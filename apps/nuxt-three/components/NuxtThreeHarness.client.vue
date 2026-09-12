<script setup lang="ts">
import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import type { CopcThreeLayerSnapshot } from '@frillab/copc-adapter/three';
import { startThreeHarness } from '../../../apps/shared/startThreeHarness';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const config = createHarnessConfig({
  appId: 'nuxt-three',
  host: 'nuxt',
  renderer: 'three',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID, '/api'),
  backend: 'copc-js',
  scenario: 'load-and-stream',
});
const contract = createTestContract(config);
const viewport = ref<HTMLDivElement>();
const status = ref('idle');
const snapshot = ref<CopcThreeLayerSnapshot>();
let stop: (() => void) | undefined;

function reportStatus(value: string): void {
  status.value = value;
  if (value === 'loading') contract.markLoading();
  else if (value === 'ready') contract.markReady();
}

function reportSnapshot(value: CopcThreeLayerSnapshot | undefined): void {
  snapshot.value = value;
  contract.setSnapshot(value);
}

function reload(): void {
  window.location.reload();
}

onMounted(() => {
  void nextTick().then(() => {
    if (!viewport.value) return;
    stop = startThreeHarness({
      container: viewport.value,
      config,
      contract,
      onStatus: reportStatus,
      onSnapshot: reportSnapshot,
    });
  });
});

onBeforeUnmount(() => stop?.());
contract.registerCommand('reload', reload);
</script>

<template>
  <div class="harness-root">
    <div ref="viewport" class="harness-canvas" aria-label="COPC Three.js viewport" />
    <aside class="harness-panel">
      <div class="eyebrow">COPC ADAPTER TEST MATRIX</div>
      <h1>Nuxt / Three.js</h1>
      <p class="muted">Nuxt의 <code>.client.vue</code> 경계에서 caller-owned Three scene을 연결합니다.</p>
      <div class="tag-row"><span>Nuxt</span><span>Three.js</span><span>{{ config.packageSource === 'npm' ? `npm ${config.packageVersion}` : config.packageSource === 'checkout' ? 'Packed checkout' : 'Packed TGZ' }}</span></div>
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
