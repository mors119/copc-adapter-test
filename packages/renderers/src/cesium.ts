import type * as CesiumTypes from 'cesium';
import type { CopcCesiumLayer, CopcCesiumLayerSnapshot } from '@frillab/copc-adapter/cesium';
import type { HarnessView } from '@copc-test/core';
import type { RendererOptions, TestRenderer } from './types';

export function mountCesiumRenderer(container: HTMLElement, options: RendererOptions): TestRenderer {
  let disposed = false;
  let cesiumModule: typeof import('cesium') | undefined;
  let viewer: CesiumTypes.Viewer | undefined;
  let layer: CopcCesiumLayer | undefined;
  let timer: number | undefined;
  options.onStatus('loading');

  const ready = (async (): Promise<void> => {
    try {
      (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = '/cesium/';
      const [Cesium, adapter] = await Promise.all([
        import('cesium'),
        import('@frillab/copc-adapter/cesium'),
      ]);
      if (disposed) return;
      cesiumModule = Cesium;

      const currentViewer = new Cesium.Viewer(container, {
        animation: false,
        timeline: false,
        geocoder: false,
        baseLayerPicker: false,
        baseLayer: false,
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        sceneModePicker: false,
        navigationHelpButton: false,
        homeButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
      });
      viewer = currentViewer;
      currentViewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#06101d');
      currentViewer.scene.globe.show = true;
      currentViewer.scene.globe.enableLighting = true;
      const localImagery = await Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
      );
      if (disposed) return;
      currentViewer.imageryLayers.addImageryProvider(localImagery);

      const currentLayer = new adapter.CopcCesiumLayer({
        url: options.fixtureUrl,
        backend: options.backend,
        colorMode: 'elevation',
        pointSize: 3,
        maxRenderedPoints: 1_000_000,
        streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
        debug: true,
      });
      layer = currentLayer;
      timer = window.setInterval(() => {
        if (!disposed) options.onSnapshot(currentLayer.getSnapshot());
      }, 250);
      await currentLayer.load();
      if (disposed) return;
      currentLayer.attachTo(currentViewer);
      options.onAttached();
      await waitForRenderedPoints(currentLayer, () => disposed);
      if (disposed) return;
      options.onSnapshot(currentLayer.getSnapshot() satisfies CopcCesiumLayerSnapshot);
      options.onStatus('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!disposed) options.onStatus('error', message);
      throw error;
    }
  })();

  return {
    ready,
    async setView(view: Exclude<HarnessView, 'visual'>): Promise<void> {
      await ready;
      if (!viewer || !layer || disposed) return;
      const sphere = cesiumModule ? getRenderedSphere(cesiumModule, viewer) : undefined;
      if (!sphere) throw new Error('Cesium has no rendered COPC points to frame.');
      const range = Math.max(sphere.radius * (view === 'near' ? 2 : view === 'far' ? 8 : 4), 150);
      viewer.camera.viewBoundingSphere(sphere, new cesiumModule!.HeadingPitchRange(0, -Math.PI / 3, range));
      viewer.camera.lookAtTransform(cesiumModule!.Matrix4.IDENTITY);
      viewer.scene.requestRender();
      options.onSnapshot(layer.getSnapshot());
    },
    snapshot: () => layer?.getSnapshot(),
    unload: () => {
      layer?.unload();
      options.onSnapshot(undefined);
    },
    destroy: () => {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) window.clearInterval(timer);
      layer?.destroy();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      options.onSnapshot(undefined);
    },
  };
}

function getRenderedSphere(Cesium: typeof import('cesium'), viewer: CesiumTypes.Viewer): CesiumTypes.BoundingSphere | undefined {
  const positions: CesiumTypes.Cartesian3[] = [];
  for (let i = 0; i < viewer.scene.primitives.length; i += 1) {
    const primitive = viewer.scene.primitives.get(i);
    if (!(primitive instanceof Cesium.PointPrimitiveCollection)) continue;
    const stride = Math.max(1, Math.floor(primitive.length / 2000));
    for (let j = 0; j < primitive.length; j += stride) {
      const position = primitive.get(j).position;
      if (position) positions.push(Cesium.Cartesian3.clone(position));
    }
  }
  return positions.length ? Cesium.BoundingSphere.fromPoints(positions) : undefined;
}

async function waitForRenderedPoints(layer: CopcCesiumLayer, isDisposed: () => boolean): Promise<void> {
  const deadline = performance.now() + 15_000;
  while (!isDisposed() && performance.now() < deadline) {
    const snapshot = layer.getSnapshot();
    if (snapshot.renderedPointCount > 0) return;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  if (!isDisposed()) throw new Error('Cesium attached the COPC layer but rendered no points within 15 seconds.');
}
