import {
  fixtureName,
  normalizeSnapshot,
  REMOTE_COPC_SOURCES,
  defaultStreamingSettings,
  DEFAULT_HARNESS_STREAMING_SETTINGS,
  DEFAULT_HARNESS_POINT_SIZE,
  HARNESS_POINT_SIZE_LIMITS,
  HARNESS_RENDER_DISTANCE_LIMITS,
  HARNESS_STREAMING_SETTING_LIMITS,
  type CopcSourceKind,
  type FixtureCatalogEntry,
  type HarnessConfig,
  type HarnessRenderer,
  type HarnessStreamingSettings,
} from '@copc-test/core';

export type PanelSelection = {
  renderer: HarnessRenderer;
  backend: 'copc-js' | 'rust';
  fixtureId: string;
  streaming: HarnessStreamingSettings;
  renderDistance?: number;
  pointSize: number;
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
  activeView?: 'overview' | 'near' | 'far';
  selectedNodes?: number;
  renderedNodes?: number;
  renderedPoints?: number;
  streamUpdates?: number;
  error?: string;
  snapshot?: unknown;
  sourceProbe?: PanelSourceProbe;
  activeDatasetUrl?: string;
  activeSourceKind?: CopcSourceKind;
  pickedPoint?: unknown;
  pickedPointScreenPosition?: { x: number; y: number };
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

type ValueRecord = Record<string, unknown>;

function asRecord(value: unknown): ValueRecord | undefined {
  return value !== null && typeof value === 'object'
    ? (value as ValueRecord)
    : undefined;
}

function formatPointValue(
  value: unknown,
  maximumFractionDigits = 3,
): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits,
      useGrouping: false,
    }).format(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' && value.trim()) return value;
  return undefined;
}

function formatPointVector(
  value: unknown,
  maximumFractionDigits: number,
): string | undefined {
  const vector = asRecord(value);
  if (!vector) return undefined;
  const coordinates = ['x', 'y', 'z'].map((axis) =>
    formatPointValue(vector[axis], maximumFractionDigits),
  );
  return coordinates.every((coordinate) => coordinate !== undefined)
    ? coordinates.join(', ')
    : undefined;
}

