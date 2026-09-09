import type {
  CopcColorMode,
  CopcCesiumLayerSnapshot,
} from '@frillab/copc-adapter';

export type CopcBackendName = 'copc-js' | 'rust';

export type DemoMode = 'streaming' | 'static';

export type AdapterTrack = 'published' | 'local';

export type LayerSettings = {
  colorMode: CopcColorMode;
  backend: CopcBackendName;
  pointSize: number;
  maxNodes: number;
  maxDepth: number;
  maxScreenSpaceError: number;
  maxRenderDistanceMeters: number;
};

export type AppSettings = LayerSettings & {
  adapterTrack: AdapterTrack;
  sampleUrl: string;
  demoMode: DemoMode;
  autoplay: boolean;
};

export type LayerStatus = 'idle' | 'loading' | 'ready' | 'error';

export type LayerState = {
  status: LayerStatus;
  message?: string;
  snapshot?: CopcCesiumLayerSnapshot;
};

export const DEFAULT_SETTINGS: AppSettings = {
  adapterTrack: 'published',
  sampleUrl: '',
  colorMode: 'elevation',
  backend: 'rust',
  pointSize: 2,
  maxNodes: 4,
  maxDepth: 4,
  maxScreenSpaceError: 8,
  maxRenderDistanceMeters: 20_000,
  demoMode: 'streaming',
  autoplay: false,
};
