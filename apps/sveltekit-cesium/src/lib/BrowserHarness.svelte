<script lang="ts">
  import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
  import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
  import type { CopcCesiumLayerSnapshot } from '@frillab/copc-adapter/cesium';
  import { onMount } from 'svelte';
  import { startCesiumHarness } from '../../../../apps/shared/startCesiumHarness';

  const config = createHarnessConfig({
    appId: 'sveltekit-cesium',
    host: 'sveltekit',
    renderer: 'cesium',
    fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID, '/api'),
    backend: 'copc-js',
    scenario: 'load-and-stream',
  });
  const contract = createTestContract(config);
  const fixtureName = config.fixtureUrl.split('/').at(-1);
  let viewport: HTMLDivElement;
  let status = 'idle';
  let snapshot: CopcCesiumLayerSnapshot | undefined;

  function reportStatus(value: string): void {
    status = value;
    if (value === 'loading') contract.markLoading();
    else if (value === 'ready') contract.markReady();
  }

  function reportSnapshot(value: CopcCesiumLayerSnapshot | undefined): void {
    snapshot = value;
    contract.setSnapshot(value);
  }

  function reload(): void {
    window.location.reload();
  }

  onMount(() => {
    const stop = startCesiumHarness({
      container: viewport,
      config,
      contract,
      onStatus: reportStatus,
      onSnapshot: reportSnapshot,
    });
    contract.registerCommand('reload', reload);
    return stop;
  });
</script>

<div class="harness-root">
  <div bind:this={viewport} class="harness-canvas" aria-label="COPC Cesium viewport"></div>
  <aside class="harness-panel">
    <div class="eyebrow">COPC ADAPTER TEST MATRIX</div>
    <h1>SvelteKit / Cesium</h1>
    <p class="muted">SvelteKit의 <code>onMount</code> 경계에서 Cesium과 adapter를 동적으로 로드합니다.</p>
    <div class="tag-row"><span>SvelteKit</span><span>Cesium</span><span>npm {config.packageVersion}</span></div>
    <div class="status-row"><span>status</span><strong data-status={status}>{status}</strong></div>
    <div class="status-row"><span>fixture</span><strong>{fixtureName}</strong></div>
    <div class="status-row"><span>scenario</span><strong>{config.scenario}</strong></div>
    <button class="primary-button" data-testid="harness-reload" type="button" onclick={reload}>레이어 다시 로드</button>
    <div class="diagnostics">
      <div><span>app</span><b>{config.appId}</b></div>
      <div><span>lifecycle</span><b>{snapshot?.lifecycle ?? '—'}</b></div>
      <div><span>backend</span><b>{snapshot?.backend ?? config.backend}</b></div>
      <div><span>rendered nodes</span><b>{snapshot?.renderedNodeKeys.length ?? '—'}</b></div>
      <div><span>rendered points</span><b>{snapshot?.renderedPointCount ?? '—'}</b></div>
      <div><span>stream updates</span><b>{snapshot?.streamingUpdateCount ?? '—'}</b></div>
    </div>
  </aside>
</div>
