import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { selectTier } from './manifest.mjs';
import { installAdapterSource, validateInstalledPackage, validateTarball } from './package-source.mjs';
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

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function packCheckout(checkout, destination) {
  const packageJsonPath = join(checkout, 'package.json');
  if (!(await isFile(packageJsonPath))) {
    throw new Error(`COPC_ADAPTER_CHECKOUT does not contain package.json: ${checkout}`);
  }
  const metadata = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  if (metadata.name !== '@frillab/copc-adapter') {
    throw new Error(`Expected @frillab/copc-adapter checkout, received ${metadata.name ?? 'unnamed package'}.`);
  }

  // Install/build/pack are intentionally run in the target checkout. This
  // makes the release gate exercise the exact artifact a release would ship.
  await command('npm', ['install', '--ignore-scripts', '--legacy-peer-deps'], { cwd: checkout });
  await command('npm', ['pack', '--pack-destination', destination], { cwd: checkout });
  const files = (await readdir(destination)).filter((file) => file.endsWith('.tgz'));
  if (files.length !== 1) {
    throw new Error(`Expected exactly one packed adapter tarball in ${destination}, found ${files.length}.`);
  }
  return join(destination, files[0]);
}

async function adapterPackageDirectory(checkout) {
  const configured = process.env.COPC_ADAPTER_PACKAGE_DIR;
  if (configured) return resolve(configured);
  const candidates = [checkout, join(checkout, 'apps/viewer-web')];
  for (const candidate of candidates) {
    const path = join(candidate, 'package.json');
    if (!(await isFile(path))) continue;
    const metadata = JSON.parse(await readFile(path, 'utf8'));
    if (metadata.name === '@frillab/copc-adapter') return candidate;
  }
  throw new Error(`Could not locate @frillab/copc-adapter package below ${checkout}. Set COPC_ADAPTER_PACKAGE_DIR.`);
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

async function verifyBuildOutputs(checkout) {
  const forbidden = [
    checkout,
    'copc-adapter-local',
    'file:../../../copc-adapter',
    'file:../../copc-adapter',
  ].filter(Boolean);
  const roots = [
    ...['vite-react-cesium', 'vite-react-three', 'vite-r3f'].map((app) => resolve(`apps/${app}/dist`)),
    ...['next-cesium', 'next-three', 'next-r3f'].map((app) => resolve(`apps/${app}/.next`)),
  ];
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
    const packageDirectory = checkout ? await adapterPackageDirectory(checkout) : undefined;
    const tarball = configuredTarball ?? (packageDirectory ? await packCheckout(packageDirectory, temporaryRoot) : undefined);
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
      VITE_COPC_PACKAGE_VERSION: 'packed-checkout',
      NEXT_PUBLIC_COPC_PACKAGE_SOURCE: 'tarball',
      NEXT_PUBLIC_COPC_PACKAGE_VERSION: 'packed-checkout',
    };
    const matrixOptions = {
      apps,
      packageSource: 'tarball',
      packageVersion: 'packed-checkout',
      backend: backends.split(',')[0],
      fixtureId: fixtures.split(',')[0],
    };
    await runMatrix('typecheck', matrixOptions);
    await runMatrix('build', matrixOptions);
    await verifyBuildOutputs(checkout);
    if (!options.skipE2E) await command('npm', ['run', 'e2e'], { env: runtimeEnvironment });
    console.log(`Release gate passed: ${tarball}`);
  } finally {
    restore();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
