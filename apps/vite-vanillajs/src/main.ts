import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';

import { CopcLayerManager } from './app/CopcLayerManager';
import { COPC_ADAPTERS } from './app/copcAdapters';
import { ControlPanel } from './app/ControlPanel';
import { createViewer } from './app/createViewer';
import { DemoController } from './app/DemoController';
import { loadSampleCatalog } from './app/sampleCatalog';
import {
  DEFAULT_SETTINGS,
  type AdapterTrack,
  type AppSettings,
} from './app/types';

const appBaseUrl = import.meta.env.BASE_URL;
const viewer = createViewer();
const manager = new CopcLayerManager(viewer, COPC_ADAPTERS.published);

let applyGeneration = 0;
let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };
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
  onAdapterChange: (track) => {
    void switchAdapter(track);
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
});

manager.onStateChange((state) => {
  panel.setLayerState(state);
  panel.setBusy(state.status === 'loading');
});

window.setInterval(() => {
  panel.updateDiagnostics(manager.getSnapshot());
}, 250);

async function applySettings(settings: AppSettings): Promise<void> {
  const requestGeneration = ++applyGeneration;
  currentSettings = settings;
  demo.stop();
  manager.setAdapter(COPC_ADAPTERS[settings.adapterTrack]);

  const ready = await manager.apply(settings, settings.sampleUrl);

  if (requestGeneration !== applyGeneration || !ready) {
    return;
  }

  demo.start(settings.demoMode, settings.autoplay);
}

async function switchAdapter(track: AdapterTrack): Promise<void> {
  if (track === currentSettings.adapterTrack) {
    return;
  }

  await applySettings({
    ...panel.getSettings(),
    adapterTrack: track,
  });
}

async function bootstrap(): Promise<void> {
  try {
    const samples = await loadSampleCatalog(appBaseUrl);

    if (samples.length === 0) {
      throw new Error('samples 폴더에서 COPC 샘플을 찾지 못했습니다.');
    }

    const defaultSample =
      samples.find((sample) => sample.name.toLowerCase() === 'sofi.copc.laz') ?? samples[0];
    panel.setSamples(samples, defaultSample.url);

    await applySettings({
      ...DEFAULT_SETTINGS,
      sampleUrl: defaultSample.url,
    });
  } catch (error: unknown) {
    console.error('Failed to load COPC sample catalog:', error);
    const message = error instanceof Error ? error.message : String(error);
    panel.setLayerState({ status: 'error', message });
    panel.setBusy(false);
  }
}

void bootstrap();

window.addEventListener('beforeunload', () => {
  demo.stop();
  manager.destroy();

  if (!viewer.isDestroyed()) {
    viewer.destroy();
  }
});
