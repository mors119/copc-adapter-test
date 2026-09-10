import type { CopcCesiumLayer, CopcCesiumLayerSnapshot } from '@frillab/copc-adapter/cesium';
import type * as CesiumTypes from 'cesium';
import type { HarnessConfig, CopcTestContract } from '@copc-test/harness-core';

type CesiumHarnessOptions = {
  container: HTMLDivElement;
  config: HarnessConfig;
  contract: CopcTestContract;
  onStatus: (status: string) => void;
  onSnapshot: (snapshot: CopcCesiumLayerSnapshot | undefined) => void;
};

/** Mount Cesium only after the framework has established its browser boundary. */
export function startCesiumHarness({
  container,
  config,
  contract,
  onStatus,
  onSnapshot,
}: CesiumHarnessOptions): () => void {
  let disposed = false;
  let timer: number | undefined;
  let viewer: CesiumTypes.Viewer | undefined;
  let layer: CopcCesiumLayer | undefined;

  onStatus('loading');
  void (async (): Promise<void> => {
    try {
      const [Cesium, adapter] = await Promise.all([
        import('cesium'),
        import('@frillab/copc-adapter/cesium'),
      ]);
      if (disposed) return;

      (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = '/api/cesium/';
      const currentViewer = new Cesium.Viewer(container, {
        animation: false,
        timeline: false,
        geocoder: false,
        baseLayerPicker: false,
        baseLayer: false,
        skyBox: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        homeButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
      });
      viewer = currentViewer;
      const currentLayer = new adapter.CopcCesiumLayer({
        url: config.fixtureUrl,
        colorMode: 'elevation',
        backend: config.backend,
        pointSize: 2,
        debug: true,
        streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8 },
      });
      layer = currentLayer;
      timer = window.setInterval(() => onSnapshot(currentLayer.getSnapshot()), 250);
      await currentLayer.load();
      if (disposed) return;
      currentLayer.attachTo(currentViewer);
      contract.markAttached();
      onSnapshot(currentLayer.getSnapshot());
      onStatus('ready');
    } catch (error: unknown) {
      if (!disposed) {
        contract.markError(error);
        onStatus('error');
      }
    }
  })();

  return () => {
    if (disposed) return;
    disposed = true;
    if (timer !== undefined) window.clearInterval(timer);
    layer?.destroy();
    if (viewer && !viewer.isDestroyed()) viewer.destroy();
    contract.markDestroyed();
    onSnapshot(undefined);
  };
}
