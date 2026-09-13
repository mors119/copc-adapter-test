import { ADAPTER_TARGET_VERSION } from './package-source.mjs';

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

const NEXT_TURBOPACK_WASM_EXPECTED_FAILURE = {
  id: 'next-turbopack-adapter-wasm-url',
  reason:
    'Next.js Turbopack cannot currently resolve the adapter package WASM URL modules (__wbindgen_* / ?url&no-inline). Remove this record when the upstream/package behavior is fixed.',
  outputIncludes: ['copc_wasm.wasm_.loader.mjs', '?url&no-inline'],
};

export const MATRIX_BACKENDS = ['copc-js', 'rust'];
export const MATRIX_BROWSERS = ['chromium', 'firefox', 'webkit'];
// Runnable fixtures are intentionally kept separate from documented gaps. The
// full/scheduled tier must exercise every available dataset without turning a
// known unavailable public URL into a red build.
export const MATRIX_FIXTURES = [
  'small-valid-copc',
  'point-format-7-rgb',
  'geographic-crs',
];
export const MATRIX_FIXTURE_GAPS = ['point-format-8-rgb-nir'];

export const MATRIX = [
  {
    appId: 'vite-vanillajs-cesium',
    workspace: 'apps/vite-vanillajs',
    host: 'vite',
    renderer: 'cesium',
    entry: '@frillab/copc-adapter',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: VANILLA_RUNTIME_SCENARIOS,
  },
  {
    appId: 'vite-vanilla-three',
    workspace: 'apps/vite-vanilla-three',
    host: 'vite',
    renderer: 'three',
    entry: '@frillab/copc-adapter/three',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'vite-react-cesium',
    workspace: 'apps/vite-react-cesium',
    host: 'vite',
    renderer: 'cesium',
    entry: '@frillab/copc-adapter/cesium',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'vite-react-three',
    workspace: 'apps/vite-react-three',
    host: 'vite',
    renderer: 'three',
    entry: '@frillab/copc-adapter/three',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: API_RUNTIME_SCENARIOS,
  },
  {
    appId: 'vite-r3f',
    workspace: 'apps/vite-r3f',
    host: 'vite',
    renderer: 'r3f',
    entry: '@frillab/copc-adapter/three',
    scenario: 'camera-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'vite-vue-cesium',
    workspace: 'apps/vite-vue-cesium',
    host: 'vite',
    renderer: 'cesium',
    entry: '@frillab/copc-adapter/cesium',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'vite-vue-three',
    workspace: 'apps/vite-vue-three',
    host: 'vite',
    renderer: 'three',
    entry: '@frillab/copc-adapter/three',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'vite-svelte-cesium',
    workspace: 'apps/vite-svelte-cesium',
    host: 'vite',
    renderer: 'cesium',
    entry: '@frillab/copc-adapter/cesium',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'vite-svelte-three',
    workspace: 'apps/vite-svelte-three',
    host: 'vite',
    renderer: 'three',
    entry: '@frillab/copc-adapter/three',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    matrixId: 'next-cesium-webpack',
    appId: 'next-cesium',
    bundler: 'webpack',
    workspace: 'apps/next-cesium',
    devScript: 'dev',
    buildScript: 'build',
    host: 'next',
    renderer: 'cesium',
    entry: '@frillab/copc-adapter/cesium',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    matrixId: 'next-cesium-turbopack',
    appId: 'next-cesium',
    bundler: 'turbopack',
    expectedFailure: NEXT_TURBOPACK_WASM_EXPECTED_FAILURE,
    workspace: 'apps/next-cesium',
    devScript: 'dev:turbo',
    buildScript: 'build:turbo',
    host: 'next',
    renderer: 'cesium',
    entry: '@frillab/copc-adapter/cesium',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    matrixId: 'next-three-webpack',
    appId: 'next-three',
    bundler: 'webpack',
    workspace: 'apps/next-three',
    devScript: 'dev',
    buildScript: 'build',
    host: 'next',
    renderer: 'three',
    entry: '@frillab/copc-adapter/three',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    matrixId: 'next-three-turbopack',
    appId: 'next-three',
    bundler: 'turbopack',
    expectedFailure: NEXT_TURBOPACK_WASM_EXPECTED_FAILURE,
    workspace: 'apps/next-three',
    devScript: 'dev:turbo',
    buildScript: 'build:turbo',
    host: 'next',
    renderer: 'three',
    entry: '@frillab/copc-adapter/three',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    matrixId: 'next-r3f-webpack',
    appId: 'next-r3f',
    bundler: 'webpack',
    workspace: 'apps/next-r3f',
    devScript: 'dev',
    buildScript: 'build',
    host: 'next',
    renderer: 'r3f',
    entry: '@frillab/copc-adapter/three',
    scenario: 'camera-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    matrixId: 'next-r3f-turbopack',
    appId: 'next-r3f',
    bundler: 'turbopack',
    expectedFailure: NEXT_TURBOPACK_WASM_EXPECTED_FAILURE,
    workspace: 'apps/next-r3f',
    devScript: 'dev:turbo',
    buildScript: 'build:turbo',
    host: 'next',
    renderer: 'r3f',
    entry: '@frillab/copc-adapter/three',
    scenario: 'camera-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'nuxt-cesium',
    workspace: 'apps/nuxt-cesium',
    host: 'nuxt',
    renderer: 'cesium',
    entry: '@frillab/copc-adapter/cesium',
    scenario: 'load-and-stream',
    startScript: 'start',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'nuxt-three',
    workspace: 'apps/nuxt-three',
    host: 'nuxt',
    renderer: 'three',
    entry: '@frillab/copc-adapter/three',
    scenario: 'load-and-stream',
    startScript: 'start',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'sveltekit-cesium',
    workspace: 'apps/sveltekit-cesium',
    host: 'sveltekit',
    renderer: 'cesium',
    entry: '@frillab/copc-adapter/cesium',
    scenario: 'load-and-stream',
    startScript: 'start',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'sveltekit-three',
    workspace: 'apps/sveltekit-three',
    host: 'sveltekit',
    renderer: 'three',
    entry: '@frillab/copc-adapter/three',
    scenario: 'load-and-stream',
    startScript: 'start',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'astro-cesium',
    workspace: 'apps/astro-cesium',
    host: 'astro',
    renderer: 'cesium',
    entry: '@frillab/copc-adapter/cesium',
    scenario: 'load-and-stream',
    startScript: 'start',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'astro-three',
    workspace: 'apps/astro-three',
    host: 'astro',
    renderer: 'three',
    entry: '@frillab/copc-adapter/three',
    scenario: 'load-and-stream',
    startScript: 'start',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'webpack-three',
    workspace: 'apps/webpack-three',
    host: 'webpack',
    renderer: 'three',
    bundler: 'webpack',
    entry: '@frillab/copc-adapter/three',
    scenario: 'camera-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'rollup-cesium',
    workspace: 'apps/rollup-cesium',
    host: 'rollup',
    renderer: 'cesium',
    bundler: 'rollup',
    entry: '@frillab/copc-adapter/cesium',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'esbuild-three',
    workspace: 'apps/esbuild-three',
    host: 'esbuild',
    renderer: 'three',
    bundler: 'esbuild',
    entry: '@frillab/copc-adapter/three',
    scenario: 'camera-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'parcel-three',
    workspace: 'apps/parcel-three',
    host: 'parcel',
    renderer: 'three',
    bundler: 'parcel',
    entry: '@frillab/copc-adapter/three',
    scenario: 'camera-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'angular-cesium',
    workspace: 'apps/angular-cesium',
    host: 'angular',
    renderer: 'cesium',
    entry: '@frillab/copc-adapter/cesium',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
  {
    appId: 'angular-three',
    workspace: 'apps/angular-three',
    host: 'angular',
    renderer: 'three',
    entry: '@frillab/copc-adapter/three',
    scenario: 'load-and-stream',
    backends: MATRIX_BACKENDS,
    runtimeScenarios: CORE_RUNTIME_SCENARIOS,
  },
];

const ALL_APP_IDS = [...new Set(MATRIX.map((entry) => entry.appId))];
const THREE_MATRIX_IDS = MATRIX
  .filter((entry) => entry.renderer === 'three' || entry.renderer === 'r3f')
  .map((entry) => entry.matrixId ?? entry.appId);

/**
 * These are the selectors used by local commands and CI. Build/typecheck
 * always cover every app in the selected tier; runtime projects use the
 * explicit app/browser/backend/fixture dimensions below.
 */
export const MATRIX_TIERS = {
  fast: {
    apps: ['vite-vanillajs-cesium', 'vite-react-three'],

    buildApps: [
      'vite-vanillajs-cesium',
      'vite-react-cesium',
      'vite-react-three',
      'next-cesium',
      'next-three',
    ],

    browsers: ['chromium'],
    backends: ['copc-js'],
    fixtures: ['small-valid-copc'],

    packageSource: 'npm',
    packageVersion: ADAPTER_TARGET_VERSION,
  },
  visual: {
    // Keep visual coverage representative and intentionally small. The
    // renderer output is shared by these Vite consumers, so every framework
    // does not need a separate screenshot baseline.
    apps: ['vite-react-cesium', 'vite-react-three', 'vite-r3f'],
    buildApps: ['vite-react-cesium', 'vite-react-three', 'vite-r3f'],

    browsers: ['chromium'],
    backends: ['copc-js'],
    fixtures: ['small-valid-copc'],

    packageSource: 'checkout',
    packageVersion: ADAPTER_TARGET_VERSION,
  },
  full: {
    apps: ALL_APP_IDS,
    buildApps: ALL_APP_IDS,
    browsers: MATRIX_BROWSERS,
    backends: MATRIX_BACKENDS,
    fixtures: MATRIX_FIXTURES,
    packageSource: 'npm',
    packageVersion: ADAPTER_TARGET_VERSION,
  },
  release: {
    apps: [
      'vite-react-cesium',
      'vite-react-three',
      'vite-r3f',
      'next-cesium',
      'next-three',
      'next-r3f',
    ],
    buildApps: [
      'vite-react-cesium',
      'vite-react-three',
      'vite-r3f',
      'next-cesium',
      'next-three',
      'next-r3f',
    ],
    browsers: ['chromium'],
    backends: ['copc-js'],
    fixtures: ['small-valid-copc'],
    packageSource: 'tarball',
    packageVersion: ADAPTER_TARGET_VERSION,
  },
  local: {
    apps: ['vite-vanillajs-cesium', 'vite-react-three'],
    buildApps: [
      'vite-vanillajs-cesium',
      'vite-react-cesium',
      'vite-react-three',
      'next-cesium',
      'next-three',
    ],
    browsers: ['chromium'],
    backends: ['copc-js'],
    fixtures: ['small-valid-copc'],
    packageSource: 'checkout',
    packageVersion: ADAPTER_TARGET_VERSION,
  },
  three: {
    apps: THREE_MATRIX_IDS,
    buildApps: THREE_MATRIX_IDS,
    browsers: ['chromium'],
    backends: ['copc-js'],
    fixtures: ['small-valid-copc'],
    packageSource: 'checkout',
    packageVersion: ADAPTER_TARGET_VERSION,
  },
};

export function selectMatrix(selector) {
  if (!selector) return MATRIX;

  const requested = new Set(
    (Array.isArray(selector) ? selector : selector.split(','))
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const selected = MATRIX.filter(
    (entry) =>
      requested.has(entry.matrixId ?? entry.appId) ||
      requested.has(entry.appId) ||
      requested.has(entry.workspace),
  );

  if (selected.length === 0) {
    throw new Error(
      `No matrix apps matched "${selector}". Use: ${MATRIX.map((entry) => entry.matrixId ?? entry.appId).join(', ')}`,
    );
  }

  return selected;
}

export function selectTier(tier = 'fast') {
  const selected = MATRIX_TIERS[tier];
  if (!selected) {
    throw new Error(
      `Unknown matrix tier "${tier}". Use: ${Object.keys(MATRIX_TIERS).join(', ')}`,
    );
  }
  return selected;
}

function valuesFromOption(option, fallback) {
  if (!option) return fallback;
  const values = option
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
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
    if (!MATRIX_BROWSERS.includes(browser))
      throw new Error(`Unsupported browser "${browser}".`);
  }
  for (const backend of backends) {
    if (!MATRIX_BACKENDS.includes(backend))
      throw new Error(`Unsupported backend "${backend}".`);
  }
  for (const fixture of fixtures) {
    if (!MATRIX_FIXTURES.includes(fixture)) {
      const gap = MATRIX_FIXTURE_GAPS.includes(fixture)
        ? ' It is recorded as a fixture gap.'
        : '';
      throw new Error(`Unsupported or unavailable fixture "${fixture}".${gap}`);
    }
  }

  return apps.flatMap((app) =>
    browsers.flatMap((browser) =>
      backends.flatMap((backend) =>
        fixtures.map((fixtureId) => ({
          ...app,
          browser,
          backend,
          fixtureId,
          packageSource: options.packageSource ?? definition.packageSource,
          packageVersion: options.packageVersion ?? definition.packageVersion,
          caseId: `${app.matrixId ?? app.appId}-${browser}-${backend}-${fixtureId}`,
        })),
      ),
    ),
  );
}
