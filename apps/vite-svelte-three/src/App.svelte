<script lang="ts">
  import { CopcThreeLayer, type CopcThreeLayerSnapshot } from '@frillab/copc-adapter/three';
  import { DEFAULT_FIXTURE_ID, fixtureName, fixtureUrlForId } from '@copc-test/fixture-client';
  import { createHarnessConfig, createTestContract, normalizeSnapshot } from '@copc-test/harness-core';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { onMount } from 'svelte';
  import { fitThreeCamera } from '../../../apps/shared/threeFit';

  const harnessConfig = createHarnessConfig({
    appId: 'vite-svelte-three',
    host: 'vite',
    renderer: 'three',
    fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
    backend: 'copc-js',
    scenario: 'load-and-stream',
  }, import.meta.env, 'VITE_');
  const testContract = createTestContract(harnessConfig);
  let viewport: HTMLDivElement;
  let status = 'idle';
  let snapshot: CopcThreeLayerSnapshot | undefined;
  $: diagnostics = normalizeSnapshot(snapshot);

  const format = (value: number | undefined): string =>
    value === undefined ? '—' : new Intl.NumberFormat('en-US').format(value);
  const reload = (): void => window.location.reload();

  onMount(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#06101d');
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20_000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    viewport.appendChild(renderer.domElement);
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
    const resize = (): void => {
      const width = viewport.clientWidth || window.innerWidth;
      const height = viewport.clientHeight || window.innerHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const render = (): void => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    const update = (): void => { void layer.update(); };
    controls.addEventListener('change', update);
    window.addEventListener('resize', resize);
    resize();
    render();
    const timer = window.setInterval(() => {
      snapshot = layer.getSnapshot();
      testContract.setSnapshot(snapshot);
    }, 250);
    testContract.registerCommand('reload', reload);
    status = 'loading';
    testContract.markLoading();
    void (async (): Promise<void> => {
      try {
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
        snapshot = layer.getSnapshot();
        testContract.setSnapshot(snapshot);
        status = 'ready';
        testContract.markReady();
      } catch (error: unknown) {
        if (!disposed) {
          status = 'error';
          testContract.markError(error);
        }
      }
    })();

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.cancelAnimationFrame(animationFrame);
      controls.removeEventListener('change', update);
      window.removeEventListener('resize', resize);
      testContract.unregisterCommand('reload');
      controls.dispose();
      layer.destroy();
      renderer.dispose();
      renderer.domElement.remove();
      testContract.markDestroyed();
    };
  });
</script>

<main class="harness-root">
  <div class="harness-canvas" bind:this={viewport}></div>
  <aside class="harness-panel">
    <div class="eyebrow">COPC ADAPTER TEST MATRIX</div>
    <h1>Vite + Svelte / Three.js</h1>
    <p class="muted">Svelte onMount/onDestroy lifecycle에서 caller-owned Three scene을 검증합니다.</p>
    <div class="tag-row">
      <span>Vite + Svelte</span><span>Three.js</span>
      <span>{harnessConfig.packageSource === 'npm' ? `npm ${harnessConfig.packageVersion}` : harnessConfig.packageSource === 'checkout' ? 'Packed checkout' : 'Packed TGZ'}</span>
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
    <p class="hint"><code>@frillab/copc-adapter/three</code>을 Svelte onMount에서 직접 attach합니다.</p>
  </aside>
</main>
