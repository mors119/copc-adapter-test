import type {
  CopcSourceKind,
  HarnessRangeValidation,
  HarnessStreamingSettings,
  HarnessView,
} from '@copc-test/core';
import type { CopcSourceProbeResult } from '@frillab/copc-adapter/cesium';

export type RendererStatus = 'loading' | 'ready' | 'error';
export type RendererColorMode =
  | 'rgb'
  | 'elevation'
  | 'intensity'
  | 'classification';
export type PointScreenPosition = { x: number; y: number };
export type RendererOptions = {
  fixtureUrl: string;
  backend: 'copc-js' | 'rust';
  rangeValidation: HarnessRangeValidation;
  sourceKind: CopcSourceKind;
  streaming: HarnessStreamingSettings;
  renderDistance?: number;
  pointSize: number;
  colorMode?: RendererColorMode;
  cesiumIonToken?: string;
  onStatus(status: RendererStatus, error?: string): void;
  onSnapshot(snapshot: unknown): void;
  onAttached(): void;
  onSourceProbe?(probe: CopcSourceProbeResult | undefined): void;
  onPointPicked?(point: unknown, screenPosition?: PointScreenPosition): void;
};

export type TestRenderer = {
  ready: Promise<void>;
  setView(view: Exclude<HarnessView, 'visual'>): Promise<void>;
  setSource?(
    sourceUrl: string,
    sourceKind: CopcSourceKind,
    colorMode?: RendererColorMode,
    pointSize?: number,
  ): Promise<void>;
  setStyle?(mode: RendererColorMode): void;
  setPointSize?(pointSize: number): Promise<void>;
  snapshot(): unknown;
  unload(): void;
  destroy(): void;
};
