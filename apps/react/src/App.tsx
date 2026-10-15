import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createHarnessConfig,
  createTestContract,
  loadFixtureCatalog,
  renderDistanceFromSearch,
  resolveCopcSourceSelection,
  sourceSelectionFromSearch,
  streamingSettingsFromSearch,
  type FixtureCatalogEntry,
  type HarnessRenderer,
  type HarnessView,
} from '@copc-test/core';
import {
  mountTestRenderer,
  type RendererStatus,
  type TestRenderer,
} from '@copc-test/renderers';
import {
  ReactControlPanel,
  panelStateFromConfig,
  type PanelActions,
  type PanelSelection,
  type PanelState,
} from '@copc-test/ui/react';

const params = new URLSearchParams(window.location.search);
const availableRenderers: HarnessRenderer[] = ['cesium', 'three', 'r3f'];
const requestedRenderer = params.get('renderer');
const initialRenderer = availableRenderers.includes(
  requestedRenderer as HarnessRenderer,
)
  ? (requestedRenderer as HarnessRenderer)
  : 'cesium';
const initialFixtureId = sourceSelectionFromSearch(params);
const initialStreaming = streamingSettingsFromSearch(params, initialRenderer);
const initialRenderDistance = renderDistanceFromSearch(params);
const initialSource = resolveCopcSourceSelection(initialFixtureId);
const initialConfig = createHarnessConfig(
  {
    appId: 'react',
    host: 'react',
    renderer: initialRenderer,
    fixtureUrl: initialSource.url,
    backend: 'copc-js',
    scenario: 'load-and-stream',
  },
  import.meta.env,
  'VITE_',
);
const contract = createTestContract(initialConfig);
window.__COPC_TEST__ = contract;

type R3FHandle = TestRenderer;
type ColorMode = 'rgb' | 'elevation' | 'intensity' | 'classification';

