import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const packageName = '@frillab/copc-adapter';

function npmCommand(args, env = process.env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('npm', args, { stdio: 'inherit', env });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`npm ${args.join(' ')} failed (${signal ?? code})`));
    });
  });
}

function command(name, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(name, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${name} ${args.join(' ')} failed (${signal ?? code})`));
    });
  });
}

function commandOutput(name, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(name, args);
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

async function validateTarball(tarball) {
  await access(tarball);

  const packageJson = await commandOutput('tar', ['-xOf', tarball, 'package/package.json'])
    .catch((error) => { throw new Error(`Unable to read package metadata from ${tarball}: ${error.message}`); });

  validatePackageMetadata(JSON.parse(packageJson), tarball);
  validatePackedAssets(await tarballEntries(tarball), tarball);
}

export function validatePackageMetadata(metadata, source) {
  if (metadata.name !== packageName) {
    throw new Error(`Expected ${packageName}, received ${metadata.name ?? 'an unnamed package'} in ${source}.`);
  }

  const exports = metadata.exports ?? {};
  for (const entry of ['.', './cesium', './three']) {
    if (!exports[entry]) {
      throw new Error(`${source} does not expose ${packageName}/${entry === '.' ? '' : entry.slice(2)}. Use a 0.3.x artifact with the public renderer entrypoints.`);
    }
  }
}

async function validateInstalledPackage({ requireAssets = false } = {}) {
  const packageRoot = resolve('node_modules/@frillab/copc-adapter');
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  validatePackageMetadata(metadata, packageRoot);
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

export { validateInstalledPackage, validateTarball };

/** Install the same adapter package name from npm or an externally packed TGZ. */
export async function installAdapterSource() {
  const source = process.env.COPC_ADAPTER_SOURCE ?? 'npm';
  const version = process.env.COPC_ADAPTER_VERSION ?? '0.3.0';

  if (source === 'npm') {
    await npmCommand(['install']);
    await validateInstalledPackage();
    return { source, spec: `${packageName}@${version}` };
  }

  if (source !== 'tarball') {
    throw new Error('COPC_ADAPTER_SOURCE must be "npm" or "tarball".');
  }

  const configuredPath = process.env.COPC_ADAPTER_TARBALL;
  if (!configuredPath) {
    throw new Error('COPC_ADAPTER_TARBALL is required when COPC_ADAPTER_SOURCE=tarball.');
  }

  const tarball = resolve(configuredPath);
  await validateTarball(tarball);

  // npm's --no-save flag does not replace a matching workspace dependency on
  // all npm versions. Install the normal dependency graph first, then overlay
  // the exact packed artifact in node_modules without touching manifests or
  // the lockfile.
  await npmCommand(['install', '--ignore-scripts', '--legacy-peer-deps', '--package-lock=false']);
  // Keep the extracted package below this repository's node_modules so its
  // peer dependencies (cesium/three) resolve exactly like a registry install.
  const extractionRoot = await mkdtemp(resolve('node_modules/.copc-adapter-source-'));
  await command('tar', ['-xzf', tarball, '-C', extractionRoot]);
  const installedPackage = resolve('node_modules/@frillab/copc-adapter');
  await rm(installedPackage, { recursive: true, force: true });
  await mkdir(dirname(installedPackage), { recursive: true });
  await symlink(join(extractionRoot, 'package'), installedPackage, 'dir');
  await validateInstalledPackage();
  return { source, spec: `file:${tarball}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await installAdapterSource();
}
