'use client';

import { CopcThreeLayer, type CopcThreeLayerSnapshot } from '@frillab/copc-adapter-local/three';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HarnessPanel } from '../../../apps/shared/HarnessPanel';
import { fitThreeCamera } from '../../../apps/shared/threeFit';

const SAMPLE_URL = '/api/samples/sofi.copc.laz';

type ViewportProps = {
  url: string;
  onStatus: (status: string) => void;
  onSnapshot: (snapshot: CopcThreeLayerSnapshot | undefined) => void;
};

function ThreeViewport({ url, onStatus, onSnapshot }: ViewportProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#06101d');
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20_000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const layer = new CopcThreeLayer({
      url,
      colorMode: 'elevation',
      backend: 'copc-js',
      pointSize: 3,
      maxRenderedPoints: 1_000_000,
      streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
      debug: true,
    });
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
      onSnapshot(undefined);
    };
  }, [onSnapshot, onStatus, url]);

  return <div ref={containerRef} className="harness-canvas" aria-label="COPC Three.js viewport" />;
}

export default function ThreeClient(): ReactNode {
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
        framework="Next.js"
        renderer="Three.js"
        status={status}
        sampleUrl={SAMPLE_URL}
        snapshot={snapshot}
        onReload={() => setReloadKey((value) => value + 1)}
      >
        <p className="hint">Direct Three.js host가 caller-owned scene, camera, renderer를 만들고 local TGZ의 Three adapter를 연결합니다.</p>
      </HarnessPanel>
    </main>
  );
}