export function App(): ReactNode {
  const [selection, setSelection] = useState<PanelSelection>({
    renderer: initialRenderer,
    backend: initialConfig.backend,
    fixtureId: initialFixtureId,
    streaming: initialStreaming,
    renderDistance: initialRenderDistance,
  });
  const [status, setStatus] = useState<PanelState['status']>('idle');
  const [snapshot, setSnapshot] = useState<unknown>();
  const [error, setError] = useState<string>();
  const [sourceProbe, setSourceProbe] = useState<PanelState['sourceProbe']>();
  const [colorMode, setColorMode] = useState<ColorMode>('elevation');
  const [activeView, setActiveView] = useState<PanelState['activeView']>(
    'overview',
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [fixtures, setFixtures] = useState<FixtureCatalogEntry[]>([]);
  const demoTimerRef = useRef<number | undefined>(undefined);
  const rendererHostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<R3FHandle | undefined>(undefined);
  const colorModeRef = useRef<ColorMode>(colorMode);
  colorModeRef.current = colorMode;
  const source = resolveCopcSourceSelection(selection.fixtureId);
  const fixtureUrl = source.url;
  const config = useMemo(
    () => ({
      ...initialConfig,
      renderer: selection.renderer,
      backend: selection.backend,
      fixtureUrl,
    }),
    [selection, fixtureUrl],
  );
  const [panelState, setPanelState] = useState<PanelState>(() =>
    ({
      ...panelStateFromConfig(initialConfig, 'react', initialFixtureId),
      streaming: initialStreaming,
      renderDistance: initialRenderDistance,
    }),
  );

  useEffect(
    () => () => {
      if (demoTimerRef.current !== undefined)
        window.clearInterval(demoTimerRef.current);
    },
    [],
  );

  const onStatus = useCallback(
    (next: RendererStatus, message?: string): void => {
      setStatus(next);
      setError(message);
      if (next === 'loading') contract.markLoading();
      else if (next === 'ready') contract.markReady();
      else if (next === 'error')
        contract.markError(message ?? 'Renderer failed.');
    },
    [],
  );
  const onSnapshot = useCallback((value: unknown): void => {
    setSnapshot(value);
    contract.setSnapshot(value);
  }, []);
  const onAttached = useCallback((): void => contract.markAttached(), []);
  const onSourceProbe = useCallback(
    (probe: PanelState['sourceProbe']): void => setSourceProbe(probe),
    [],
  );
  const onR3FHandle = useCallback((handle: R3FHandle | undefined): void => {
    rendererRef.current = handle;
  }, []);
  const setView = useCallback(
    async (view: Exclude<HarnessView, 'visual'>): Promise<void> => {
      const activeRenderer = rendererRef.current;
      if (!activeRenderer) return;
      try {
        await activeRenderer.setView(view);
        if (rendererRef.current === activeRenderer) setActiveView(view);
      } catch (cause) {
        onStatus(
          'error',
          cause instanceof Error ? cause.message : String(cause),
        );
      }
    },
    [onStatus],
  );

  useEffect(() => {
    contract.setConfig({
      renderer: selection.renderer,
      backend: selection.backend,
      fixtureUrl,
    });
    setPanelState((previous) => ({
      ...previous,
      ...selection,
      fixtureUrl,
      host: 'react',
      packageName: '@frillab/copc-adapter',
      packageVersion: initialConfig.packageVersion,
      packageSource: initialConfig.packageSource,
      status,
      snapshot,
      error,
      sourceProbe,
      activeView,
      activeDatasetUrl: (snapshot as { datasetUrl?: string } | undefined)
        ?.datasetUrl,
      activeSourceKind: (
        snapshot as { sourceKind?: PanelState['activeSourceKind'] } | undefined
      )?.sourceKind,
      pickedPoint: (snapshot as { pickedPoint?: unknown } | undefined)
        ?.pickedPoint,
      pickedPointScreenPosition: (
        snapshot as
          | { pickedPointScreenPosition?: PanelState['pickedPointScreenPosition'] }
          | undefined
      )?.pickedPointScreenPosition,
      colorMode,
    }));
  }, [
    selection,
    fixtureUrl,
    status,
    snapshot,
    error,
    sourceProbe,
    colorMode,
    activeView,
  ]);

  useEffect(() => {
    void loadFixtureCatalog()
      .then((catalog) => setFixtures(catalog.fixtures))
      .catch((cause: unknown) =>
        onStatus(
          'error',
          cause instanceof Error ? cause.message : String(cause),
        ),
      );
  }, [onStatus]);

  useEffect(() => {
    let disposed = false;
    let mounted: TestRenderer | undefined;
    const container = rendererHostRef.current;
    if (selection.renderer === 'r3f' || !container) return undefined;
    contract.recordMount();
    onStatus('loading');
    void mountTestRenderer(selection.renderer, container, {
      fixtureUrl,
      sourceKind: source.kind,
      colorMode: colorModeRef.current,
      backend: selection.backend,
      streaming: selection.streaming,
      renderDistance: selection.renderDistance,
      cesiumIonToken:
        selection.renderer === 'cesium'
          ? import.meta.env.VITE_CESIUM_ION_TOKEN
          : undefined,
      onStatus,
      onSnapshot,
      onAttached,
      onSourceProbe,
    })
      .then((handle) => {
        if (disposed) {
          handle.destroy();
          return;
        }
        mounted = handle;
        rendererRef.current = handle;
        return handle.ready.catch((cause: unknown) => {
          if (!disposed)
            onStatus(
              'error',
              cause instanceof Error ? cause.message : String(cause),
            );
        });
      })
      .catch((cause: unknown) => {
        if (!disposed)
          onStatus(
            'error',
            cause instanceof Error ? cause.message : String(cause),
          );
      });
    return () => {
      disposed = true;
      mounted?.destroy();
      if (rendererRef.current === mounted) rendererRef.current = undefined;
      contract.recordUnmount();
      contract.markDestroyed();
    };
  }, [
    selection.renderer,
    selection.backend,
    selection.streaming,
    selection.renderDistance,
    fixtureUrl,
    source.kind,
    reloadKey,
    onStatus,
    onSnapshot,
    onAttached,
    onSourceProbe,
  ]);

  useEffect(() => {
    contract.registerCommand('reload', () =>
      setReloadKey((value) => value + 1),
    );
    contract.registerCommand('setView', (view) =>
      setView(view === 'visual' ? 'overview' : view),
    );
    contract.registerCommand('unload', () => rendererRef.current?.unload());
    contract.registerCommand('destroy', () => {
      rendererRef.current?.destroy();
      rendererRef.current = undefined;
      setReloadKey((value) => value + 1);
    });
    return () => {
      contract.unregisterCommand('reload');
      contract.unregisterCommand('setView');
      contract.unregisterCommand('unload');
      contract.unregisterCommand('destroy');
    };
  }, [setView]);

  const apply = useCallback(
    (next: PanelSelection): void => {
      if (demoTimerRef.current !== undefined)
        window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = undefined;
      let nextSource: ReturnType<typeof resolveCopcSourceSelection>;
      try {
        nextSource = resolveCopcSourceSelection(next.fixtureId);
      } catch (cause) {
        setStatus('error');
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      }
      if (
        colorMode !== 'elevation' &&
        nextSource.remote?.expectedCapabilities[colorMode] === false
      )
        setColorMode('elevation');
      setSelection(next);
      setActiveView('overview');
      setSnapshot(undefined);
      setError(undefined);
      if (
        next.renderer === selection.renderer &&
        next.backend === selection.backend &&
        next.fixtureId === selection.fixtureId &&
        JSON.stringify(next.streaming) ===
          JSON.stringify(selection.streaming) &&
        next.renderDistance === selection.renderDistance
      ) {
        setReloadKey((value) => value + 1);
      }
    },
    [selection, colorMode],
  );
  const setStyle = useCallback((mode: ColorMode): void => {
    setColorMode(mode);
    rendererRef.current?.setStyle?.(mode);
  }, []);
  const actions: PanelActions = {
    apply,
    reload: () => setReloadKey((value) => value + 1),
    startDemo: () => {
      if (demoTimerRef.current !== undefined)
        window.clearInterval(demoTimerRef.current);
      const views = ['near', 'far', 'overview'] as const;
      let index = 0;
      void setView(views[index++]!);
      demoTimerRef.current = window.setInterval(() => {
        void setView(views[index++ % views.length]!);
      }, 1200);
    },
    stopDemo: () => {
      if (demoTimerRef.current !== undefined)
        window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = undefined;
    },
    overview: () => setView('overview'),
    far: () => setView('far'),
    near: () => setView('near'),
    setStyle,
  };
  const displayedState: PanelState = {
    ...panelState,
    ...selection,
    fixtureUrl,
    status,
    snapshot,
    error,
    sourceProbe,
    colorMode,
    activeView,
  };

  return (
    <main className="copc-renderer-root" data-host="react">
      {selection.renderer === 'r3f' ? (
        <Canvas
          key={`${fixtureUrl}:${selection.backend}:${reloadKey}`}
          camera={{ position: [0, 0, 1000], near: 0.1, far: 20_000 }}
          gl={{ antialias: true, alpha: false }}>
          <R3FPointCloud
            fixtureUrl={fixtureUrl}
            backend={selection.backend}
            streaming={selection.streaming}
            renderDistance={selection.renderDistance}
            onStatus={onStatus}
            onSnapshot={onSnapshot}
            onAttached={onAttached}
            onHandle={onR3FHandle}
          />
        </Canvas>
      ) : (
        <div
          ref={rendererHostRef}
          className="copc-renderer-root"
          data-testid="renderer-viewport"
        />
      )}
      <ReactControlPanel
        config={config}
        state={displayedState}
        renderers={availableRenderers}
        actions={actions}
        fixtures={fixtures}
      />
    </main>
  );
}

type R3FPointCloudProps = {
  fixtureUrl: string;
  backend: PanelSelection['backend'];
  streaming: PanelSelection['streaming'];
  renderDistance?: number;
  onStatus: (status: RendererStatus, error?: string) => void;
  onSnapshot: (snapshot: unknown) => void;
  onAttached: () => void;
  onHandle: (handle: R3FHandle | undefined) => void;
};

function R3FPointCloud({
  fixtureUrl,
  backend,
  streaming,
  renderDistance,
  onStatus,
  onSnapshot,
  onAttached,
  onHandle,
}: R3FPointCloudProps): ReactNode {
  const { camera, gl, scene } = useThree();
  const layerRef = useRef<
    import('@frillab/copc-adapter/three').CopcThreeLayer | undefined
  >(undefined);
  const controlsRef = useRef<OrbitControls | undefined>(undefined);
  useEffect(() => {
    let disposed = false;
    let controls: OrbitControls | undefined;
    let layer: import('@frillab/copc-adapter/three').CopcThreeLayer | undefined;
    let timer = 0;
    contract.recordMount();
    onStatus('loading');
    const ready = (async (): Promise<void> => {
      const adapter = await import('@frillab/copc-adapter/three');
      if (disposed) return;
      controls = new OrbitControls(camera, gl.domElement);
      controls.enableDamping = true;
      controlsRef.current = controls;
      const current = new adapter.CopcThreeLayer({
        url: fixtureUrl,
        backend,
        colorMode: 'elevation',
        pointSize: 3,
        maxRenderedPoints: streaming.maxRenderedPoints,
        streaming: {
          maxNodes: streaming.maxNodes,
          maxDepth: streaming.maxDepth,
          maxScreenSpaceError: streaming.maxScreenSpaceError,
          maxRenderDistanceMeters: streaming.maxRenderDistanceMeters,
        },
        debug: true,
      });
      layer = current;
      layerRef.current = current;
      current.attachTo({ scene, camera, renderer: gl });
      onAttached();
      controls.addEventListener('change', () => {
        void current.update();
      });
      timer = window.setInterval(() => {
        if (!disposed) onSnapshot(current.getSnapshot());
      }, 250);
      await current.load();
      if (disposed) return;
      await current.update();
      if (disposed) return;
      if (!fitR3FCamera(current, camera, controls.target, renderDistance))
        throw new Error('COPC loaded, but R3F rendered no points.');
      controls.update();
      await current.update();
      onSnapshot(current.getSnapshot());
      onStatus('ready');
    })();
    const handle: R3FHandle = {
      ready,
      snapshot: () => layer?.getSnapshot(),
      setView: async (view) => {
        await ready;
        if (!layer || !controls || disposed) return;
        if (!fitR3FCamera(layer, camera, controls.target, renderDistance))
          return;
        if (view !== 'overview')
          camera.position.copy(controls.target).add(
            camera.position
              .clone()
              .sub(controls.target)
              .multiplyScalar(view === 'near' ? 0.5 : 2),
          );
        controls.update();
        await layer.update();
        onSnapshot(layer.getSnapshot());
      },
      unload: () => {
        layer?.unload();
        onSnapshot(undefined);
      },
      destroy: () => {
        if (disposed) return;
        disposed = true;
        window.clearInterval(timer);
        controls?.dispose();
        layer?.destroy();
        controlsRef.current = undefined;
        layerRef.current = undefined;
        onSnapshot(undefined);
        contract.recordUnmount();
        contract.markDestroyed();
      },
    };
    onHandle(handle);
    void ready.catch((cause: unknown) => {
      if (!disposed)
        onStatus(
          'error',
          cause instanceof Error ? cause.message : String(cause),
        );
    });
    return () => {
      handle.destroy();
      onHandle(undefined);
    };
  }, [
    camera,
    gl,
    scene,
    fixtureUrl,
    backend,
    streaming,
    renderDistance,
    onStatus,
    onSnapshot,
    onAttached,
    onHandle,
  ]);
  useFrame(() => controlsRef.current?.update());
  return null;
}

function fitR3FCamera(
  layer: import('@frillab/copc-adapter/three').CopcThreeLayer,
  camera: THREE.Camera,
  target: THREE.Vector3,
  renderDistance?: number,
): boolean {
  const bounds = new THREE.Box3().setFromObject(layer.getRoot());
  if (bounds.isEmpty()) return false;
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 10);
  const offset = new THREE.Vector3(
    radius * 1.55,
    -radius * 1.55,
    radius * 0.95,
  );
  if (renderDistance !== undefined)
    offset.setLength(renderDistance);
  camera.position.copy(center).add(offset);
  camera.lookAt(center);
  target.copy(center);
  camera.updateMatrixWorld(true);
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.near = Math.max(radius / 10_000, 0.1);
    camera.far = Math.max(radius * 12, (renderDistance ?? 0) * 2, 20_000);
    camera.updateProjectionMatrix();
  }
  return true;
}
