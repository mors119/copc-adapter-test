import { fixtureName } from '@copc-test/fixture-client';
import { normalizeSnapshot, type HarnessConfig } from '@copc-test/harness-core';
import type { ReactNode } from 'react';

type HarnessPanelProps = {
  config: HarnessConfig;
  framework: string;
  renderer: string;
  status: string;
  snapshot?: unknown;
  onReload: () => void;
  children?: ReactNode;
};

export function HarnessPanel({
  config,
  framework,
  renderer,
  status,
  snapshot,
  onReload,
  children,
}: HarnessPanelProps): ReactNode {
  const diagnostics = snapshot === undefined ? undefined : normalizeSnapshot(snapshot);
  const format = (value: number | undefined): string =>
    value === undefined ? '—' : new Intl.NumberFormat('en-US').format(value);

  return (
    <aside className="harness-panel">
      <div className="eyebrow">COPC ADAPTER TEST MATRIX</div>
      <h1>{framework} / {renderer}</h1>
      <p className="muted">
        같은 COPC fixture와 streaming 계약을 호스트별로 검증합니다.
      </p>

      <div className="tag-row">
        <span>{framework}</span>
        <span>{renderer}</span>
        <span>{config.packageSource === 'npm' ? `npm ${config.packageVersion}` : config.packageSource === 'checkout' ? 'Packed checkout' : 'Packed TGZ'}</span>
      </div>

      <div className="status-row">
        <span>status</span>
        <strong data-status={status}>{status}</strong>
      </div>
      <div className="status-row">
        <span>fixture</span>
        <strong>{fixtureName(config.fixtureUrl)}</strong>
      </div>
      <div className="status-row">
        <span>scenario</span>
        <strong>{config.scenario}</strong>
      </div>

      <button className="primary-button" data-testid="harness-reload" type="button" onClick={onReload}>
        레이어 다시 로드
      </button>

      <div className="diagnostics">
        <div><span>app</span><b>{config.appId}</b></div>
        <div><span>lifecycle</span><b>{diagnostics?.lifecycle ?? '—'}</b></div>
        <div><span>backend</span><b>{diagnostics?.backend ?? config.backend}</b></div>
        <div><span>rendered nodes</span><b>{format(diagnostics?.renderedNodeKeys.length)}</b></div>
        <div><span>rendered points</span><b>{format(diagnostics?.renderedPointCount)}</b></div>
        <div><span>stream updates</span><b>{format(diagnostics?.streamingUpdateCount)}</b></div>
      </div>

      {children}
    </aside>
  );
}
