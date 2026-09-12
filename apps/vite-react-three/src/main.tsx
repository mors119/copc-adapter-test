import '../../../apps/shared/styles.css';

import {
  CopcStreamingCore,
  CopcThreeLayer,
  createThreeStreamingView,
  probeCopcSource,
  type CopcThreeLayerSnapshot,
} from '@frillab/copc-adapter/three';
import {
  DEFAULT_FIXTURE_ID,
  FIXTURE_CATALOG_PATH,
  fixtureUrlForId,
  type FixtureCatalog,
} from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { StrictMode, useCallback, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HarnessPanel } from '../../../apps/shared/HarnessPanel';
import { fitThreeCamera } from '../../../apps/shared/threeFit';
import { benchmarkCacheOptions } from '../../../apps/shared/benchmarkOptions';
import { withPublicHierarchyDiagnostics } from '../../../apps/shared/publicDiagnostics';

const harnessConfig = createHarnessConfig({
  appId: 'vite-react-three',
  host: 'vite',
  renderer: 'three',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
  backend: 'copc-js',
  scenario: 'load-and-stream',
}, import.meta.env, 'VITE_');
const testContract = createTestContract(harnessConfig);

type ViewportProps = {
  url: string;
  onStatus: (status: string) => void;
  onSnapshot: (snapshot: PublishedSnapshot | undefined) => void;
  onHandle: (handle: ThreeApiHandle | undefined) => void;
};

type ThreeApiHandle = {
  reload(): Promise<void>;
  detach(): void;
  unload(): void;
  destroy(): void;
  pick(x: number, y: number): void;
  runApiCoverage(): Promise<void>;
  probeSource(label: string, source: string): Promise<void>;
};

type Operation = { status: 'passed' | 'unsupported' | 'error'; message?: string };
type CopcColorMode = 'fixed' | 'elevation' | 'rgb' | 'intensity' | 'classification';
type PublishedSnapshot = CopcThreeLayerSnapshot & {
  selectedPoint?: ReturnType<CopcThreeLayer['getSelectedPoint']>;
};

function selectedPointForContract(
  point: NonNullable<PublishedSnapshot['selectedPoint']>,
): {
  index: number;
  nodeKey: string;
  position: [number, number, number];
  attributes?: Record<string, number>;
} {
  const attributes: Record<string, number> = {};
  if (point.intensity !== undefined) attributes.intensity = point.intensity;
  if (point.classification !== undefined) attributes.classification = point.classification;
  if (point.rgb) {
    attributes.red = point.rgb.red;
    attributes.green = point.rgb.green;
    attributes.blue = point.rgb.blue;
  }
  return {
    index: point.pointIndex,
    nodeKey: point.nodeKey,
    position: [point.longitude, point.latitude, point.height],
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
  };
}

let activeThreeHandle: ThreeApiHandle | undefined;

testContract.registerCommand('reload', () => activeThreeHandle?.reload());
testContract.registerCommand('detach', () => activeThreeHandle?.detach());
testContract.registerCommand('unload', () => activeThreeHandle?.unload());
testContract.registerCommand('destroy', () => activeThreeHandle?.destroy());
testContract.registerCommand('pick', (x = 0, y = 0) => { activeThreeHandle?.pick(x, y); });
testContract.registerCommand('runApiCoverage', () => activeThreeHandle?.runApiCoverage());
testContract.registerCommand('probeSource', (label, source) => activeThreeHandle?.probeSource(label, source));

const STREAMING_OPTIONS = {
  maxNodes: 8,
  maxDepth: 6,
  maxScreenSpaceError: 8,
  maxRenderDistanceMeters: 20_000,
  maxRenderedPoints: 1_000_000,
};

function layerOptions(url: string, colorMode: CopcColorMode): ConstructorParameters<typeof CopcThreeLayer>[0] {
  return {
    url,
    colorMode,
    backend: harnessConfig.backend,
    pointSize: 3,
    maxRenderedPoints: STREAMING_OPTIONS.maxRenderedPoints,
    streaming: STREAMING_OPTIONS,
    ...benchmarkCacheOptions(),
    debug: true,
  };
}

