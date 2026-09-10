export const MATRIX = [
  { appId: 'vite-vanillajs-cesium', workspace: 'apps/vite-vanillajs', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter', scenario: 'camera-stream' },
  { appId: 'vite-react-cesium', workspace: 'apps/vite-react-cesium', host: 'vite', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream' },
  { appId: 'vite-react-three', workspace: 'apps/vite-react-three', host: 'vite', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream' },
  { appId: 'vite-r3f', workspace: 'apps/vite-r3f', host: 'vite', renderer: 'r3f', entry: '@frillab/copc-adapter/three', scenario: 'camera-stream' },
  { appId: 'next-cesium', workspace: 'apps/next-cesium', host: 'next', renderer: 'cesium', entry: '@frillab/copc-adapter/cesium', scenario: 'load-and-stream' },
  { appId: 'next-three', workspace: 'apps/next-three', host: 'next', renderer: 'three', entry: '@frillab/copc-adapter/three', scenario: 'load-and-stream' },
  { appId: 'next-r3f', workspace: 'apps/next-r3f', host: 'next', renderer: 'r3f', entry: '@frillab/copc-adapter/three', scenario: 'camera-stream' },
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
