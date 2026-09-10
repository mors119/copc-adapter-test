import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTestContract,
  normalizeSnapshot,
  type HarnessConfig,
} from '../src/index.ts';

const config: HarnessConfig = {
  appId: 'test-app',
  host: 'vite',
  renderer: 'three',
  fixtureUrl: '/samples/test.copc.laz',
  backend: 'copc-js',
  scenario: 'load-and-stream',
  packageSource: 'npm',
  packageVersion: '0.3.0',
};

test('normalizes adapter snapshots into the renderer-neutral diagnostics shape', () => {
  assert.deepEqual(normalizeSnapshot({
    lifecycle: 'ready',
    backend: 'copc-js',
    selectedNodeKeys: ['0/0-0-0-0'],
    renderedNodeKeys: ['0/0-0-0-0'],
    renderedPointCount: 42,
    streamingUpdateCount: 3,
    datasetUrl: config.fixtureUrl,
    attached: true,
  }), {
    lifecycle: 'ready',
    backend: 'copc-js',
    datasetUrl: config.fixtureUrl,
    attached: true,
    selectedNodeKeys: ['0/0-0-0-0'],
    renderedNodeKeys: ['0/0-0-0-0'],
    renderedPointCount: 42,
    streamingUpdateCount: 3,
    metadataLoaded: true,
    hierarchyLoaded: true,
  });
});

test('publishes lifecycle, error, and config transitions through one contract', () => {
  const contract = createTestContract(config);
  assert.equal(contract.result.status, 'idle');

  contract.markLoading();
  contract.setSnapshot({ lifecycle: 'loading', renderedNodeKeys: [], selectedNodeKeys: [] });
  assert.equal(contract.getResult().status, 'loading');
  assert.equal(contract.getResult().diagnostics.renderedNodeKeys.length, 0);

  contract.setConfig({ backend: 'rust', packageSource: 'tarball' });
  assert.equal(contract.result.config.backend, 'rust');
  assert.equal(contract.result.config.packageSource, 'tarball');

  contract.markError(new Error('fixture unavailable'));
  assert.equal(contract.result.status, 'error');
  assert.equal(contract.result.lifecycle, 'error');
  assert.equal(contract.result.error?.message, 'fixture unavailable');

  contract.markDestroyed();
  assert.equal(contract.result.status, 'destroyed');
  assert.equal(contract.result.lifecycle, 'destroyed');
});
