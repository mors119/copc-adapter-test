import '../../../apps/shared/styles.css';

import { CopcThreeLayer, type CopcThreeLayerSnapshot } from '@frillab/copc-adapter-local/three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { StrictMode, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HarnessPanel } from '../../../apps/shared/HarnessPanel';
import { fitThreeCamera } from '../../../apps/shared/threeFit';

const SAMPLE_URL = '/samples/sofi.copc.laz';

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
      backend: 'copc-js',
      pointSize: 3,
      maxRenderedPoints: 1_000_000,
      streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
      debug: true,
    });
    layerRef.current = layer;
    let disposed = false;
    onStatus('loading');

    const timer = window.setInterval(() => onSnapshot(layer.getSnapshot()), 250);
    void (async (): Promise<void> => {
      try {
        layer.attachTo({ scene, camera, renderer: gl });
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
        if (!disposed) onStatus(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      disposed = true;
      window.clearInterval(timer);
      controls.dispose();
      controlsRef.current = undefined;
      layer.destroy();
      layerRef.current = undefined;
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
  const reportStatus = useCallback((value: string) => setStatus(value), []);
  const reportSnapshot = useCallback((value: CopcThreeLayerSnapshot | undefined) => setSnapshot(value), []);

  return (
    <main className="harness-root">
      <div className="harness-canvas">
        <Canvas key={`${SAMPLE_URL}:${reloadKey}`} camera={{ position: [0, 0, 1000], near: 0.1, far: 20_000 }}>
          <CopcPointCloud url={SAMPLE_URL} onStatus={reportStatus} onSnapshot={reportSnapshot} />
        </Canvas>
      </div>
      <HarnessPanel
        framework="Vite"
        renderer="React Three Fiber"
        status={status}
        sampleUrl={SAMPLE_URL}
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
