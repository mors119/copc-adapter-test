<script lang="ts">
  import * as Cesium from 'cesium';
  import { CopcCesiumLayer, type CopcCesiumLayerSnapshot } from '@frillab/copc-adapter/cesium';
  import { DEFAULT_FIXTURE_ID, fixtureName, fixtureUrlForId } from '@copc-test/fixture-client';
  import { createHarnessConfig, createTestContract, normalizeSnapshot } from '@copc-test/harness-core';
  import { onMount } from 'svelte';

  const harnessConfig = createHarnessConfig({
    appId: 'vite-svelte-cesium',
    host: 'vite',
    renderer: 'cesium',
    fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
    backend: 'copc-js',
    scenario: 'load-and-stream',
  }, import.meta.env, 'VITE_');
  const testContract = createTestContract(harnessConfig);
  let viewport: HTMLDivElement;
  let status = 'idle';
  let snapshot: CopcCesiumLayerSnapshot | undefined;
  $: diagnostics = normalizeSnapshot(snapshot);

  const format = (value: number | undefined): string =>
    value === undefined ? '—' : new Intl.NumberFormat('en-US').format(value);
  const reload = (): void => window.location.reload();

  onMount(() => {
    const baseUrl = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '/')}`;
    (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = `${baseUrl}cesium/`;
    const viewer = new Cesium.Viewer(viewport, {
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
    const layer = new CopcCesiumLayer({
      url: harnessConfig.fixtureUrl,
      colorMode: 'elevation',
      backend: harnessConfig.backend,
      pointSize: 2,
      debug: true,
      streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8 },
    });
    let disposed = false;
    const timer = window.setInterval(() => {
      snapshot = layer.getSnapshot();
      testContract.setSnapshot(snapshot);
    }, 250);
    testContract.registerCommand('reload', reload);
    status = 'loading';
    testContract.markLoading();
    void layer.load().then(() => {
      if (disposed) return;
      layer.attachTo(viewer);
      snapshot = layer.getSnapshot();
      testContract.markAttached();
      testContract.setSnapshot(snapshot);
      status = 'ready';
      testContract.markReady();
    }).catch((error: unknown) => {
      if (disposed) return;
      status = 'error';
      testContract.markError(error);
    });

    return () => {
      disposed = true;
      window.clearInterval(timer);
      testContract.unregisterCommand('reload');
      layer.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
      testContract.markDestroyed();
    };
  });
</script>

<main class="harness-root">
  <div class="harness-canvas" bind:this={viewport} aria-label="COPC 포인트 클라우드 지도"></div>
  <aside class="harness-panel">
    <div class="eyebrow">COPC ADAPTER TEST MATRIX</div>
    <h1>Vite + Svelte / Cesium</h1>
    <p class="muted">Svelte onMount/onDestroy lifecycle에서 공개 Cesium entry를 검증합니다.</p>
    <div class="tag-row">
      <span>Vite + Svelte</span><span>Cesium</span>
      <span>{harnessConfig.packageSource === 'tarball' ? 'Packed TGZ' : `npm ${harnessConfig.packageVersion}`}</span>
    </div>
    <div class="status-row"><span>status</span><strong data-status={status}>{status}</strong></div>
    <div class="status-row"><span>fixture</span><strong>{fixtureName(harnessConfig.fixtureUrl)}</strong></div>
    <div class="status-row"><span>scenario</span><strong>{harnessConfig.scenario}</strong></div>
    <button class="primary-button" data-testid="harness-reload" type="button" onclick={reload}>레이어 다시 로드</button>
    <div class="diagnostics">
      <div><span>app</span><b>{harnessConfig.appId}</b></div>
      <div><span>lifecycle</span><b>{diagnostics.lifecycle ?? '—'}</b></div>
      <div><span>backend</span><b>{diagnostics.backend ?? harnessConfig.backend}</b></div>
      <div><span>rendered nodes</span><b>{format(diagnostics.renderedNodeKeys.length)}</b></div>
      <div><span>rendered points</span><b>{format(diagnostics.renderedPointCount)}</b></div>
      <div><span>stream updates</span><b>{format(diagnostics.streamingUpdateCount)}</b></div>
    </div>
    <p class="hint"><code>@frillab/copc-adapter/cesium</code>을 Svelte onMount에서 직접 attach합니다.</p>
  </aside>
</main>
