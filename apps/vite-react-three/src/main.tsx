import '../../../apps/shared/styles.css';

import { CopcThreeLayer, type CopcThreeLayerSnapshot } from '@frillab/copc-adapter-local/three';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HarnessPanel } from '../../../apps/shared/HarnessPanel';
import { fitThreeCamera } from '../../../apps/shared/threeFit';

const SAMPLE_URL = '/samples/sofi.copc.laz';

type ViewportProps = {
  url: string;
  onStatus: (status: string) => void;
  onSnapshot: (snapshot: CopcThreeLayerSnapshot | undefined) => void;
};

function ThreeViewport({ url, onStatus, onSnapshot }: ViewportProps): ReactNode {
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

    const layer = new CopcThreeLayer({
      url,
      colorMode: 'elevation',
      backend: 'copc-js',
      pointSize: 3,
      maxRenderedPoints: 1_000_000,
      streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
      debug: true,
    });
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.addEventListener('change', () => { void layer.update(); });
    let disposed = false;
    let animationFrame = 0;
    onStatus('loading');

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

    const timer = window.setInterval(() => onSnapshot(layer.getSnapshot()), 250);
    void (async (): Promise<void> => {
      try {
        layer.attachTo({ scene, camera, renderer });
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
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      controls.dispose();
      layer.destroy();
      renderer.dispose();
      renderer.domElement.remove();
      container.remove();
      onSnapshot(undefined);
    };
  }, [onSnapshot, onStatus, url]);

  return null;
}

function App(): ReactNode {
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState('idle');
  const [snapshot, setSnapshot] = useState<CopcThreeLayerSnapshot>();

  return (
    <main className="harness-root">
      <ThreeViewport
        key={`${SAMPLE_URL}:${reloadKey}`}
        url={SAMPLE_URL}
        onStatus={setStatus}
        onSnapshot={setSnapshot}
      />
      <HarnessPanel
        framework="Vite + React"
        renderer="Three.js"
        status={status}
        sampleUrl={SAMPLE_URL}
        snapshot={snapshot}
        onReload={() => setReloadKey((value) => value + 1)}
      >
        <p className="hint">로컬 TGZ의 <code>@frillab/copc-adapter-local/three</code> entry를 사용합니다. 드래그/휠로 카메라를 움직이면 LoD update가 실행됩니다.</p>
      </HarnessPanel>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
