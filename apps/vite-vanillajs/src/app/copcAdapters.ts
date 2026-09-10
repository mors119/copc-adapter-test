import * as PublishedCopcAdapter from '@frillab/copc-adapter';
import type {
  CopcCesiumLayer,
  CopcCesiumLayerOptions,
  CopcCesiumLayerSnapshot,
} from '@frillab/copc-adapter';

export type CopcAdapterLayer = Pick<
  CopcCesiumLayer,
  'attachTo' | 'detachFrom' | 'destroy' | 'getSnapshot' | 'load' | 'unload'
>;

export type CopcAdapterModule = {
  CopcCesiumLayer: new (options: CopcCesiumLayerOptions) => CopcAdapterLayer;
};

export type { CopcCesiumLayerSnapshot };

export const COPC_ADAPTER: CopcAdapterModule = PublishedCopcAdapter;
