import type { CopcSourceKind, HarnessView } from '@copc-test/core';
import type { CopcSourceProbeResult } from '@frillab/copc-adapter/cesium';

export type RendererStatus = 'loading' | 'ready' | 'error';
export type RendererColorMode = 'rgb' | 'elevation' | 'intensity' | 'classification';
export type RendererOptions = {
  fixtureUrl: string;
  backend: 'copc-js' | 'rust';
  sourceKind: CopcSourceKind;
  colorMode?: RendererColorMode;
  onStatus(status: RendererStatus, error?: string): void;
  onSnapshot(snapshot: unknown): void;
  onAttached(): void;
  onSourceProbe?(probe: CopcSourceProbeResult | undefined): void;
  onPointPicked?(point: unknown): void;
};

export type TestRenderer = {
  ready: Promise<void>;
  setView(view: Exclude<HarnessView, 'visual'>): Promise<void>;
  setSource?(sourceUrl: string, sourceKind: CopcSourceKind, colorMode?: RendererColorMode): Promise<void>;
  setStyle?(mode: RendererColorMode): void;
  snapshot(): unknown;
  unload(): void;
  destroy(): void;
};
