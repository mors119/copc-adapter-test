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
const NEXT_TURBOPACK_WASM_EXPECTED_FAILURE = {
  id: 'next-turbopack-adapter-wasm-url',
  reason: 'Next.js Turbopack cannot currently resolve the adapter package WASM URL modules (__wbindgen_* / ?url&no-inline). Remove this record when the upstream/package behavior is fixed.',
};

export const MATRIX = [
  { appId: 'vite-vanillajs-cesium', workspace: 'apps/vite-vanillajs', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter', scenario: 'camera-stream', runtimeScenarios: VANILLA_RUNTIME_SCENARIOS },
  { appId: 'vite-react-cesium', workspace: 'apps/vite-react-cesium', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-react-three', workspace: 'apps/vite-react-three', host: 'vite', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-r3f', workspace: 'apps/vite-r3f', host: 'vite', renderer: 'r3f', entry: '@frillab/copc-adapter/three', scenario: 'camera-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { matrixId: 'next-cesium-webpack', appId: 'next-cesium', bundler: 'webpack', workspace: 'apps/next-cesium', devScript: 'dev', buildScript: 'build', host: 'next', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { matrixId: 'next-cesium-turbopack', appId: 'next-cesium', bundler: 'turbopack', expectedFailure: NEXT_TURBOPACK_WASM_EXPECTED_FAILURE, workspace: 'apps/next-cesium', devScript: 'dev:turbo', buildScript: 'build:turbo', host: 'next', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { matrixId: 'next-three-webpack', appId: 'next-three', bundler: 'webpack', workspace: 'apps/next-three', devScript: 'dev', buildScript: 'build', host: 'next', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { matrixId: 'next-three-turbopack', appId: 'next-three', bundler: 'turbopack', expectedFailure: NEXT_TURBOPACK_WASM_EXPECTED_FAILURE, workspace: 'apps/next-three', devScript: 'dev:turbo', buildScript: 'build:turbo', host: 'next', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { matrixId: 'next-r3f-webpack', appId: 'next-r3f', bundler: 'webpack', workspace: 'apps/next-r3f', devScript: 'dev', buildScript: 'build', host: 'next', renderer: 'r3f', entry: '@frillab/copc-adapter/three', scenario: 'camera-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { matrixId: 'next-r3f-turbopack', appId: 'next-r3f', bundler: 'turbopack', expectedFailure: NEXT_TURBOPACK_WASM_EXPECTED_FAILURE, workspace: 'apps/next-r3f', devScript: 'dev:turbo', buildScript: 'build:turbo', host: 'next', renderer: 'r3f', entry: '@frillab/copc-adapter/three', scenario: 'camera-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'nuxt-cesium', workspace: 'apps/nuxt-cesium', host: 'nuxt', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'nuxt-three', workspace: 'apps/nuxt-three', host: 'nuxt', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'sveltekit-cesium', workspace: 'apps/sveltekit-cesium', host: 'sveltekit', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'sveltekit-three', workspace: 'apps/sveltekit-three', host: 'sveltekit', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'astro-cesium', workspace: 'apps/astro-cesium', host: 'astro', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'astro-three', workspace: 'apps/astro-three', host: 'astro', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
];

export function selectMatrix(selector) {
  if (!selector) return MATRIX;

  const requested = new Set(selector.split(',').map((value) => value.trim()).filter(Boolean));
  const selected = MATRIX.filter((entry) => requested.has(entry.matrixId ?? entry.appId) || requested.has(entry.appId) || requested.has(entry.workspace));

  if (selected.length === 0) {
    throw new Error(`No matrix apps matched "${selector}". Use: ${MATRIX.map((entry) => entry.matrixId ?? entry.appId).join(', ')}`);
  }

  return selected;
}
