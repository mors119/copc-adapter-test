import '../../../apps/shared/styles.css';

import { CopcThreeLayer, type CopcThreeLayerSnapshot } from '@frillab/copc-adapter/three';
import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createVanillaHarnessPanel } from '../../../apps/shared/VanillaHarnessPanel';
import { fitThreeCamera } from '../../../apps/shared/threeFit';

const harnessConfig = createHarnessConfig({
  appId: 'vite-vanilla-three',
  host: 'vite',
  renderer: 'three',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
  backend: 'copc-js',
  scenario: 'load-and-stream',
}, import.meta.env, 'VITE_');
const testContract = createTestContract(harnessConfig);
const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Vanilla Three app root is missing.');

const canvasHost = document.createElement('div');
canvasHost.className = 'harness-canvas';
app.appendChild(canvasHost);
const panel = createVanillaHarnessPanel({
  config: harnessConfig,
  framework: 'Vite Vanilla JS',
  renderer: 'Three.js',
  onReload: () => window.location.reload(),
});
app.appendChild(panel.element);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#06101d');
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20_000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
canvasHost.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const layer = new CopcThreeLayer({
  url: harnessConfig.fixtureUrl,
  colorMode: 'elevation',
  backend: harnessConfig.backend,
  pointSize: 3,
  maxRenderedPoints: 100_000,
  streaming: { maxNodes: 4, maxDepth: 5, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
  debug: true,
});

let disposed = false;
let animationFrame = 0;
let panelStatus = 'idle';
const resize = (): void => {
  const width = canvasHost.clientWidth || window.innerWidth;
  const height = canvasHost.clientHeight || window.innerHeight;
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
};
const render = (): void => {
  controls.update();
  renderer.render(scene, camera);
  animationFrame = window.requestAnimationFrame(render);
};
const snapshotTimer = window.setInterval(() => {
  const snapshot = layer.getSnapshot();
  panel.update(panelStatus, snapshot);
  testContract.setSnapshot(snapshot);
}, 250);
const update = (): void => { void layer.update(); };
controls.addEventListener('change', update);
window.addEventListener('resize', resize);
resize();
render();

testContract.registerCommand('reload', () => window.location.reload());
void (async (): Promise<void> => {
  try {
    testContract.markLoading();
    panelStatus = 'loading';
    panel.update('loading');
    layer.attachTo({ scene, camera, renderer });
    testContract.markAttached();
    await layer.load();
    if (disposed) return;
    await layer.update();
    if (disposed || !fitThreeCamera(layer, camera, controls.target)) {
      throw new Error('COPC loaded, but no Three.js points were rendered.');
    }
    controls.update();
    await layer.update();
    const snapshot = layer.getSnapshot() as CopcThreeLayerSnapshot;
    panelStatus = 'ready';
    panel.update('ready', snapshot);
    testContract.setSnapshot(snapshot);
    testContract.markReady();
  } catch (error: unknown) {
    if (!disposed) {
      panelStatus = 'error';
      panel.update('error', layer.getSnapshot());
      testContract.markError(error);
    }
  }
})();

const dispose = (): void => {
  if (disposed) return;
  disposed = true;
  window.clearInterval(snapshotTimer);
  window.cancelAnimationFrame(animationFrame);
  controls.removeEventListener('change', update);
  window.removeEventListener('resize', resize);
  controls.dispose();
  layer.destroy();
  renderer.dispose();
  renderer.domElement.remove();
  testContract.markDestroyed();
};
window.addEventListener('beforeunload', dispose, { once: true });
