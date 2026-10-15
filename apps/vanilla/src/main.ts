import 'cesium/Build/Cesium/Widgets/widgets.css';
import '@copc-test/ui/panel.css';

import { createHarnessConfig, createTestContract, loadFixtureCatalog, resolveCopcSourceSelection, sourceSelectionFromSearch, type FixtureCatalogEntry, type HarnessRenderer } from '@copc-test/core';
import { mountControlPanel, panelStateFromConfig, type MountedPanel, type PanelSelection, type PanelState } from '@copc-test/ui';
import { mountTestRenderer, type TestRenderer } from '@copc-test/renderers';

const rendererElement = document.querySelector<HTMLElement>('#renderer')!;
const panelTarget = document.querySelector<HTMLElement>('#panel')!;
const params = new URLSearchParams(location.search);
const initialRenderer: HarnessRenderer = params.get('renderer') === 'three' ? 'three' : 'cesium';
let fixtureId = sourceSelectionFromSearch(params);
let resolvedSource = resolveCopcSourceSelection(fixtureId);
const harnessConfig = createHarnessConfig({
  appId: 'vanilla', host: 'vanilla', renderer: initialRenderer,
  fixtureUrl: resolvedSource.url, backend: 'copc-js', scenario: 'load-and-stream',
}, import.meta.env, 'VITE_');
const contract = createTestContract(harnessConfig);
const allowedRenderers: HarnessRenderer[] = ['cesium', 'three'];
let selected: PanelSelection = { renderer: initialRenderer, backend: harnessConfig.backend, fixtureId };
let colorMode: 'rgb' | 'elevation' | 'intensity' | 'classification' = 'elevation';
let panelState: PanelState = { ...panelStateFromConfig(harnessConfig, 'vanilla', fixtureId), colorMode };
let panel: MountedPanel;
let renderer: TestRenderer | undefined;
let demoTimer: number | undefined;
let demoIndex = 0;
let generation = 0;

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
  const record = snapshot && typeof snapshot === 'object' ? snapshot as Record<string, unknown> : undefined;
  update({
    snapshot,
    activeDatasetUrl: typeof record?.datasetUrl === 'string' ? record.datasetUrl : panelState.activeDatasetUrl,
    activeSourceKind: record?.sourceKind === 'remote' || record?.sourceKind === 'custom-remote' || record?.sourceKind === 'local-fixture'
      ? record.sourceKind
      : panelState.activeSourceKind,
    pickedPoint: record?.pickedPoint,
  });
}

async function apply(selection: PanelSelection): Promise<void> {
  let nextSource: ReturnType<typeof resolveCopcSourceSelection>;
  try { nextSource = resolveCopcSourceSelection(selection.fixtureId); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    contract.markError(error);
    update({ status: 'error', error: message });
    return;
  }
  if (colorMode !== 'elevation' && nextSource.remote?.expectedCapabilities[colorMode] === false) colorMode = 'elevation';
  const canSwitchSourceInPlace = renderer !== undefined
    && selection.renderer === selected.renderer
    && selection.backend === selected.backend
    && selection.fixtureId !== selected.fixtureId
    && selection.renderer === 'cesium'
    && typeof renderer.setSource === 'function';
  if (canSwitchSourceInPlace && renderer) {
    selected = selection;
    fixtureId = selection.fixtureId;
    resolvedSource = nextSource;
    const fixtureUrl = nextSource.url;
    contract.setConfig({ renderer: selection.renderer, backend: selection.backend, fixtureUrl });
    update({ ...selection, fixtureUrl, status: 'loading', error: undefined, sourceProbe: undefined, colorMode });
    contract.markLoading();
    try {
      await renderer.setSource?.(fixtureUrl, nextSource.kind);
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
  const fixtureUrl = nextSource.url;
  contract.setConfig({ renderer: selection.renderer, backend: selection.backend, fixtureUrl });
  update({ ...selection, fixtureUrl, status: 'loading', error: undefined, snapshot: undefined, sourceProbe: undefined, activeDatasetUrl: undefined, activeSourceKind: undefined, colorMode });
  contract.markLoading();
  try {
    if (selection.renderer !== 'cesium' && selection.renderer !== 'three') throw new Error(`Unsupported Vanilla renderer: ${selection.renderer}`);
    const mounted = await mountTestRenderer(selection.renderer, rendererElement, {
      fixtureUrl,
      backend: selection.backend,
      sourceKind: nextSource.kind,
      colorMode,
      onAttached: () => contract.markAttached(),
      onSnapshot: reportSnapshot,
      onSourceProbe: (sourceProbe) => update({ sourceProbe }),
      onPointPicked: (pickedPoint) => update({ pickedPoint }),
      onStatus: (status, error) => {
        if (currentGeneration !== generation) return;
        if (status === 'ready') contract.markReady();
        else if (status === 'error') contract.markError(error ?? 'Renderer failed.');
        update({ status, error });
      },
    });
    if (currentGeneration !== generation) {
      mounted.destroy();
      return;
    }
    renderer = mounted;
    contract.recordMount();
    contract.registerCommand('setView', (view) => renderer?.setView(view === 'visual' ? 'overview' : view));
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
  try { await renderer?.setView(view); }
  catch (error) { contract.markError(error); update({ status: 'error', error: error instanceof Error ? error.message : String(error) }); }
}

function setStyle(mode: 'rgb' | 'elevation' | 'intensity' | 'classification'): void {
  colorMode = mode;
  try {
    renderer?.setStyle?.(mode);
    update({ colorMode: mode });
  } catch (error) {
    update({ status: 'error', error: error instanceof Error ? error.message : String(error) });
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
      demoTimer = window.setInterval(() => { void setView(steps[demoIndex++ % steps.length]!); }, 1200);
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

void loadFixtureCatalog().then((catalog) => panel.setFixtures(catalog.fixtures satisfies FixtureCatalogEntry[])).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  contract.markError(error);
  update({ status: 'error', error: message });
});
void apply(selected);
window.addEventListener('pagehide', destroy, { once: true });
