import { fixtureName, normalizeSnapshot, REMOTE_COPC_SOURCES, type CopcSourceKind, type FixtureCatalogEntry, type HarnessConfig, type HarnessRenderer } from '@copc-test/core';

export type PanelSelection = {
  renderer: HarnessRenderer;
  backend: 'copc-js' | 'rust';
  fixtureId: string;
};

export type PanelSourceProbe = {
  reachable: boolean;
  rangeSupported: boolean | 'unknown';
  status?: number;
  partialStatus?: number;
  contentRange?: string;
  corsReadable: boolean | 'unknown';
  copcDetected: boolean | 'unknown';
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
  sourceProbe?: PanelSourceProbe;
  activeDatasetUrl?: string;
  activeSourceKind?: CopcSourceKind;
  pickedPoint?: unknown;
  colorMode?: 'rgb' | 'elevation' | 'intensity' | 'classification';
};

export type PanelActions = {
  apply(selection: PanelSelection): void;
  reload(): void;
  startDemo(): void;
  stopDemo(): void;
  overview(): void;
  far(): void;
  near(): void;
  setStyle(mode: 'rgb' | 'elevation' | 'intensity' | 'classification'): void;
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
    <p class="copc-panel__help">Remote COPC streaming is the functional spec. Local fixtures are deterministic regressions.</p>
    <div class="copc-panel__tags">
      <span data-field="host"></span><span data-field="renderer-label"></span>
      <span data-testid="adapter-source"></span>
    </div>
    <label>Renderer<select data-testid="renderer-select"></select></label>
    <label>Backend<select data-testid="backend-select">
      <option value="copc-js">copc-js</option><option value="rust">rust / WASM</option>
    </select></label>
    <section class="copc-panel__source" aria-label="COPC source">
      <h2>COPC Source</h2>
      <label>Remote / fixture<select data-testid="fixture-select" aria-label="COPC Source"></select></label>
      <div class="copc-panel__source-url"><span>Source URL</span><code data-testid="source-url"></code></div>
      <label>Custom URL<input data-testid="custom-source-url" type="url" placeholder="https://host.example/data.copc.laz" autocomplete="url"></label>
      <button data-testid="load-custom-source" type="button">Load custom URL</button>
      <div class="copc-panel__status"><span>Source type</span><strong data-testid="source-type">Remote HTTP</strong></div>
      <div class="copc-panel__status"><span>Attributes</span><strong data-testid="source-capabilities">—</strong></div>
      <div class="copc-panel__status"><span>Reachable</span><strong data-testid="source-reachable">—</strong></div>
      <div class="copc-panel__status"><span>HTTP Range</span><strong data-testid="source-range">—</strong></div>
      <div class="copc-panel__status"><span>HTTP status</span><strong data-testid="source-http-status">—</strong></div>
      <div class="copc-panel__status"><span>Content-Range</span><strong data-testid="source-content-range">—</strong></div>
      <div class="copc-panel__status"><span>COPC detected</span><strong data-testid="source-copc">—</strong></div>
      <div class="copc-panel__status"><span>CORS readable</span><strong data-testid="source-cors">—</strong></div>
      <div class="copc-panel__status"><span>Active dataset</span><strong data-testid="active-dataset">—</strong></div>
      <div class="copc-panel__status"><span>Camera center</span><strong data-testid="camera-location">—</strong></div>
    </section>
    <div class="copc-panel__status"><span>Status</span><strong data-testid="harness-status" data-status="idle">idle</strong></div>
    <div class="copc-panel__status"><span>Selection</span><strong data-field="fixture"></strong></div>
    <div class="copc-panel__status"><span>Error</span><strong class="copc-panel__error" data-testid="harness-error">—</strong></div>
    <div class="copc-panel__diagnostics">
      <div><span>Adapter</span><b data-field="adapter"></b></div>
      <div><span>Selected nodes</span><b data-testid="selected-nodes">0</b></div>
      <div><span>Rendered nodes</span><b data-testid="rendered-nodes">0</b></div>
      <div><span>Rendered points</span><b data-testid="rendered-points">0</b></div>
      <div><span>Stream updates</span><b data-testid="stream-updates">0</b></div>
      <div><span>Render distance</span><b data-testid="render-distance">—</b></div>
      <div><span>Range requests</span><b data-testid="range-requests">0</b></div>
      <div><span>Hierarchy requests</span><b data-testid="hierarchy-requests">0</b></div>
      <div><span>Hierarchy cache hits</span><b data-testid="hierarchy-cache-hits">0</b></div>
      <div><span>Point cache</span><b data-testid="point-cache">0 entries</b></div>
      <div><span>Visible LoD levels</span><b data-testid="visible-lod-levels">—</b></div>
    </div>
    <label>Style<select data-testid="style-select">
      <option value="rgb">RGB</option><option value="elevation">Elevation</option>
      <option value="intensity">Intensity</option><option value="classification">Classification</option>
    </select></label>
    <div class="copc-panel__status"><span>Point inspection</span><strong data-testid="point-inspection">Click a rendered point</strong></div>
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
  let localFixtures = [] as FixtureCatalogEntry[];
  const backendSelect = byTestId<HTMLSelectElement>('backend-select');
  const fixtureSelect = byTestId<HTMLSelectElement>('fixture-select');
  const customSourceInput = byTestId<HTMLInputElement>('custom-source-url');
  const sourceUrl = byTestId<HTMLElement>('source-url');
  const styleSelect = byTestId<HTMLSelectElement>('style-select');
  rendererSelect.value = state.renderer;
  backendSelect.value = state.backend;
  fixtureSelect.value = state.fixtureId;
  const selectedFixtureId = (): string => {
    if (fixtureSelect.value !== 'custom:') return fixtureSelect.value;
    const enteredUrl = customSourceInput.value.trim();
    if (enteredUrl) return `custom:${enteredUrl}`;
    return state.fixtureId.startsWith('custom:') ? state.fixtureId : 'custom:';
  };
  const onApply = (): void => actions.apply({
    renderer: rendererSelect.value as HarnessRenderer,
    backend: backendSelect.value as PanelSelection['backend'],
    fixtureId: selectedFixtureId(),
  });
  fixtureSelect.addEventListener('change', () => {
    if (fixtureSelect.value !== 'custom:') onApply();
  });
  byTestId<HTMLButtonElement>('apply-settings').addEventListener('click', onApply);
  byTestId<HTMLButtonElement>('load-custom-source').addEventListener('click', () => {
    const url = customSourceInput.value.trim();
    if (!url) return;
    actions.apply({
      renderer: rendererSelect.value as HarnessRenderer,
      backend: backendSelect.value as PanelSelection['backend'],
      fixtureId: `custom:${url}`,
    });
  });
  styleSelect.addEventListener('change', () => actions.setStyle(styleSelect.value as 'rgb' | 'elevation' | 'intensity' | 'classification'));
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
      if (selectionChanged.fixtureId) fixtureSelect.value = state.fixtureId.startsWith('custom:') ? 'custom:' : state.fixtureId;
      field('host').textContent = `Host: ${state.host}`;
      field('renderer-label').textContent = state.renderer;
      field('adapter').textContent = `${state.packageName}@${state.packageVersion}`;
      byTestId('adapter-source').textContent = `${state.packageSource} package`;
      const selectedRemote = REMOTE_COPC_SOURCES.find((source) => `remote:${source.id}` === state.fixtureId);
      const selectedFixture = localFixtures.find((fixture) => fixture.id === state.fixtureId);
      field('fixture').textContent = selectedRemote?.name ?? selectedFixture?.title ?? (state.fixtureId.startsWith('custom:') ? 'Custom URL' : state.fixtureId || fixtureName(state.fixtureUrl));
      sourceUrl.textContent = state.fixtureUrl;
      byTestId('source-type').textContent = state.activeSourceKind === 'local-fixture'
        || (!state.activeSourceKind && !state.fixtureId.startsWith('remote:') && !state.fixtureId.startsWith('custom:'))
        ? 'Local Fixture'
        : state.fixtureId.startsWith('custom:') ? 'Custom Remote HTTP' : 'Remote HTTP';
      byTestId('active-dataset').textContent = state.activeDatasetUrl ?? '—';
      const camera = nestedRecord(state.snapshot, 'camera');
      byTestId('camera-location').textContent = camera
        ? `${Number(camera.latitude).toFixed(4)}°, ${Number(camera.longitude).toFixed(4)}° · ${new Intl.NumberFormat('en-US').format(Math.round(Number(camera.height)))} m`
        : '—';
      const probe = state.sourceProbe;
      const yesNo = (value: boolean | 'unknown' | undefined): string => value === undefined ? '—' : value === 'unknown' ? 'Unknown' : value ? 'Supported' : 'Unsupported';
      byTestId('source-reachable').textContent = probe ? yesNo(probe.reachable) : 'Not probed';
      byTestId('source-range').textContent = probe ? yesNo(probe.rangeSupported) : 'Not probed';
      byTestId('source-http-status').textContent = probe?.partialStatus === undefined ? '—' : String(probe.partialStatus);
      byTestId('source-content-range').textContent = probe?.contentRange ?? '—';
      byTestId('source-copc').textContent = probe ? yesNo(probe.copcDetected) : 'Not probed';
      byTestId('source-cors').textContent = probe ? yesNo(probe.corsReadable) : 'Not probed';
      const capabilityText = selectedRemote
        ? ['rgb', 'intensity', 'classification'].map((field) => `${field.toUpperCase()} ${selectedRemote.expectedCapabilities[field as 'rgb' | 'intensity' | 'classification'] ? 'available' : 'unavailable'}`).join(' · ')
        : selectedFixture ? selectedFixture.capabilities.join(' · ') : state.fixtureId.startsWith('custom:') ? 'Not known until source metadata loads' : '—';
      byTestId('source-capabilities').textContent = capabilityText;
      const styles = ['rgb', 'intensity', 'classification'] as const;
      for (const style of styles) {
        const option = styleSelect.querySelector<HTMLOptionElement>(`option[value="${style}"]`);
        if (option) {
          const capability = selectedRemote?.expectedCapabilities[style]
            ?? selectedFixture?.capabilities.some((value) => value.toLowerCase().includes(style));
          option.disabled = capability === false;
        }
      }
      if (state.colorMode) styleSelect.value = state.colorMode;
      const status = byTestId<HTMLElement>('harness-status');
      status.dataset.status = state.status;
      status.textContent = state.status;
      byTestId('harness-error').textContent = state.error ?? '—';
      const snapshot = state.snapshot === undefined ? undefined : normalizeSnapshot(state.snapshot);
      const number = (value: number | undefined): string => value === undefined ? '0' : new Intl.NumberFormat('en-US').format(value);
      const snapshotRecord = state.snapshot && typeof state.snapshot === 'object' ? state.snapshot as Record<string, unknown> : undefined;
      const nested = (key: string): Record<string, unknown> | undefined => {
        const value = snapshotRecord?.[key];
        return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
      };
      const rangeRequests = nested('rangeRequests');
      const hierarchy = nested('hierarchy');
      const pointCache = nested('pointCache');
      const selectedKeys = Array.isArray(snapshotRecord?.selectedNodeKeys) ? snapshotRecord.selectedNodeKeys.filter((key): key is string => typeof key === 'string') : [];
      const lod = selectedKeys.map((key) => /^(\d+)(?:[-/])/.exec(key)?.[1]).filter((value): value is string => value !== undefined).map(Number);
      byTestId('selected-nodes').textContent = number(state.selectedNodes ?? snapshot?.selectedNodeKeys.length);
      byTestId('rendered-nodes').textContent = number(state.renderedNodes ?? snapshot?.renderedNodeKeys.length);
      byTestId('rendered-points').textContent = number(state.renderedPoints ?? snapshot?.renderedPointCount);
      byTestId('stream-updates').textContent = number(state.streamUpdates ?? snapshot?.streamingUpdateCount);
      byTestId('render-distance').textContent = state.renderDistance === undefined ? '—' : `${number(state.renderDistance)} m`;
      byTestId('range-requests').textContent = number(typeof rangeRequests?.requested === 'number' ? rangeRequests.requested : undefined);
      byTestId('hierarchy-requests').textContent = number(typeof hierarchy?.pageRequests === 'number' ? hierarchy.pageRequests : undefined);
      byTestId('hierarchy-cache-hits').textContent = number(typeof hierarchy?.pageCacheHits === 'number' ? hierarchy.pageCacheHits : undefined);
      byTestId('point-cache').textContent = pointCache
        ? `${number(typeof pointCache.cachedNodeCount === 'number' ? pointCache.cachedNodeCount : undefined)} entries · ${number(typeof pointCache.hits === 'number' ? pointCache.hits : undefined)} hits`
        : '—';
      byTestId('visible-lod-levels').textContent = lod.length
        ? `${Math.min(...lod)}–${Math.max(...lod)}`
        : '—';
      const picked = state.pickedPoint;
      byTestId('point-inspection').textContent = picked && typeof picked === 'object'
        ? JSON.stringify(picked, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value)
        : 'Click a rendered point';
      byTestId<HTMLButtonElement>('apply-settings').disabled = state.status === 'loading';
      styleSelect.disabled = state.renderer !== 'cesium' || (state.status !== 'ready' && !state.activeDatasetUrl);
    },
    setFixtures(fixtures) {
      const selected = fixtureSelect.value || state.fixtureId;
      localFixtures = fixtures;
      fixtureSelect.replaceChildren();
      const remoteGroup = document.createElement('optgroup');
      remoteGroup.label = 'Remote examples (direct HTTP Range)';
      for (const source of REMOTE_COPC_SOURCES) {
        const option = document.createElement('option');
        option.value = `remote:${source.id}`;
        option.textContent = source.name;
        option.title = [source.approximateSize, source.description, ...Object.entries(source.expectedCapabilities).filter(([key, value]) => key !== 'range' && value).map(([key]) => key)].filter(Boolean).join(' · ');
        remoteGroup.append(option);
      }
      fixtureSelect.append(remoteGroup);
      if (fixtures.length) {
        const localGroup = document.createElement('optgroup');
        localGroup.label = 'Local deterministic fixtures';
        for (const fixture of fixtures) {
          const option = document.createElement('option');
          option.value = fixture.id;
          option.textContent = fixture.title;
          option.title = fixture.capabilities.join(', ');
          localGroup.append(option);
        }
        fixtureSelect.append(localGroup);
      }
      const customOption = document.createElement('option');
      customOption.value = 'custom:';
      customOption.textContent = 'Custom URL (use field below)';
      fixtureSelect.append(customOption);
      if (fixtures.some(({ id }) => id === selected)) fixtureSelect.value = selected;
      else if (selected.startsWith('remote:') && REMOTE_COPC_SOURCES.some(({ id }) => `remote:${id}` === selected)) fixtureSelect.value = selected;
      else if (selected.startsWith('custom:')) fixtureSelect.value = 'custom:';
    },
    destroy() {
      root.remove();
    },
  };
  panel.setFixtures([]);
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

function nestedRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' ? nested as Record<string, unknown> : undefined;
}
