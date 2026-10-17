import 'cesium/Build/Cesium/Widgets/widgets.css';
import '@copc-test/ui/panel.css';

import {
  createHarnessConfig,
  createTestContract,
  renderDistanceFromSearch,
  streamingSettingsFromSearch,
  loadFixtureCatalog,
  resolveCopcSourceSelection,
  sourceSelectionFromSearch,
  type FixtureCatalogEntry,
  type HarnessRenderer,
} from '@copc-test/core';
import {
  mountControlPanel,
  panelStateFromConfig,
  type MountedPanel,
  type PanelSelection,
  type PanelState,
} from '@copc-test/ui';
import { mountTestRenderer, type TestRenderer } from '@copc-test/renderers';

const rendererElement = document.querySelector<HTMLElement>('#renderer')!;
const panelTarget = document.querySelector<HTMLElement>('#panel')!;
const params = new URLSearchParams(location.search);
const initialRenderer: HarnessRenderer =
  params.get('renderer') === 'three' ? 'three' : 'cesium';
const initialStreaming = streamingSettingsFromSearch(params, initialRenderer);
const initialRenderDistance = renderDistanceFromSearch(params);
let fixtureId = sourceSelectionFromSearch(params);
let resolvedSource = resolveCopcSourceSelection(fixtureId);
const harnessConfig = createHarnessConfig(
  {
    appId: 'vanilla',
    host: 'vanilla',
    renderer: initialRenderer,
    fixtureUrl: resolvedSource.url,
    backend: 'copc-js',
    scenario: 'load-and-stream',
  },
  import.meta.env,
  'VITE_',
);
const contract = createTestContract(harnessConfig);
const allowedRenderers: HarnessRenderer[] = ['cesium', 'three'];
let selected: PanelSelection = {
  renderer: initialRenderer,
  backend: harnessConfig.backend,
  pointSize: harnessConfig.pointSize,
  fixtureId,
  streaming: initialStreaming,
  renderDistance: initialRenderDistance,
};
let colorMode: 'rgb' | 'elevation' | 'intensity' | 'classification' =
  'elevation';
let panelState: PanelState = {
  ...panelStateFromConfig(harnessConfig, 'vanilla', fixtureId),
  streaming: initialStreaming,
  renderDistance: initialRenderDistance,
  colorMode,
};
let panel: MountedPanel;
let renderer: TestRenderer | undefined;
let demoTimer: number | undefined;
let demoIndex = 0;
let generation = 0;
let styleRevision = 0;

function update(patch: Partial<PanelState>): void {
  panelState = { ...panelState, ...patch };
  panel.update(panelState);
}

function stopDemo(): void {
  if (demoTimer !== undefined) window.clearInterval(demoTimer);
  demoTimer = undefined;
}

function reportSnapshot(snapshot: unknown): void {
  contract.setSnapshot(snapshot);
  const record =
    snapshot && typeof snapshot === 'object'
      ? (snapshot as Record<string, unknown>)
      : undefined;
  update({
    snapshot,
    activeDatasetUrl:
      typeof record?.datasetUrl === 'string'
        ? record.datasetUrl
        : panelState.activeDatasetUrl,
    activeSourceKind:
      record?.sourceKind === 'remote' ||
      record?.sourceKind === 'custom-remote' ||
      record?.sourceKind === 'local-fixture'
        ? record.sourceKind
        : panelState.activeSourceKind,
    pickedPoint: record?.pickedPoint,
    pickedPointScreenPosition: record?.pickedPointScreenPosition as
      | PanelState['pickedPointScreenPosition']
      | undefined,
  });
}