export function mountControlPanel(
  target: HTMLElement,
  options: MountPanelOptions,
): MountedPanel {
  const { config, renderers, actions } = options;
  const root = document.createElement('aside');
  root.className = 'copc-panel';
  root.dataset.testid = 'control-panel';
  root.dataset.appId = config.appId;
  root.innerHTML = `
    <button class="copc-panel__toggle" data-testid="panel-toggle" type="button" aria-label="Collapse control panel" aria-expanded="true" aria-controls="control-panel-content" title="Collapse panel"><span aria-hidden="true">‹</span></button>
    <div class="copc-panel__body" id="control-panel-content" data-testid="control-panel-body">
      <div class="copc-panel__heading">
        <div class="copc-panel__eyebrow">COPC ADAPTER</div>
        <h1>Consumer testbed</h1>
        <div class="copc-panel__tags">
          <span data-field="host"></span><span data-field="renderer-label"></span>
          <span data-testid="adapter-source"></span>
        </div>
        <div class="copc-panel__status-line">
          <span>Status</span><strong data-testid="harness-status" data-status="idle">idle</strong>
        </div>
      </div>
      <fieldset class="copc-panel__field">
        <legend>Renderer</legend>
        <div class="copc-segmented" role="radiogroup" aria-label="Renderer" data-testid="renderer-select"></div>
      </fieldset>
      <fieldset class="copc-panel__field">
        <legend>Backend</legend>
        <div class="copc-segmented" role="radiogroup" aria-label="Backend" data-testid="backend-select">
          <button type="button" role="radio" data-value="copc-js">JavaScript</button>
          <button type="button" role="radio" data-value="rust">Rust / WASM</button>
        </div>
      </fieldset>
      <section class="copc-panel__section copc-panel__source" aria-label="COPC source">
        <h2>Source</h2>
        <label>Dataset<select data-testid="fixture-select" aria-label="COPC source"></select></label>
        <label>Custom URL<input data-testid="custom-source-url" type="url" placeholder="https://host.example/data.copc.laz" autocomplete="url"></label>
        <div class="copc-panel__source-url"><span>URL</span><code data-testid="source-url"></code></div>
        <button data-testid="load-source" type="button">Load source</button>
        <details class="copc-panel__details" data-testid="source-diagnostics">
          <summary>Source diagnostics</summary>
          <div class="copc-panel__status"><span>Selected dataset</span><strong data-testid="selected-dataset">—</strong></div>
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
        </details>
      </section>
      <section class="copc-panel__section">
        <h2>Appearance</h2>
        <label>Color mode<select data-testid="style-select">
          <option value="rgb">RGB</option><option value="elevation">Elevation</option>
          <option value="intensity">Intensity</option><option value="classification">Classification</option>
        </select></label>
        <p class="copc-panel__hint" data-testid="style-support-note" hidden>Live color-mode changes are supported by Cesium in this testbed.</p>
        <div class="copc-slider" data-control="pointSize">
          <div class="copc-slider__heading"><label for="point-size-slider">Point size</label><output data-value-for="pointSize">3 px</output></div>
          <input id="point-size-slider" data-slider="pointSize" data-testid="point-size-slider" type="range" min="1" max="10" step="1" aria-label="Point size" />
        </div>
      </section>
      <section class="copc-panel__section" data-testid="streaming-settings">
        <h2>Streaming</h2>
        <div class="copc-slider" data-control="maxNodes">
          <div class="copc-slider__heading"><label for="max-nodes-slider">Max selected nodes</label><output data-value-for="maxNodes">8</output></div>
          <input id="max-nodes-slider" data-slider="maxNodes" data-testid="max-nodes-slider" type="range" min="1" max="32" step="1" aria-label="Max selected nodes" />
        </div>
        <div class="copc-slider" data-control="maxRenderedPoints">
          <div class="copc-slider__heading"><label for="max-rendered-points-slider">Max rendered points</label><output data-value-for="maxRenderedPoints">1,000,000</output></div>
          <input id="max-rendered-points-slider" data-slider="maxRenderedPoints" data-testid="max-rendered-points-slider" type="range" min="0" max="6" step="1" aria-label="Max rendered points" />
        </div>
        <div class="copc-slider" data-control="maxDepth">
          <div class="copc-slider__heading"><label for="max-depth-slider">Max depth</label><output data-value-for="maxDepth">8</output></div>
          <input id="max-depth-slider" data-slider="maxDepth" data-testid="max-depth-slider" type="range" min="0" max="16" step="1" aria-label="Max depth" />
        </div>
        <div class="copc-slider" data-control="maxScreenSpaceError">
          <div class="copc-slider__heading"><label for="max-screen-space-error-slider">Screen-space error</label><output data-value-for="maxScreenSpaceError">8 px</output></div>
          <input id="max-screen-space-error-slider" data-slider="maxScreenSpaceError" data-testid="max-screen-space-error-slider" type="range" min="0.1" max="16" step="0.1" aria-label="Screen-space error" />
          <p class="copc-panel__hint">Lower values generally request more detail.</p>
        </div>
        <div class="copc-panel__distance-mode">
          <span>Camera distance</span>
          <div class="copc-segmented" role="radiogroup" aria-label="Camera distance mode" data-testid="render-distance-mode">
            <button type="button" role="radio" data-value="auto">Auto-fit</button>
            <button type="button" role="radio" data-value="manual">Manual</button>
          </div>
          <div class="copc-slider" data-control="renderDistance">
            <div class="copc-slider__heading"><label for="render-distance-slider">Manual camera distance</label><output data-value-for="renderDistance">Auto-fit</output></div>
            <input id="render-distance-slider" data-slider="renderDistance" data-testid="render-distance-slider" type="range" min="0" max="17" step="1" aria-label="Camera distance" />
          </div>
        </div>
        <p class="copc-panel__hint">Camera distance frames the view. Max render distance limits which nodes stream.</p>
        <div class="copc-slider" data-control="maxRenderDistanceMeters">
          <div class="copc-slider__heading"><label for="max-render-distance-slider">Max render distance</label><output data-value-for="maxRenderDistanceMeters">20,000 m</output></div>
      <input id="max-render-distance-slider" data-slider="maxRenderDistanceMeters" data-testid="max-render-distance-slider" type="range" min="0" max="16" step="1" aria-label="Max render distance in meters" />
        </div>
      </section>
      <details class="copc-panel__details" data-testid="advanced-settings">
        <summary>Advanced settings</summary>
        <p class="copc-panel__hint">Enter exact values within the adapter's supported ranges.</p>
        <label>Point size (px)<input data-testid="point-size-input" type="number" required></label>
        <label>Max selected nodes<input data-streaming-setting="maxNodes" data-testid="max-nodes-input" type="number" required></label>
        <label>Max rendered points<input data-streaming-setting="maxRenderedPoints" data-testid="max-rendered-points-input" type="number" required></label>
        <label>Max depth<input data-streaming-setting="maxDepth" data-testid="max-depth-input" type="number" required></label>
        <label>Screen-space error (px)<input data-streaming-setting="maxScreenSpaceError" data-testid="max-screen-space-error-input" type="number" required></label>
        <label>Max render distance (m)<input data-streaming-setting="maxRenderDistanceMeters" data-testid="max-render-distance-input" type="number" required></label>
        <label>Camera distance (m; blank = auto-fit)<input data-testid="render-distance-input" type="number" placeholder="Auto-fit"></label>
      </details>
      <div class="copc-panel__selection-status"><span>Requested configuration</span><strong data-testid="settings-summary">Cesium · JavaScript · 3 px</strong></div>
      <p class="copc-panel__status-note" data-testid="settings-state">Ready configuration is active. Changes apply on request.</p>
      <div class="copc-panel__button-row copc-panel__button-row--single">
        <button class="copc-panel__primary" data-testid="apply-settings" type="button">Apply settings</button>
      </div>
      <div class="copc-panel__button-row">
        <button data-testid="reload-renderer" type="button">Reload renderer</button>
        <button data-testid="demo-start" type="button">Start demo</button>
      </div>
      <button data-testid="demo-stop" type="button">Stop demo</button>
      <fieldset class="copc-panel__field copc-panel__view-field">
        <legend>Camera view</legend>
        <div class="copc-segmented" role="radiogroup" aria-label="Camera view" data-testid="camera-view-select">
          <button type="button" role="radio" data-value="overview">Overview</button>
          <button type="button" role="radio" data-value="near">Near</button>
          <button type="button" role="radio" data-value="far">Far</button>
        </div>
      </fieldset>
      <div class="copc-panel__error" data-testid="harness-error" hidden></div>
      <details class="copc-panel__details" data-testid="diagnostics-details">
        <summary>More diagnostics</summary>
        <div class="copc-panel__diagnostics">
          <div><span>Adapter</span><b data-field="adapter"></b></div>
          <div><span>Backend</span><b data-testid="diag-backend">—</b></div>
          <div><span>Renderer point size</span><b data-testid="diag-point-size">—</b></div>
          <div><span>Metadata</span><b data-testid="metadata-summary">—</b></div>
          <div><span>Hierarchy</span><b data-testid="hierarchy-summary">—</b></div>
          <div><span>Worker</span><b data-testid="worker-summary">—</b></div>
          <div><span>Streaming performance</span><b data-testid="performance-summary">—</b></div>
          <div><span>Selected nodes</span><b data-testid="selected-nodes">0</b></div>
          <div><span>Rendered nodes</span><b data-testid="rendered-nodes">0</b></div>
          <div><span>Rendered points</span><b data-testid="rendered-points">0</b></div>
          <div><span>Stream updates</span><b data-testid="stream-updates">0</b></div>
          <div><span>Range requests</span><b data-testid="range-requests">0</b></div>
          <div><span>Hierarchy requests</span><b data-testid="hierarchy-requests">0</b></div>
          <div><span>Hierarchy cache hits</span><b data-testid="hierarchy-cache-hits">0</b></div>
          <div><span>Point cache</span><b data-testid="point-cache">0 entries</b></div>
          <div><span>Visible LoD levels</span><b data-testid="visible-lod-levels">—</b></div>
        </div>
      </details>
    </div>
  `;
  const streamingHud = document.createElement('section');
  streamingHud.className = 'copc-streaming-hud';
  streamingHud.dataset.testid = 'streaming-hud';
  streamingHud.setAttribute('aria-label', 'COPC streaming status');
  streamingHud.setAttribute('aria-live', 'polite');
  streamingHud.innerHTML = `
    <div class="copc-streaming-hud__heading-row">
      <div class="copc-streaming-hud__heading">COPC Streaming</div>
      <button
        class="copc-streaming-hud__toggle"
        data-testid="streaming-hud-toggle"
        type="button"
        aria-label="Collapse streaming status"
        aria-expanded="true"
        aria-controls="streaming-hud-body"
        title="Collapse streaming status"
      ><span aria-hidden="true">−</span></button>
    </div>
    <div class="copc-streaming-hud__body" data-testid="streaming-hud-body" id="streaming-hud-body">
      <div class="copc-streaming-hud__context">
        <span data-testid="hud-backend">copc-js</span>
        <span data-testid="hud-view">Overview</span>
      </div>
      <dl class="copc-streaming-hud__metrics">
        <div><dt>Selected nodes</dt><dd data-testid="hud-selected-nodes">0 / 8</dd></div>
        <div><dt>Rendered nodes</dt><dd data-testid="hud-rendered-nodes">0</dd></div>
        <div><dt>Rendered points</dt><dd data-testid="hud-rendered-points">0 / 1,000,000</dd></div>
        <div><dt>Range requests</dt><dd data-testid="hud-range-requests">0</dd></div>
        <div><dt>LoD</dt><dd data-testid="hud-lod">—</dd></div>
      </dl>
    </div>
  `;
  const pointPopover = document.createElement('section');
  pointPopover.className = 'copc-point-popover';
  pointPopover.dataset.testid = 'point-inspection';
  pointPopover.setAttribute('role', 'region');
  pointPopover.setAttribute('aria-label', 'Selected point details');
  pointPopover.setAttribute('aria-live', 'polite');
  pointPopover.hidden = true;
  pointPopover.innerHTML = `
    <div class="copc-point-popover__heading">Selected point</div>
    <dl class="copc-point-popover__coordinates">
      <div data-testid="point-latitude-row"><dt>Latitude (°)</dt><dd data-testid="point-latitude">—</dd></div>
      <div data-testid="point-longitude-row"><dt>Longitude (°)</dt><dd data-testid="point-longitude">—</dd></div>
      <div data-testid="point-height-row"><dt>Height (m)</dt><dd data-testid="point-height">—</dd></div>
    </dl>
    <dl class="copc-point-popover__attributes">
      <div data-testid="point-intensity-row"><dt>Intensity</dt><dd data-testid="point-intensity">—</dd></div>
      <div data-testid="point-classification-row"><dt>Classification</dt><dd><span data-testid="point-classification">—</span><span data-testid="point-classification-label"></span></dd></div>
      <div data-testid="point-rgb-row"><dt>RGB</dt><dd data-testid="point-rgb">—</dd></div>
    </dl>
    <details class="copc-point-popover__extra" data-testid="point-extra-details">
      <summary>More point details</summary>
      <dl>
        <div data-testid="point-level-row"><dt>LoD level</dt><dd data-testid="point-level">—</dd></div>
        <div data-testid="point-index-row"><dt>Point index</dt><dd data-testid="point-index">—</dd></div>
        <div data-testid="point-node-row"><dt>Node</dt><dd data-testid="point-node">—</dd></div>
        <div data-testid="point-backend-row"><dt>Backend</dt><dd data-testid="point-backend">—</dd></div>
        <div data-testid="point-source-row"><dt>Source XYZ</dt><dd data-testid="point-source">—</dd></div>
        <div data-testid="point-world-row"><dt>World ECEF (m)</dt><dd data-testid="point-world">—</dd></div>
      </dl>
      <dl data-testid="point-dimensions"></dl>
    </details>
  `;
  target.append(root, streamingHud, pointPopover);

  const byTestId = <T extends HTMLElement>(id: string): T => {
    const node = root.querySelector<T>(`[data-testid="${id}"]`);
    if (!node)
      throw new Error(`Shared control panel is missing data-testid="${id}".`);
    return node;
  };
  const byPointTestId = <T extends HTMLElement>(id: string): T => {
    const node = pointPopover.querySelector<T>(`[data-testid="${id}"]`);
    if (!node) throw new Error(`Point popover is missing data-testid="${id}".`);
    return node;
  };
  const byHudTestId = <T extends HTMLElement>(id: string): T => {
    const node = streamingHud.querySelector<T>(`[data-testid="${id}"]`);
    if (!node) throw new Error(`Streaming HUD is missing data-testid="${id}".`);
    return node;
  };
  const field = <T extends HTMLElement>(name: string): T => {
    const node = root.querySelector<T>(`[data-field="${name}"]`);
    if (!node)
      throw new Error(`Shared control panel is missing data-field="${name}".`);
    return node;
  };
  const selectedSegment = (group: HTMLElement): string =>
    group.dataset.selected ?? '';
  const setSegmentValue = (group: HTMLElement, value: string): void => {
    group.dataset.selected = value;
    for (const button of group.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]',
    )) {
      const selected = button.dataset.value === value;
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  };
  const bindSegment = (
    group: HTMLElement,
    onChange: (value: string) => void,
  ): void => {
    group.setAttribute('aria-orientation', 'horizontal');
    const buttons = (): HTMLButtonElement[] =>
      Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const select = (button: HTMLButtonElement): void => {
      const value = button.dataset.value;
      if (!value || button.disabled) return;
      setSegmentValue(group, value);
      onChange(value);
    };
    for (const button of buttons()) {
      button.addEventListener('click', () => select(button));
      button.addEventListener('keydown', (event) => {
        const choices = buttons().filter((candidate) => !candidate.disabled);
        const index = choices.indexOf(button);
        const nextIndex =
          event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? (index + 1) % choices.length
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? (index - 1 + choices.length) % choices.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? choices.length - 1
                  : -1;
        if (nextIndex < 0) return;
        event.preventDefault();
        const next = choices[nextIndex];
        if (next) {
          select(next);
          next.focus();
        }
      });
    }
  };
  const state = { ...options.state };
  let localFixtures = [] as FixtureCatalogEntry[];
  const rendererSelect = byTestId<HTMLElement>('renderer-select');
  const backendSelect = byTestId<HTMLElement>('backend-select');
  const cameraViewSelect = byTestId<HTMLElement>('camera-view-select');
  const renderDistanceMode = byTestId<HTMLElement>('render-distance-mode');
  const selectedDataset = byTestId<HTMLElement>('selected-dataset');
  const fixtureSelect = byTestId<HTMLSelectElement>('fixture-select');
  const customSourceInput = byTestId<HTMLInputElement>('custom-source-url');
  const sourceUrl = byTestId<HTMLElement>('source-url');
  const styleSelect = byTestId<HTMLSelectElement>('style-select');
  const renderDistanceInput = byTestId<HTMLInputElement>(
    'render-distance-input',
  );
  const pointSizeInput = byTestId<HTMLInputElement>('point-size-input');
  renderDistanceInput.min = String(HARNESS_RENDER_DISTANCE_LIMITS.min);
  renderDistanceInput.max = String(HARNESS_RENDER_DISTANCE_LIMITS.max);
  renderDistanceInput.step = String(HARNESS_RENDER_DISTANCE_LIMITS.step);
  pointSizeInput.min = String(HARNESS_POINT_SIZE_LIMITS.min);
  pointSizeInput.max = String(HARNESS_POINT_SIZE_LIMITS.max);
  pointSizeInput.step = String(HARNESS_POINT_SIZE_LIMITS.step);
  const streamingInputs = new Map<
    keyof HarnessStreamingSettings,
    HTMLInputElement
  >();
  for (const key of Object.keys(
    DEFAULT_HARNESS_STREAMING_SETTINGS,
  ) as (keyof HarnessStreamingSettings)[]) {
    const input = root.querySelector<HTMLInputElement>(
      `[data-streaming-setting="${key}"]`,
    );
    if (!input) {
      throw new Error(
        `Shared control panel is missing streaming setting "${key}".`,
      );
    }
    const limits = HARNESS_STREAMING_SETTING_LIMITS[key];
    input.min = String(limits.min);
    input.max = String(limits.max);
    input.step = String(limits.step);
    streamingInputs.set(key, input);
  }
  type ScalarKey =
    | keyof HarnessStreamingSettings
    | 'pointSize'
    | 'renderDistance';
  const scalarInputs = new Map<ScalarKey, HTMLInputElement>([
    ['pointSize', pointSizeInput],
    ['renderDistance', renderDistanceInput],
    ...streamingInputs,
  ]);
  const sliderInputs = new Map<ScalarKey, HTMLInputElement>();
  for (const slider of root.querySelectorAll<HTMLInputElement>('[data-slider]')) {
    const key = slider.dataset.slider as ScalarKey | undefined;
    if (key) sliderInputs.set(key, slider);
  }
  const sliderStops: Partial<Record<ScalarKey, number[]>> = {
    maxRenderedPoints: [
      100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000,
    ],
    maxRenderDistanceMeters: [
      1, 100, 150, 250, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000,
      100_000, 250_000, 500_000, 1_000_000, 2_000_000, 10_000_000,
    ],
    renderDistance: [
      150, 250, 500, 750, 1_000, 1_500, 2_000, 3_000, 5_000, 10_000,
      20_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000,
      10_000_000,
    ],
  };
  const formatSetting = (key: ScalarKey, value: number | undefined): string => {
    if (value === undefined) return 'Auto-fit';
    const formatted = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: key === 'maxScreenSpaceError' ? 1 : 0,
    }).format(value);
    if (key === 'pointSize') return `${formatted} px`;
    if (key === 'maxScreenSpaceError') return `${formatted} px`;
    if (key === 'renderDistance' || key === 'maxRenderDistanceMeters')
      return `${formatted} m`;
    return formatted;
  };
  const nearestStop = (key: ScalarKey, value: number): number => {
    const stops = sliderStops[key];
    if (!stops) return value;
    return stops.reduce(
      (nearest, candidate, index) =>
        Math.abs(candidate - value) < Math.abs(stops[nearest]! - value)
          ? index
          : nearest,
      0,
    );
  };
  const writeScalar = (key: ScalarKey, value: number | undefined): void => {
    const input = scalarInputs.get(key);
    if (input) {
      const next = value === undefined ? '' : String(value);
      if (input.value !== next) input.value = next;
    }
    const slider = sliderInputs.get(key);
    if (slider) {
      if (value !== undefined) {
        const next = String(nearestStop(key, value));
        if (slider.value !== next) slider.value = next;
      }
      slider.disabled = key === 'renderDistance' && value === undefined;
    }
    const output = root.querySelector<HTMLOutputElement>(
      `[data-value-for="${key}"]`,
    );
    if (output) output.textContent = formatSetting(key, value);
  };
  const writeRenderDistanceMode = (renderDistance: number | undefined): void => {
    setSegmentValue(
      renderDistanceMode,
      renderDistance === undefined ? 'auto' : 'manual',
    );
    writeScalar('renderDistance', renderDistance);
  };
  const writeStreamingInputs = (streaming: HarnessStreamingSettings): void => {
    for (const [key, value] of Object.entries(streaming) as [
      keyof HarnessStreamingSettings,
      number,
    ][])
      writeScalar(key, value);
  };
  const readScalar = (key: ScalarKey): number | undefined | null => {
    if (key === 'renderDistance' && selectedSegment(renderDistanceMode) === 'auto')
      return undefined;
    const input = scalarInputs.get(key)!;
    if (!input.checkValidity()) {
      input.reportValidity();
      return null;
    }
    return input.value === '' && key === 'renderDistance'
      ? undefined
      : input.valueAsNumber;
  };
  const readStreamingInputs = (): HarnessStreamingSettings | undefined => {
    const values = {} as HarnessStreamingSettings;
    for (const key of Object.keys(DEFAULT_HARNESS_STREAMING_SETTINGS) as (keyof HarnessStreamingSettings)[]) {
      const value = readScalar(key);
      if (value === undefined || value === null) return undefined;
      values[key] = value;
    }
    return values;
  };
  const rendererLabels: Record<HarnessRenderer, string> = {
    cesium: 'Cesium',
    three: 'Three.js',
    r3f: 'R3F',
  };
  rendererSelect.replaceChildren();
  for (const renderer of renderers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.dataset.value = renderer;
    button.dataset.testid = `renderer-option-${renderer}`;
    button.textContent = rendererLabels[renderer];
    rendererSelect.append(button);
  }
  let rendererDraft = state.renderer;
  let backendDraft = state.backend;
  setSegmentValue(rendererSelect, rendererDraft);
  setSegmentValue(backendSelect, backendDraft);
  setSegmentValue(cameraViewSelect, state.activeView ?? 'overview');
  const selectedFixtureId = (): string => {
    if (fixtureSelect.value !== 'custom:') return fixtureSelect.value;
    const enteredUrl = customSourceInput.value.trim();
    if (enteredUrl) return `custom:${enteredUrl}`;
    return state.fixtureId.startsWith('custom:') ? state.fixtureId : 'custom:';
  };
  const updateSelectedDataset = (): void => {
    const id = selectedFixtureId();
    const remote = REMOTE_COPC_SOURCES.find(
      (source) => `remote:${source.id}` === id,
    );
    const fixture = localFixtures.find((candidate) => candidate.id === id);
    selectedDataset.textContent =
      remote?.name ??
      fixture?.title ??
      (id.startsWith('custom:')
        ? id.length > 7
          ? id.slice(7)
          : 'Custom URL required'
        : id || fixtureName(state.fixtureUrl));
  };
  const readRawScalar = (key: ScalarKey): number | undefined => {
    if (key === 'renderDistance' && selectedSegment(renderDistanceMode) === 'auto')
      return undefined;
    const value = scalarInputs.get(key)!.value;
    return value === '' && key === 'renderDistance'
      ? undefined
      : scalarInputs.get(key)!.valueAsNumber;
  };
  const settingsSummary = byTestId<HTMLElement>('settings-summary');
  const settingsState = byTestId<HTMLElement>('settings-state');
  const applyButton = byTestId<HTMLButtonElement>('apply-settings');
  const loadSourceButton = byTestId<HTMLButtonElement>('load-source');
  const markDirty = (): void => {
    const dirty =
      rendererDraft !== state.renderer ||
      backendDraft !== state.backend ||
      selectedFixtureId() !== state.fixtureId ||
      readRawScalar('pointSize') !== state.pointSize ||
      readRawScalar('renderDistance') !== state.renderDistance ||
      (Object.keys(DEFAULT_HARNESS_STREAMING_SETTINGS) as (keyof HarnessStreamingSettings)[]).some(
        (key) => readRawScalar(key) !== state.streaming[key],
      );
    settingsSummary.textContent = `${rendererLabels[rendererDraft]} · ${backendDraft === 'rust' ? 'Rust / WASM' : 'JavaScript'} · ${formatSetting('pointSize', readRawScalar('pointSize'))}`;
    settingsState.textContent = dirty
      ? 'Changes are pending. Apply settings to activate them.'
      : state.status === 'loading'
        ? 'Loading the requested configuration…'
        : state.status === 'error'
          ? 'The requested configuration failed to load.'
          : state.status === 'ready'
            ? 'The requested configuration is active.'
            : 'Choose settings, then apply them.';
    applyButton.disabled = state.status === 'loading';
    loadSourceButton.disabled = state.status === 'loading';
    const error = byTestId<HTMLElement>('harness-error');
    error.hidden = !state.error;
    error.textContent = state.error ?? '';
    updateSelectedDataset();
  };
  bindSegment(rendererSelect, (value) => {
    rendererDraft = value as HarnessRenderer;
    markDirty();
  });
  bindSegment(backendSelect, (value) => {
    backendDraft = value as PanelSelection['backend'];
    markDirty();
  });
  bindSegment(cameraViewSelect, (value) => {
    if (value === 'overview') actions.overview();
    else if (value === 'near') actions.near();
    else if (value === 'far') actions.far();
  });
  bindSegment(renderDistanceMode, (value) => {
    if (value === 'auto') {
      renderDistanceInput.value = '';
      writeScalar('renderDistance', undefined);
    } else {
      const current = Number(renderDistanceInput.value);
      writeScalar(
        'renderDistance',
        Number.isFinite(current) && current >= HARNESS_RENDER_DISTANCE_LIMITS.min
          ? current
          : 2_000,
      );
    }
    markDirty();
  });
  writeScalar('pointSize', state.pointSize ?? DEFAULT_HARNESS_POINT_SIZE);
  writeRenderDistanceMode(state.renderDistance);
  writeStreamingInputs(state.streaming);
  const panelBody = byTestId<HTMLElement>('control-panel-body');
  const panelToggle = byTestId<HTMLButtonElement>('panel-toggle');
  panelToggle.addEventListener('click', () => {
    const collapsed = root.classList.toggle('copc-panel--collapsed');
    panelBody.hidden = collapsed;
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    panelToggle.setAttribute(
      'aria-label',
      collapsed ? 'Expand control panel' : 'Collapse control panel',
    );
    panelToggle.title = collapsed ? 'Expand panel' : 'Collapse panel';
    panelToggle.querySelector('span')!.textContent = collapsed ? '›' : '‹';
  });
  const hudBody = byHudTestId<HTMLElement>('streaming-hud-body');
  const hudToggle = byHudTestId<HTMLButtonElement>('streaming-hud-toggle');
  hudToggle.addEventListener('click', () => {
    const collapsed = streamingHud.classList.toggle(
      'copc-streaming-hud--collapsed',
    );
    hudBody.hidden = collapsed;
    hudToggle.setAttribute('aria-expanded', String(!collapsed));
    hudToggle.setAttribute(
      'aria-label',
      collapsed ? 'Expand streaming status' : 'Collapse streaming status',
    );
    hudToggle.title = collapsed
      ? 'Expand streaming status'
      : 'Collapse streaming status';
    hudToggle.querySelector('span')!.textContent = collapsed ? '+' : '−';
  });
  fixtureSelect.value = state.fixtureId.startsWith('custom:')
    ? 'custom:'
    : state.fixtureId;
  const onApply = (): void => {
    const streaming = readStreamingInputs();
    if (!streaming) return;
    const renderDistance = readScalar('renderDistance');
    if (renderDistance === null) return;
    const pointSize = readScalar('pointSize');
    if (pointSize === undefined || pointSize === null) return;
    actions.apply({
      renderer: rendererDraft,
      backend: backendDraft,
      fixtureId: selectedFixtureId(),
      streaming,
      renderDistance,
      pointSize,
    });
  };
  fixtureSelect.addEventListener('change', markDirty);
  customSourceInput.addEventListener('input', () => {
    if (customSourceInput.value.trim()) fixtureSelect.value = 'custom:';
    markDirty();
  });
  for (const [key, input] of scalarInputs) {
    input.addEventListener('input', () => {
      const value =
        input.value === '' && key === 'renderDistance'
          ? undefined
          : input.valueAsNumber;
      writeScalar(key, value);
      if (key === 'renderDistance')
        setSegmentValue(
          renderDistanceMode,
          value === undefined ? 'auto' : 'manual',
        );
      markDirty();
    });
  }
  for (const [key, slider] of sliderInputs) {
    slider.addEventListener('input', () => {
      const stops = sliderStops[key];
      const index = slider.valueAsNumber;
      const value = stops ? stops[Math.round(index)] : index;
      if (value === undefined) return;
      writeScalar(key, value);
      if (key === 'renderDistance')
        setSegmentValue(renderDistanceMode, 'manual');
      markDirty();
    });
  }
  byTestId<HTMLButtonElement>('apply-settings').addEventListener(
    'click',
    onApply,
  );
  loadSourceButton.addEventListener('click', onApply);
  styleSelect.addEventListener('change', () =>
    actions.setStyle(
      styleSelect.value as 'rgb' | 'elevation' | 'intensity' | 'classification',
    ),
  );
  byTestId<HTMLButtonElement>('reload-renderer').addEventListener(
    'click',
    actions.reload,
  );
  byTestId<HTMLButtonElement>('demo-start').addEventListener(
    'click',
    actions.startDemo,
  );
  byTestId<HTMLButtonElement>('demo-stop').addEventListener(
    'click',
    actions.stopDemo,
  );
  markDirty();

  const panel: MountedPanel = {
    element: root,
    update(next) {
      if (state.pickedPoint !== next.pickedPoint)
        byPointTestId<HTMLDetailsElement>('point-extra-details').open = false;
      const selectionChanged = {
        renderer: state.renderer !== next.renderer,
        backend: state.backend !== next.backend,
        fixtureId: state.fixtureId !== next.fixtureId,
        pointSize: state.pointSize !== next.pointSize,
        streaming:
          JSON.stringify(state.streaming) !== JSON.stringify(next.streaming),
        renderDistance: state.renderDistance !== next.renderDistance,
      };
      Object.assign(state, next);
      if (selectionChanged.renderer) {
        rendererDraft = state.renderer;
        setSegmentValue(rendererSelect, state.renderer);
      }
      if (selectionChanged.backend) {
        backendDraft = state.backend;
        setSegmentValue(backendSelect, state.backend);
      }
      if (selectionChanged.fixtureId) {
        fixtureSelect.value = state.fixtureId.startsWith('custom:')
          ? 'custom:'
          : state.fixtureId;
        customSourceInput.value = state.fixtureId.startsWith('custom:')
          ? state.fixtureId.slice('custom:'.length)
          : '';
      }
      if (selectionChanged.pointSize)
        writeScalar('pointSize', state.pointSize);
      if (selectionChanged.streaming) writeStreamingInputs(state.streaming);
      if (selectionChanged.renderDistance)
        writeRenderDistanceMode(state.renderDistance);
      if (state.activeView)
        setSegmentValue(cameraViewSelect, state.activeView);
      field('host').textContent = `Host: ${state.host}`;
      field('renderer-label').textContent = state.renderer;
      field('adapter').textContent =
        `${state.packageName}@${state.packageVersion}`;
      byTestId('adapter-source').textContent = `${state.packageSource} package`;
      const selectedRemote = REMOTE_COPC_SOURCES.find(
        (source) => `remote:${source.id}` === state.fixtureId,
      );
      const selectedFixture = localFixtures.find(
        (fixture) => fixture.id === state.fixtureId,
      );
      updateSelectedDataset();
      sourceUrl.textContent = state.fixtureUrl;
      byTestId('source-type').textContent =
        state.activeSourceKind === 'local-fixture' ||
        (!state.activeSourceKind &&
          !state.fixtureId.startsWith('remote:') &&
          !state.fixtureId.startsWith('custom:'))
          ? 'Local Fixture'
          : state.fixtureId.startsWith('custom:')
            ? 'Custom Remote HTTP'
            : 'Remote HTTP';
      byTestId('active-dataset').textContent = state.activeDatasetUrl ?? '—';
      const camera = nestedRecord(state.snapshot, 'camera');
      byTestId('camera-location').textContent = camera
        ? `${Number(camera.latitude).toFixed(4)}°, ${Number(camera.longitude).toFixed(4)}° · ${new Intl.NumberFormat('en-US').format(Math.round(Number(camera.height)))} m`
        : '—';
      const probe = state.sourceProbe;
      const yesNo = (value: boolean | 'unknown' | undefined): string =>
        value === undefined
          ? '—'
          : value === 'unknown'
            ? 'Unknown'
            : value
              ? 'Supported'
              : 'Unsupported';
      byTestId('source-reachable').textContent = probe
        ? yesNo(probe.reachable)
        : 'Not probed';
      byTestId('source-range').textContent = probe
        ? yesNo(probe.rangeSupported)
        : 'Not probed';
      byTestId('source-http-status').textContent =
        probe?.partialStatus === undefined ? '—' : String(probe.partialStatus);
      byTestId('source-content-range').textContent = probe?.contentRange ?? '—';
      byTestId('source-copc').textContent = probe
        ? yesNo(probe.copcDetected)
        : 'Not probed';
      byTestId('source-cors').textContent = probe
        ? yesNo(probe.corsReadable)
        : 'Not probed';
      const capabilityText = selectedRemote
        ? ['rgb', 'intensity', 'classification']
            .map(
              (field) =>
                `${field.toUpperCase()} ${selectedRemote.expectedCapabilities[field as 'rgb' | 'intensity' | 'classification'] ? 'available' : 'unavailable'}`,
            )
            .join(' · ')
        : selectedFixture
          ? selectedFixture.capabilities.join(' · ')
          : state.fixtureId.startsWith('custom:')
            ? 'Not known until source metadata loads'
            : '—';
      byTestId('source-capabilities').textContent = capabilityText;
      const styles = ['rgb', 'intensity', 'classification'] as const;
      for (const style of styles) {
        const option = styleSelect.querySelector<HTMLOptionElement>(
          `option[value="${style}"]`,
        );
        if (option) {
          const capability =
            selectedRemote?.expectedCapabilities[style] ??
            selectedFixture?.capabilities.some((value) =>
              value.toLowerCase().includes(style),
            );
          option.disabled = capability === false;
          option.title =
            capability === false
              ? `${style.toUpperCase()} attributes are not available in this dataset.`
              : '';
          option.textContent =
            capability === false
              ? `${style.toUpperCase()} (unavailable)`
              : style.toUpperCase();
        }
      }
      if (state.colorMode) styleSelect.value = state.colorMode;
      const status = byTestId<HTMLElement>('harness-status');
      status.dataset.status = state.status;
      status.textContent = state.status;
      const snapshot =
        state.snapshot === undefined
          ? undefined
          : normalizeSnapshot(state.snapshot);
      const number = (value: number | undefined): string =>
        value === undefined
          ? '0'
          : new Intl.NumberFormat('en-US').format(value);
      const snapshotRecord =
        state.snapshot && typeof state.snapshot === 'object'
          ? (state.snapshot as Record<string, unknown>)
          : undefined;
      const nested = (key: string): Record<string, unknown> | undefined => {
        const value = snapshotRecord?.[key];
        return value && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : undefined;
      };
      const rangeRequests = nested('rangeRequests');
      const hierarchy = nested('hierarchy');
      const pointCache = nested('pointCache');
      const worker = nested('worker');
      const performance = nested('performance');
      const metadata = nested('metadata');
      const statCount = (value: unknown): string | undefined =>
        typeof value === 'number' && Number.isFinite(value)
          ? number(value)
          : undefined;
      byTestId('diag-backend').textContent =
        state.backend === 'rust' ? 'Rust / WASM' : 'JavaScript';
      const snapshotPointSize = statCount(snapshotRecord?.rendererPointSize);
      byTestId('diag-point-size').textContent = snapshotPointSize
        ? `${snapshotPointSize} px`
        : '—';
      byTestId('metadata-summary').textContent = [
        typeof metadata?.pointCount === 'number'
          ? `${number(metadata.pointCount)} points`
          : undefined,
        typeof metadata?.lasVersion === 'string'
          ? `LAS ${metadata.lasVersion}`
          : undefined,
        typeof metadata?.pointFormat === 'number'
          ? `PDRF ${metadata.pointFormat}`
          : undefined,
      ]
        .filter((value): value is string => value !== undefined)
        .join(' · ') || '—';
      byTestId('hierarchy-summary').textContent = [
        statCount(hierarchy?.pageRequests) !== undefined
          ? `${statCount(hierarchy?.pageRequests)} requests`
          : undefined,
        statCount(hierarchy?.pageCacheHits) !== undefined
          ? `${statCount(hierarchy?.pageCacheHits)} cache hits`
          : undefined,
      ]
        .filter((value): value is string => value !== undefined)
        .join(' · ') || '—';
      byTestId('worker-summary').textContent = [
        statCount(worker?.completedCount) !== undefined
          ? `${statCount(worker?.completedCount)} completed`
          : undefined,
        statCount(worker?.activeCount) !== undefined
          ? `${statCount(worker?.activeCount)} active`
          : undefined,
        statCount(worker?.failedCount) !== undefined
          ? `${statCount(worker?.failedCount)} failed`
          : undefined,
      ]
        .filter((value): value is string => value !== undefined)
        .join(' · ') || '—';
      byTestId('performance-summary').textContent = [
        typeof performance?.updateDurationMs === 'number'
          ? `update ${performance.updateDurationMs.toFixed(1)} ms`
          : undefined,
        typeof performance?.nodeSelectionMs === 'number'
          ? `selection ${performance.nodeSelectionMs.toFixed(1)} ms`
          : undefined,
        typeof performance?.budgetUtilizationPercent === 'number'
          ? `${performance.budgetUtilizationPercent.toFixed(1)}% budget`
          : undefined,
      ]
        .filter((value): value is string => value !== undefined)
        .join(' · ') || '—';
      const selectedKeys = Array.isArray(snapshotRecord?.selectedNodeKeys)
        ? snapshotRecord.selectedNodeKeys.filter(
            (key): key is string => typeof key === 'string',
          )
        : [];
      const lod = selectedKeys
        .map((key) => /^(\d+)(?:[-/])/.exec(key)?.[1])
        .filter((value): value is string => value !== undefined)
        .map(Number);
      byTestId('selected-nodes').textContent = number(
        state.selectedNodes ?? snapshot?.selectedNodeKeys.length,
      );
      byTestId('rendered-nodes').textContent = number(
        state.renderedNodes ?? snapshot?.renderedNodeKeys.length,
      );
      byTestId('rendered-points').textContent = number(
        state.renderedPoints ?? snapshot?.renderedPointCount,
      );
      byTestId('stream-updates').textContent = number(
        state.streamUpdates ?? snapshot?.streamingUpdateCount,
      );
      byTestId('range-requests').textContent = number(
        typeof rangeRequests?.requested === 'number'
          ? rangeRequests.requested
          : undefined,
      );
      byTestId('hierarchy-requests').textContent = number(
        typeof hierarchy?.pageRequests === 'number'
          ? hierarchy.pageRequests
          : undefined,
      );
      byTestId('hierarchy-cache-hits').textContent = number(
        typeof hierarchy?.pageCacheHits === 'number'
          ? hierarchy.pageCacheHits
          : undefined,
      );
      byTestId('point-cache').textContent = pointCache
        ? `${number(typeof pointCache.cachedNodeCount === 'number' ? pointCache.cachedNodeCount : undefined)} entries · ${number(typeof pointCache.hits === 'number' ? pointCache.hits : undefined)} hits`
        : '—';
      byTestId('visible-lod-levels').textContent = lod.length
        ? `${Math.min(...lod)}–${Math.max(...lod)}`
        : '—';
      const setHudValue = (id: string, value: string): void => {
        const element = byHudTestId(id);
        if (element.textContent !== value) element.textContent = value;
      };
      const selectedNodeCount = number(
        state.selectedNodes ?? snapshot?.selectedNodeKeys.length,
      );
      const renderedPointCount = number(
        state.renderedPoints ?? snapshot?.renderedPointCount,
      );
      setHudValue(
        'hud-backend',
        state.backend === 'rust' ? 'Rust / WASM' : 'copc-js',
      );
      setHudValue(
        'hud-view',
        state.activeView === 'near'
          ? 'Near'
          : state.activeView === 'far'
            ? 'Far'
            : 'Overview',
      );
      setHudValue(
        'hud-selected-nodes',
        `${selectedNodeCount} / ${number(state.streaming.maxNodes)}`,
      );
      setHudValue(
        'hud-rendered-nodes',
        number(state.renderedNodes ?? snapshot?.renderedNodeKeys.length),
      );
      setHudValue(
        'hud-rendered-points',
        `${renderedPointCount} / ${number(state.streaming.maxRenderedPoints)}`,
      );
      setHudValue(
        'hud-range-requests',
        number(
          typeof rangeRequests?.requested === 'number'
            ? rangeRequests.requested
            : undefined,
        ),
      );
      setHudValue(
        'hud-lod',
        lod.length ? `${Math.min(...lod)}–${Math.max(...lod)}` : '—',
      );
      const picked = state.pickedPoint;
      const point = asRecord(picked);
      const screenPosition = state.pickedPointScreenPosition;
      pointPopover.hidden =
        !point ||
        !screenPosition ||
        !Number.isFinite(screenPosition.x) ||
        !Number.isFinite(screenPosition.y);
      const setPointValue = (
        name: string,
        value: unknown,
        maximumFractionDigits = 3,
      ): void => {
        const formatted = formatPointValue(value, maximumFractionDigits);
        const valueElement = byPointTestId(`point-${name}`);
        const nextText = formatted ?? '—';
        if (valueElement.textContent !== nextText)
          valueElement.textContent = nextText;
        const row = byPointTestId<HTMLElement>(`point-${name}-row`);
        const hidden = formatted === undefined;
        if (row.hidden !== hidden) row.hidden = hidden;
      };
      setPointValue('latitude', point?.latitude, 7);
      setPointValue('longitude', point?.longitude, 7);
      setPointValue('height', point?.height, 3);
      setPointValue('intensity', point?.intensity, 0);
      setPointValue('classification', point?.classification, 0);
      setPointValue('level', point?.level, 0);
      setPointValue('index', point?.pointIndex, 0);
      setPointValue('node', point?.nodeKey);
      setPointValue('backend', point?.backend);

      const classificationLabel =
        typeof point?.classificationLabel === 'string'
          ? point.classificationLabel
          : undefined;
      const classificationLabelElement = byPointTestId(
        'point-classification-label',
      );
      const classificationLabelText = classificationLabel
        ? ` · ${classificationLabel}`
        : '';
      if (classificationLabelElement.textContent !== classificationLabelText)
        classificationLabelElement.textContent = classificationLabelText;

      const rgb = asRecord(point?.rgb);
      const rgbValues = rgb
        ? ['red', 'green', 'blue'].map((channel) =>
            formatPointValue(rgb[channel], 0),
          )
        : [];
      const hasRgb = rgbValues.length === 3 && rgbValues.every(Boolean);
      const rgbText = hasRgb ? rgbValues.join(', ') : '—';
      const rgbElement = byPointTestId('point-rgb');
      if (rgbElement.textContent !== rgbText) rgbElement.textContent = rgbText;
      const rgbRow = byPointTestId<HTMLElement>('point-rgb-row');
      const rgbRowHidden = !hasRgb;
      if (rgbRow.hidden !== rgbRowHidden) rgbRow.hidden = rgbRowHidden;

      const sourceText = formatPointVector(point?.source, 3);
      const sourceElement = byPointTestId('point-source');
      const sourceValue = sourceText ?? '—';
      if (sourceElement.textContent !== sourceValue)
        sourceElement.textContent = sourceValue;
      const sourceRow = byPointTestId<HTMLElement>('point-source-row');
      if (sourceRow.hidden !== (sourceText === undefined))
        sourceRow.hidden = sourceText === undefined;
      const worldText = formatPointVector(point?.world, 2);
      const worldElement = byPointTestId('point-world');
      const worldValue = worldText ?? '—';
      if (worldElement.textContent !== worldValue)
        worldElement.textContent = worldValue;
      const worldRow = byPointTestId<HTMLElement>('point-world-row');
      if (worldRow.hidden !== (worldText === undefined))
        worldRow.hidden = worldText === undefined;
      const dimensions = byPointTestId('point-dimensions');
      const extraDimensions = asRecord(point?.dimensions);
      const nextDimensions = Object.entries(extraDimensions ?? {})
        .map(([name, value]) => ({ name, value: formatPointValue(value) }))
        .filter(
          (dimension): dimension is { name: string; value: string } =>
            dimension.value !== undefined,
        );
      const currentDimensions = Array.from(dimensions.children).map((row) => ({
        name: row.querySelector('dt')?.textContent ?? '',
        value: row.querySelector('dd')?.textContent ?? '',
      }));
      const dimensionsChanged =
        currentDimensions.length !== nextDimensions.length ||
        nextDimensions.some(
          (dimension, index) =>
            currentDimensions[index]?.name !== dimension.name ||
            currentDimensions[index]?.value !== dimension.value,
        );
      if (dimensionsChanged) {
        dimensions.replaceChildren();
        for (const { name, value } of nextDimensions) {
          const row = document.createElement('div');
          const label = document.createElement('dt');
          const detail = document.createElement('dd');
          label.textContent = name;
          detail.textContent = value;
          row.append(label, detail);
          dimensions.append(row);
        }
      }
      const hasAdditionalAttributes = [
        'level',
        'index',
        'node',
        'backend',
      ].some((name) => !byPointTestId<HTMLElement>(`point-${name}-row`).hidden);
      byPointTestId<HTMLDetailsElement>('point-extra-details').hidden =
        !hasAdditionalAttributes &&
        sourceText === undefined &&
        worldText === undefined &&
        dimensions.childElementCount === 0;
      if (!pointPopover.hidden && screenPosition) {
        const margin = 12;
        const bounds = pointPopover.getBoundingClientRect();
        const halfWidth = bounds.width / 2;
        const left = Math.max(
          margin + halfWidth,
          Math.min(window.innerWidth - margin - halfWidth, screenPosition.x),
        );
        let placement: 'above' | 'below' = 'above';
        let top = screenPosition.y - 12;
        if (top - bounds.height < margin) {
          placement = 'below';
          top = Math.min(
            screenPosition.y + 12,
            window.innerHeight - bounds.height - margin,
          );
        }
        pointPopover.dataset.placement = placement;
        pointPopover.style.left = `${left}px`;
        pointPopover.style.top = `${Math.max(margin, top)}px`;
      }
      byTestId<HTMLButtonElement>('apply-settings').disabled =
        state.status === 'loading';
      styleSelect.disabled =
        state.renderer !== 'cesium' ||
        (state.status !== 'ready' && !state.activeDatasetUrl);
      byTestId<HTMLElement>('style-support-note').hidden =
        state.renderer === 'cesium';
      markDirty();
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
        option.title = [
          source.approximateSize,
          source.description,
          ...Object.entries(source.expectedCapabilities)
            .filter(([key, value]) => key !== 'range' && value)
            .map(([key]) => key),
        ]
          .filter(Boolean)
          .join(' · ');
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
      if (fixtures.some(({ id }) => id === selected))
        fixtureSelect.value = selected;
      else if (
        selected.startsWith('remote:') &&
        REMOTE_COPC_SOURCES.some(({ id }) => `remote:${id}` === selected)
      )
        fixtureSelect.value = selected;
      else if (selected.startsWith('custom:')) {
        fixtureSelect.value = 'custom:';
        customSourceInput.value =
          selected.slice('custom:'.length) ||
          customSourceInput.value ||
          state.fixtureUrl ||
          '';
      }
      updateSelectedDataset();
    },
    destroy() {
      root.remove();
      streamingHud.remove();
      pointPopover.remove();
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
    pointSize: config.pointSize,
    fixtureId,
    fixtureUrl: config.fixtureUrl,
    packageName: '@frillab/copc-adapter',
    packageVersion: config.packageVersion,
    packageSource: config.packageSource,
    status: 'idle',
    activeView: 'overview',
    streaming: defaultStreamingSettings(config.renderer),
  };
}

function nestedRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object'
    ? (nested as Record<string, unknown>)
    : undefined;
}
