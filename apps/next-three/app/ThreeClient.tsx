'use client';

import { CopcThreeLayer, type CopcThreeLayerSnapshot } from '@frillab/copc-adapter/three';
import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { HarnessPanel } from '../../../apps/shared/HarnessPanel';
import { fitThreeCamera } from '../../../apps/shared/threeFit';

const harnessConfig = createHarnessConfig({
  appId: 'next-three',
  host: 'next',
  renderer: 'three',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID, '/api'),
  backend: 'copc-js',
  scenario: 'load-and-stream',
}, process.env, 'NEXT_PUBLIC_');
const testContract = createTestContract(harnessConfig);

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
      backend: harnessConfig.backend,
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
    const update = (): void => { void layer.update(); };
    controls.addEventListener('change', update);
    render();
    const timer = window.setInterval(() => onSnapshot(layer.getSnapshot()), 250);

    void (async (): Promise<void> => {
      try {
        layer.attachTo({ scene, camera, renderer });
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
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      controls.removeEventListener('change', update);
      controls.dispose();
      layer.destroy();
      renderer.dispose();
      renderer.domElement.remove();
      testContract.markDestroyed();
      onSnapshot(undefined);
    };
  }, [onSnapshot, onStatus, url]);

  return <div ref={containerRef} className="harness-canvas" aria-label="COPC Three.js viewport" />;
}

export default function ThreeClient(): ReactNode {
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState('idle');
  const [snapshot, setSnapshot] = useState<CopcThreeLayerSnapshot>();
  useEffect(() => {
    testContract.registerCommand('reload', () => setReloadKey((value) => value + 1));
    return () => testContract.unregisterCommand('reload');
  }, []);
  const reportStatus = useCallback((value: string): void => {
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
      <ThreeViewport
        key={`${harnessConfig.fixtureUrl}:${reloadKey}`}
        url={harnessConfig.fixtureUrl}
        onStatus={reportStatus}
        onSnapshot={reportSnapshot}
      />
      <HarnessPanel
        config={harnessConfig}
        framework="Next.js"
        renderer="Three.js"
        status={status}
        snapshot={snapshot}
        onReload={() => setReloadKey((value) => value + 1)}
      >
        <p className="hint">Direct Three.js host가 caller-owned scene, camera, renderer를 만들고 <code>@frillab/copc-adapter/three</code>를 연결합니다.</p>
      </HarnessPanel>
    </main>
  );
}
