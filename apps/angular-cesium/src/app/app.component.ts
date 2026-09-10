import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  signal,
} from '@angular/core';
import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import * as Cesium from 'cesium';
import { CopcCesiumLayer, type CopcCesiumLayerSnapshot } from '@frillab/copc-adapter/cesium';
import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import { AngularHarnessPanelComponent } from '../../../angular-shared/src/angular-harness-panel.component';

const harnessConfig = createHarnessConfig({
  appId: 'angular-cesium',
  host: 'angular',
  renderer: 'cesium',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
  backend: 'copc-js',
  scenario: 'load-and-stream',
});
const testContract = createTestContract(harnessConfig);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AngularHarnessPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="harness-root">
      <div #viewport class="harness-canvas" aria-label="COPC Cesium viewport"></div>
      <app-angular-harness-panel
        [config]="config"
        framework="Angular"
        renderer="Cesium"
        [status]="status()"
        [snapshot]="snapshot()"
        (reload)="reload()"
      >
        <p class="hint">Angular의 <code>ngAfterViewInit</code>/<code>ngOnDestroy</code>에서 caller-owned Cesium Viewer와 <code>@frillab/copc-adapter/cesium</code>을 연결합니다.</p>
      </app-angular-harness-panel>
    </main>
  `,
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('viewport', { static: true })
  private readonly viewport!: ElementRef<HTMLDivElement>;

  readonly config = harnessConfig;
  readonly status = signal('idle');
  readonly snapshot = signal<CopcCesiumLayerSnapshot | undefined>(undefined);

  private viewer?: Cesium.Viewer;
  private layer?: CopcCesiumLayer;
  private snapshotTimer?: number;
  private destroyed = false;

  ngAfterViewInit(): void {
    testContract.registerCommand('reload', () => this.reload());
    testContract.registerCommand('setView', (view) => {
      if (!this.viewer) return;
      const amount = view === 'near' ? 500 : view === 'far' ? -500 : 0;
      if (amount > 0) this.viewer.camera.zoomIn(amount);
      if (amount < 0) this.viewer.camera.zoomOut(-amount);
      this.viewer.camera.changed.raiseEvent();
      this.viewer.camera.moveEnd.raiseEvent();
      this.viewer.scene.requestRender();
    });
    this.startViewer();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cleanupViewer();
    testContract.unregisterCommand('reload');
    testContract.unregisterCommand('setView');
  }

  reload(): void {
    if (this.destroyed) return;
    this.cleanupViewer();
    this.startViewer();
  }

  private startViewer(): void {
    (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = `${window.location.origin}/cesium/`;

    const viewer = new Cesium.Viewer(this.viewport.nativeElement, {
      animation: false,
      timeline: false,
      geocoder: false,
      baseLayerPicker: false,
      baseLayer: false,
      skyBox: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      homeButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });
    const layer = new CopcCesiumLayer({
      url: harnessConfig.fixtureUrl,
      colorMode: 'elevation',
      backend: harnessConfig.backend,
      pointSize: 2,
      debug: true,
      streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8 },
    });

    this.viewer = viewer;
    this.layer = layer;
    this.status.set('loading');
    testContract.markLoading();
    this.snapshotTimer = window.setInterval(() => this.publishSnapshot(layer), 250);

    void layer.load().then(() => {
      if (this.destroyed || this.layer !== layer) {
        layer.destroy();
        return;
      }
      layer.attachTo(viewer);
      this.publishSnapshot(layer);
      testContract.markAttached();
      this.status.set('ready');
      testContract.markReady();
    }).catch((error: unknown) => {
      if (this.destroyed || this.layer !== layer) return;
      this.publishSnapshot(layer);
      this.status.set('error');
      testContract.markError(error);
    });
  }

  private publishSnapshot(layer: CopcCesiumLayer): void {
    const current = layer.getSnapshot();
    this.snapshot.set(current);
    testContract.setSnapshot(current);
  }

  private cleanupViewer(): void {
    if (this.snapshotTimer !== undefined) window.clearInterval(this.snapshotTimer);
    this.snapshotTimer = undefined;
    this.layer?.destroy();
    this.layer = undefined;
    if (this.viewer && !this.viewer.isDestroyed()) this.viewer.destroy();
    this.viewer = undefined;
    this.snapshot.set(undefined);
    testContract.markDestroyed();
  }
}
