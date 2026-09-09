import type { CopcCesiumLayerSnapshot } from '@frillab/copc-adapter';
import type { AdapterTrack, AppSettings, DemoMode, LayerState } from './types';
import type { CopcSample } from './sampleCatalog';

type ControlPanelCallbacks = {
  onApply: (settings: AppSettings) => void;
  onAdapterChange: (track: AdapterTrack) => void;
  onRun: (settings: AppSettings) => void;
  onStop: () => void;
  onCamera: (view: 'far' | 'near' | 'overview') => void;
};

export class ControlPanel {
  private readonly root: HTMLDivElement;

  private readonly callbacks: ControlPanelCallbacks;

  private readonly statusElement: HTMLDivElement;

  private readonly diagnosticsElement: HTMLDivElement;

  private readonly applyButton: HTMLButtonElement;

  private readonly sampleSelect: HTMLSelectElement;

  private readonly adapterButtons: NodeListOf<HTMLButtonElement>;

  private adapterTrack: AdapterTrack = 'published';

  private samplesReady = false;

  constructor(callbacks: ControlPanelCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'copc-control-panel';
    this.root.innerHTML = this.createMarkup();
    document.body.appendChild(this.root);

    this.statusElement = this.getElement<HTMLDivElement>('panel-status');
    this.diagnosticsElement = this.getElement<HTMLDivElement>('panel-diagnostics');
    this.applyButton = this.getElement<HTMLButtonElement>('apply-settings');
    this.sampleSelect = this.getElement<HTMLSelectElement>('sample-file');
    this.adapterButtons = this.root.querySelectorAll<HTMLButtonElement>('[data-adapter-track]');
    this.applyButton.disabled = true;

    this.applyButton.addEventListener('click', () => {
      this.callbacks.onApply(this.readSettings());
    });
    this.getElement<HTMLButtonElement>('run-demo').addEventListener('click', () => {
      this.callbacks.onRun(this.readSettings());
    });
    this.getElement<HTMLButtonElement>('stop-demo').addEventListener('click', () => {
      this.callbacks.onStop();
    });
    for (const button of this.adapterButtons) {
      button.addEventListener('click', () => {
        const track = button.dataset.adapterTrack;
        if (track === 'published' || track === 'local') {
          this.setAdapterTrack(track);
          this.callbacks.onAdapterChange(track);
        }
      });
    }

    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-camera]')) {
      button.addEventListener('click', () => {
        const view = button.dataset.camera;
        if (view === 'far' || view === 'near' || view === 'overview') {
          this.callbacks.onCamera(view);
        }
      });
    }

    this.getElement<HTMLInputElement>('point-size').addEventListener('input', () => {
      this.getElement<HTMLOutputElement>('point-size-value').value = this.getElement<HTMLInputElement>('point-size').value;
    });
  }

  setBusy(busy: boolean): void {
    this.applyButton.disabled = busy || !this.samplesReady;
    this.sampleSelect.disabled = busy || !this.samplesReady;
    for (const button of this.adapterButtons) {
      button.disabled = busy;
    }
    this.applyButton.textContent = busy ? '적용 중…' : '설정 적용 및 다시 로드';
  }

  setSamples(samples: CopcSample[], selectedUrl?: string): void {
    this.sampleSelect.replaceChildren();

    for (const sample of samples) {
      const option = document.createElement('option');
      option.value = sample.url;
      option.textContent = sample.name;
      option.title = sample.path;
      this.sampleSelect.appendChild(option);
    }

    this.samplesReady = samples.length > 0;
    if (selectedUrl && samples.some((sample) => sample.url === selectedUrl)) {
      this.sampleSelect.value = selectedUrl;
    }
    this.sampleSelect.disabled = !this.samplesReady;
    this.applyButton.disabled = !this.samplesReady;
  }

  setAdapterTrack(track: AdapterTrack): void {
    this.adapterTrack = track;

    for (const button of this.adapterButtons) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.adapterTrack === track),
      );
    }
  }

  getSettings(): AppSettings {
    return this.readSettings();
  }

  setLayerState(state: LayerState): void {
    this.statusElement.textContent = state.message ?? state.status;
    this.statusElement.dataset.status = state.status;
  }

  setPhase(phase: string): void {
    this.getElement<HTMLSpanElement>('phase-value').textContent = phase;
  }

  updateDiagnostics(snapshot: CopcCesiumLayerSnapshot | undefined): void {
    if (!snapshot) {
      this.diagnosticsElement.textContent = '레이어 대기 중';
      return;
    }

    const format = (value: number): string => new Intl.NumberFormat('en-US').format(value);
    this.diagnosticsElement.innerHTML = `
      <div><span>backend</span><b>${snapshot.backend}</b></div>
      <div><span>selected nodes</span><b>${format(snapshot.selectedNodeKeys.length)}</b></div>
      <div><span>rendered nodes</span><b>${format(snapshot.renderedNodeKeys.length)}</b></div>
      <div><span>rendered points</span><b>${format(snapshot.renderedPointCount)}</b></div>
      <div><span>stream updates</span><b>${format(snapshot.streamingUpdateCount)}</b></div>
    `;
  }

  private readSettings(): AppSettings {
    const readNumber = (id: string): number => Number(this.getElement<HTMLInputElement>(id).value);
    const demoMode = this.getElement<HTMLSelectElement>('demo-mode').value as DemoMode;

    return {
      adapterTrack: this.adapterTrack,
      sampleUrl: this.getElement<HTMLSelectElement>('sample-file').value,
      colorMode: this.getElement<HTMLSelectElement>('color-mode').value as AppSettings['colorMode'],
      backend: this.getElement<HTMLSelectElement>('backend').value as AppSettings['backend'],
      pointSize: readNumber('point-size'),
      maxNodes: readNumber('max-nodes'),
      maxDepth: readNumber('max-depth'),
      maxScreenSpaceError: readNumber('screen-space-error'),
      maxRenderDistanceMeters: readNumber('render-distance'),
      demoMode,
      autoplay: this.getElement<HTMLInputElement>('autoplay').checked,
    };
  }

  private getElement<T extends HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);

    if (!element) {
      throw new Error(`Control panel element #${id} was not found.`);
    }

    return element;
  }

  private createMarkup(): string {
    return `
      <div class="panel-kicker">COPC ADAPTER</div>
      <h1>Point cloud playground</h1>
      <p class="panel-help">레이어 옵션을 바꾸고 바로 다시 로드합니다.</p>

      <div class="control-grid">
        <div class="control-label">Adapter 구현체
          <div class="adapter-toggle" role="group" aria-label="Adapter 구현체">
            <button type="button" class="adapter-button" data-adapter-track="published" aria-pressed="true">
              Published package
            </button>
            <button type="button" class="adapter-button" data-adapter-track="local" aria-pressed="false">
              Local TGZ
            </button>
          </div>
        </div>
        <label>샘플 파일
          <select id="sample-file" disabled>
            <option>샘플 목록을 불러오는 중…</option>
          </select>
        </label>
        <label>데모 모드
          <select id="demo-mode">
            <option value="streaming">Streaming LoD</option>
            <option value="static">Static / Orbit</option>
          </select>
        </label>
        <label>Color mode
          <select id="color-mode">
            <option value="elevation">Elevation</option>
            <option value="fixed">Fixed cyan</option>
            <option value="rgb">RGB</option>
            <option value="intensity">Intensity</option>
            <option value="classification">Classification</option>
          </select>
        </label>
        <label>Backend
          <select id="backend">
            <option value="rust">Rust / WASM</option>
            <option value="copc-js">copc-js</option>
          </select>
        </label>
        <label>Point size
          <span class="range-line">
            <input id="point-size" type="range" min="1" max="8" step="0.5" value="2" />
            <output id="point-size-value">2</output>
          </span>
        </label>
        <label>Max nodes
          <input id="max-nodes" type="number" min="1" max="32" step="1" value="4" />
        </label>
        <label>Max depth
          <input id="max-depth" type="number" min="0" max="12" step="1" value="4" />
        </label>
        <label>Screen-space error
          <input id="screen-space-error" type="number" min="1" max="64" step="1" value="8" />
        </label>
        <label>Render distance (m)
          <input id="render-distance" type="number" min="100" step="100" value="20000" />
        </label>
      </div>

      <label class="check-line"><input id="autoplay" type="checkbox" /> 카메라 데모 반복 실행</label>

      <div class="button-row">
        <button id="apply-settings" class="primary-button">설정 적용 및 다시 로드</button>
      </div>
      <div class="button-row two-columns">
        <button id="run-demo">데모 시작</button>
        <button id="stop-demo">중지</button>
      </div>

      <div class="section-title">CAMERA</div>
      <div class="button-row three-columns">
        <button data-camera="overview">Overview</button>
        <button data-camera="far">Far</button>
        <button data-camera="near">Near</button>
      </div>

      <div class="status-line"><span>status</span><strong id="panel-status">idle</strong></div>
      <div class="status-line"><span>phase</span><strong id="phase-value">READY</strong></div>
      <div id="panel-diagnostics" class="diagnostics">레이어 대기 중</div>
    `;
  }
}
