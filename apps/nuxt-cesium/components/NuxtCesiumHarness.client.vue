<script setup lang="ts">
import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import type { CopcCesiumLayerSnapshot } from '@frillab/copc-adapter/cesium';
import type * as CesiumTypes from 'cesium';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const config = createHarnessConfig({
  appId: 'nuxt-cesium',
  host: 'nuxt',
  renderer: 'cesium',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID, '/api'),
  backend: 'copc-js',
  scenario: 'load-and-stream',
});
const contract = createTestContract(config);
const viewport = ref<HTMLDivElement>();
const status = ref('idle');
const snapshot = ref<CopcCesiumLayerSnapshot>();
let dispose: (() => void) | undefined;

function reportStatus(value: string): void {
  status.value = value;
  if (value === 'loading') contract.markLoading();
  else if (value === 'ready') contract.markReady();
  else if (value !== 'idle') contract.markError(value);
}

function reportSnapshot(value: CopcCesiumLayerSnapshot | undefined): void {
  snapshot.value = value;
  contract.setSnapshot(value);
}

onMounted(async () => {
  await nextTick();
  const container = viewport.value;
  if (!container) return;

  let disposed = false;
  let timer: number | undefined;
  let viewer: CesiumTypes.Viewer | undefined;
  let layer: { load(): Promise<void>; attachTo(value: unknown): void; getSnapshot(): unknown; destroy(): void } | undefined;
  reportStatus('loading');

  dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timer !== undefined) window.clearInterval(timer);
    layer?.destroy();
    if (viewer && !viewer.isDestroyed()) viewer.destroy();
    contract.markDestroyed();
  };

  (async (): Promise<void> => {
    try {
      const [Cesium, adapter] = await Promise.all([
        import('cesium'),
        import('@frillab/copc-adapter/cesium'),
      ]);
      if (disposed) return;

      (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = '/api/cesium/';
      const currentViewer = new Cesium.Viewer(container, {
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
      viewer = currentViewer;
      const currentLayer = new adapter.CopcCesiumLayer({
        url: config.fixtureUrl,
        colorMode: 'elevation',
        backend: config.backend,
        pointSize: 2,
        debug: true,
        streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8 },
      });
      layer = currentLayer;
      timer = window.setInterval(() => reportSnapshot(currentLayer.getSnapshot()), 250);
      await currentLayer.load();
      if (disposed) return;
      currentLayer.attachTo(currentViewer);
      contract.markAttached();
      reportSnapshot(currentLayer.getSnapshot());
      reportStatus('ready');
    } catch (error: unknown) {
      if (!disposed) {
        contract.markError(error);
        status.value = 'error';
      }
    }
  })();
});

onBeforeUnmount(() => dispose?.());

contract.registerCommand('reload', () => window.location.reload());

function reload(): void {
  window.location.reload();
}
</script>

<template>
  <div class="harness-root">
    <div ref="viewport" class="harness-canvas" aria-label="COPC Cesium viewport" />
    <aside class="harness-panel">
      <div class="eyebrow">COPC ADAPTER TEST MATRIX</div>
      <h1>Nuxt / Cesium</h1>
      <p class="muted">Nuxt의 <code>.client.vue</code> 경계에서 Cesium과 adapter를 동적으로 로드합니다.</p>
      <div class="tag-row"><span>Nuxt</span><span>Cesium</span><span>npm {{ config.packageVersion }}</span></div>
      <div class="status-row"><span>status</span><strong :data-status="status">{{ status }}</strong></div>
      <div class="status-row"><span>fixture</span><strong>{{ config.fixtureUrl.split('/').at(-1) }}</strong></div>
      <div class="status-row"><span>scenario</span><strong>{{ config.scenario }}</strong></div>
      <button class="primary-button" data-testid="harness-reload" type="button" @click="reload">레이어 다시 로드</button>
      <div class="diagnostics">
        <div><span>app</span><b>{{ config.appId }}</b></div>
        <div><span>lifecycle</span><b>{{ snapshot?.lifecycle ?? '—' }}</b></div>
        <div><span>backend</span><b>{{ snapshot?.backend ?? config.backend }}</b></div>
        <div><span>rendered nodes</span><b>{{ snapshot?.renderedNodeKeys?.length ?? '—' }}</b></div>
        <div><span>rendered points</span><b>{{ snapshot?.renderedPointCount ?? '—' }}</b></div>
        <div><span>stream updates</span><b>{{ snapshot?.streamingUpdateCount ?? '—' }}</b></div>
      </div>
    </aside>
  </div>
</template>
