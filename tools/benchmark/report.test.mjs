import assert from 'node:assert/strict';
import test from 'node:test';
import {
  benchmarkKey,
  compareReports,
  median,
  percentile,
  summarizeRecord,
} from './report.mjs';

function record(overrides = {}) {
  return {
    identity: {
      appId: 'vite-react-three',
      renderer: 'three',
      backend: 'copc-js',
      browser: 'chromium',
      fixtureId: 'small-valid-copc',
    },
    scenario: 'initial-load',
    samples: [
      {
        status: 'complete',
        timings: { loadCompletionMs: 100, timeToFirstRenderedPointsMs: 140 },
        requests: { fixtureRequestCount: 3, rangeRequestCount: 3, bytesServed: 900, rangeBytesServed: 900 },
        diagnostics: { renderedPointCount: 1000 },
      },
      {
        status: 'complete',
        timings: { loadCompletionMs: 120, timeToFirstRenderedPointsMs: 150 },
        requests: { fixtureRequestCount: 3, rangeRequestCount: 3, bytesServed: 1000, rangeBytesServed: 1000 },
        diagnostics: { renderedPointCount: 1100 },
      },
    ],
    ...overrides,
  };
}

test('summarizes repeated measurements by median and keeps stable identity keys', () => {
  const value = record();
  assert.equal(benchmarkKey(value), 'vite-react-three|three|copc-js|chromium|small-valid-copc|initial-load');
  assert.equal(median([100, 120]), 110);
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
  assert.deepEqual(summarizeRecord(value).metrics, {
    'timings.loadCompletionMs': 110,
    'timings.timeToFirstRenderedPointsMs': 145,
    'requests.fixtureRequestCount': 3,
    'requests.rangeRequestCount': 3,
    'requests.bytesServed': 950,
    'requests.rangeBytesServed': 950,
    'diagnostics.renderedPointCount': 1050,
  });
});

test('does not promote noisy timing changes but detects repeatable request amplification', () => {
  const baseline = { generatedAt: '2026-01-01T00:00:00.000Z', results: [record()] };
  const current = {
    generatedAt: '2026-01-02T00:00:00.000Z',
    results: [record({ samples: [
      {
        status: 'complete',
        timings: { loadCompletionMs: 150, timeToFirstRenderedPointsMs: 140 },
        requests: { fixtureRequestCount: 7, rangeRequestCount: 7, bytesServed: 1500, rangeBytesServed: 1500 },
        diagnostics: { renderedPointCount: 1000 },
      },
      {
        status: 'complete',
        timings: { loadCompletionMs: 160, timeToFirstRenderedPointsMs: 160 },
        requests: { fixtureRequestCount: 7, rangeRequestCount: 7, bytesServed: 1600, rangeBytesServed: 1600 },
        diagnostics: { renderedPointCount: 1000 },
      },
    ] })],
  };
  const comparison = compareReports(current, baseline);
  const metrics = comparison.comparisons[0].metrics;
  assert.equal(metrics['timings.loadCompletionMs'].significance, 'informational');
  assert.equal(metrics['requests.fixtureRequestCount'].significance, 'hard-regression');
  assert.equal(comparison.hardRegressions.length, 4);
  assert.equal(comparison.hardRegressions[0].path, 'requests.fixtureRequestCount');
});

test('ignores not-applicable scenario samples when comparing profiles', () => {
  const report = { results: [record({ samples: [{ status: 'not-applicable', reason: 'small fixture' }] })] };
  assert.deepEqual(summarizeRecord(report.results[0]).metrics, {});
  assert.equal(compareReports(report, report).comparisons.length, 0);
});
