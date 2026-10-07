import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_FIXTURE_ID, createHarnessConfig, createTestContract, fixtureUrlForId, loadFixtureCatalog, type FixtureCatalogEntry, type HarnessRenderer, type HarnessView } from '@copc-test/core';
import { mountTestRenderer, type RendererStatus, type TestRenderer } from '@copc-test/renderers';
import { ReactControlPanel, panelStateFromConfig, type PanelActions, type PanelSelection, type PanelState } from '@copc-test/ui/react';

const params = new URLSearchParams(window.location.search);
const availableRenderers: HarnessRenderer[] = ['cesium', 'three', 'r3f'];
const requestedRenderer = params.get('renderer');
const initialRenderer = availableRenderers.includes(requestedRenderer as HarnessRenderer)
  ? requestedRenderer as HarnessRenderer
  : 'cesium';
const initialFixtureId = params.get('fixtureId') ?? DEFAULT_FIXTURE_ID;
const initialConfig = createHarnessConfig({
  appId: 'react', host: 'react', renderer: initialRenderer,
  fixtureUrl: fixtureUrlForId(initialFixtureId), backend: 'copc-js', scenario: 'load-and-stream',
}, import.meta.env, 'VITE_');
const contract = createTestContract(initialConfig);
window.__COPC_TEST__ = contract;

type R3FHandle = TestRenderer;

