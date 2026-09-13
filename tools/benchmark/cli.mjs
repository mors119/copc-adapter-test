import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ADAPTER_TARGET_VERSION } from '../matrix/package-source.mjs';
import { compareReports, formatComparison } from './report.mjs';
import { spawnPlatformCommand } from '../command.mjs';

const profiles = {
  quick: {
    apps: 'vite-vanillajs-cesium',
    browsers: 'chromium',
    backends: 'copc-js',
    fixtures: 'small-valid-copc',
    repeat: '1',
  },
  representative: {
    apps: 'vite-react-cesium,vite-react-three',
    browsers: 'chromium',
    backends: 'copc-js,rust',
    fixtures: 'small-valid-copc,point-format-7-rgb',
    repeat: '2',
  },
  full: {
    // Keep the full benchmark matrix limited to consumers with the benchmark
    // harness hooks required by every scenario. Framework coverage remains in
    // the correctness matrix until its consumer-specific integration exists.
    apps: 'vite-react-cesium,vite-react-three',
    browsers: 'chromium,firefox,webkit',
    backends: 'copc-js,rust',
    fixtures: 'small-valid-copc,point-format-7-rgb,geographic-crs',
    repeat: '3',
  },
};

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function run(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnPlatformCommand(command, args, { stdio: 'inherit', env });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolvePromise(code ?? (signal ? 1 : 0)));
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

const profileName = option('--profile') ?? 'quick';
const profile = profiles[profileName];
if (!profile) throw new Error(`Unknown benchmark profile "${profileName}". Use quick, representative, or full.`);

const outputFile = resolve(option('--output') ?? 'benchmark-results/latest.json');
const packageSource = process.env.COPC_ADAPTER_SOURCE ?? 'npm';
const packageVersion = process.env.COPC_ADAPTER_VERSION ?? ADAPTER_TARGET_VERSION;
const selected = {
  apps: option('--apps') ?? profile.apps,
  browsers: option('--browsers') ?? profile.browsers,
  backends: option('--backends') ?? profile.backends,
  fixtures: option('--fixtures') ?? profile.fixtures,
  repeat: option('--repeat') ?? profile.repeat,
};
const environment = {
  ...process.env,
  COPC_BENCHMARK: '1',
  COPC_BENCHMARK_OUTPUT: outputFile,
  COPC_BENCHMARK_REPEAT: selected.repeat,
  COPC_BENCHMARK_CACHE_BYTES: process.env.COPC_BENCHMARK_CACHE_BYTES ?? '8388608',
  COPC_E2E_MODE: 'full',
  COPC_E2E_PACKAGE_SOURCE: packageSource,
  COPC_E2E_PACKAGE_VERSION: packageVersion,
  VITE_COPC_PACKAGE_SOURCE: packageSource,
  VITE_COPC_PACKAGE_VERSION: packageVersion,
  NEXT_PUBLIC_COPC_PACKAGE_SOURCE: packageSource,
  NEXT_PUBLIC_COPC_PACKAGE_VERSION: packageVersion,
  COPC_E2E_APPS: selected.apps,
  COPC_E2E_BROWSERS: selected.browsers,
  COPC_E2E_BACKENDS: selected.backends,
  COPC_E2E_FIXTURES: selected.fixtures,
  COPC_E2E_TIMEOUT: process.env.COPC_E2E_TIMEOUT ?? '600000',
  COPC_E2E_READY_TIMEOUT: process.env.COPC_E2E_READY_TIMEOUT ?? '300000',
};

if (!hasFlag('--no-fetch')) {
  const fixtureArgs = selected.fixtures.split(',').map((fixture) => fixture.trim()).filter(Boolean);
  const fetchCode = await run('npm', ['run', 'fixtures', '--', 'fetch', ...fixtureArgs], environment);
  if (fetchCode !== 0) process.exit(fetchCode);
}

console.log(`Running benchmark profile=${profileName} apps=${selected.apps} browsers=${selected.browsers} backends=${selected.backends} fixtures=${selected.fixtures} repeat=${selected.repeat}`);
const testCode = await run('npm', ['run', 'e2e', '--', '--config', 'playwright.config.mjs'], environment);

const baselineFile = option('--baseline');
if (baselineFile) {
  const comparison = compareReports(await readJson(outputFile), await readJson(baselineFile), {
    minSamples: 2,
  });
  const comparisonFile = resolve(option('--comparison-output') ?? outputFile.replace(/\.json$/, '.comparison.json'));
  await writeFile(comparisonFile, `${JSON.stringify(comparison, null, 2)}\n`);
  console.log(formatComparison(comparison));
  console.log(`Benchmark comparison written to ${comparisonFile}`);
  if (hasFlag('--fail-on-regression') && comparison.hardRegressions.length > 0) process.exitCode = 1;
}

if (testCode !== 0) process.exitCode = testCode;
