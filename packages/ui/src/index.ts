import { fixtureName, normalizeSnapshot, type FixtureCatalogEntry, type HarnessConfig, type HarnessRenderer } from '@copc-test/core';

export type PanelSelection = {
  renderer: HarnessRenderer;
  backend: 'copc-js' | 'rust';
  fixtureId: string;
};

export type PanelState = PanelSelection & {
  host: 'vanilla' | 'react' | 'next';
  fixtureUrl: string;
  packageName: string;
  packageVersion: string;
  packageSource: 'checkout' | 'tarball' | 'npm';
  status: 'idle' | 'loading' | 'ready' | 'error';
  selectedNodes?: number;
  renderedNodes?: number;
  renderedPoints?: number;
  streamUpdates?: number;
  renderDistance?: number;
  error?: string;
  snapshot?: unknown;
};

export type PanelActions = {
  apply(selection: PanelSelection): void;
  reload(): void;
  startDemo(): void;
  stopDemo(): void;
  overview(): void;
  far(): void;
  near(): void;
};

export type MountedPanel = {
  element: HTMLElement;
  update(state: PanelState): void;
  setFixtures(fixtures: FixtureCatalogEntry[]): void;
  destroy(): void;
};

export type MountPanelOptions = {
  config: HarnessConfig;
  state: PanelState;
  renderers: HarnessRenderer[];
  actions: PanelActions;
};

