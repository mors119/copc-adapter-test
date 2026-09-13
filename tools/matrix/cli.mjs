import {
  ADAPTER_PACKAGE,
  ADAPTER_TARGET_VERSION,
  installAdapterSource,
  PUBLIC_ENTRYPOINTS,
} from './package-source.mjs';
import { runReleaseGate } from './release-gate.mjs';
import { selectMatrix, selectTier } from './manifest.mjs';
import { runMatrix } from './runner.mjs';
import { spawn } from 'node:child_process';

const command = process.argv[2] ?? 'build';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function printInstalledAdapter(result) {
  console.log(`Installed ${ADAPTER_PACKAGE}@${result.version} from ${result.spec}`);
  console.log(`Package boundary: ${PUBLIC_ENTRYPOINTS.join(', ')}`);
}

function configureLocalCheckout() {
  process.env.COPC_ADAPTER_SOURCE = 'checkout';
  process.env.COPC_ADAPTER_VERSION = ADAPTER_TARGET_VERSION;
  if (!process.env.COPC_ADAPTER_CHECKOUT) process.env.COPC_ADAPTER_CHECKOUT = '../copc-adapter';
}

async function bootstrapAdapter() {
  const result = await installAdapterSource();
  printInstalledAdapter(result);
  return result;
}

function localConsumer(mode) {
  const defaultApp = mode === 'cesium' ? 'vite-react-cesium' : 'vite-vanilla-three';
  const requested = option('--app') ?? process.env.COPC_LOCAL_APP ?? defaultApp;
  const apps = selectMatrix(requested);
  if (apps.length !== 1) {
    throw new Error(`Local development requires one consumer app; "${requested}" matched ${apps.length}. Use a concrete app such as vite-vanilla-three.`);
  }
  const [app] = apps;
  const expectedRenderer = mode === 'cesium' ? 'cesium' : undefined;
  if (expectedRenderer && app.renderer !== expectedRenderer) {
    throw new Error(`${requested} is not a Cesium consumer.`);
  }
  if (!expectedRenderer && app.renderer !== 'three' && app.renderer !== 'r3f') {
    throw new Error(`${requested} is not a Three consumer.`);
  }
  return app;
}

function forwardedLocalArgs() {
  const args = process.argv.slice(4);
  const forwarded = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--app') {
      index += 1;
      continue;
    }
    forwarded.push(args[index]);
  }
  return forwarded;
}

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

function tierOptions(tier) {
  const definition = selectTier(tier);
  return {
    apps: option('--apps') ?? option('--app'),
    browsers: option('--browsers'),
    backends: option('--backends'),
    fixtures: option('--fixtures'),
    packageSource: process.env.COPC_ADAPTER_SOURCE ?? definition.packageSource,
    packageVersion: process.env.COPC_ADAPTER_VERSION ?? definition.packageVersion,
  };
}

async function fetchFixtures(fixtureSelector) {
  await npmCommand(['run', 'fixtures', '--', 'fetch', ...fixtureSelector.split(',')]);
}

async function runTier(tier) {
  const definition = selectTier(tier);
  const options = tierOptions(tier);
  const buildApps = options.apps ?? definition.buildApps.join(',');
  const runtimeApps = options.apps ?? definition.apps.join(',');
  const browsers = options.browsers ?? definition.browsers.join(',');
  const backends = options.backends ?? definition.backends.join(',');
  const fixtures = options.fixtures ?? definition.fixtures.join(',');

  if (!hasFlag('--skip-bootstrap') && !process.env.COPC_MATRIX_SKIP_BOOTSTRAP) {
    await npmCommand(['run', 'bootstrap'], {
      ...process.env,
      COPC_ADAPTER_SOURCE: options.packageSource,
      COPC_ADAPTER_VERSION: options.packageVersion,
    });
  }
  await npmCommand(['run', 'test:contract']);
  await npmCommand(['run', 'test:fixtures']);
  if (!hasFlag('--skip-fixtures') && !process.env.COPC_MATRIX_SKIP_FIXTURES) {
    await fetchFixtures(fixtures);
  }

  await runMatrix('typecheck', { ...options, apps: buildApps });
  await runMatrix('build', { ...options, apps: buildApps });

  if (hasFlag('--skip-e2e') || process.env.COPC_MATRIX_SKIP_E2E) return;
  const e2eEnv = {
    ...process.env,
    COPC_E2E_MODE: tier,
    COPC_E2E_APPS: runtimeApps,
    COPC_E2E_BROWSERS: browsers,
    COPC_E2E_BACKENDS: backends,
    COPC_E2E_FIXTURES: fixtures,
    VITE_COPC_PACKAGE_SOURCE: options.packageSource,
    VITE_COPC_PACKAGE_VERSION: options.packageVersion,
    NEXT_PUBLIC_COPC_PACKAGE_SOURCE: options.packageSource,
    NEXT_PUBLIC_COPC_PACKAGE_VERSION: options.packageVersion,
    COPC_E2E_PACKAGE_SOURCE: options.packageSource,
    COPC_E2E_PACKAGE_VERSION: options.packageVersion,
  };
  await npmCommand(['run', 'e2e'], e2eEnv);
}

if (command === 'bootstrap') {
  await bootstrapAdapter();
} else if (command === 'bootstrap-local') {
  configureLocalCheckout();
  await bootstrapAdapter();
} else if (command === 'dev-local') {
  const mode = process.argv[3] ?? 'three';
  if (mode !== 'three' && mode !== 'cesium') {
    throw new Error(`Unknown local development renderer "${mode}". Use three or cesium.`);
  }
  configureLocalCheckout();
  await bootstrapAdapter();
  const app = localConsumer(mode);
  await npmCommand(['run', app.devScript ?? 'dev', '--workspace', app.workspace, '--', ...forwardedLocalArgs()]);
} else if (command === 'build') {
  await runMatrix('build');
} else if (command === 'typecheck') {
  await runMatrix('typecheck');
} else if (command === 'fast' || command === 'full' || command === 'local' || command === 'three') {
  await runTier(command);
} else if (command === 'release' || command === 'release-gate') {
  await runReleaseGate({
    apps: option('--apps'),
    browsers: option('--browsers'),
    backends: option('--backends'),
    fixtures: option('--fixtures'),
    skipE2E: hasFlag('--skip-e2e') || Boolean(process.env.COPC_MATRIX_SKIP_E2E),
    skipFixtures: hasFlag('--skip-fixtures') || Boolean(process.env.COPC_MATRIX_SKIP_FIXTURES),
  });
} else {
  throw new Error(`Unknown command "${command}". Use bootstrap, bootstrap-local, dev-local, build, typecheck, fast, full, local, three, or release.`);
}
