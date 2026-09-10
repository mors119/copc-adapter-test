import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { fixtureName } from '@copc-test/fixture-client';
import { normalizeSnapshot, type HarnessConfig, type HarnessDiagnostics } from '@copc-test/harness-core';

@Component({
  selector: 'app-angular-harness-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="harness-panel">
      <div class="eyebrow">COPC ADAPTER TEST MATRIX</div>
      <h1>{{ framework }} / {{ renderer }}</h1>
      <p class="muted">같은 COPC fixture와 streaming 계약을 호스트별로 검증합니다.</p>

      <div class="tag-row">
        <span>{{ framework }}</span>
        <span>{{ renderer }}</span>
        <span>{{ config.packageSource === 'tarball' ? 'Packed TGZ' : 'npm ' + config.packageVersion }}</span>
      </div>

      <div class="status-row">
        <span>status</span>
        <strong [attr.data-status]="status">{{ status }}</strong>
      </div>
      <div class="status-row">
        <span>fixture</span>
        <strong>{{ fixtureLabel }}</strong>
      </div>
      <div class="status-row">
        <span>scenario</span>
        <strong>{{ config.scenario }}</strong>
      </div>

      <button class="primary-button" data-testid="harness-reload" type="button" (click)="reload.emit()">
        레이어 다시 로드
      </button>

      <div class="diagnostics">
        <div><span>app</span><b>{{ config.appId }}</b></div>
        <div><span>lifecycle</span><b>{{ diagnostics?.lifecycle ?? '—' }}</b></div>
        <div><span>backend</span><b>{{ diagnostics?.backend ?? config.backend }}</b></div>
        <div><span>rendered nodes</span><b>{{ format(diagnostics?.renderedNodeKeys?.length) }}</b></div>
        <div><span>rendered points</span><b>{{ format(diagnostics?.renderedPointCount) }}</b></div>
        <div><span>stream updates</span><b>{{ format(diagnostics?.streamingUpdateCount) }}</b></div>
      </div>

      <ng-content></ng-content>
    </aside>
  `,
})
export class AngularHarnessPanelComponent {
  @Input({ required: true }) config!: HarnessConfig;
  @Input({ required: true }) framework!: string;
  @Input({ required: true }) renderer!: string;
  @Input({ required: true }) status!: string;
  @Input() snapshot: unknown;
  @Output() readonly reload = new EventEmitter<void>();

  get fixtureLabel(): string {
    return fixtureName(this.config.fixtureUrl);
  }

  get diagnostics(): HarnessDiagnostics | undefined {
    return this.snapshot === undefined ? undefined : normalizeSnapshot(this.snapshot);
  }

  format(value: number | undefined): string {
    return value === undefined ? '—' : new Intl.NumberFormat('en-US').format(value);
  }
}
