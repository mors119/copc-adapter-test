import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { selectMatrix, selectTier } from './manifest.mjs';
import {
  installAdapterSource,
  ADAPTER_TARGET_VERSION,
  packAdapterCheckout,
  validateInstalledPackage,
  validateTarball,
} from './package-source.mjs';
import { runMatrix } from './runner.mjs';

function command(name, args, { cwd = process.cwd(), env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(name, args, { cwd, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${name} ${args.join(' ')} failed (${signal ?? code})`));
    });
  });
}

async function readTextFiles(directory) {
  const files = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(?:js|mjs|cjs|css|html|json|map)$/.test(entry.name)) files.push(path);
    }
  }
  await visit(directory);
  return Promise.all(files.map(async (path) => ({ path, text: await readFile(path, 'utf8') })));
}

async function allFiles(directory) {
  const files = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files.push(path);
    }
  }
  await visit(directory);
  return files;
}

async function verifyBuildOutputs(checkout, appSelector) {
  const forbidden = [
    checkout,
  ].filter(Boolean);
  const roots = selectMatrix(appSelector).map((app) => resolve(app.workspace, app.host === 'next' ? '.next' : 'dist'));
  const builtFiles = [];
  for (const root of roots) builtFiles.push(...await readTextFiles(root));
  const outputPaths = [];
  for (const root of roots) outputPaths.push(...await allFiles(root));
  const leaked = builtFiles.flatMap(({ path, text }) => forbidden
    .filter((value) => text.includes(value))
    .map((value) => `${path} contains ${value}`));
  if (leaked.length > 0) {
    throw new Error(`Release build contains a repository-relative adapter reference:\n${leaked.join('\n')}`);
  }
  if (!outputPaths.some((path) => path.endsWith('.wasm'))) {
    throw new Error('Release build did not emit a WASM asset from the installed adapter package.');
  }
  if (!outputPaths.some((path) => /worker/i.test(path))
    && !builtFiles.some(({ text }) => /\bWorker\b/.test(text))) {
    throw new Error('Release build did not retain a Worker asset/reference from the installed adapter package.');
  }
}

function setTemporaryEnvironment(values) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

export async function runReleaseGate(options = {}) {
  const definition = selectTier('release');
  const apps = options.apps ?? definition.buildApps.join(',');
  const browsers = options.browsers ?? definition.browsers.join(',');
  const backends = options.backends ?? definition.backends.join(',');
  const fixtures = options.fixtures ?? definition.fixtures.join(',');
  const checkout = process.env.COPC_ADAPTER_CHECKOUT
    ? resolve(process.env.COPC_ADAPTER_CHECKOUT)
    : undefined;
  const configuredTarball = process.env.COPC_ADAPTER_TARBALL
    ? resolve(process.env.COPC_ADAPTER_TARBALL)
    : undefined;
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'copc-adapter-release-gate-'));
  const restore = setTemporaryEnvironment({
    COPC_ADAPTER_SOURCE: 'tarball',
    COPC_ADAPTER_TARBALL: configuredTarball,
  });

  try {
    const packed = checkout ? await packAdapterCheckout(checkout, temporaryRoot) : undefined;
    const tarball = configuredTarball ?? packed?.tarball;
    if (!tarball) {
      throw new Error('Release gate requires COPC_ADAPTER_CHECKOUT or COPC_ADAPTER_TARBALL.');
    }
    process.env.COPC_ADAPTER_TARBALL = tarball;
    await validateTarball(tarball);
    await installAdapterSource();
    await validateInstalledPackage({ requireAssets: true });
    if (!options.skipFixtures && !process.env.COPC_MATRIX_SKIP_FIXTURES) {
      await command('npm', ['run', 'fixtures', '--', 'fetch', ...fixtures.split(',')]);
    }

    const runtimeEnvironment = {
      ...process.env,
      COPC_E2E_MODE: 'release',
      COPC_E2E_APPS: apps,
      COPC_E2E_BROWSERS: browsers,
      COPC_E2E_BACKENDS: backends,
      COPC_E2E_FIXTURES: fixtures,
      VITE_COPC_PACKAGE_SOURCE: 'tarball',
      VITE_COPC_PACKAGE_VERSION: ADAPTER_TARGET_VERSION,
      NEXT_PUBLIC_COPC_PACKAGE_SOURCE: 'tarball',
      NEXT_PUBLIC_COPC_PACKAGE_VERSION: ADAPTER_TARGET_VERSION,
      COPC_E2E_PACKAGE_SOURCE: 'tarball',
      COPC_E2E_PACKAGE_VERSION: ADAPTER_TARGET_VERSION,
    };
    const matrixOptions = {
      apps,
      packageSource: 'tarball',
      packageVersion: ADAPTER_TARGET_VERSION,
      backend: backends.split(',')[0],
      fixtureId: fixtures.split(',')[0],
    };
    await runMatrix('typecheck', matrixOptions);
    await runMatrix('build', matrixOptions);
    await verifyBuildOutputs(checkout, apps);
    if (!options.skipE2E) await command('npm', ['run', 'e2e'], { env: runtimeEnvironment });
    console.log(`Release gate passed: ${tarball}`);
  } finally {
    restore();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
