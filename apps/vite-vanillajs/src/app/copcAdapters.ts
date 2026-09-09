import * as LocalCopcAdapter from '@frillab/copc-adapter-local';
import * as PublishedCopcAdapter from '@frillab/copc-adapter';
import type {
  CopcCesiumLayer,
  CopcCesiumLayerOptions,
  CopcCesiumLayerSnapshot,
} from '@frillab/copc-adapter';
import type { AdapterTrack } from './types';

export type CopcAdapterLayer = Pick<
  CopcCesiumLayer,
  'attachTo' | 'destroy' | 'getSnapshot' | 'load'
>;

export type CopcAdapterModule = {
  CopcCesiumLayer: new (options: CopcCesiumLayerOptions) => CopcAdapterLayer;
};

export type { CopcCesiumLayerSnapshot };

export const COPC_ADAPTERS: Record<AdapterTrack, CopcAdapterModule> = {
  published: PublishedCopcAdapter,
  local: LocalCopcAdapter,
};
