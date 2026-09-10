import { FIXTURE_CATALOG_PATH, fixtureUrlForId, type FixtureCatalog } from '@copc-test/fixture-client';

export type CopcSample = {
  id: string;
  name: string;
  path: string;
  url: string;
  capabilities: string[];
};

export async function loadSampleCatalog(baseUrl: string): Promise<CopcSample[]> {
  const response = await fetch(`${baseUrl}${FIXTURE_CATALOG_PATH.slice(1)}`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`샘플 목록을 불러오지 못했습니다. (${response.status})`);
  }

  const manifest = await response.json() as FixtureCatalog;

  if (!Array.isArray(manifest.fixtures)) {
    throw new Error('샘플 목록 형식이 올바르지 않습니다.');
  }

  return manifest.fixtures.map((fixture) => ({
    id: fixture.id,
    name: fixture.title,
    path: fixture.cachePath,
    url: fixtureUrlForId(fixture.id, baseUrl.replace(/\/$/, '')),
    capabilities: fixture.capabilities,
  }));
}
