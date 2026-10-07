import type { HarnessRenderer } from '@copc-test/core';
import type { RendererOptions, TestRenderer } from './types';

export type { RendererOptions, RendererStatus, TestRenderer } from './types';

/** Keep renderer libraries out of server evaluation and load each only when selected. */
export async function mountTestRenderer(
  renderer: 'cesium' | 'three',
  container: HTMLElement,
  options: RendererOptions,
): Promise<TestRenderer> {
  if (renderer === 'cesium') {
    const module = await import('./cesium');
    return module.mountCesiumRenderer(container, options);
  }
  const module = await import('./three');
  return module.mountThreeRenderer(container, options);
}

export function isSharedRenderer(renderer: HarnessRenderer): renderer is 'cesium' | 'three' {
  return renderer === 'cesium' || renderer === 'three';
}
