import { CopcThreeLayer, type CopcThreeLayerSnapshot } from '@frillab/copc-adapter/three';
import { fixtureUrlForId, DEFAULT_FIXTURE_ID } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract, type HarnessConfig, type HarnessHost } from '@copc-test/harness-core';
import * as THREE from 'three';
import { fitThreeCamera } from './threeFit';

export type ThreeBundlerSmokeOptions = {
  appId: string;
  host: Extract<HarnessHost, 'webpack' | 'esbuild' | 'parcel'>;
  backend: 'copc-js' | 'rust';
  bundlerLabel: string;
};

function configFor(options: ThreeBundlerSmokeOptions): HarnessConfig {
  return createHarnessConfig({
    appId: options.appId,
    host: options.host,
    renderer: 'three',
    fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
    backend: options.backend,
    scenario: 'camera-stream',
  });
}

function snapshotValue(layer: CopcThreeLayer | undefined): CopcThreeLayerSnapshot | undefined {
  return layer?.getSnapshot();
}

/** Start a deliberately small caller-owned Three.js application for bundler tests. */
export function startBundlerThreeSmoke(options: ThreeBundlerSmokeOptions): void {
  const config = configFor(options);
  const contract = createTestContract(config);
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Bundler smoke app is missing #app.');

  root.innerHTML = `
    <main class="smoke-root">
      <div id="viewport" class="smoke-viewport" aria-label="COPC Three.js viewport"></div>
      <aside class="smoke-panel">
        <p class="eyebrow">COPC BUNDLER SMOKE</p>
        <h1>${options.bundlerLabel} / Three.js</h1>
        <p>Published adapter package consumer</p>
        <dl>
          <div><dt>app</dt><dd>${config.appId}</dd></div>
          <div><dt>status</dt><dd id="status" data-status="idle">idle</dd></div>
          <div><dt>backend</dt><dd>${config.backend}</dd></div>
          <div><dt>fixture</dt><dd>${DEFAULT_FIXTURE_ID}</dd></div>
        </dl>
        <pre id="diagnostics" aria-live="polite"></pre>
      </aside>
    </main>`;

  const viewport = root.querySelector<HTMLElement>('#viewport');
  const status = root.querySelector<HTMLElement>('#status');
  const diagnostics = root.querySelector<HTMLElement>('#diagnostics');
  if (!viewport || !status || !diagnostics) throw new Error('Bundler smoke app did not render its harness.');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07111f');
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20_000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewport.appendChild(renderer.domElement);

  const layer = new CopcThreeLayer({
    url: config.fixtureUrl,
    backend: config.backend,
    colorMode: 'elevation',
    pointSize: 3,
    maxRenderedPoints: 1_000_000,
    streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
    debug: true,
  });
  let disposed = false;
  const target = new THREE.Vector3();

  const publish = (snapshot: unknown = snapshotValue(layer)): void => {
    contract.setSnapshot(snapshot);
    diagnostics.textContent = JSON.stringify(contract.getResult(), null, 2);
  };
  const setStatus = (value: 'loading' | 'ready' | 'error'): void => {
    status.textContent = value;
    status.dataset.status = value;
    if (value === 'loading') contract.markLoading();
    else if (value === 'ready') contract.markReady();
    else contract.markError('Bundler smoke runtime failed.', 'runtime');
    publish();
  };
  const resize = (): void => {
    const width = viewport.clientWidth || window.innerWidth;
    const height = viewport.clientHeight || window.innerHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const onWheel = (event: WheelEvent): void => {
    if (!layer || disposed) return;
    const scale = event.deltaY < 0 ? 0.75 : 1.25;
    camera.position.sub(target).multiplyScalar(scale).add(target);
    camera.updateMatrixWorld(true);
    void layer.update().then(publish).catch((error: unknown) => {
      if (!disposed) {
        contract.markError(error, 'runtime');
        publish();
      }
    });
  };
  const render = (): void => {
    if (disposed) return;
    renderer.render(scene, camera);
    window.requestAnimationFrame(render);
  };
  const timer = window.setInterval(publish, 250);

  window.addEventListener('resize', resize);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: true });
  contract.registerCommand('reload', () => window.location.reload());
  resize();
  render();
  setStatus('loading');

  void (async (): Promise<void> => {
    try {
      layer.attachTo({ scene, camera, renderer });
      contract.markAttached();
      publish();
      await layer.load();
      if (disposed) return;
      await layer.update();
      if (disposed) return;
      if (!fitThreeCamera(layer, camera, target)) {
        throw new Error('COPC loaded, but no Three.js points were rendered.');
      }
      camera.updateMatrixWorld(true);
      await layer.update();
      if (disposed) return;
      publish();
      setStatus('ready');
    } catch (error: unknown) {
      if (!disposed) {
        contract.markError(error, 'runtime');
        status.textContent = error instanceof Error ? error.message : String(error);
        status.dataset.status = 'error';
        publish();
      }
    }
  })();

  window.addEventListener('beforeunload', () => {
    disposed = true;
    window.clearInterval(timer);
    window.removeEventListener('resize', resize);
    renderer.domElement.removeEventListener('wheel', onWheel);
    layer.destroy();
    renderer.dispose();
    contract.markDestroyed();
  }, { once: true });
}
