const CORE_RUNTIME_SCENARIOS = [
  'metadata-root-hierarchy',
  'attach-to-caller-renderer',
  'initial-point-rendering',
  'camera-streaming-update',
  'equivalent-view-is-stable',
  'reload-to-ready',
  'diagnostics-observable',
  'source-error-is-visible',
  'rust-failure-is-not-retried',
];
const VANILLA_RUNTIME_SCENARIOS = [
  ...CORE_RUNTIME_SCENARIOS,
  'detach-preserves-host-resources',
  'unload-releases-point-state',
  'destroy-releases-layer-resources',
];
const API_RUNTIME_SCENARIOS = [
  ...CORE_RUNTIME_SCENARIOS,
  'detach-preserves-host-resources',
  'unload-releases-point-state',
  'destroy-releases-layer-resources',
  'point-picking',
  'api-lifecycle',
  'source-probe',
];

export const MATRIX_BACKENDS = ['copc-js', 'rust'];
export const MATRIX_BROWSERS = ['chromium', 'firefox', 'webkit'];
export const MATRIX_FIXTURES = ['small-valid-copc', 'point-format-7-rgb'];

export const MATRIX = [
  { appId: 'vite-vanillajs-cesium', workspace: 'apps/vite-vanillajs', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: VANILLA_RUNTIME_SCENARIOS },
  { appId: 'vite-vanilla-three', workspace: 'apps/vite-vanilla-three', host: 'vite', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-react-cesium', workspace: 'apps/vite-react-cesium', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-react-three', workspace: 'apps/vite-react-three', host: 'vite', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: API_RUNTIME_SCENARIOS },
  { appId: 'vite-r3f', workspace: 'apps/vite-r3f', host: 'vite', renderer: 'r3f', entry: '@frillab/copc-adapter/three', scenario: 'camera-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-vue-cesium', workspace: 'apps/vite-vue-cesium', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-vue-three', workspace: 'apps/vite-vue-three', host: 'vite', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-svelte-cesium', workspace: 'apps/vite-svelte-cesium', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-svelte-three', workspace: 'apps/vite-svelte-three', host: 'vite', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'next-cesium', workspace: 'apps/next-cesium', host: 'next', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'next-three', workspace: 'apps/next-three', host: 'next', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'next-r3f', workspace: 'apps/next-r3f', host: 'next', renderer: 'r3f', entry: '@frillab/copc-adapter/three', scenario: 'camera-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'webpack-three', workspace: 'apps/webpack-three', host: 'webpack', renderer: 'three', bundler: 'webpack', entry: '@frillab/copc-adapter/three', scenario: 'camera-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'rollup-cesium', workspace: 'apps/rollup-cesium', host: 'rollup', renderer: 'cesium', bundler: 'rollup', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'esbuild-three', workspace: 'apps/esbuild-three', host: 'esbuild', renderer: 'three', bundler: 'esbuild', entry: '@frillab/copc-adapter/three', scenario: 'camera-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'parcel-three', workspace: 'apps/parcel-three', host: 'parcel', renderer: 'three', bundler: 'parcel', entry: '@frillab/copc-adapter/three', scenario: 'camera-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'angular-cesium', workspace: 'apps/angular-cesium', host: 'angular', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'angular-three', workspace: 'apps/angular-three', host: 'angular', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', backends: MATRIX_BACKENDS, runtimeScenarios: CORE_RUNTIME_SCENARIOS },
];

const ALL_APP_IDS = MATRIX.map((entry) => entry.appId);

/**
 * These are the selectors used by local commands and CI. Build/typecheck
 * always cover every app in the selected tier; runtime projects use the
 * explicit app/browser/backend/fixture dimensions below.
 */
export const MATRIX_TIERS = {
  fast: {
    apps: ['vite-vanillajs-cesium', 'vite-vanilla-three', 'vite-react-cesium', 'vite-react-three', 'vite-r3f', 'vite-vue-cesium', 'vite-vue-three', 'vite-svelte-cesium', 'vite-svelte-three', 'webpack-three', 'rollup-cesium', 'angular-cesium', 'angular-three'],
    buildApps: ALL_APP_IDS,
    browsers: ['chromium'],
    backends: ['copc-js'],
    fixtures: ['small-valid-copc'],
    packageSource: 'npm',
    packageVersion: '0.3.0',
  },
  full: {
    apps: ALL_APP_IDS,
    buildApps: ALL_APP_IDS,
    browsers: MATRIX_BROWSERS,
    backends: MATRIX_BACKENDS,
    fixtures: MATRIX_FIXTURES,
    packageSource: 'npm',
    packageVersion: '0.3.0',
  },
  release: {
    apps: ['vite-react-cesium', 'vite-react-three', 'vite-r3f', 'next-cesium', 'next-three', 'next-r3f'],
    buildApps: ['vite-react-cesium', 'vite-react-three', 'vite-r3f', 'next-cesium', 'next-three', 'next-r3f'],
    browsers: ['chromium'],
    backends: ['copc-js'],
    fixtures: ['small-valid-copc'],
    packageSource: 'tarball',
    packageVersion: 'packed-checkout',
  },
};

export function selectMatrix(selector) {
  if (!selector) return MATRIX;

  const requested = new Set((Array.isArray(selector) ? selector : selector.split(','))
    .map((value) => value.trim())
    .filter(Boolean));
  const selected = MATRIX.filter((entry) => requested.has(entry.appId) || requested.has(entry.workspace));

  if (selected.length === 0) {
    throw new Error(`No matrix apps matched "${selector}". Use: ${MATRIX.map((entry) => entry.appId).join(', ')}`);
  }

  return selected;
}

export function selectTier(tier = 'fast') {
  const selected = MATRIX_TIERS[tier];
  if (!selected) {
    throw new Error(`Unknown matrix tier "${tier}". Use: ${Object.keys(MATRIX_TIERS).join(', ')}`);
  }
  return selected;
}

function valuesFromOption(option, fallback) {
  if (!option) return fallback;
  const values = option.split(',').map((value) => value.trim()).filter(Boolean);
  return values.length > 0 ? values : fallback;
}

/** Return concrete runtime combinations with a stable, report-friendly ID. */
export function selectMatrixCases(tier = 'fast', options = {}) {
  const definition = selectTier(tier);
  const apps = selectMatrix(options.apps ?? definition.apps);
  const browsers = valuesFromOption(options.browsers, definition.browsers);
  const backends = valuesFromOption(options.backends, definition.backends);
  const fixtures = valuesFromOption(options.fixtures, definition.fixtures);

  for (const browser of browsers) {
    if (!MATRIX_BROWSERS.includes(browser)) throw new Error(`Unsupported browser "${browser}".`);
  }
  for (const backend of backends) {
    if (!MATRIX_BACKENDS.includes(backend)) throw new Error(`Unsupported backend "${backend}".`);
  }

  return apps.flatMap((app) => browsers.flatMap((browser) => backends.flatMap((backend) => fixtures.map((fixtureId) => ({
    ...app,
    browser,
    backend,
    fixtureId,
    packageSource: options.packageSource ?? definition.packageSource,
    packageVersion: options.packageVersion ?? definition.packageVersion,
    caseId: `${app.appId}-${browser}-${backend}-${fixtureId}`,
  })))));
}
