import { fixtureName } from '@copc-test/fixture-client';
import { normalizeSnapshot, type HarnessConfig } from '@copc-test/harness-core';

type VanillaHarnessPanelOptions = {
  config: HarnessConfig;
  framework: string;
  renderer: string;
  onReload: () => void;
};

export type VanillaHarnessPanel = {
  element: HTMLElement;
  update(status: string, snapshot?: unknown): void;
};

/** DOM-only equivalent of the React harness panel for non-React consumers. */
export function createVanillaHarnessPanel(options: VanillaHarnessPanelOptions): VanillaHarnessPanel {
  const element = document.createElement('aside');
  element.className = 'harness-panel';
  element.innerHTML = `
    <div class="eyebrow">COPC ADAPTER TEST MATRIX</div>
    <h1></h1>
    <p class="muted">같은 COPC fixture와 streaming 계약을 호스트별로 검증합니다.</p>
    <div class="tag-row"><span></span><span></span><span></span></div>
    <div class="status-row"><span>status</span><strong data-status="idle"></strong></div>
    <div class="status-row"><span>fixture</span><strong data-field="fixture"></strong></div>
    <div class="status-row"><span>scenario</span><strong data-field="scenario"></strong></div>
    <button class="primary-button" data-testid="harness-reload" type="button">레이어 다시 로드</button>
    <div class="diagnostics">
      <div><span>app</span><b data-field="app"></b></div>
      <div><span>lifecycle</span><b data-field="lifecycle">—</b></div>
      <div><span>backend</span><b data-field="backend"></b></div>
      <div><span>rendered nodes</span><b data-field="nodes">0</b></div>
      <div><span>rendered points</span><b data-field="points">—</b></div>
      <div><span>stream updates</span><b data-field="updates">—</b></div>
    </div>
  `;

  const text = (selector: string): HTMLElement => {
    const child = element.querySelector<HTMLElement>(selector);
    if (!child) throw new Error(`Harness panel is missing ${selector}.`);
    return child;
  };
  const format = (value: number | undefined): string =>
    value === undefined ? '—' : new Intl.NumberFormat('en-US').format(value);

  text('h1').textContent = `${options.framework} / ${options.renderer}`;
  const tags = element.querySelectorAll<HTMLElement>('.tag-row span');
  tags[0].textContent = options.framework;
  tags[1].textContent = options.renderer;
  tags[2].textContent = options.config.packageSource === 'tarball'
    ? 'Packed TGZ'
    : `npm ${options.config.packageVersion}`;
  text('[data-field="fixture"]').textContent = fixtureName(options.config.fixtureUrl);
  text('[data-field="scenario"]').textContent = options.config.scenario;
  text('[data-field="app"]').textContent = options.config.appId;
  text('[data-field="backend"]').textContent = options.config.backend;
  text('[data-testid="harness-reload"]').addEventListener('click', options.onReload);

  return {
    element,
    update(status, snapshot) {
      const diagnostics = snapshot === undefined ? undefined : normalizeSnapshot(snapshot);
      const statusElement = text('.status-row strong');
      statusElement.dataset.status = status;
      statusElement.textContent = status;
      text('[data-field="lifecycle"]').textContent = diagnostics?.lifecycle ?? '—';
      text('[data-field="backend"]').textContent = diagnostics?.backend ?? options.config.backend;
      text('[data-field="nodes"]').textContent = format(diagnostics?.renderedNodeKeys.length);
      text('[data-field="points"]').textContent = format(diagnostics?.renderedPointCount);
      text('[data-field="updates"]').textContent = format(diagnostics?.streamingUpdateCount);
    },
  };
}
