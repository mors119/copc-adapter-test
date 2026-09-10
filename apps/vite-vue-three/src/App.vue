<script setup lang="ts">
import { CopcThreeLayer, type CopcThreeLayerSnapshot } from '@frillab/copc-adapter/three';
import { DEFAULT_FIXTURE_ID, fixtureName, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract, normalizeSnapshot } from '@copc-test/harness-core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { fitThreeCamera } from '../../../apps/shared/threeFit';

const harnessConfig = createHarnessConfig({
  appId: 'vite-vue-three',
  host: 'vite',
  renderer: 'three',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
  backend: 'copc-js',
  scenario: 'load-and-stream',
}, import.meta.env, 'VITE_');
const testContract = createTestContract(harnessConfig);
const viewport = ref<HTMLDivElement>();
const status = ref('idle');
const snapshot = ref<CopcThreeLayerSnapshot>();
const diagnostics = computed(() => normalizeSnapshot(snapshot.value));
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let renderer: THREE.WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
let layer: CopcThreeLayer | undefined;
let animationFrame = 0;
let timer = 0;
let disposed = false;
let cleanup = (): void => {};

const format = (value: number | undefined): string =>
  value === undefined ? '—' : new Intl.NumberFormat('en-US').format(value);
const reload = (): void => window.location.reload();

onMounted(() => {
  if (!viewport.value) throw new Error('Vue Three viewport is missing.');
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#06101d');
  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20_000);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewport.value.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  layer = new CopcThreeLayer({
    url: harnessConfig.fixtureUrl,
    colorMode: 'elevation',
    backend: harnessConfig.backend,
    pointSize: 3,
    maxRenderedPoints: 100_000,
    streaming: { maxNodes: 4, maxDepth: 5, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
    debug: true,
  });
  const resize = (): void => {
    if (!viewport.value || !camera || !renderer) return;
    const width = viewport.value.clientWidth || window.innerWidth;
    const height = viewport.value.clientHeight || window.innerHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const render = (): void => {
    if (!scene || !camera || !renderer) return;
    controls?.update();
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(render);
  };
  const update = (): void => { void layer?.update(); };
  controls.addEventListener('change', update);
  window.addEventListener('resize', resize);
  resize();
  render();
  testContract.registerCommand('reload', reload);
  status.value = 'loading';
  testContract.markLoading();
  timer = window.setInterval(() => {
    snapshot.value = layer?.getSnapshot();
    testContract.setSnapshot(snapshot.value);
  }, 250);

  void (async (): Promise<void> => {
    try {
      if (!layer || !scene || !camera || !renderer || !controls) throw new Error('Vue Three renderer is not ready.');
      layer.attachTo({ scene, camera, renderer });
      testContract.markAttached();
      await layer.load();
      if (disposed) return;
      await layer.update();
      if (!fitThreeCamera(layer, camera, controls.target)) {
        throw new Error('COPC loaded, but no Three.js points were rendered.');
      }
      controls.update();
      await layer.update();
      snapshot.value = layer.getSnapshot();
      testContract.setSnapshot(snapshot.value);
      status.value = 'ready';
      testContract.markReady();
    } catch (error: unknown) {
      if (!disposed) {
        status.value = 'error';
        testContract.markError(error);
      }
    }
  })();

  cleanup = (): void => {
    disposed = true;
    window.clearInterval(timer);
    window.cancelAnimationFrame(animationFrame);
    controls?.removeEventListener('change', update);
    window.removeEventListener('resize', resize);
    testContract.unregisterCommand('reload');
    controls?.dispose();
    layer?.destroy();
    renderer?.dispose();
    renderer?.domElement.remove();
    testContract.markDestroyed();
  };
});

onUnmounted(() => cleanup());
</script>

<template>
  <main class="harness-root">
    <div ref="viewport" class="harness-canvas"></div>
    <aside class="harness-panel">
      <div class="eyebrow">COPC ADAPTER TEST MATRIX</div>
      <h1>Vite + Vue / Three.js</h1>
      <p class="muted">Vue mounted/unmounted lifecycle에서 caller-owned Three scene을 검증합니다.</p>
      <div class="tag-row">
        <span>Vite + Vue</span><span>Three.js</span>
        <span>{{ harnessConfig.packageSource === 'tarball' ? 'Packed TGZ' : `npm ${harnessConfig.packageVersion}` }}</span>
      </div>
      <div class="status-row"><span>status</span><strong :data-status="status">{{ status }}</strong></div>
      <div class="status-row"><span>fixture</span><strong>{{ fixtureName(harnessConfig.fixtureUrl) }}</strong></div>
      <div class="status-row"><span>scenario</span><strong>{{ harnessConfig.scenario }}</strong></div>
      <button class="primary-button" data-testid="harness-reload" type="button" @click="reload">레이어 다시 로드</button>
      <div class="diagnostics">
        <div><span>app</span><b>{{ harnessConfig.appId }}</b></div>
        <div><span>lifecycle</span><b>{{ diagnostics.lifecycle ?? '—' }}</b></div>
        <div><span>backend</span><b>{{ diagnostics.backend ?? harnessConfig.backend }}</b></div>
        <div><span>rendered nodes</span><b>{{ format(diagnostics.renderedNodeKeys.length) }}</b></div>
        <div><span>rendered points</span><b>{{ format(diagnostics.renderedPointCount) }}</b></div>
        <div><span>stream updates</span><b>{{ format(diagnostics.streamingUpdateCount) }}</b></div>
      </div>
      <p class="hint"><code>@frillab/copc-adapter/three</code>을 Vue mounted hook에서 직접 attach합니다.</p>
    </aside>
  </main>
</template>
