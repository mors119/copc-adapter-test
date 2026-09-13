import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnPlatformCommand } from '../command.mjs';
import {
  ADAPTER_PACKAGE,
  ADAPTER_TARGET_VERSION,
  installAdapterSource,
  validatePackageMetadata,
} from './package-source.mjs';

const metadata = {
  name: ADAPTER_PACKAGE,
  version: ADAPTER_TARGET_VERSION,
  exports: {
    '.': { import: './dist/index.js' },
    './cesium': { import: './dist/cesium.js' },
    './three': { import: './dist/three.js' },
  },
};

test('accepts the current adapter package boundary', () => {
  assert.doesNotThrow(() => validatePackageMetadata(metadata, 'fixture'));
});

test('rejects an older adapter version instead of silently downgrading', () => {
  assert.throws(
    () => validatePackageMetadata({ ...metadata, version: '0.3.0' }, 'fixture'),
    /expected @frillab\/copc-adapter@0\.4\.0/,
  );
});

test('requires every public renderer entrypoint', () => {
  const missingThree = {
    ...metadata,
    exports: { ...metadata.exports, './three': undefined },
  };
  assert.throws(() => validatePackageMetadata(missingThree, 'fixture'), /does not expose @frillab\/copc-adapter\/three/);
});

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function runNode(args, { cwd, env }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, { cwd, env });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise(output);
      else reject(new Error(`${process.execPath} ${args.join(' ')} failed (${signal ?? code}):\n${output}`));
    });
  });
}

function runProcess(command, args, { cwd, env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnPlatformCommand(command, args, { cwd, env, stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code})`));
    });
  });
}

async function createPackedCheckout(root) {
  const checkout = join(root, 'adapter-checkout');
  const packageDirectory = join(checkout, 'apps', 'viewer-web');
  const runtimeDependency = join(checkout, 'runtime-dependency');
  const dist = join(packageDirectory, 'dist');
  await mkdir(dist, { recursive: true });
  await mkdir(runtimeDependency, { recursive: true });

  await writeJson(join(runtimeDependency, 'package.json'), {
    name: 'copc-adapter-fixture-runtime',
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
  });
  await writeFile(join(runtimeDependency, 'index.js'), 'export const fixtureRuntimeDependency = true;\n');
  await runProcess('npm', ['pack', '--pack-destination', checkout], { cwd: runtimeDependency });
  await writeJson(join(packageDirectory, 'package.json'), {
    name: ADAPTER_PACKAGE,
    version: ADAPTER_TARGET_VERSION,
    type: 'module',
    files: ['dist'],
    exports: {
      '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      './cesium': { types: './dist/cesium.d.ts', import: './dist/cesium.js' },
      './three': { types: './dist/three.d.ts', import: './dist/three.js' },
    },
    dependencies: {
      'copc-adapter-fixture-runtime': 'file:../../copc-adapter-fixture-runtime-1.0.0.tgz',
    },
    bundledDependencies: ['copc-adapter-fixture-runtime'],
  });
  await writeFile(join(dist, 'index.js'), 'export const fixtureAdapter = true;\n');
  await writeFile(join(dist, 'index.d.ts'), 'export declare const fixtureAdapter: boolean;\n');
  await writeFile(join(dist, 'cesium.js'), 'export const fixtureCesiumEntry = true;\n');
  await writeFile(join(dist, 'cesium.d.ts'), 'export declare const fixtureCesiumEntry: boolean;\n');
  await writeFile(join(dist, 'three.js'), 'export const fixtureThreeEntry = true;\n');
  await writeFile(join(dist, 'three.d.ts'), 'export declare const fixtureThreeEntry: boolean;\n');
  await writeFile(join(dist, 'copc_wasm.wasm'), new Uint8Array([0, 97, 115, 109]));
  await writeFile(join(dist, 'rustCopcWorkerFactory.js'), 'export const fixtureWorker = true;\n');
  return checkout;
}

test('installs a packed checkout with runtime assets and clears Vite caches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'copc-adapter-source-test-'));
  try {
    const checkout = await createPackedCheckout(root);
    await mkdir(join(root, 'node_modules', '.vite'), { recursive: true });
    await mkdir(join(root, 'apps', 'fixture-app', 'node_modules', '.vite'), { recursive: true });
    await writeFile(join(root, 'node_modules', '.vite', 'metadata.json'), '{}\n');
    await writeFile(join(root, 'apps', 'fixture-app', 'node_modules', '.vite', 'metadata.json'), '{}\n');
    await writeJson(join(root, 'package.json'), { name: 'packed-adapter-consumer-fixture', private: true, type: 'module' });

    const packageSourceUrl = pathToFileURL(resolve('tools/matrix/package-source.mjs')).href;
    const script = `
      import assert from 'node:assert/strict';
      import { access, readFile } from 'node:fs/promises';
      import { installAdapterSource } from ${JSON.stringify(packageSourceUrl)};

      const result = await installAdapterSource();
      assert.equal(result.source, 'checkout');
      assert.equal(result.spec, 'packed-checkout:0.4.0');
      assert.equal(result.version, '0.4.0');
      const metadata = JSON.parse(await readFile('node_modules/@frillab/copc-adapter/package.json', 'utf8'));
      assert.equal(metadata.name, '@frillab/copc-adapter');
      assert.equal(metadata.version, '0.4.0');
      for (const entry of ['@frillab/copc-adapter', '@frillab/copc-adapter/cesium', '@frillab/copc-adapter/three']) await import(entry);
      for (const asset of [
        'node_modules/@frillab/copc-adapter/dist/copc_wasm.wasm',
        'node_modules/@frillab/copc-adapter/dist/rustCopcWorkerFactory.js',
      ]) await access(asset);
      const runtime = JSON.parse(await readFile('node_modules/@frillab/copc-adapter/node_modules/copc-adapter-fixture-runtime/package.json', 'utf8'));
      assert.equal(runtime.version, '1.0.0');
      for (const cache of ['node_modules/.vite', 'apps/fixture-app/node_modules/.vite']) {
        await assert.rejects(() => access(cache), { code: 'ENOENT' });
      }
    `;
    await runNode(['--input-type=module', '--eval', script], {
      cwd: root,
      env: {
        ...process.env,
        COPC_ADAPTER_SOURCE: 'checkout',
        COPC_ADAPTER_CHECKOUT: checkout,
        COPC_ADAPTER_VERSION: ADAPTER_TARGET_VERSION,
        COPC_ADAPTER_PACKAGE_DIR: '',
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
