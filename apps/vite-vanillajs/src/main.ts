import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';

import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import { CopcLayerManager } from './app/CopcLayerManager';
import { COPC_ADAPTER } from './app/copcAdapters';
import { ControlPanel } from './app/ControlPanel';
import { createViewer } from './app/createViewer';
import { DemoController } from './app/DemoController';
import { loadSampleCatalog } from './app/sampleCatalog';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
} from './app/types';

const harnessConfig = createHarnessConfig({
  appId: 'vite-vanillajs-cesium',
  host: 'vite',
  renderer: 'cesium',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
  backend: 'rust',
  scenario: 'load-and-stream',
}, import.meta.env, 'VITE_');
const testContract = createTestContract(harnessConfig);
const appBaseUrl = import.meta.env.BASE_URL;
const viewer = createViewer();
const manager = new CopcLayerManager(viewer, COPC_ADAPTER);
testContract.registerCommand('reload', () => window.location.reload());
testContract.registerCommand('detach', () => {
  manager.getLayer()?.detachFrom();
  testContract.setSnapshot(manager.getSnapshot());
});
testContract.registerCommand('unload', () => {
  manager.getLayer()?.unload();
  testContract.setSnapshot(manager.getSnapshot());
});
testContract.registerCommand('destroy', () => {
  manager.destroy();
  testContract.setSnapshot(undefined);
  testContract.markDestroyed();
});

let applyGeneration = 0;
let panel: ControlPanel;

const demo = new DemoController({
  viewer,
  getLayer: () => manager.getLayer(),
  onPhaseChange: (phase) => panel.setPhase(phase),
});

panel = new ControlPanel({
  onApply: (settings) => {
    void applySettings(settings);
  },
  onRun: (settings) => {
    demo.start(settings.demoMode, true);
  },
  onStop: () => demo.stop(),
  onCamera: (view) => {
    void demo.moveTo(view).catch((error: unknown) => {
      console.error('Camera movement failed:', error);
    });
  },
}, harnessConfig.packageSource);

manager.onStateChange((state) => {
  panel.setLayerState(state);
  panel.setBusy(state.status === 'loading');
  if (state.snapshot !== undefined) testContract.setSnapshot(state.snapshot);
  if (state.status === 'loading') testContract.markLoading();
  else if (state.status === 'ready') testContract.markReady();
  else if (state.status === 'error') testContract.markError(state.message ?? 'Layer failed to load.');
});

window.setInterval(() => {
  const snapshot = manager.getSnapshot();
  panel.updateDiagnostics(snapshot);
  if (snapshot !== undefined) testContract.setSnapshot(snapshot);
}, 250);

async function applySettings(settings: AppSettings): Promise<void> {
  const requestGeneration = ++applyGeneration;
  demo.stop();
  testContract.setConfig({
    fixtureUrl: settings.sampleUrl,
    backend: settings.backend,
    packageSource: settings.packageSource,
  });

  const ready = await manager.apply(settings, settings.sampleUrl);

  if (requestGeneration !== applyGeneration || !ready) {
    return;
  }

  demo.start(settings.demoMode, settings.autoplay);
}

async function bootstrap(): Promise<void> {
  try {
    const samples = await loadSampleCatalog(appBaseUrl);

    if (samples.length === 0) {
      throw new Error('fixture catalog에서 COPC fixture를 찾지 못했습니다.');
    }

    const defaultSample =
      samples.find((sample) => sample.id === DEFAULT_FIXTURE_ID) ?? samples[0];
    const configuredSampleUrl = harnessConfig.fixtureUrl !== fixtureUrlForId(DEFAULT_FIXTURE_ID)
      ? harnessConfig.fixtureUrl
      : defaultSample.url;
    panel.setSamples(samples, configuredSampleUrl);

    await applySettings({
      ...DEFAULT_SETTINGS,
      sampleUrl: configuredSampleUrl,
      backend: harnessConfig.backend,
      packageSource: harnessConfig.packageSource,
    });
  } catch (error: unknown) {
    console.error('Failed to load COPC sample catalog:', error);
    const message = error instanceof Error ? error.message : String(error);
    testContract.markError(error);
    panel.setLayerState({ status: 'error', message });
    panel.setBusy(false);
  }
}

void bootstrap();

window.addEventListener('beforeunload', () => {
  demo.stop();
  manager.destroy();
  testContract.markDestroyed();

  if (!viewer.isDestroyed()) {
    viewer.destroy();
  }
});
