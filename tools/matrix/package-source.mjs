import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ADAPTER_PACKAGE = '@frillab/copc-adapter';
export const ADAPTER_TARGET_VERSION = '0.4.0';
const PUBLIC_ENTRYPOINTS = ['.', './cesium', './three'];

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

function npmCommand(args, options = {}) {
  return command('npm', args, options);
}

function commandOutput(name, args, { cwd = process.cwd(), env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(name, args, { cwd, env });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise(output);
      else reject(new Error(`${name} ${args.join(' ')} failed (${signal ?? code}): ${error}`));
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

async function tarballEntries(tarball) {
  const output = await commandOutput('tar', ['-tzf', tarball]);
  return output.split('\n').map((entry) => entry.trim()).filter(Boolean);
}

function validatePackedAssets(entries, source) {
  const packageEntries = entries.filter((entry) => entry.startsWith('package/'));
  const wasmEntries = packageEntries.filter((entry) => entry.endsWith('.wasm'));
  const workerEntries = packageEntries.filter((entry) => /worker/i.test(entry) && /\.(?:js|mjs|cjs|ts)$/.test(entry));
  if (wasmEntries.length === 0) {
    throw new Error(`${source} does not contain a packaged WASM asset.`);
  }
  if (workerEntries.length === 0) {
    throw new Error(`${source} does not contain a packaged Worker asset.`);
  }
  if (packageEntries.some((entry) => entry.includes('/../') || entry.startsWith('../') || entry.startsWith('/'))) {
    throw new Error(`${source} contains an unsafe path outside the package root.`);
  }
}

function validateAdapterVersion(version, source, expectedVersion = ADAPTER_TARGET_VERSION) {
  if (version !== expectedVersion) {
    throw new Error(`${source} contains ${ADAPTER_PACKAGE}@${version ?? 'unknown'}; expected ${ADAPTER_PACKAGE}@${expectedVersion}.`);
  }
}

export function validatePackageMetadata(metadata, source, expectedVersion = ADAPTER_TARGET_VERSION) {
  if (metadata.name !== ADAPTER_PACKAGE) {
    throw new Error(`Expected ${ADAPTER_PACKAGE}, received ${metadata.name ?? 'an unnamed package'} in ${source}.`);
  }
  validateAdapterVersion(metadata.version, source, expectedVersion);

  const exports = metadata.exports ?? {};
  for (const entry of PUBLIC_ENTRYPOINTS) {
    if (!exports[entry]) {
      const publicName = entry === '.' ? ADAPTER_PACKAGE : `${ADAPTER_PACKAGE}/${entry.slice(2)}`;
      throw new Error(`${source} does not expose ${publicName}. The 0.4.x package must expose the root, /cesium, and /three entrypoints.`);
    }
  }
}

export async function validateTarball(tarball) {
  await access(tarball);

  const packageJson = await commandOutput('tar', ['-xOf', tarball, 'package/package.json'])
    .catch((error) => { throw new Error(`Unable to read package metadata from ${tarball}: ${error.message}`); });
  const metadata = JSON.parse(packageJson);
  validatePackageMetadata(metadata, tarball);
  validatePackedAssets(await tarballEntries(tarball), tarball);
  return metadata;
}

async function installedPackageMetadata() {
  const packageRoot = resolve('node_modules/@frillab/copc-adapter');
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  return { packageRoot, metadata };
}

export async function validateInstalledPackage({ requireAssets = false, expectedVersion = ADAPTER_TARGET_VERSION } = {}) {
  const { packageRoot, metadata } = await installedPackageMetadata();
  validatePackageMetadata(metadata, packageRoot, expectedVersion);
  if (requireAssets) {
    const entries = [];
    async function collect(directory, relative = '') {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await collect(path, childRelative);
        else entries.push(`package/${childRelative}`);
      }
    }
    await collect(packageRoot);
    validatePackedAssets(entries, packageRoot);
  }
  return packageRoot;
}

export async function adapterPackageDirectory(checkout) {
  const resolvedCheckout = resolve(checkout);
  const configured = process.env.COPC_ADAPTER_PACKAGE_DIR;
  const candidates = configured
    ? [resolve(configured)]
    : [join(resolvedCheckout, 'apps/viewer-web'), resolvedCheckout];
  for (const candidate of candidates) {
    const packageJsonPath = join(candidate, 'package.json');
    if (!(await isFile(packageJsonPath))) continue;
    const metadata = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    if (metadata.name === ADAPTER_PACKAGE) return candidate;
  }
  throw new Error(`Could not locate ${ADAPTER_PACKAGE} package below ${resolvedCheckout}. Expected apps/viewer-web/package.json.`);
}

export async function packAdapterCheckout(checkout = process.env.COPC_ADAPTER_CHECKOUT ?? '../copc-adapter', destination) {
  const resolvedCheckout = resolve(checkout);
  const packageDirectory = await adapterPackageDirectory(resolvedCheckout);
  const packageJsonPath = join(packageDirectory, 'package.json');
  const metadata = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  validatePackageMetadata(metadata, packageJsonPath);

  const packDestination = resolve(destination ?? process.env.COPC_ADAPTER_PACK_DESTINATION
    ?? await mkdtemp(join(tmpdir(), 'copc-adapter-pack-')));
  await mkdir(packDestination, { recursive: true });
  const before = new Set((await readdir(packDestination)).filter((file) => file.endsWith('.tgz')));

  // npm pack runs the package's real prepack hook. For the current adapter this
  // builds the library, generates the Rust/WASM assets, and then packs dist.
  await npmCommand([
    'install',
    '--ignore-scripts',
    '--legacy-peer-deps',
    '--no-audit',
    '--no-fund',
  ], { cwd: packageDirectory });
  await npmCommand(['pack', '--pack-destination', packDestination], { cwd: packageDirectory });

  const files = (await readdir(packDestination))
    .filter((file) => file.endsWith('.tgz') && !before.has(file));
  if (files.length !== 1) {
    throw new Error(`Expected exactly one new packed adapter tarball in ${packDestination}, found ${files.length}.`);
  }
  const tarball = join(packDestination, files[0]);
  await validateTarball(tarball);
  return { checkout: resolvedCheckout, packageDirectory, tarball, metadata };
}

async function installBaseWorkspace() {
  // Consumer manifests intentionally keep the adapter as an optional peer so a
  // clean clone does not ask npm for an unpublished 0.4.0 before bootstrap can
  // pack a sibling checkout or install an explicit tarball.
  await npmCommand([
    'install',
    '--ignore-scripts',
    '--legacy-peer-deps',
    '--package-lock=false',
    '--no-audit',
    '--no-fund',
  ]);
}

async function installPackedArtifact(tarball) {
  await installBaseWorkspace();
  const extractionRoot = await mkdtemp(resolve('node_modules/.copc-adapter-source-'));
  await command('tar', ['-xzf', tarball, '-C', extractionRoot]);
  const installedPackage = resolve('node_modules/@frillab/copc-adapter');
  await rm(installedPackage, { recursive: true, force: true });
  await mkdir(dirname(installedPackage), { recursive: true });
  // The consumer resolves the exact unpacked tarball below node_modules, not
  // source files from the sibling checkout.
  await symlink(join(extractionRoot, 'package'), installedPackage, 'dir');
  await validateInstalledPackage({ requireAssets: true });
}

/**
 * Install the same adapter package name from npm, an external TGZ, or a local
 * checkout that is packed before it is consumed.
 */
export async function installAdapterSource() {
  const source = process.env.COPC_ADAPTER_SOURCE ?? 'npm';
  const version = process.env.COPC_ADAPTER_VERSION ?? ADAPTER_TARGET_VERSION;

  if (source === 'npm') {
    try {
      await npmCommand([
        'install',
        `${ADAPTER_PACKAGE}@${version}`,
        '--ignore-scripts',
        '--legacy-peer-deps',
        '--package-lock=false',
        '--no-save',
        '--no-audit',
        '--no-fund',
      ]);
    } catch (error) {
      throw new Error(`Unable to install ${ADAPTER_PACKAGE}@${version} from the npm registry. npm mode never falls back to an older adapter version. ${error.message}`, { cause: error });
    }
    const packageRoot = await validateInstalledPackage({ requireAssets: true, expectedVersion: version });
    return { source, spec: `${ADAPTER_PACKAGE}@${version}`, packageRoot, version };
  }

  if (source === 'checkout') {
    const packDestination = await mkdtemp(join(tmpdir(), 'copc-adapter-checkout-pack-'));
    try {
      const packed = await packAdapterCheckout(undefined, packDestination);
      await installPackedArtifact(packed.tarball);
      return {
        source,
        spec: `packed-checkout:${packed.metadata.version}`,
        packageRoot: resolve('node_modules/@frillab/copc-adapter'),
        version: packed.metadata.version,
      };
    } finally {
      // installPackedArtifact extracted the package into node_modules. The
      // temporary tarball can be removed without changing the installed source.
      await rm(packDestination, { recursive: true, force: true });
    }
  }

  if (source !== 'tarball') {
    throw new Error('COPC_ADAPTER_SOURCE must be "checkout", "tarball", or "npm".');
  }

  const configuredPath = process.env.COPC_ADAPTER_TARBALL;
  if (!configuredPath) {
    throw new Error('COPC_ADAPTER_TARBALL is required when COPC_ADAPTER_SOURCE=tarball.');
  }

  const tarball = resolve(configuredPath);
  const metadata = await validateTarball(tarball);
  await installPackedArtifact(tarball);
  return { source, spec: `file:${tarball}`, packageRoot: resolve('node_modules/@frillab/copc-adapter'), version: metadata.version, tarball };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'pack') {
    const packed = await packAdapterCheckout();
    console.log(`Packed adapter tarball: ${packed.tarball}`);
  } else {
    const result = await installAdapterSource();
    console.log(`Adapter source: ${result.spec}`);
  }
}
