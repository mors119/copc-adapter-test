import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  signal,
} from '@angular/core';
import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CopcThreeLayer, type CopcThreeLayerSnapshot } from '@frillab/copc-adapter/three';
import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import { AngularHarnessPanelComponent } from '../../../angular-shared/src/angular-harness-panel.component';
import { fitThreeCamera } from '../../../shared/threeFit';

const harnessConfig = createHarnessConfig({
  appId: 'angular-three',
  host: 'angular',
  renderer: 'three',
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
      <div #viewport class="harness-canvas" aria-label="COPC Three.js viewport"></div>
      <app-angular-harness-panel
        [config]="config"
        framework="Angular"
        renderer="Three.js"
        [status]="status()"
        [snapshot]="snapshot()"
        (reload)="reload()"
      >
        <p class="hint">Angular의 <code>ngAfterViewInit</code>/<code>ngOnDestroy</code>에서 caller-owned scene, camera, renderer와 <code>@frillab/copc-adapter/three</code>을 연결합니다.</p>
      </app-angular-harness-panel>
    </main>
  `,
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('viewport', { static: true })
  private readonly viewport!: ElementRef<HTMLDivElement>;

  readonly config = harnessConfig;
  readonly status = signal('idle');
  readonly snapshot = signal<CopcThreeLayerSnapshot | undefined>(undefined);

  private camera?: THREE.PerspectiveCamera;
  private webglRenderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private layer?: CopcThreeLayer;
  private snapshotTimer?: number;
  private animationFrame?: number;
  private resizeListener?: () => void;
  private disposed = false;

  ngAfterViewInit(): void {
    testContract.registerCommand('reload', () => this.reload());
    testContract.registerCommand('setView', async (view) => {
      if (!this.camera || !this.controls || !this.layer) return;
      const scale = view === 'near' ? 0.65 : view === 'far' ? 1.5 : 1;
      const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(scale);
      this.camera.position.copy(this.controls.target).add(offset);
      this.camera.updateMatrixWorld(true);
      this.controls.update();
      await this.layer.update();
    });
    this.startScene();
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.cleanupScene();
    testContract.unregisterCommand('reload');
    testContract.unregisterCommand('setView');
  }

  reload(): void {
    if (this.disposed) return;
    this.cleanupScene();
    this.startScene();
  }

  private startScene(): void {
    const container = this.viewport.nativeElement;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#06101d');
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20_000);
    const webglRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(webglRenderer.domElement);

    const controls = new OrbitControls(camera, webglRenderer.domElement);
    controls.enableDamping = true;
    const layer = new CopcThreeLayer({
      url: harnessConfig.fixtureUrl,
      colorMode: 'elevation',
      backend: harnessConfig.backend,
      pointSize: 3,
      maxRenderedPoints: 1_000_000,
      streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
      debug: true,
    });

    this.webglRenderer = webglRenderer;
    this.camera = camera;
    this.controls = controls;
    this.layer = layer;
    this.status.set('loading');
    testContract.markLoading();

    const resize = (): void => {
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      webglRenderer.setSize(width, height, false);
    };
    const render = (): void => {
      controls.update();
      webglRenderer.render(scene, camera);
      this.animationFrame = window.requestAnimationFrame(render);
    };
    const onControlsChange = (): void => { void layer.update(); };
    window.addEventListener('resize', resize);
    this.resizeListener = resize;
    controls.addEventListener('change', onControlsChange);
    resize();
    render();
    this.snapshotTimer = window.setInterval(() => this.publishSnapshot(layer), 250);

    void (async (): Promise<void> => {
      try {
        layer.attachTo({ scene, camera, renderer: webglRenderer });
        testContract.markAttached();
        await layer.load();
        if (this.disposed || this.layer !== layer) return;
        await layer.update();
        if (this.disposed || this.layer !== layer) return;
        if (!fitThreeCamera(layer, camera, controls.target)) {
          throw new Error('COPC loaded, but no Three.js points were rendered.');
        }
        controls.update();
        await layer.update();
        this.publishSnapshot(layer);
        this.status.set('ready');
        testContract.markReady();
      } catch (error: unknown) {
        if (this.disposed || this.layer !== layer) return;
        this.publishSnapshot(layer);
        this.status.set('error');
        testContract.markError(error);
      }
    })();
  }

  private publishSnapshot(layer: CopcThreeLayer): void {
    const current = layer.getSnapshot();
    this.snapshot.set(current);
    testContract.setSnapshot(current);
  }

  private cleanupScene(): void {
    if (this.snapshotTimer !== undefined) window.clearInterval(this.snapshotTimer);
    this.snapshotTimer = undefined;
    if (this.animationFrame !== undefined) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    if (this.resizeListener) window.removeEventListener('resize', this.resizeListener);
    this.resizeListener = undefined;
    this.controls?.dispose();
    this.layer?.destroy();
    this.layer = undefined;
    this.webglRenderer?.dispose();
    this.webglRenderer?.domElement.remove();
    this.webglRenderer = undefined;
    this.camera = undefined;
    this.controls = undefined;
    this.snapshot.set(undefined);
    testContract.markDestroyed();
  }
}
