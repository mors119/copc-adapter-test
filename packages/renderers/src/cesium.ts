import type * as CesiumTypes from 'cesium';
import type { CopcCesiumLayer, CopcSourceProbeResult } from '@frillab/copc-adapter';
import type { HarnessView } from '@copc-test/core';
import type { RendererOptions, TestRenderer } from './types';

type ColorMode = 'rgb' | 'elevation' | 'intensity' | 'classification';
type CesiumAdapterModule = typeof import('@frillab/copc-adapter/cesium');
type AdapterRootModule = typeof import('@frillab/copc-adapter');

export function mountCesiumRenderer(container: HTMLElement, options: RendererOptions): TestRenderer {
  let disposed = false;
  let cesiumModule: typeof import('cesium') | undefined;
  let adapter: CesiumAdapterModule | undefined;
  let probeCopcSource: AdapterRootModule['probeCopcSource'] | undefined;
  let viewer: CesiumTypes.Viewer | undefined;
  let layer: CopcCesiumLayer | undefined;
  let activeSourceKind = options.sourceKind;
  let activeProbe: CopcSourceProbeResult | undefined;
  let pickedPoint: unknown;
  let colorMode: ColorMode = options.colorMode ?? 'elevation';
  let timer: number | undefined;
  let sourceGeneration = 0;
  let commitQueue: Promise<void> = Promise.resolve();
  options.onStatus('loading');

  const viewerReady = (async (): Promise<void> => {
    (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = '/cesium/';
    const [Cesium, cesiumAdapter, rootAdapter] = await Promise.all([
      import('cesium'),
      import('@frillab/copc-adapter/cesium'),
      import('@frillab/copc-adapter'),
    ]);
    if (disposed) return;
    cesiumModule = Cesium;
    adapter = cesiumAdapter;
    probeCopcSource = rootAdapter.probeCopcSource;

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
    container.dataset.cesiumViewerInstance = String(++nextViewerInstanceId);
    currentViewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#06101d');
    currentViewer.scene.globe.show = true;
    currentViewer.scene.globe.enableLighting = true;
    const localImagery = await Cesium.TileMapServiceImageryProvider.fromUrl(
      Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
    );
    if (disposed) return;
    currentViewer.imageryLayers.addImageryProvider(localImagery);
  })();

  function snapshotOf(currentLayer: CopcCesiumLayer): unknown {
    const cartographic = viewer?.camera.positionCartographic;
    return {
      ...currentLayer.getSnapshot(),
      hierarchy: currentLayer.getHierarchyDiagnostics(),
      pointCache: currentLayer.getPointCacheDiagnostics(),
      sourceProbe: activeProbe,
      sourceKind: activeSourceKind,
      pickedPoint,
      ...(cartographic && cesiumModule ? {
        camera: {
          longitude: cesiumModule.Math.toDegrees(cartographic.longitude),
          latitude: cesiumModule.Math.toDegrees(cartographic.latitude),
          height: cartographic.height,
        },
      } : {}),
    };
  }

  async function changeSource(sourceUrl: string, sourceKind: RendererOptions['sourceKind']): Promise<void> {
    await viewerReady;
    if (disposed) return;
    const currentViewer = viewer;
    const currentAdapter = adapter;
    if (!currentViewer || !currentAdapter) throw new Error('Cesium Viewer is not available.');
    const currentGeneration = ++sourceGeneration;
    options.onStatus('loading');
    options.onSourceProbe?.(undefined);

    let candidate: CopcCesiumLayer | undefined;
    let candidateProbe: CopcSourceProbeResult | undefined;
    try {
      if (sourceKind !== 'local-fixture') {
        if (!probeCopcSource) throw new Error('The installed adapter does not expose probeCopcSource.');
        candidateProbe = await probeCopcSource(sourceUrl);
        if (currentGeneration !== sourceGeneration || disposed) return;
        options.onSourceProbe?.(candidateProbe);
        const range = candidateProbe.contentRange;
        const validRange = typeof range === 'string' && /^bytes\s+0-\d+\/(?:\d+)$/.test(range);
        if (!candidateProbe.reachable || candidateProbe.corsReadable !== true
          || candidateProbe.partialStatus !== 206 || candidateProbe.rangeSupported !== true
          || !validRange || candidateProbe.copcDetected !== true) {
          const details = [
            `reachable=${candidateProbe.reachable}`,
            `corsReadable=${candidateProbe.corsReadable}`,
            `rangeSupported=${candidateProbe.rangeSupported}`,
            `HTTP=${candidateProbe.partialStatus ?? candidateProbe.status ?? 'unknown'}`,
            `Content-Range=${candidateProbe.contentRange ?? 'unavailable'}`,
            `COPC=${candidateProbe.copcDetected}`,
          ].join(', ');
          throw new Error(`Remote COPC source probe failed (${details}). The URL must be browser-readable and serve valid HTTP 206 byte ranges.`);
        }
      }

      candidate = new currentAdapter.CopcCesiumLayer({
        url: sourceUrl,
        backend: options.backend,
        colorMode,
        pointSize: 3,
        maxRenderedPoints: 1_000_000,
        streaming: { maxNodes: 8, maxDepth: 8, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
        debug: true,
        onPointPicked: (point) => {
          pickedPoint = point;
          options.onPointPicked?.(point);
          if (layer) options.onSnapshot(snapshotOf(layer));
        },
      });
      await candidate.load();
      if (currentGeneration !== sourceGeneration || disposed) {
        candidate.destroy();
        return;
      }

      let committed = false;
      const commit = commitQueue.then(async () => {
        if (currentGeneration !== sourceGeneration || disposed || !candidate) {
          candidate?.destroy();
          return;
        }
        const previousLayer = layer;
        const previousProbe = activeProbe;
        const previousKind = activeSourceKind;
        try {
          candidate.attachTo(currentViewer);
          await waitForRenderedPoints(candidate, () => disposed || currentGeneration !== sourceGeneration);
          if (disposed || currentGeneration !== sourceGeneration) {
            candidate.destroy();
            return;
          }
          previousLayer?.detachFrom();
          layer = candidate;
          activeProbe = candidateProbe;
          activeSourceKind = sourceKind;
          pickedPoint = undefined;
          frameViewerToLayer(cesiumModule!, currentViewer, layer);
          previousLayer?.destroy();
          committed = true;
          options.onAttached();
          options.onSnapshot(snapshotOf(layer));
          options.onStatus('ready');
        } catch (error) {
          if (previousLayer) layer = previousLayer;
          else if (layer === candidate) layer = undefined;
          activeProbe = previousProbe;
          activeSourceKind = previousKind;
          throw error;
        }
      });
      commitQueue = commit.catch(() => undefined);
      await commit;
      if (!committed && currentGeneration === sourceGeneration && !disposed) {
        throw new Error('COPC source switch did not commit.');
      }
    } catch (error) {
      candidate?.destroy();
      if (!disposed && currentGeneration === sourceGeneration) {
        options.onSourceProbe?.(candidateProbe);
        options.onStatus('error', error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  const ready = (async (): Promise<void> => {
    await viewerReady;
    await changeSource(options.fixtureUrl, options.sourceKind);
    timer = window.setInterval(() => {
      if (!disposed && layer) options.onSnapshot(snapshotOf(layer));
    }, 250);
  })();

  return {
    ready,
    async setView(view: Exclude<HarnessView, 'visual'>): Promise<void> {
      await viewerReady;
      if (!viewer || !layer || disposed) return;
      if (!cesiumModule) throw new Error('Cesium module is not available for camera framing.');
      frameViewerToLayer(cesiumModule, viewer, layer, view);
      options.onSnapshot(snapshotOf(layer));
    },
    async setSource(sourceUrl, sourceKind): Promise<void> {
      await changeSource(sourceUrl, sourceKind);
    },
    setStyle(mode): void {
      colorMode = mode;
      layer?.setStyle({ colorMode: mode });
      if (layer) options.onSnapshot(snapshotOf(layer));
    },
    snapshot: () => layer ? snapshotOf(layer) : undefined,
    unload: () => {
      layer?.unload();
      options.onSnapshot(undefined);
    },
    destroy: () => {
      if (disposed) return;
      disposed = true;
      sourceGeneration += 1;
      if (timer !== undefined) window.clearInterval(timer);
      layer?.destroy();
      layer = undefined;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      delete container.dataset.cesiumViewerInstance;
      options.onSnapshot(undefined);
    },
  };
}

let nextViewerInstanceId = 0;

function frameViewerToLayer(
  Cesium: typeof import('cesium'),
  viewer: CesiumTypes.Viewer,
  layer: CopcCesiumLayer,
  view: Exclude<HarnessView, 'visual'> = 'overview',
): void {
  const sphere = getRenderedSphere(Cesium, viewer);
  if (!sphere) throw new Error('Cesium has no rendered COPC points to frame.');
  const range = Math.max(sphere.radius * (view === 'near' ? 2 : view === 'far' ? 8 : 4), 150);
  viewer.camera.viewBoundingSphere(sphere, new Cesium.HeadingPitchRange(0, -Math.PI / 3, range));
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  viewer.scene.requestRender();
  void layer.getSnapshot();
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

async function waitForRenderedPoints(layer: CopcCesiumLayer, isCancelled: () => boolean): Promise<void> {
  const deadline = performance.now() + 25_000;
  while (!isCancelled() && performance.now() < deadline) {
    if (layer.getSnapshot().renderedPointCount > 0) return;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  if (!isCancelled()) throw new Error('Cesium attached the COPC layer but rendered no points within 25 seconds.');
}
