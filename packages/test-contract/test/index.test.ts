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
  assert.equal(contract.result.diagnostics.backend, 'copc-js');

  contract.markLoading();
  contract.setSnapshot({ lifecycle: 'loading', renderedNodeKeys: [], selectedNodeKeys: [] });
  assert.equal(contract.getResult().status, 'loading');
  assert.equal(contract.getResult().diagnostics.renderedNodeKeys.length, 0);

  contract.setConfig({ backend: 'rust', packageSource: 'tarball' });
  assert.equal(contract.result.config.backend, 'rust');
  assert.equal(contract.result.config.packageSource, 'tarball');
  assert.equal(contract.result.diagnostics.backend, 'rust');

  contract.markError(new Error('fixture unavailable'));
  assert.equal(contract.result.status, 'error');
  assert.equal(contract.result.lifecycle, 'error');
  assert.equal(contract.result.error?.message, 'fixture unavailable');

  contract.markDestroyed();
  assert.equal(contract.result.status, 'destroyed');
  assert.equal(contract.result.lifecycle, 'destroyed');
});

test('preserves backend error stage and code for external failure assertions', () => {
  const contract = createTestContract(config);
  const error = Object.assign(new Error('Rust backend rejected the source'), {
    name: 'CopcBackendError',
    stage: 'metadata',
    code: 'unsupported',
  });
  contract.markError(error);
  assert.deepEqual(contract.result.error, {
    name: 'CopcBackendError',
    message: 'Rust backend rejected the source',
    stack: error.stack,
    stage: 'metadata',
    code: 'unsupported',
  });

  contract.markError(error.message);
  assert.equal(contract.result.error?.name, 'CopcBackendError');
  assert.equal(contract.result.error?.stage, 'metadata');
});

test('normalizes optional picking and cache diagnostics without exposing decoder internals', () => {
  assert.deepEqual(normalizeSnapshot({
    lifecycle: 'ready',
    selectedPoint: {
      index: 4,
      nodeKey: '0/0-0-0-0',
      position: [1, 2, 3],
      attributes: { classification: 2, label: 'ground' },
    },
    pointCache: {
      cachedNodeCount: 2,
      currentCacheBytes: 4096,
      cacheByteBudget: 8192,
      evictionCount: 3,
      bytesEvicted: 2048,
    },
  }), {
    backend: undefined,
    lifecycle: 'ready',
    datasetUrl: undefined,
    attached: undefined,
    selectedNodeKeys: [],
    renderedNodeKeys: [],
    renderedPointCount: undefined,
    streamingUpdateCount: undefined,
    metadataLoaded: true,
    hierarchyLoaded: true,
    selectedPoint: {
      index: 4,
      nodeKey: '0/0-0-0-0',
      position: [1, 2, 3],
      attributes: { classification: 2, label: 'ground' },
    },
    cache: {
      loadedNodeCount: 2,
      cacheBytes: 4096,
      cacheBudgetBytes: 8192,
      evictionCount: 3,
      bytesEvicted: 2048,
    },
  });
});

test('preserves public streaming performance, transition, and worker diagnostics', () => {
  assert.deepEqual(normalizeSnapshot({
    lifecycle: 'ready',
    performance: {
      updateDurationMs: 12.5,
      rangeFetchBytes: 4096,
      decodeDurationMs: 3.25,
      longestMainThreadBlockingSectionMs: 1.75,
      minimumFrontierExceedsPointBudget: false,
      visibleLevelRange: { min: 0, max: 4 },
      cameraDirection: [0, 1, 0],
      privateDecoderCounter: 99,
    },
    transition: {
      activeReplacementGroupCount: 0,
      staleReplacementCancellationCount: 2,
    },
    worker: {
      workerCount: 2,
      activeCount: 1,
      queuedCount: 0,
      completedCount: 5,
    },
  }).performance, {
    updateDurationMs: 12.5,
    rangeFetchBytes: 4096,
    decodeDurationMs: 3.25,
    longestMainThreadBlockingSectionMs: 1.75,
    minimumFrontierExceedsPointBudget: false,
    visibleLevelRange: { min: 0, max: 4 },
    cameraDirection: [0, 1, 0],
  });
  assert.deepEqual(normalizeSnapshot({
    transition: { activeReplacementGroupCount: 0, staleReplacementCancellationCount: 2 },
    worker: { workerCount: 2, activeCount: 1, queuedCount: 0, completedCount: 5 },
  }).transition, {
    activeReplacementGroupCount: 0,
    staleReplacementCancellationCount: 2,
  });
  assert.deepEqual(normalizeSnapshot({
    transition: { activeReplacementGroupCount: 0 },
    worker: { workerCount: 2, activeCount: 1, queuedCount: 0, completedCount: 5 },
  }).worker, {
    workerCount: 2,
    activeCount: 1,
    queuedCount: 0,
    completedCount: 5,
  });
});

test('normalizes hierarchy request and cache counters without deriving false negatives', () => {
  assert.deepEqual(normalizeSnapshot({
    hierarchy: {
      requestCount: 1,
      cacheHitCount: 5,
      cacheMissCount: 1,
      bytesFetched: 1024,
      loadedPageCount: 1,
      loadedEntryCount: 8,
    },
  }).hierarchy, {
    requestCount: 1,
    cacheHitCount: 5,
    cacheMissCount: 1,
    bytesFetched: 1024,
    loadedPageCount: 1,
    loadedEntryCount: 8,
  });
});

test('keeps registered browser commands outside the serializable result', async () => {
  const contract = createTestContract(config);
  let invoked = false;
  contract.registerCommand('reload', () => { invoked = true; });

  assert.deepEqual(contract.getCapabilities(), ['reload']);
  await contract.commands.reload?.();
  assert.equal(invoked, true);

  contract.unregisterCommand('reload');
  assert.deepEqual(contract.getCapabilities(), []);
});

test('preserves explicit public API and source-probe diagnostics across snapshots', () => {
  const contract = createTestContract(config);
  contract.setApiDiagnostics({
    entrypoints: ['@frillab/copc-adapter/three'],
    operations: { load: { status: 'passed' } },
    probes: {
      default: {
        reachable: true,
        rangeSupported: true,
        corsReadable: true,
        copcDetected: true,
        warnings: [],
      },
    },
  });
  contract.setSnapshot({ lifecycle: 'ready', renderedPointCount: 12 });

  assert.deepEqual(contract.result.diagnostics.api, {
    entrypoints: ['@frillab/copc-adapter/three'],
    operations: { load: { status: 'passed' } },
    probes: {
      default: {
        reachable: true,
        rangeSupported: true,
        corsReadable: true,
        copcDetected: true,
        warnings: [],
      },
    },
  });
});