export function App(): ReactNode {
  const [selection, setSelection] = useState<PanelSelection>({ renderer: initialRenderer, backend: initialConfig.backend, fixtureId: initialFixtureId });
  const [status, setStatus] = useState<PanelState['status']>('idle');
  const [snapshot, setSnapshot] = useState<unknown>();
  const [error, setError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const [fixtures, setFixtures] = useState<FixtureCatalogEntry[]>([]);
  const demoTimerRef = useRef<number | undefined>(undefined);
  const rendererHostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<R3FHandle | undefined>(undefined);
  const fixtureUrl = fixtureUrlForId(selection.fixtureId);
  const config = useMemo(() => ({ ...initialConfig, renderer: selection.renderer, backend: selection.backend, fixtureUrl }), [selection, fixtureUrl]);
  const [panelState, setPanelState] = useState<PanelState>(() => panelStateFromConfig(initialConfig, 'react', initialFixtureId));

  useEffect(() => () => {
    if (demoTimerRef.current !== undefined) window.clearInterval(demoTimerRef.current);
  }, []);

  const onStatus = useCallback((next: RendererStatus, message?: string): void => {
    setStatus(next);
    setError(message);
    if (next === 'loading') contract.markLoading();
    else if (next === 'ready') contract.markReady();
    else if (next === 'error') contract.markError(message ?? 'Renderer failed.');
  }, []);
  const onSnapshot = useCallback((value: unknown): void => {
    setSnapshot(value);
    contract.setSnapshot(value);
  }, []);
  const onAttached = useCallback((): void => contract.markAttached(), []);
  const onR3FHandle = useCallback((handle: R3FHandle | undefined): void => { rendererRef.current = handle; }, []);

  useEffect(() => {
    contract.setConfig({ renderer: selection.renderer, backend: selection.backend, fixtureUrl });
    setPanelState((previous) => ({
      ...previous, ...selection, fixtureUrl, host: 'react', packageName: '@frillab/copc-adapter',
      packageVersion: initialConfig.packageVersion, packageSource: initialConfig.packageSource,
      status, snapshot, error,
    }));
  }, [selection, fixtureUrl, status, snapshot, error]);

  useEffect(() => {
    void loadFixtureCatalog().then((catalog) => setFixtures(catalog.fixtures)).catch((cause: unknown) => onStatus('error', cause instanceof Error ? cause.message : String(cause)));
  }, [onStatus]);

  useEffect(() => {
    let disposed = false;
    let mounted: TestRenderer | undefined;
    const container = rendererHostRef.current;
    if (selection.renderer === 'r3f' || !container) return undefined;
    contract.recordMount();
    onStatus('loading');
    void mountTestRenderer(selection.renderer, container, { fixtureUrl, backend: selection.backend, onStatus, onSnapshot, onAttached })
      .then((handle) => {
        if (disposed) { handle.destroy(); return; }
        mounted = handle;
        rendererRef.current = handle;
        return handle.ready.catch((cause: unknown) => { if (!disposed) onStatus('error', cause instanceof Error ? cause.message : String(cause)); });
      })
      .catch((cause: unknown) => { if (!disposed) onStatus('error', cause instanceof Error ? cause.message : String(cause)); });
    return () => {
      disposed = true;
      mounted?.destroy();
      if (rendererRef.current === mounted) rendererRef.current = undefined;
      contract.recordUnmount();
      contract.markDestroyed();
    };
  }, [selection.renderer, selection.backend, fixtureUrl, reloadKey, onStatus, onSnapshot, onAttached]);

  useEffect(() => {
    contract.registerCommand('reload', () => setReloadKey((value) => value + 1));
    contract.registerCommand('setView', (view) => rendererRef.current?.setView(view === 'visual' ? 'overview' : view));
    contract.registerCommand('unload', () => rendererRef.current?.unload());
    contract.registerCommand('destroy', () => {
      rendererRef.current?.destroy();
      rendererRef.current = undefined;
      setReloadKey((value) => value + 1);
    });
    return () => {
      contract.unregisterCommand('reload'); contract.unregisterCommand('setView');
      contract.unregisterCommand('unload'); contract.unregisterCommand('destroy');
    };
  }, []);

  const apply = useCallback((next: PanelSelection): void => {
    if (demoTimerRef.current !== undefined) window.clearInterval(demoTimerRef.current);
    demoTimerRef.current = undefined;
    setSelection(next);
    setSnapshot(undefined);
    setError(undefined);
    if (next.renderer === selection.renderer && next.backend === selection.backend && next.fixtureId === selection.fixtureId) {
      setReloadKey((value) => value + 1);
    }
  }, [selection]);
  const setView = useCallback((view: Exclude<HarnessView, 'visual'>): void => { void rendererRef.current?.setView(view); }, []);
  const actions: PanelActions = {
    apply,
    reload: () => setReloadKey((value) => value + 1),
    startDemo: () => {
      if (demoTimerRef.current !== undefined) window.clearInterval(demoTimerRef.current);
      const views = ['near', 'far', 'overview'] as const;
      let index = 0;
      void setView(views[index++]!);
      demoTimerRef.current = window.setInterval(() => { void setView(views[index++ % views.length]!); }, 1200);
    },
    stopDemo: () => { if (demoTimerRef.current !== undefined) window.clearInterval(demoTimerRef.current); demoTimerRef.current = undefined; },
    overview: () => setView('overview'), far: () => setView('far'), near: () => setView('near'),
  };
  const displayedState: PanelState = { ...panelState, ...selection, fixtureUrl, status, snapshot, error };

  return <main className="copc-renderer-root" data-host="react">
    {selection.renderer === 'r3f'
      ? <Canvas key={`${fixtureUrl}:${selection.backend}:${reloadKey}`} camera={{ position: [0, 0, 1000], near: 0.1, far: 20_000 }} gl={{ antialias: true, alpha: false }}>
          <R3FPointCloud fixtureUrl={fixtureUrl} backend={selection.backend} onStatus={onStatus} onSnapshot={onSnapshot} onAttached={onAttached} onHandle={onR3FHandle} />
        </Canvas>
      : <div ref={rendererHostRef} className="copc-renderer-root" data-testid="renderer-viewport" />}
    <ReactControlPanel config={config} state={displayedState} renderers={availableRenderers} actions={actions} fixtures={fixtures} />
  </main>;
}

type R3FPointCloudProps = {
  fixtureUrl: string; backend: PanelSelection['backend'];
  onStatus: (status: RendererStatus, error?: string) => void;
  onSnapshot: (snapshot: unknown) => void; onAttached: () => void;
  onHandle: (handle: R3FHandle | undefined) => void;
};

function R3FPointCloud({ fixtureUrl, backend, onStatus, onSnapshot, onAttached, onHandle }: R3FPointCloudProps): ReactNode {
  const { camera, gl, scene } = useThree();
  const layerRef = useRef<import('@frillab/copc-adapter/three').CopcThreeLayer | undefined>(undefined);
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
        url: fixtureUrl, backend, colorMode: 'elevation', pointSize: 3,
        maxRenderedPoints: 1_000_000,
        streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 }, debug: true,
      });
      layer = current; layerRef.current = current;
      current.attachTo({ scene, camera, renderer: gl }); onAttached();
      controls.addEventListener('change', () => { void current.update(); });
      timer = window.setInterval(() => { if (!disposed) onSnapshot(current.getSnapshot()); }, 250);
      await current.load(); if (disposed) return;
      await current.update(); if (disposed) return;
      if (!fitR3FCamera(current, camera, controls.target)) throw new Error('COPC loaded, but R3F rendered no points.');
      controls.update(); await current.update();
      onSnapshot(current.getSnapshot()); onStatus('ready');
    })();
    const handle: R3FHandle = {
      ready,
      snapshot: () => layer?.getSnapshot(),
      setView: async (view) => {
        await ready; if (!layer || !controls || disposed) return;
        if (view === 'overview') fitR3FCamera(layer, camera, controls.target);
        else camera.position.copy(controls.target).add(camera.position.clone().sub(controls.target).multiplyScalar(view === 'near' ? 0.65 : 1.5));
        controls.update(); await layer.update(); onSnapshot(layer.getSnapshot());
      },
      unload: () => { layer?.unload(); onSnapshot(undefined); },
      destroy: () => { if (disposed) return; disposed = true; window.clearInterval(timer); controls?.dispose(); layer?.destroy(); controlsRef.current = undefined; layerRef.current = undefined; onSnapshot(undefined); contract.recordUnmount(); contract.markDestroyed(); },
    };
    onHandle(handle);
    void ready.catch((cause: unknown) => { if (!disposed) onStatus('error', cause instanceof Error ? cause.message : String(cause)); });
    return () => { handle.destroy(); onHandle(undefined); };
  }, [camera, gl, scene, fixtureUrl, backend, onStatus, onSnapshot, onAttached, onHandle]);
  useFrame(() => controlsRef.current?.update());
  return null;
}

function fitR3FCamera(layer: import('@frillab/copc-adapter/three').CopcThreeLayer, camera: THREE.Camera, target: THREE.Vector3): boolean {
  const bounds = new THREE.Box3().setFromObject(layer.getRoot());
  if (bounds.isEmpty()) return false;
  const center = bounds.getCenter(new THREE.Vector3()); const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 10);
  camera.position.set(center.x + radius * 1.55, center.y - radius * 1.55, center.z + radius * 0.95); camera.lookAt(center); target.copy(center); camera.updateMatrixWorld(true);
  if (camera instanceof THREE.PerspectiveCamera) { camera.near = Math.max(radius / 10_000, 0.1); camera.far = Math.max(radius * 12, 20_000); camera.updateProjectionMatrix(); }
  return true;
}