export function mountControlPanel(target: HTMLElement, options: MountPanelOptions): MountedPanel {
  const { config, renderers, actions } = options;
  const root = document.createElement('aside');
  root.className = 'copc-panel';
  root.dataset.testid = 'control-panel';
  root.dataset.appId = config.appId;
  root.innerHTML = `
    <div class="copc-panel__eyebrow">COPC ADAPTER TESTBED</div>
    <h1>Consumer harness</h1>
    <p class="copc-panel__help">One packed adapter, shared fixtures, real renderers.</p>
    <div class="copc-panel__tags">
      <span data-field="host"></span><span data-field="renderer-label"></span>
      <span data-testid="adapter-source"></span>
    </div>
    <label>Renderer<select data-testid="renderer-select"></select></label>
    <label>Backend<select data-testid="backend-select">
      <option value="copc-js">copc-js</option><option value="rust">rust / WASM</option>
    </select></label>
    <label>Fixture<select data-testid="fixture-select"><option value="small-valid-copc">small-valid-copc</option></select></label>
    <div class="copc-panel__status"><span>Status</span><strong data-testid="harness-status" data-status="idle">idle</strong></div>
    <div class="copc-panel__status"><span>Fixture</span><strong data-field="fixture"></strong></div>
    <div class="copc-panel__status"><span>Error</span><strong class="copc-panel__error" data-testid="harness-error">—</strong></div>
    <div class="copc-panel__diagnostics">
      <div><span>Adapter</span><b data-field="adapter"></b></div>
      <div><span>Selected nodes</span><b data-testid="selected-nodes">0</b></div>
      <div><span>Rendered nodes</span><b data-testid="rendered-nodes">0</b></div>
      <div><span>Rendered points</span><b data-testid="rendered-points">0</b></div>
      <div><span>Stream updates</span><b data-testid="stream-updates">0</b></div>
      <div><span>Render distance</span><b data-testid="render-distance">—</b></div>
    </div>
    <div class="copc-panel__button-row">
      <button class="copc-panel__primary" data-testid="apply-settings" type="button">Apply / reload</button>
      <button data-testid="reload-renderer" type="button">Reload renderer</button>
    </div>
    <div class="copc-panel__button-row copc-panel__button-row--three">
      <button data-action="overview" type="button">Overview</button>
      <button data-action="far" type="button">Far</button>
      <button data-action="near" type="button">Near</button>
    </div>
    <div class="copc-panel__button-row copc-panel__button-row--two">
      <button data-testid="demo-start" type="button">Start demo</button>
      <button data-testid="demo-stop" type="button">Stop demo</button>
    </div>
  `;
  target.append(root);

  const byTestId = <T extends HTMLElement>(id: string): T => {
    const node = root.querySelector<T>(`[data-testid="${id}"]`);
    if (!node) throw new Error(`Shared control panel is missing data-testid="${id}".`);
    return node;
  };
  const field = <T extends HTMLElement>(name: string): T => {
    const node = root.querySelector<T>(`[data-field="${name}"]`);
    if (!node) throw new Error(`Shared control panel is missing data-field="${name}".`);
    return node;
  };
  const rendererSelect = byTestId<HTMLSelectElement>('renderer-select');
  for (const renderer of renderers) {
    const option = document.createElement('option');
    option.value = renderer;
    option.textContent = renderer === 'r3f' ? 'React Three Fiber' : renderer === 'three' ? 'Three.js' : 'Cesium';
    rendererSelect.append(option);
  }
  const state = { ...options.state };
  const backendSelect = byTestId<HTMLSelectElement>('backend-select');
  const fixtureSelect = byTestId<HTMLSelectElement>('fixture-select');
  rendererSelect.value = state.renderer;
  backendSelect.value = state.backend;
  fixtureSelect.value = state.fixtureId;
  const onApply = (): void => actions.apply({
    renderer: rendererSelect.value as HarnessRenderer,
    backend: backendSelect.value as PanelSelection['backend'],
    fixtureId: fixtureSelect.value,
  });
  byTestId<HTMLButtonElement>('apply-settings').addEventListener('click', onApply);
  byTestId<HTMLButtonElement>('reload-renderer').addEventListener('click', actions.reload);
  byTestId<HTMLButtonElement>('demo-start').addEventListener('click', actions.startDemo);
  byTestId<HTMLButtonElement>('demo-stop').addEventListener('click', actions.stopDemo);
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    button.addEventListener('click', () => {
      if (button.dataset.action === 'overview') actions.overview();
      else if (button.dataset.action === 'far') actions.far();
      else if (button.dataset.action === 'near') actions.near();
    });
  }

  const panel: MountedPanel = {
    element: root,
    update(next) {
      const selectionChanged = {
        renderer: state.renderer !== next.renderer,
        backend: state.backend !== next.backend,
        fixtureId: state.fixtureId !== next.fixtureId,
      };
      Object.assign(state, next);
      if (selectionChanged.renderer) rendererSelect.value = state.renderer;
      if (selectionChanged.backend) backendSelect.value = state.backend;
      if (selectionChanged.fixtureId) fixtureSelect.value = state.fixtureId;
      field('host').textContent = `Host: ${state.host}`;
      field('renderer-label').textContent = state.renderer;
      field('adapter').textContent = `${state.packageName}@${state.packageVersion}`;
      byTestId('adapter-source').textContent = `${state.packageSource} package`;
      field('fixture').textContent = state.fixtureId || fixtureName(state.fixtureUrl);
      const status = byTestId<HTMLElement>('harness-status');
      status.dataset.status = state.status;
      status.textContent = state.status;
      byTestId('harness-error').textContent = state.error ?? '—';
      const snapshot = state.snapshot === undefined ? undefined : normalizeSnapshot(state.snapshot);
      const number = (value: number | undefined): string => value === undefined ? '0' : new Intl.NumberFormat('en-US').format(value);
      byTestId('selected-nodes').textContent = number(state.selectedNodes ?? snapshot?.selectedNodeKeys.length);
      byTestId('rendered-nodes').textContent = number(state.renderedNodes ?? snapshot?.renderedNodeKeys.length);
      byTestId('rendered-points').textContent = number(state.renderedPoints ?? snapshot?.renderedPointCount);
      byTestId('stream-updates').textContent = number(state.streamUpdates ?? snapshot?.streamingUpdateCount);
      byTestId('render-distance').textContent = state.renderDistance === undefined ? '—' : `${number(state.renderDistance)} m`;
      byTestId<HTMLButtonElement>('apply-settings').disabled = state.status === 'loading';
    },
    setFixtures(fixtures) {
      const selected = fixtureSelect.value || state.fixtureId;
      fixtureSelect.replaceChildren();
      for (const fixture of fixtures) {
        const option = document.createElement('option');
        option.value = fixture.id;
        option.textContent = fixture.title;
        option.title = fixture.capabilities.join(', ');
        fixtureSelect.append(option);
      }
      if (fixtures.some(({ id }) => id === selected)) fixtureSelect.value = selected;
    },
    destroy() {
      root.remove();
    },
  };
  panel.update(state);
  return panel;
}

export function panelStateFromConfig(
  config: HarnessConfig,
  host: PanelState['host'],
  fixtureId: string,
): PanelState {
  return {
    host,
    renderer: config.renderer,
    backend: config.backend,
    fixtureId,
    fixtureUrl: config.fixtureUrl,
    packageName: '@frillab/copc-adapter',
    packageVersion: config.packageVersion,
    packageSource: config.packageSource,
    status: 'idle',
    renderDistance: 20_000,
  };
}
