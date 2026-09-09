import * as Cesium from 'cesium';
import {
  flyToBoundingSphere,
  getRenderedCopcBoundingSphere,
  sleep,
  waitForCopcBoundingSphere,
  waitForGlobeTiles,
} from './createViewer';
import type { CopcAdapterLayer } from './copcAdapters';
import type { DemoMode } from './types';

export type DemoPhase =
  | 'READY'
  | 'FAR'
  | 'ZOOMING IN'
  | 'NEAR'
  | 'ZOOMING OUT'
  | 'STOPPED';

type DemoControllerOptions = {
  viewer: Cesium.Viewer;
  getLayer: () => CopcAdapterLayer | undefined;
  onPhaseChange: (phase: DemoPhase) => void;
};

export class DemoController {
  private readonly viewer: Cesium.Viewer;

  private readonly getLayer: () => CopcAdapterLayer | undefined;

  private readonly onPhaseChange: (phase: DemoPhase) => void;

  private runId = 0;

  private bounds: Cesium.BoundingSphere | undefined;

  private phase: DemoPhase = 'READY';

  constructor(options: DemoControllerOptions) {
    this.viewer = options.viewer;
    this.getLayer = options.getLayer;
    this.onPhaseChange = options.onPhaseChange;
  }

  getPhase(): DemoPhase {
    return this.phase;
  }

  stop(): void {
    this.runId += 1;
    this.viewer.camera.cancelFlight();
    this.setPhase('STOPPED');
  }

  start(mode: DemoMode, autoplay: boolean): void {
    this.stop();
    const currentRunId = this.runId;
    void this.run(mode, autoplay, currentRunId).catch((error: unknown) => {
      if (this.isCurrent(currentRunId)) {
        console.error('COPC camera demo failed:', error);
        this.setPhase('READY');
      }
    });
  }

  async moveTo(view: 'far' | 'near' | 'overview'): Promise<void> {
    const sphere = await this.ensureBounds();

    if (view === 'near') {
      await flyToBoundingSphere(this.viewer, sphere, 25, -44, 1.15, 0.8);
    } else if (view === 'far') {
      await flyToBoundingSphere(this.viewer, sphere, 25, -48, 3.1, 0.8);
    } else {
      await flyToBoundingSphere(this.viewer, sphere, 25, -80, 3.6, 0.8);
    }
  }

  private async run(
    mode: DemoMode,
    autoplay: boolean,
    currentRunId: number,
  ): Promise<void> {
    this.bounds = undefined;
    await this.ensureBounds();

    if (!this.isCurrent(currentRunId)) {
      return;
    }

    if (mode === 'streaming') {
      await this.playStreaming(currentRunId, autoplay);
    } else {
      await this.playStatic(currentRunId, autoplay);
    }
  }

  private async playStreaming(
    currentRunId: number,
    autoplay: boolean,
  ): Promise<void> {
    this.setPhase('FAR');
    await this.moveTo('far');
    await waitForGlobeTiles(this.viewer);

    if (!autoplay) {
      return;
    }

    do {
      await sleep(700);
      if (!this.isCurrent(currentRunId)) return;

      this.setPhase('ZOOMING IN');
      await this.moveTo('near');
      await this.waitForStreamingUpdate();
      if (!this.isCurrent(currentRunId)) return;

      this.setPhase('NEAR');
      await sleep(900);
      if (!this.isCurrent(currentRunId)) return;

      this.setPhase('ZOOMING OUT');
      await this.moveTo('far');
      await this.waitForStreamingUpdate();
      if (!this.isCurrent(currentRunId)) return;

      this.setPhase('FAR');
    } while (this.isCurrent(currentRunId));
  }

  private async playStatic(
    currentRunId: number,
    autoplay: boolean,
  ): Promise<void> {
    this.setPhase('FAR');
    await this.moveTo('overview');

    if (!autoplay) {
      return;
    }

    do {
      await this.moveTo('near');
      await sleep(900);
      if (!this.isCurrent(currentRunId)) return;

      await flyToBoundingSphere(
        this.viewer,
        await this.ensureBounds(),
        50,
        -78,
        2.2,
        1.2,
      );
      await sleep(800);
      if (!this.isCurrent(currentRunId)) return;

      await flyToBoundingSphere(
        this.viewer,
        await this.ensureBounds(),
        5,
        -78,
        2.2,
        1.2,
      );
      await sleep(800);
      if (!this.isCurrent(currentRunId)) return;

      await this.moveTo('overview');
      await sleep(1_300);
    } while (this.isCurrent(currentRunId));
  }

  private async ensureBounds(): Promise<Cesium.BoundingSphere> {
    const renderedBounds = getRenderedCopcBoundingSphere(this.viewer);

    if (renderedBounds) {
      this.bounds = renderedBounds;
      return renderedBounds;
    }

    if (this.bounds) {
      return this.bounds;
    }

    this.bounds = await waitForCopcBoundingSphere(this.viewer);
    return this.bounds;
  }

  private async waitForStreamingUpdate(): Promise<void> {
    const previousCount = this.getLayer()?.getSnapshot().streamingUpdateCount ?? 0;
    const deadline = performance.now() + 1_500;

    while (performance.now() < deadline) {
      if ((this.getLayer()?.getSnapshot().streamingUpdateCount ?? 0) > previousCount) {
        return;
      }

      await sleep(100);
    }
  }

  private isCurrent(runId: number): boolean {
    return runId === this.runId && !this.viewer.isDestroyed();
  }

  private setPhase(phase: DemoPhase): void {
    this.phase = phase;
    this.onPhaseChange(phase);
  }
}