async function fixtureRecordForUrl(url: string): Promise<FixtureCatalog['fixtures'][number]> {
  const response = await fetch(FIXTURE_CATALOG_PATH, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load fixture catalog (${response.status}).`);

  const catalog = await response.json() as FixtureCatalog;
  const fixtureId = decodeURIComponent(
    new URL(url, window.location.origin).pathname.split('/').filter(Boolean).at(-1) ?? '',
  );
  const fixture = catalog.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture) throw new Error(`Fixture ${fixtureId || '<unknown>'} is missing from the served catalog.`);
  return fixture;
}

function ThreeViewport({ url, onStatus, onSnapshot, onHandle }: ViewportProps): ReactNode {
  useEffect(() => {
    const container = document.createElement('div');
    container.className = 'harness-canvas';
    document.body.appendChild(container);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#06101d');
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20_000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    let layer = new CopcThreeLayer(layerOptions(url, 'elevation'));
    let disposed = false;
    let animationFrame = 0;
    const apiCoverageOnly = new URLSearchParams(window.location.search).get('apiCoverage') === '1';

    const publishSnapshot = (): void => {
      const snapshot = layer.getSnapshot();
      const selectedPoint = layer.getSelectedPoint();
      const publicSnapshot = withPublicHierarchyDiagnostics(
        selectedPoint ? { ...snapshot, selectedPoint } : snapshot,
        layer,
      );
      onSnapshot(publicSnapshot);
    };

    const resize = (): void => {
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    window.addEventListener('resize', resize);
    resize();

    const render = (): void => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();
    controls.addEventListener('change', () => { void layer.update(); });

    const loadLayer = async (nextLayer: CopcThreeLayer, fitCamera: boolean): Promise<void> => {
      layer = nextLayer;
      layer.attachTo({ scene, camera, renderer });
      testContract.markAttached();
      await layer.load();
      if (disposed) return;
      if (apiCoverageOnly) {
        publishSnapshot();
        onStatus('ready');
        return;
      }
      await layer.update();
      if (disposed) return;
      if (fitCamera && !fitThreeCamera(layer, camera, controls.target)) {
        throw new Error('COPC loaded, but no Three.js points were rendered.');
      }
      controls.update();
      await layer.update();
      publishSnapshot();
      onStatus('ready');
    };

    const runApiCoverage = async (): Promise<void> => {
      const operations: Record<string, Operation> = {};
      const colorModes: Record<string, Operation> = {};
      const operation = (name: string, status: Operation['status'], message?: string): void => {
        operations[name] = { status, ...(message ? { message } : {}) };
      };

      const metadata = layer.getMetadata();
      operation('load', metadata ? 'passed' : 'error', metadata ? undefined : 'metadata was not loaded');
      operation('getMetadata', metadata ? 'passed' : 'error', metadata ? undefined : 'metadata was not loaded');
      const hierarchy = layer.getHierarchyDiagnostics();
      operation('getHierarchyDiagnostics', hierarchy ? 'passed' : 'error', hierarchy ? undefined : 'diagnostics were not available');
      const cache = layer.getPointCacheDiagnostics();
      operation('getPointCacheDiagnostics', cache ? 'passed' : 'error');
      operation('getSnapshot', layer.getSnapshot() ? 'passed' : 'error');
      operation('attachTo', layer.getSnapshot().attached ? 'passed' : 'error');
      testContract.setApiDiagnostics({
        entrypoints: ['@frillab/copc-adapter/three'],
        operations,
        metadata: metadata ? {
          pointCount: metadata.pointCount,
          hasBounds: Boolean(metadata.bounds),
          hasCrs: Boolean(metadata.wkt),
        } : undefined,
        ...(hierarchy ? {
          hierarchy: {
            requestCount: hierarchy.pageRequests,
            cacheHitCount: hierarchy.pageCacheHits,
            cacheMissCount: hierarchy.pageRequests,
            bytesFetched: hierarchy.hierarchyBytesFetched,
            loadedPageCount: hierarchy.loadedPageCount,
            loadedEntryCount: hierarchy.loadedEntryCount,
          },
        } : {}),
      });

      const probe = await probeCopcSource(url);
      operation('probeCopcSource', probe.reachable && probe.corsReadable === true ? 'passed' : 'error');
      testContract.setApiDiagnostics({
        operations,
        probes: {
          default: {
            reachable: probe.reachable,
            rangeSupported: probe.rangeSupported,
            corsReadable: probe.corsReadable,
            copcDetected: probe.copcDetected,
            ...(probe.status === undefined ? {} : { status: probe.status }),
            ...(probe.partialStatus === undefined ? {} : { partialStatus: probe.partialStatus }),
            warnings: [...probe.warnings],
          },
        },
      });

      const activeFixture = await fixtureRecordForUrl(url);
      const sourceAttributes = new Set(activeFixture.coverage.attributes ?? []);

      const core = new CopcStreamingCore({
        url,
        backend: harnessConfig.backend,
        maxRenderedPoints: STREAMING_OPTIONS.maxRenderedPoints,
        streaming: STREAMING_OPTIONS,
      });
      try {
        await core.load();
        const frame = layer.getLocalFrame();
        if (!frame) throw new Error('Three layer did not expose a loaded local frame');
        let streamingSnapshot = core.getSnapshot();
        operation('CopcStreamingCore.load', streamingSnapshot.lifecycle === 'ready' ? 'passed' : 'error');
        const view = createThreeStreamingView({ camera, frame, renderer });
        await core.updateView(view);
        streamingSnapshot = core.getSnapshot();
        operation('CopcStreamingCore.updateView', streamingSnapshot.streamingUpdateCount > 0 ? 'passed' : 'error');
        testContract.setApiDiagnostics({
          operations,
          streaming: {
            lifecycle: streamingSnapshot.lifecycle,
            updateCount: streamingSnapshot.streamingUpdateCount,
            selectedNodeCount: streamingSnapshot.selectedNodeKeys.length,
          },
        });
      } catch (error: unknown) {
        operation('CopcStreamingCore.load', 'error', error instanceof Error ? error.message : String(error));
        testContract.setApiDiagnostics({ operations });
      } finally {
        core.destroy();
      }

      let colorMatrixCameraFitted = !apiCoverageOnly;
      for (const colorMode of ['fixed', 'elevation', 'rgb', 'intensity', 'classification'] as const) {
        const candidate = new CopcThreeLayer(layerOptions(url, colorMode));
        try {
          candidate.attachTo({ scene, camera, renderer });
          await candidate.load();
          await candidate.update();
          if (!colorMatrixCameraFitted) {
            if (!fitThreeCamera(candidate, camera, controls.target)) {
              throw new Error(`No points rendered for color mode ${colorMode}`);
            }
            colorMatrixCameraFitted = true;
            controls.update();
            await candidate.update();
          }
          if ((candidate.getSnapshot().renderedPointCount ?? 0) <= 0) {
            throw new Error(`Color mode ${colorMode} did not render any points`);
          }
          colorModes[colorMode] = colorMode === 'rgb' && !sourceAttributes.has('rgb')
            ? { status: 'unsupported', message: `${activeFixture.id} has no RGB attributes.` }
            : { status: 'passed' };
        } catch (error: unknown) {
          colorModes[colorMode] = {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          };
        } finally {
          candidate.destroy();
        }
      }
      testContract.setApiDiagnostics({ operations, colorModes });

      await layer.reload();
      if (!apiCoverageOnly) await layer.update();
      operation('reload', layer.getSnapshot().lifecycle === 'ready' ? 'passed' : 'error');
      layer.detachFrom();
      operation('detachFrom', layer.getSnapshot().attached === false ? 'passed' : 'error');
      layer.attachTo({ scene, camera, renderer });
      if (!apiCoverageOnly) await layer.update();
      layer.unload();
      operation('unload', layer.getMetadata() === undefined && layer.getSnapshot().renderedPointCount === 0 ? 'passed' : 'error');
      layer.destroy();
      operation('destroy', layer.getSnapshot().lifecycle === 'destroyed' ? 'passed' : 'error');
      testContract.setApiDiagnostics({ operations, colorModes });
      testContract.markDestroyed();
      publishSnapshot();
    };

    const handle: ThreeApiHandle = {
      async reload(): Promise<void> {
        testContract.markLoading();
        onStatus('loading');
        await layer.reload();
        await layer.update();
        publishSnapshot();
        testContract.markReady();
        onStatus('ready');
      },
      detach(): void {
        layer.detachFrom();
        publishSnapshot();
      },
      unload(): void {
        layer.unload();
        publishSnapshot();
      },
      destroy(): void {
        layer.destroy();
        publishSnapshot();
        testContract.markDestroyed();
        onStatus('destroyed');
      },
      pick(x: number, y: number): void {
        camera.updateMatrixWorld(true);
        let pickPosition: THREE.Vector3 | undefined;
        layer.getRoot().traverse((object) => {
          if (pickPosition || object.type !== 'Points') return;
          const points = object as THREE.Points;
          const positions = points.geometry.getAttribute('position');
          if (!positions || positions.count === 0) return;
          pickPosition = new THREE.Vector3(
            positions.getX(0),
            positions.getY(0),
            positions.getZ(0),
          ).applyMatrix4(points.matrixWorld).project(camera);
        });
        const rect = renderer.domElement.getBoundingClientRect();
        const screenPosition = pickPosition
          ? {
              x: rect.left + ((pickPosition.x + 1) / 2) * rect.width,
              y: rect.top + ((1 - pickPosition.y) / 2) * rect.height,
            }
          : { x, y };
        layer.pick({
          x: ((screenPosition.x - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
          y: -(((screenPosition.y - rect.top) / Math.max(rect.height, 1)) * 2 - 1),
        });
        publishSnapshot();
      },
      runApiCoverage,
      async probeSource(label: string, source: string): Promise<void> {
        const probe = await probeCopcSource(source);
        testContract.setApiDiagnostics({
          probes: {
            [label]: {
              reachable: probe.reachable,
              rangeSupported: probe.rangeSupported,
              corsReadable: probe.corsReadable,
              copcDetected: probe.copcDetected,
              ...(probe.status === undefined ? {} : { status: probe.status }),
              ...(probe.partialStatus === undefined ? {} : { partialStatus: probe.partialStatus }),
              warnings: [...probe.warnings],
            },
          },
        });
      },
    };
    onHandle(handle);
    onStatus('loading');
    testContract.markLoading();
    void loadLayer(layer, true).catch((error: unknown) => {
      if (!disposed) {
        testContract.markError(error);
        onStatus(error instanceof Error ? error.message : String(error));
      }
    });

    const timer = window.setInterval(publishSnapshot, 250);
    return () => {
      disposed = true;
      onHandle(undefined);
      window.clearInterval(timer);
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      controls.dispose();
      layer.destroy();
      renderer.dispose();
      renderer.domElement.remove();
      container.remove();
      testContract.markDestroyed();
      onSnapshot(undefined);
    };
  }, [onHandle, onSnapshot, onStatus, url]);

  return null;
}

function App(): ReactNode {
  const [status, setStatus] = useState('idle');
  const [snapshot, setSnapshot] = useState<PublishedSnapshot>();
  const [handle, setHandle] = useState<ThreeApiHandle>();

  const assignHandle = useCallback((value: ThreeApiHandle | undefined): void => {
    activeThreeHandle = value;
    setHandle(value);
  }, []);

  const reportStatus = useCallback((value: string): void => {
    setStatus(value);
    if (value === 'loading') testContract.markLoading();
    else if (value === 'ready') testContract.markReady();
    else if (value === 'destroyed') testContract.markDestroyed();
    else if (value !== 'idle') testContract.markError(value);
  }, []);
  const reportSnapshot = useCallback((value: PublishedSnapshot | undefined): void => {
    setSnapshot(value);
    testContract.setSnapshot(value?.selectedPoint
      ? { ...value, selectedPoint: selectedPointForContract(value.selectedPoint) }
      : value);
  }, []);

  return (
    <main className="harness-root">
      <ThreeViewport
        url={harnessConfig.fixtureUrl}
        onStatus={reportStatus}
        onSnapshot={reportSnapshot}
        onHandle={assignHandle}
      />
      <HarnessPanel
        config={harnessConfig}
        framework="Vite + React"
        renderer="Three.js"
        status={status}
        snapshot={snapshot}
        onReload={() => { void handle?.reload(); }}
      >
        <p className="hint"><code>@frillab/copc-adapter/three</code> 공개 entry와 renderer-neutral streaming core를 실제 소비자 코드에서 호출합니다.</p>
      </HarnessPanel>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
