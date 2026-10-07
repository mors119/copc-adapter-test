import type { HarnessView } from '@copc-test/core';

export type RendererStatus = 'loading' | 'ready' | 'error';
export type RendererOptions = {
  fixtureUrl: string;
  backend: 'copc-js' | 'rust';
  onStatus(status: RendererStatus, error?: string): void;
  onSnapshot(snapshot: unknown): void;
  onAttached(): void;
};

export type TestRenderer = {
  ready: Promise<void>;
  setView(view: Exclude<HarnessView, 'visual'>): Promise<void>;
  snapshot(): unknown;
  unload(): void;
  destroy(): void;
};
