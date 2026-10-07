import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const catalog = JSON.parse(readFileSync(new URL('../../fixtures/catalog.json', import.meta.url), 'utf8'));

test('shared catalog keeps deterministic, RGB, and geographic CRS fixtures available', () => {
  const byId = new Map(catalog.fixtures.map((fixture) => [fixture.id, fixture]));
  const smoke = byId.get('small-valid-copc');
  assert.equal(catalog.defaultFixtureId, 'small-valid-copc');
  assert.ok(smoke.capabilities.includes('valid-copc'));
  assert.ok(smoke.checksum.value);

  const rgb = byId.get('point-format-7-rgb');
  assert.ok(rgb.capabilities.includes('rgb'));

  const geographic = byId.get('geographic-crs');
  assert.equal(geographic.coverage.crsFamily, 'geographic');

  for (const fixture of [smoke, rgb, geographic]) {
    assert.ok(fixture.filename.endsWith('.copc.laz'));
    assert.ok(fixture.cachePath && !fixture.cachePath.startsWith('/'));
  }
});
