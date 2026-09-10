export const DEFAULT_FIXTURE_PATH = '/samples/sofi.copc.laz';

export type FixtureCategory = 'samples' | 'cesium';

/** Return the last URL path segment for a fixture label in shared UI. */
export function fixtureName(url: string): string {
  return url.split('/').at(-1) || url;
}

/** Keep query/config fixture URLs relative to the current app unless absolute. */
export function resolveFixtureUrl(url: string, baseUrl = ''): string {
  if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('/')) return url;
  return `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
}

export function isFixtureCategory(value: string): value is FixtureCategory {
  return value === 'samples' || value === 'cesium';
}
