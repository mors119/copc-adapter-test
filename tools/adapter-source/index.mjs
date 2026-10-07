import { readFileSync } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import semver from 'semver';

export const ADAPTER_PACKAGE = '@frillab/copc-adapter';
export const ADAPTER_VERSION = '0.4.0';
export const PUBLIC_EXPORTS = ['.', './cesium', './three'];
const root = resolve(import.meta.dirname, '../..');

function commandEnvironment() {
  const environment = { ...process.env };
  if (!environment.NPM_CONFIG_CACHE && !environment.CI) {
    environment.NPM_CONFIG_CACHE = resolve(root, '.cache/npm-cache');
  }
  return environment;
}

function run(command, args, cwd = root) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: commandEnvironment() });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0
      ? resolvePromise()
      : reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code}).`)));
  });
}

function output(command, args, cwd = root) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: commandEnvironment() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0
      ? resolvePromise(stdout)
      : reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code}): ${stderr}`)));
  });
}

async function isFile(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

function validateMetadata(metadata, source) {
  if (metadata.name !== ADAPTER_PACKAGE) throw new Error(`${source} is ${metadata.name ?? 'unnamed'}; expected ${ADAPTER_PACKAGE}.`);
  if (metadata.version !== ADAPTER_VERSION) throw new Error(`${source} is ${ADAPTER_PACKAGE}@${metadata.version ?? 'unknown'}; expected ${ADAPTER_PACKAGE}@${ADAPTER_VERSION}.`);
  for (const name of PUBLIC_EXPORTS) {
    const target = metadata.exports?.[name];
    if (!target?.types || !target?.import) throw new Error(`${source} must expose public entrypoint ${name} with types and import conditions.`);
  }
  return metadata;
}

async function tarEntries(tarball) {
  return (await output('tar', ['-tzf', tarball])).split('\n').map((line) => line.trim()).filter(Boolean);
}

function validateEntries(entries, source) {
  const packageEntries = entries.filter((entry) => entry.startsWith('package/'));
  if (!packageEntries.some((entry) => entry.endsWith('.wasm'))) throw new Error(`${source} is missing a packaged WASM asset.`);
  if (!packageEntries.some((entry) => /worker/i.test(entry) && /\.(?:js|mjs|cjs)$/.test(entry))) throw new Error(`${source} is missing packaged Worker code.`);
  if (!packageEntries.some((entry) => entry.endsWith('.d.ts'))) throw new Error(`${source} is missing declaration files.`);
  if (packageEntries.some((entry) => entry.includes('/../') || entry.startsWith('../') || entry.startsWith('/'))) throw new Error(`${source} contains a path outside the package root.`);
}

export async function validateTarball(tarball) {
  await access(tarball);
  const metadata = JSON.parse(await output('tar', ['-xOf', tarball, 'package/package.json']));
  validateMetadata(metadata, tarball);
  const entries = await tarEntries(tarball);
  validateEntries(entries, tarball);
  for (const target of Object.values(metadata.exports)) {
    for (const relative of Object.values(target)) {
      if (!entries.includes(`package/${relative.replace(/^\.\//, '')}`)) {
        throw new Error(`${tarball} does not include declared package entry ${relative}.`);
      }
    }
  }
  return metadata;
}

export async function validateInstalledPackage() {
  const packageRoot = resolve(root, 'node_modules/@frillab/copc-adapter');
  const metadata = validateMetadata(JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')), packageRoot);
  const entries = [];
  async function collect(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await collect(join(directory, entry.name), child);
      else entries.push(`package/${child}`);
    }
  }
  await collect(packageRoot);
  validateEntries(entries, packageRoot);
  for (const target of Object.values(metadata.exports)) {
    for (const relative of Object.values(target)) {
      if (!await isFile(join(packageRoot, relative.replace(/^\.\//, '')))) throw new Error(`${packageRoot} is missing declared package entry ${relative}.`);
    }
  }
  return { packageRoot, metadata };
}

async function locatePackage(checkout) {
  const configured = process.env.COPC_ADAPTER_PACKAGE_DIR;
  const candidates = configured ? [resolve(configured)] : [join(resolve(checkout), 'apps/viewer-web'), resolve(checkout)];
  for (const candidate of candidates) {
    const path = join(candidate, 'package.json');
    if (!await isFile(path)) continue;
    const metadata = JSON.parse(await readFile(path, 'utf8'));
    if (metadata.name === ADAPTER_PACKAGE) return { directory: candidate, metadata };
  }
  throw new Error(`Could not find ${ADAPTER_PACKAGE} under ${resolve(checkout)}. Expected apps/viewer-web/package.json.`);
}

export async function packAdapterCheckout(
  checkout = process.env.COPC_ADAPTER_CHECKOUT ?? '../copc-adapter',
  destination = process.env.COPC_ADAPTER_PACK_DESTINATION ?? resolve(root, '.cache/adapter-artifacts'),
) {
  const resolvedCheckout = resolve(root, checkout);
  const { directory, metadata } = await locatePackage(resolvedCheckout);
  validateMetadata(metadata, join(directory, 'package.json'));
  await mkdir(destination, { recursive: true });
  if (!await isFile(join(directory, 'node_modules/.package-lock.json'))) {
    if (await isFile(join(directory, 'package-lock.json'))) await run('npm', ['ci', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'], directory);
    else await run('npm', ['install', '--ignore-scripts', '--legacy-peer-deps', '--package-lock=false', '--no-audit', '--no-fund'], directory);
  }
  const expectedArtifact = join(resolve(destination), 'frillab-copc-adapter-0.4.0.tgz');
  await rm(expectedArtifact, { force: true });
  const before = new Set((await readdir(destination)).filter((file) => file.endsWith('.tgz')));
  // npm pack runs the adapter's actual prepack hook before archiving the public package.
  await run('npm', ['pack', '--pack-destination', resolve(destination)], directory);
  const artifacts = (await readdir(destination)).filter((file) => file.endsWith('.tgz') && !before.has(file));
  if (artifacts.length !== 1) throw new Error(`npm pack should create exactly one adapter tarball; found ${artifacts.length}.`);
  const tarball = join(resolve(destination), artifacts[0]);
  const packedMetadata = await validateTarball(tarball);
  return { checkout: resolvedCheckout, packageDirectory: directory, tarball, metadata: packedMetadata };
}

async function writeSourceMetadata(source, version, spec) {
  const metadata = { packageName: ADAPTER_PACKAGE, packageVersion: version, packageSource: source, spec, installedAt: new Date().toISOString() };
  const directory = resolve(root, '.cache');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'adapter-source.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

async function ensureRootDependencies() {
  if (await isFile(resolve(root, 'node_modules/.package-lock.json'))) return;
  await run('npm', ['install', '--ignore-scripts', '--legacy-peer-deps', '--package-lock=false', '--no-audit', '--no-fund'], root);
}

async function unpackArtifact(tarball) {
  await ensureRootDependencies();
  const packageParent = resolve(root, 'node_modules/@frillab');
  const packageRoot = join(packageParent, 'copc-adapter');
  const temporaryPackage = join(packageParent, `.copc-adapter-install-${process.pid}`);
  await mkdir(packageParent, { recursive: true });
  await rm(temporaryPackage, { recursive: true, force: true });
  await rm(packageRoot, { recursive: true, force: true });
  await mkdir(temporaryPackage, { recursive: true });
  await run('tar', ['-xzf', resolve(tarball), '-C', temporaryPackage, '--strip-components=1', 'package'], root);
  await rename(temporaryPackage, packageRoot);
  return packageRoot;
}

async function installCheckoutArtifact(tarball, fallbackDependencyRoot) {
  const packageRoot = await unpackArtifact(tarball);
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  for (const [dependency, range] of Object.entries(metadata.dependencies ?? {})) {
    const rootDependency = resolve(root, 'node_modules', dependency);
    if (await isFile(join(rootDependency, 'package.json'))) {
      const installed = JSON.parse(await readFile(join(rootDependency, 'package.json'), 'utf8'));
      if (semver.satisfies(installed.version, range)) continue;
    }
    const checkoutDependency = resolve(fallbackDependencyRoot, 'node_modules', dependency);
    if (!await isFile(join(checkoutDependency, 'package.json'))) {
      throw new Error(`Packed ${ADAPTER_PACKAGE} requires ${dependency}, which is not installed at the root or in the selected adapter checkout.`);
    }
    const checkoutMetadata = JSON.parse(await readFile(join(checkoutDependency, 'package.json'), 'utf8'));
    if (!semver.satisfies(checkoutMetadata.version, range)) {
      throw new Error(`Packed ${ADAPTER_PACKAGE} requires ${dependency}@${range}, but the selected checkout provides ${checkoutMetadata.version}.`);
    }
    await mkdir(resolve(rootDependency, '..'), { recursive: true });
    await rm(rootDependency, { recursive: true, force: true });
    await symlink(checkoutDependency, rootDependency, 'junction');
    console.log(`Using ${dependency} from the adapter checkout's installed dependency tree.`);
  }
  return validateInstalledPackage();
}

async function installTarball(tarball) {
  const packageRoot = await unpackArtifact(tarball);
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  for (const [dependency, range] of Object.entries(metadata.dependencies ?? {})) {
    const dependencyRoot = resolve(root, 'node_modules', dependency);
    if (await isFile(join(dependencyRoot, 'package.json'))) {
      const installed = JSON.parse(await readFile(join(dependencyRoot, 'package.json'), 'utf8'));
      if (semver.satisfies(installed.version, range)) continue;
    }
    try {
      await run('npm', ['install', `${dependency}@${range}`, '--ignore-scripts', '--legacy-peer-deps', '--package-lock=false', '--no-save', '--no-audit', '--no-fund'], root);
    } catch (error) {
      throw new Error(`Unable to install ${dependency}@${range}, a runtime dependency of ${ADAPTER_PACKAGE}. ${error.message}`, { cause: error });
    }
    const installed = JSON.parse(await readFile(join(dependencyRoot, 'package.json'), 'utf8'));
    if (!semver.satisfies(installed.version, range)) {
      throw new Error(`Installed ${dependency}@${installed.version}; packed ${ADAPTER_PACKAGE} requires ${range}.`);
    }
  }
  return validateInstalledPackage();
}

export async function bootstrapAdapterSource(source = process.env.COPC_ADAPTER_SOURCE ?? 'checkout') {
  await ensureRootDependencies();
  if (source === 'checkout') {
    const packed = await packAdapterCheckout();
    const installed = await installCheckoutArtifact(packed.tarball, packed.packageDirectory);
    const metadata = await writeSourceMetadata(source, installed.metadata.version, `packed-checkout:${packed.tarball}`);
    console.log(`Installed ${ADAPTER_PACKAGE}@${installed.metadata.version} from packed checkout: ${packed.tarball}`);
    return { ...packed, ...installed, source: metadata };
  }
  if (source === 'tarball') {
    const tarball = process.env.COPC_ADAPTER_TARBALL;
    if (!tarball) throw new Error('COPC_ADAPTER_TARBALL is required when COPC_ADAPTER_SOURCE=tarball.');
    const absolute = resolve(tarball);
    await validateTarball(absolute);
    const installed = await installTarball(absolute);
    await writeSourceMetadata(source, installed.metadata.version, `file:${absolute}`);
    console.log(`Installed ${ADAPTER_PACKAGE}@${installed.metadata.version} from ${absolute}`);
    return { ...installed, tarball: absolute, source };
  }
  if (source === 'npm') {
    const version = process.env.COPC_ADAPTER_VERSION ?? ADAPTER_VERSION;
    if (version !== ADAPTER_VERSION) throw new Error(`This testbed targets ${ADAPTER_VERSION}; requested npm version ${version} is not supported.`);
    try {
      await run('npm', ['install', `${ADAPTER_PACKAGE}@${version}`, '--ignore-scripts', '--legacy-peer-deps', '--package-lock=false', '--no-save', '--no-audit', '--no-fund'], root);
    } catch (error) {
      throw new Error(`Unable to install published ${ADAPTER_PACKAGE}@${version}. npm mode does not fall back to another version. ${error.message}`, { cause: error });
    }
    const installed = await validateInstalledPackage();
    await writeSourceMetadata(source, installed.metadata.version, `${ADAPTER_PACKAGE}@${version}`);
    console.log(`Installed published ${ADAPTER_PACKAGE}@${installed.metadata.version}`);
    return { ...installed, source };
  }
  throw new Error('COPC_ADAPTER_SOURCE must be checkout, tarball, or npm.');
}

export async function clearViteCaches() {
  const paths = [resolve(root, 'node_modules/.vite')];
  for (const app of ['vanilla', 'react']) paths.push(resolve(root, `apps/${app}/node_modules/.vite`));
  await Promise.all(paths.map((path) => rm(path, { recursive: true, force: true })));
}

export function vitePackageDefines(prefix = 'VITE_') {
  const metadata = readAdapterSourceMetadata();
  return {
    [`import.meta.env.${prefix}COPC_PACKAGE_SOURCE`]: JSON.stringify(metadata.packageSource),
    [`import.meta.env.${prefix}COPC_PACKAGE_VERSION`]: JSON.stringify(metadata.packageVersion),
  };
}

export function readAdapterSourceMetadata() {
  try {
    return JSON.parse(readFileSync(resolve(root, '.cache/adapter-source.json'), 'utf8'));
  } catch (error) {
    throw new Error('Adapter source metadata is missing. Run npm run bootstrap before starting or building a consumer.', { cause: error });
  }
}
