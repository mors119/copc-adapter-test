import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  BUILD_TOOL_VERSIONS,
  selectCompatibilityCases,
  selectPackageManagers,
} from './manifest.mjs';

const ADAPTER_PACKAGE = '@frillab/copc-adapter';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function commandFor(packageManager) {
  if (process.platform !== 'win32') return packageManager;
  return `${packageManager}.cmd`;
}

function runCommand(packageManager, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const command = commandFor(packageManager);
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code})`));
    });
  });
}

function packageManagerInstallArgs(packageManager) {
  switch (packageManager) {
    case 'npm': return ['install', '--ignore-scripts', '--no-audit', '--no-fund'];
    case 'pnpm': return ['install', '--ignore-scripts', '--no-frozen-lockfile'];
    case 'yarn': return ['install', '--ignore-scripts'];
    case 'bun': return ['install', '--ignore-scripts', '--no-progress'];
    default: throw new Error(`Unsupported package manager: ${packageManager}`);
  }
}

function packageManagerBuildArgs() {
  return ['run', 'build'];
}

function adapterSpec() {
  const tarball = process.env.COPC_ADAPTER_TARBALL;
  if (tarball !== undefined) {
    if (!tarball) throw new Error('COPC_ADAPTER_TARBALL cannot be empty. Refusing to fall back to a registry package.');
    return `file:${resolve(tarball)}`;
  }

  const configured = process.env.COPC_ADAPTER_SPEC;
  if (configured) {
    // COPC_ADAPTER_SPEC is convenient on the command line as
    // @frillab/copc-adapter@version, while package.json dependency values
    // contain only the version for a registry package.
    return configured.startsWith(`${ADAPTER_PACKAGE}@`)
      ? configured.slice(`${ADAPTER_PACKAGE}@`.length)
      : configured;
  }

  return process.env.COPC_ADAPTER_VERSION ?? '0.3.0';
}

function configuredAdapterVersion() {
  if (process.env.COPC_ADAPTER_VERSION) return process.env.COPC_ADAPTER_VERSION;

  const configured = process.env.COPC_ADAPTER_SPEC;
  if (configured?.startsWith(`${ADAPTER_PACKAGE}@`)) {
    return configured.slice(`${ADAPTER_PACKAGE}@`.length);
  }

  const tarball = process.env.COPC_ADAPTER_TARBALL;
  const match = tarball && basename(tarball).match(/^frillab-copc-adapter-(.+)\.tgz$/);
  return match?.[1] ?? '0.3.0';
}

function sourceForCase(testCase) {
  return [
    ...testCase.imports,
    "document.body.dataset.compatibilityCase = 'passed';",
  ].join('\n');
}

function packageJsonFor(testCase, adapter) {
  return {
    name: `copc-adapter-compat-${testCase.id}`,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { build: 'vite build' },
    dependencies: {
      [ADAPTER_PACKAGE]: adapter,
      ...testCase.peers,
      vite: BUILD_TOOL_VERSIONS.vite,
      typescript: BUILD_TOOL_VERSIONS.typescript,
    },
  };
}

async function writeConsumer(root, testCase, adapter) {
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'package.json'), `${JSON.stringify(packageJsonFor(testCase, adapter), null, 2)}\n`);
  await writeFile(join(root, 'index.html'), `<!doctype html>\n<html><body><script type="module" src="/src/main.ts"></script></body></html>\n`);
  await writeFile(join(root, 'src', 'main.ts'), `${sourceForCase(testCase)}\n`);
}

async function installedAdapterVersion(root) {
  try {
    const packageJson = JSON.parse(await readFile(join(root, 'node_modules', '@frillab', 'copc-adapter', 'package.json'), 'utf8'));
    return packageJson.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function context(testCase, packageManager, adapterVersion) {
  return [
    `packageManager=${packageManager}`,
    `os=${process.platform}`,
    `node=${process.version}`,
    `renderer=${testCase.renderer}`,
    `peerTrack=${testCase.id}`,
    `adapter=${ADAPTER_PACKAGE}@${adapterVersion}`,
  ].join(' ');
}

export async function runCompatibilityCase(testCase, packageManager, { keepTemp = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'copc-adapter-compat-'));

  try {
    const adapter = adapterSpec();
    const requestedAdapterVersion = configuredAdapterVersion();
    await writeConsumer(root, testCase, adapter);
    console.log(`\n→ ${context(testCase, packageManager, requestedAdapterVersion)} install`);
    await runCommand(packageManager, packageManagerInstallArgs(packageManager), root);
    const installedVersion = await installedAdapterVersion(root);
    console.log(`→ ${context(testCase, packageManager, installedVersion)} production build`);
    await runCommand(packageManager, packageManagerBuildArgs(), root);
    console.log(`✓ ${context(testCase, packageManager, installedVersion)} passed`);
    return { root, adapterVersion: installedVersion };
  } catch (error) {
    const installedVersion = await installedAdapterVersion(root);
    throw new Error(`${context(testCase, packageManager, installedVersion)} failed: ${error.message}`, { cause: error });
  } finally {
    if (!keepTemp) await rm(root, { recursive: true, force: true });
    else console.log(`Compatibility consumer retained at ${root}`);
  }
}

export async function runCompatibility(options = {}) {
  const cases = selectCompatibilityCases(options.cases ?? option('--cases') ?? option('--case'));
  const packageManagers = selectPackageManagers(options.packageManagers ?? option('--package-managers') ?? option('--package-manager'));
  const keepTemp = options.keepTemp ?? process.argv.includes('--keep-temp');

  for (const packageManager of packageManagers) {
    for (const testCase of cases) {
      await runCompatibilityCase(testCase, packageManager, { keepTemp });
    }
  }
}

export function isCliEntry(moduleUrl, argvPath) {
  return Boolean(argvPath) && moduleUrl === pathToFileURL(argvPath).href;
}

if (isCliEntry(import.meta.url, process.argv[1])) {
  await runCompatibility();
}
