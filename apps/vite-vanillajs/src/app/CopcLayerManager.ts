import type * as Cesium from 'cesium';
import {
  type CopcAdapterLayer,
  type CopcAdapterModule,
  type CopcCesiumLayerSnapshot,
} from './copcAdapters';
import type { LayerSettings, LayerState } from './types';

type LayerStateListener = (state: LayerState) => void;

export class CopcLayerManager {
  private readonly viewer: Cesium.Viewer;

  private adapter: CopcAdapterModule;

  private layer: CopcAdapterLayer | undefined;

  private generation = 0;

  private state: LayerState = { status: 'idle' };

  private readonly listeners = new Set<LayerStateListener>();

  constructor(viewer: Cesium.Viewer, adapter: CopcAdapterModule) {
    this.viewer = viewer;
    this.adapter = adapter;
  }

  onStateChange(listener: LayerStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);

    return () => this.listeners.delete(listener);
  }

  getLayer(): CopcAdapterLayer | undefined {
    return this.layer;
  }

  getSnapshot(): CopcCesiumLayerSnapshot | undefined {
    return this.layer?.getSnapshot();
  }

  setAdapter(adapter: CopcAdapterModule): void {
    if (this.adapter === adapter) {
      return;
    }

    this.generation += 1;
    this.layer?.destroy();
    this.layer = undefined;
    this.adapter = adapter;
    this.setState({ status: 'idle', message: 'COPC adapter를 변경하는 중…' });
  }

  async apply(settings: LayerSettings, url: string): Promise<boolean> {
    const requestGeneration = ++this.generation;

    this.layer?.destroy();
    this.layer = undefined;
    this.setState({ status: 'loading', message: 'COPC 레이어를 준비하는 중…' });

    const layer = new this.adapter.CopcCesiumLayer({
      url,
      colorMode: settings.colorMode,
      backend: settings.backend,
      pointSize: settings.pointSize,
      debug: true,
      streaming: {
        maxNodes: settings.maxNodes,
        maxDepth: settings.maxDepth,
        maxScreenSpaceError: settings.maxScreenSpaceError,
        maxRenderDistanceMeters: settings.maxRenderDistanceMeters,
      },
    });

    this.layer = layer;

    try {
      await layer.load();

      if (requestGeneration !== this.generation) {
        layer.destroy();
        return false;
      }

      layer.attachTo(this.viewer);
      this.setState({
        status: 'ready',
        message: 'COPC 레이어가 연결되었습니다.',
        snapshot: layer.getSnapshot(),
      });

      return true;
    } catch (error) {
      if (requestGeneration !== this.generation) {
        layer.destroy();
        return false;
      }

      console.error('Failed to initialize COPC layer:', error);

      if (error instanceof Error) {
        console.error('cause:', error.cause);

        if (error.cause instanceof Error) {
          console.error('cause.cause:', error.cause.cause);
        }
      }

      const message = error instanceof Error ? error.message : String(error);
      this.setState({ status: 'error', message });

      return false;
    }
  }

  destroy(): void {
    this.generation += 1;
    this.layer?.destroy();
    this.layer = undefined;
    this.setState({ status: 'idle' });
  }

  private setState(state: LayerState): void {
    this.state = state;

    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
