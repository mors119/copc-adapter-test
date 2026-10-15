import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SOURCE_SELECTION,
  REMOTE_COPC_SOURCES,
  resolveCopcSourceSelection,
  sourceSelectionFromSearch,
} from '../src/sources.ts';

test('remote COPC defaults and shared catalog contain browser-ready source metadata', () => {
  assert.equal(DEFAULT_SOURCE_SELECTION, 'remote:autzen');
  assert.deepEqual(
    REMOTE_COPC_SOURCES.map(({ id }) => id),
    ['autzen', 'chicago-downtown'],
  );
  for (const source of REMOTE_COPC_SOURCES) {
    assert.equal(new URL(source.url).protocol, 'https:');
    assert.equal(source.expectedCapabilities.range, true);
    assert.ok(!('checksum' in source));
    assert.ok(!('localPath' in source));
  }
  assert.equal(REMOTE_COPC_SOURCES[1]?.expectedCapabilities.rgb, false);
});

test('source selection keeps remote choices, custom URLs, and fixture overrides distinct', () => {
  assert.equal(
    resolveCopcSourceSelection(DEFAULT_SOURCE_SELECTION).kind,
    'remote',
  );
  assert.equal(
    resolveCopcSourceSelection('remote:chicago-downtown').url,
    REMOTE_COPC_SOURCES[1]?.url,
  );
  assert.equal(
    resolveCopcSourceSelection('small-valid-copc').kind,
    'local-fixture',
  );
  assert.equal(
    resolveCopcSourceSelection('custom:https://example.test/scan.copc.laz')
      .kind,
    'custom-remote',
  );
  assert.throws(
    () => resolveCopcSourceSelection('custom:file:///tmp/scan.copc.laz'),
    /HTTP or HTTPS/u,
  );
  assert.equal(
    sourceSelectionFromSearch(new URLSearchParams()),
    DEFAULT_SOURCE_SELECTION,
  );
  assert.equal(
    sourceSelectionFromSearch(new URLSearchParams('sourceId=chicago-downtown')),
    'remote:chicago-downtown',
  );
  assert.equal(
    sourceSelectionFromSearch(
      new URLSearchParams('fixtureId=small-valid-copc'),
    ),
    'small-valid-copc',
  );
  assert.equal(
    sourceSelectionFromSearch(
      new URLSearchParams({
        fixtureId: 'custom:https://example.test/scan.copc.laz',
      }),
    ),
    'custom:https://example.test/scan.copc.laz',
  );
});