async function apply(selection: PanelSelection): Promise<void> {
  let nextSource: ReturnType<typeof resolveCopcSourceSelection>;
  try {
    nextSource = resolveCopcSourceSelection(selection.fixtureId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    contract.markError(error);
    update({ status: 'error', error: message });
    return;
  }
  const nextColorMode =
    colorMode !== 'elevation' &&
    nextSource.remote?.expectedCapabilities[colorMode] === false
      ? 'elevation'
      : colorMode;
  const pointSizeOnly =
    selection.pointSize !== selected.pointSize &&
    selection.renderer === selected.renderer &&
    selection.backend === selected.backend &&
    selection.fixtureId === selected.fixtureId &&
    JSON.stringify(selection.streaming) ===
      JSON.stringify(selected.streaming) &&
    selection.renderDistance === selected.renderDistance;
  if (pointSizeOnly && renderer?.setPointSize) {
    const currentRenderer = renderer;
    update({ status: 'loading', error: undefined });
    contract.markLoading();
    try {
      await currentRenderer.setPointSize!(selection.pointSize);
      if (renderer !== currentRenderer) return;
      selected = selection;
      contract.setConfig({ pointSize: selection.pointSize });
      update({ ...selection, status: 'ready', error: undefined });
      contract.markReady();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      contract.markError(error);
      update({ status: 'error', error: message });
    }
    return;
  }
  const canSwitchSourceInPlace =
    renderer !== undefined &&
    selection.renderer === selected.renderer &&
    selection.backend === selected.backend &&
    selection.fixtureId !== selected.fixtureId &&
    JSON.stringify(selection.streaming) ===
      JSON.stringify(selected.streaming) &&
    selection.renderDistance === selected.renderDistance &&
    selection.renderer === 'cesium' &&
    typeof renderer.setSource === 'function';
  if (canSwitchSourceInPlace && renderer) {
    const styleRevisionAtStart = styleRevision;
    selected = selection;
    fixtureId = selection.fixtureId;
    resolvedSource = nextSource;
    const fixtureUrl = nextSource.url;
    contract.setConfig({
      renderer: selection.renderer,
      backend: selection.backend,
      pointSize: selection.pointSize,
      fixtureUrl,
    });
    update({
      ...selection,
      fixtureUrl,
      status: 'loading',
      error: undefined,
      sourceProbe: undefined,
    });
    contract.markLoading();
    try {
      await renderer.setSource?.(
        fixtureUrl,
        nextSource.kind,
        nextColorMode,
        selection.pointSize,
      );
      if (styleRevision === styleRevisionAtStart) colorMode = nextColorMode;
      update({ colorMode, activeView: 'overview' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      contract.markError(error);
      update({ status: 'error', error: message });
    }
    return;
  }

  const currentGeneration = ++generation;
  stopDemo();
  if (renderer) {
    renderer.destroy();
    contract.recordUnmount();
  }
  renderer = undefined;
  selected = selection;
  fixtureId = selection.fixtureId;
  resolvedSource = nextSource;
  colorMode = nextColorMode;
  const fixtureUrl = nextSource.url;
  contract.setConfig({
    renderer: selection.renderer,
    backend: selection.backend,
    pointSize: selection.pointSize,
    fixtureUrl,
  });
  update({
    ...selection,
    fixtureUrl,
    status: 'loading',
    activeView: 'overview',
    error: undefined,
    snapshot: undefined,
    sourceProbe: undefined,
    activeDatasetUrl: undefined,
    activeSourceKind: undefined,
    colorMode,
  });
  contract.markLoading();
  try {
    if (selection.renderer !== 'cesium' && selection.renderer !== 'three')
      throw new Error(`Unsupported Vanilla renderer: ${selection.renderer}`);
    const mounted = await mountTestRenderer(
      selection.renderer,
      rendererElement,
      {
        fixtureUrl,
        backend: selection.backend,
        streaming: selection.streaming,
        renderDistance: selection.renderDistance,
        pointSize: selection.pointSize,
        sourceKind: nextSource.kind,
        colorMode,
        cesiumIonToken:
          selection.renderer === 'cesium'
            ? import.meta.env.VITE_CESIUM_ION_TOKEN
            : undefined,
        onAttached: () => contract.markAttached(),
        onSnapshot: reportSnapshot,
        onSourceProbe: (sourceProbe) => update({ sourceProbe }),
        onPointPicked: (pickedPoint, pickedPointScreenPosition) =>
          update({ pickedPoint, pickedPointScreenPosition }),
        onStatus: (status, error) => {
          if (currentGeneration !== generation) return;
          if (status === 'ready') contract.markReady();
          else if (status === 'error')
            contract.markError(error ?? 'Renderer failed.');
          update({ status, error });
        },
      },
    );
    if (currentGeneration !== generation) {
      mounted.destroy();
      return;
    }
    renderer = mounted;
    contract.recordMount();
    contract.registerCommand('setView', (view) =>
      setView(view === 'visual' ? 'overview' : view),
    );
    contract.registerCommand('reload', () => void apply(selected));
    contract.registerCommand('unload', () => renderer?.unload());
    contract.registerCommand('destroy', () => destroy());
    await renderer.ready;
  } catch (error) {
    if (currentGeneration !== generation) return;
    const message = error instanceof Error ? error.message : String(error);
    contract.markError(error);
    update({ status: 'error', error: message });
  }
}

async function setView(view: 'overview' | 'near' | 'far'): Promise<void> {
  const activeRenderer = renderer;
  if (!activeRenderer) return;
  try {
    await activeRenderer.setView(view);
    if (renderer === activeRenderer) update({ activeView: view });
  } catch (error) {
    contract.markError(error);
    update({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function setStyle(
  mode: 'rgb' | 'elevation' | 'intensity' | 'classification',
): void {
  styleRevision += 1;
  colorMode = mode;
  try {
    renderer?.setStyle?.(mode);
    update({ colorMode: mode });
  } catch (error) {
    update({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function destroy(): void {
  generation += 1;
  stopDemo();
  if (renderer) {
    renderer.destroy();
    contract.recordUnmount();
  }
  renderer = undefined;
  panel.destroy();
  contract.markDestroyed();
}

panel = mountControlPanel(panelTarget, {
  config: harnessConfig,
  state: panelState,
  renderers: allowedRenderers,
  actions: {
    apply: (next) => void apply(next),
    reload: () => void apply(selected),
    startDemo: () => {
      stopDemo();
      demoIndex = 0;
      const steps = ['near', 'far', 'overview'] as const;
      demoTimer = window.setInterval(() => {
        void setView(steps[demoIndex++ % steps.length]!);
      }, 1200);
      void setView('near');
    },
    stopDemo,
    overview: () => void setView('overview'),
    far: () => void setView('far'),
    near: () => void setView('near'),
    setStyle,
  },
});
contract.registerCommand('reload', () => void apply(selected));
contract.registerCommand('destroy', () => destroy());
window.__COPC_TEST__ = contract;

void loadFixtureCatalog()
  .then((catalog) =>
    panel.setFixtures(catalog.fixtures satisfies FixtureCatalogEntry[]),
  )
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    contract.markError(error);
    update({ status: 'error', error: message });
  });
void apply(selected);
window.addEventListener('pagehide', destroy, { once: true });
