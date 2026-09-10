import { CopcCesiumLayer, type CopcCesiumLayerSnapshot } from '@frillab/copc-adapter/cesium';
import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract, type HarnessConfig, type HarnessHost } from '@copc-test/harness-core';
import * as Cesium from 'cesium';

export type CesiumBundlerSmokeOptions = {
  appId: string;
  host: Extract<HarnessHost, 'rollup'>;
  backend: 'copc-js' | 'rust';
  bundlerLabel: string;
};

function configFor(options: CesiumBundlerSmokeOptions): HarnessConfig {
  return createHarnessConfig({
    appId: options.appId,
    host: options.host,
    renderer: 'cesium',
    fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
    backend: options.backend,
    scenario: 'load-and-stream',
  });
}

/** Start a minimal Cesium consumer; the bundler must emit Cesium's runtime assets. */
export function startBundlerCesiumSmoke(options: CesiumBundlerSmokeOptions): void {
  const config = configFor(options);
  const contract = createTestContract(config);
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Bundler smoke app is missing #app.');

  root.innerHTML = `
    <main class="smoke-root">
      <div id="viewport" class="smoke-viewport" aria-label="COPC Cesium viewport"></div>
      <aside class="smoke-panel">
        <p class="eyebrow">COPC BUNDLER SMOKE</p>
        <h1>${options.bundlerLabel} / Cesium</h1>
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

  // Rollup copies the Cesium Build/Cesium directory to this stable URL.
  (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = '/cesium/';
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
    url: config.fixtureUrl,
    backend: config.backend,
    colorMode: 'elevation',
    pointSize: 2,
    streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8 },
    debug: true,
  });
  let disposed = false;
  const publish = (snapshot: CopcCesiumLayerSnapshot | undefined = layer.getSnapshot()): void => {
    contract.setSnapshot(snapshot);
    diagnostics.textContent = JSON.stringify(contract.getResult(), null, 2);
  };
  const setStatus = (value: 'loading' | 'ready' | 'error', error?: unknown): void => {
    status.textContent = value === 'error' && error instanceof Error ? error.message : value;
    status.dataset.status = value;
    if (value === 'loading') contract.markLoading();
    else if (value === 'ready') contract.markReady();
    else contract.markError(error ?? 'Bundler smoke runtime failed.', 'runtime');
    publish();
  };
  const timer = window.setInterval(publish, 250);

  contract.registerCommand('reload', () => window.location.reload());
  setStatus('loading');
  void (async (): Promise<void> => {
    try {
      await layer.load();
      if (disposed) return;
      layer.attachTo(viewer);
      contract.markAttached();
      publish();
      setStatus('ready');
    } catch (error: unknown) {
      if (!disposed) setStatus('error', error);
    }
  })();

  window.addEventListener('beforeunload', () => {
    disposed = true;
    window.clearInterval(timer);
    layer.destroy();
    if (!viewer.isDestroyed()) viewer.destroy();
    contract.markDestroyed();
  }, { once: true });
}
