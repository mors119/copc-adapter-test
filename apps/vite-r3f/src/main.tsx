import '../../../apps/shared/styles.css';

import { CopcThreeLayer, type CopcThreeLayerSnapshot } from '@frillab/copc-adapter/three';
import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { StrictMode, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HarnessPanel } from '../../../apps/shared/HarnessPanel';
import { fitThreeCamera } from '../../../apps/shared/threeFit';

const harnessConfig = createHarnessConfig({
  appId: 'vite-r3f',
  host: 'vite',
  renderer: 'r3f',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
  backend: 'copc-js',
  scenario: 'load-and-stream',
}, import.meta.env, 'VITE_');
const testContract = createTestContract(harnessConfig);

type PointCloudProps = {
  url: string;
  onStatus: (status: string) => void;
  onSnapshot: (snapshot: CopcThreeLayerSnapshot | undefined) => void;
};

function CopcPointCloud({ url, onStatus, onSnapshot }: PointCloudProps): ReactNode {
  const { camera, gl, scene } = useThree();
  const layerRef = useRef<CopcThreeLayer | undefined>(undefined);
  const controlsRef = useRef<OrbitControls | undefined>(undefined);

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    const layer = new CopcThreeLayer({
      url,
      colorMode: 'elevation',
      backend: harnessConfig.backend,
      pointSize: 3,
      maxRenderedPoints: 100_000,
      streaming: { maxNodes: 4, maxDepth: 5, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
      debug: true,
    });
    layerRef.current = layer;
    let disposed = false;
    onStatus('loading');

    const timer = window.setInterval(() => onSnapshot(layer.getSnapshot()), 250);
    void (async (): Promise<void> => {
      try {
        layer.attachTo({ scene, camera, renderer: gl });
        testContract.markAttached();
        await layer.load();
        if (disposed) return;
        await layer.update();
        if (disposed) return;
        if (!fitThreeCamera(layer, camera, controls.target)) {
          throw new Error('COPC loaded, but no Three.js points were rendered.');
        }
        controls.update();
        await layer.update();
        onSnapshot(layer.getSnapshot());
        onStatus('ready');
      } catch (error: unknown) {
        if (!disposed) {
          testContract.markError(error);
          onStatus(error instanceof Error ? error.message : String(error));
        }
      }
    })();

    return () => {
      disposed = true;
      window.clearInterval(timer);
      controls.dispose();
      controlsRef.current = undefined;
      layer.destroy();
      layerRef.current = undefined;
      testContract.markDestroyed();
      onSnapshot(undefined);
    };
  }, [camera, gl, onSnapshot, onStatus, scene, url]);

  useFrame(() => {
    controlsRef.current?.update();
    void layerRef.current?.update();
  });

  return null;
}

function App(): ReactNode {
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState('idle');
  const [snapshot, setSnapshot] = useState<CopcThreeLayerSnapshot>();
  useEffect(() => {
    testContract.registerCommand('reload', () => setReloadKey((value) => value + 1));
    return () => testContract.unregisterCommand('reload');
  }, []);
  const reportStatusWithContract = useCallback((value: string): void => {
    setStatus(value);
    if (value === 'loading') testContract.markLoading();
    else if (value === 'ready') testContract.markReady();
    else if (value !== 'idle') testContract.markError(value);
  }, []);
  const reportSnapshot = useCallback((value: CopcThreeLayerSnapshot | undefined): void => {
    setSnapshot(value);
    testContract.setSnapshot(value);
  }, []);

  return (
    <main className="harness-root">
      <div className="harness-canvas">
        <Canvas key={`${harnessConfig.fixtureUrl}:${reloadKey}`} camera={{ position: [0, 0, 1000], near: 0.1, far: 20_000 }}>
          <CopcPointCloud url={harnessConfig.fixtureUrl} onStatus={reportStatusWithContract} onSnapshot={reportSnapshot} />
        </Canvas>
      </div>
      <HarnessPanel
        config={harnessConfig}
        framework="Vite"
        renderer="React Three Fiber"
        status={status}
        snapshot={snapshot}
        onReload={() => setReloadKey((value) => value + 1)}
      >
        <p className="hint">R3F의 <code>useThree</code>/<code>useFrame</code>에서 caller-owned scene, camera, render loop에 Three layer를 연결합니다.</p>
      </HarnessPanel>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
