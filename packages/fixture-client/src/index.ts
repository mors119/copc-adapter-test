export const DEFAULT_FIXTURE_ID = 'small-valid-copc';
export const FIXTURE_CATALOG_PATH = '/fixtures.json';
export const FIXTURE_ROUTE_PREFIX = '/fixtures';
export const DEFAULT_FIXTURE_PATH = `${FIXTURE_ROUTE_PREFIX}/${DEFAULT_FIXTURE_ID}`;

export type FixtureCategory = 'fixtures' | 'samples' | 'cesium';

export type FixtureChecksum = {
  algorithm: 'sha256';
  value: string | null;
};

export type FixtureCatalogEntry = {
  id: string;
  title: string;
  filename: string;
  capabilities: string[];
  source: {
    url: string;
    provenance: string;
    license: string;
  };
  checksum: FixtureChecksum;
  cachePath: string;
};

export type FixtureCatalog = {
  version: number;
  defaultFixtureId: string;
  fixtures: FixtureCatalogEntry[];
};

/** Build the URL consumed by an app for a catalog fixture ID. */
export function fixtureUrlForId(id: string, baseUrl = ''): string {
  return `${baseUrl.replace(/\/$/, '')}${FIXTURE_ROUTE_PREFIX}/${encodeURIComponent(id)}`;
}

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
  return value === 'fixtures' || value === 'samples' || value === 'cesium';
}
