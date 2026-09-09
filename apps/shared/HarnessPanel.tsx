import type { ReactNode } from 'react';

export type HarnessSnapshot = {
  lifecycle?: string;
  backend?: string;
  renderedPointCount?: number;
  renderedNodeKeys?: string[];
  streamingUpdateCount?: number;
};

type HarnessPanelProps = {
  framework: string;
  renderer: string;
  status: string;
  sampleUrl: string;
  snapshot?: HarnessSnapshot;
  onReload: () => void;
  children?: ReactNode;
};

export function HarnessPanel({
  framework,
  renderer,
  status,
  sampleUrl,
  snapshot,
  onReload,
  children,
}: HarnessPanelProps): ReactNode {
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
        <span>Range fixture</span>
      </div>

      <div className="status-row">
        <span>status</span>
        <strong data-status={status}>{status}</strong>
      </div>
      <div className="status-row">
        <span>fixture</span>
        <strong>{sampleUrl.split('/').at(-1) ?? sampleUrl}</strong>
      </div>

      <button className="primary-button" type="button" onClick={onReload}>
        레이어 다시 로드
      </button>

      <div className="diagnostics">
        <div><span>lifecycle</span><b>{snapshot?.lifecycle ?? '—'}</b></div>
        <div><span>backend</span><b>{snapshot?.backend ?? '—'}</b></div>
        <div><span>rendered nodes</span><b>{format(snapshot?.renderedNodeKeys?.length)}</b></div>
        <div><span>rendered points</span><b>{format(snapshot?.renderedPointCount)}</b></div>
        <div><span>stream updates</span><b>{format(snapshot?.streamingUpdateCount)}</b></div>
      </div>

      {children}
    </aside>
  );
}
