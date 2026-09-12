<script setup lang="ts">
import * as Cesium from 'cesium';
import { CopcCesiumLayer, type CopcCesiumLayerSnapshot } from '@frillab/copc-adapter/cesium';
import { DEFAULT_FIXTURE_ID, fixtureName, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract, normalizeSnapshot } from '@copc-test/harness-core';
import { computed, onMounted, onUnmounted, ref } from 'vue';

const harnessConfig = createHarnessConfig({
  appId: 'vite-vue-cesium',
  host: 'vite',
  renderer: 'cesium',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
  backend: 'copc-js',
  scenario: 'load-and-stream',
}, import.meta.env, 'VITE_');
const testContract = createTestContract(harnessConfig);
const viewport = ref<HTMLDivElement>();
const status = ref('idle');
const snapshot = ref<CopcCesiumLayerSnapshot>();
const diagnostics = computed(() => normalizeSnapshot(snapshot.value));
let viewer: Cesium.Viewer | undefined;
let layer: CopcCesiumLayer | undefined;
let timer = 0;

const format = (value: number | undefined): string =>
  value === undefined ? '—' : new Intl.NumberFormat('en-US').format(value);
const reload = (): void => window.location.reload();

onMounted(() => {
  if (!viewport.value) throw new Error('Vue Cesium viewport is missing.');
  const baseUrl = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '/')}`;
  (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = `${baseUrl}cesium/`;
  viewer = new Cesium.Viewer(viewport.value, {
    animation: false,
    timeline: false,
    geocoder: false,
    baseLayerPicker: false,
    baseLayer: false,
    skyBox: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    homeButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  });
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#07111f');
  layer = new CopcCesiumLayer({
    url: harnessConfig.fixtureUrl,
    colorMode: 'elevation',
    backend: harnessConfig.backend,
    pointSize: 2,
    debug: true,
    streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8 },
  });
  testContract.registerCommand('reload', reload);
  status.value = 'loading';
  testContract.markLoading();
  timer = window.setInterval(() => {
    snapshot.value = layer?.getSnapshot();
    testContract.setSnapshot(snapshot.value);
  }, 250);

  void layer.load().then(() => {
    if (!layer || !viewer) return;
    layer.attachTo(viewer);
    snapshot.value = layer.getSnapshot();
    testContract.markAttached();
    testContract.setSnapshot(snapshot.value);
    status.value = 'ready';
    testContract.markReady();
  }).catch((error: unknown) => {
    status.value = 'error';
    testContract.markError(error);
  });
});

onUnmounted(() => {
  window.clearInterval(timer);
  testContract.unregisterCommand('reload');
  layer?.destroy();
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  testContract.markDestroyed();
});
</script>

<template>
  <main class="harness-root">
    <div ref="viewport" class="harness-canvas" aria-label="COPC 포인트 클라우드 지도"></div>
    <aside class="harness-panel">
      <div class="eyebrow">COPC ADAPTER TEST MATRIX</div>
      <h1>Vite + Vue / Cesium</h1>
      <p class="muted">Vue mounted/unmounted lifecycle에서 공개 Cesium entry를 검증합니다.</p>
      <div class="tag-row">
        <span>Vite + Vue</span><span>Cesium</span>
        <span>{{ harnessConfig.packageSource === 'npm' ? `npm ${harnessConfig.packageVersion}` : harnessConfig.packageSource === 'checkout' ? 'Packed checkout' : 'Packed TGZ' }}</span>
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
      <p class="hint"><code>@frillab/copc-adapter/cesium</code>을 Vue mounted hook에서 직접 attach합니다.</p>
    </aside>
  </main>
</template>
