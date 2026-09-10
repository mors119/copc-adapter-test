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

export const MATRIX = [
  { appId: 'vite-vanillajs-cesium', workspace: 'apps/vite-vanillajs', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter', scenario: 'load-and-stream', runtimeScenarios: VANILLA_RUNTIME_SCENARIOS },
  { appId: 'vite-vanilla-three', workspace: 'apps/vite-vanilla-three', host: 'vite', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-react-cesium', workspace: 'apps/vite-react-cesium', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-react-three', workspace: 'apps/vite-react-three', host: 'vite', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-r3f', workspace: 'apps/vite-r3f', host: 'vite', renderer: 'r3f', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-vue-cesium', workspace: 'apps/vite-vue-cesium', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-vue-three', workspace: 'apps/vite-vue-three', host: 'vite', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-svelte-cesium', workspace: 'apps/vite-svelte-cesium', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'vite-svelte-three', workspace: 'apps/vite-svelte-three', host: 'vite', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'next-cesium', workspace: 'apps/next-cesium', host: 'next', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'next-three', workspace: 'apps/next-three', host: 'next', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
  { appId: 'next-r3f', workspace: 'apps/next-r3f', host: 'next', renderer: 'r3f', entry: '@frillab/copc-adapter/three', scenario: 'camera-stream', runtimeScenarios: CORE_RUNTIME_SCENARIOS },
];

export function selectMatrix(selector) {
  if (!selector) return MATRIX;

  const requested = new Set(selector.split(',').map((value) => value.trim()).filter(Boolean));
  const selected = MATRIX.filter((entry) => requested.has(entry.appId) || requested.has(entry.workspace));

  if (selected.length === 0) {
    throw new Error(`No matrix apps matched "${selector}". Use: ${MATRIX.map((entry) => entry.appId).join(', ')}`);
  }

  return selected;
}
