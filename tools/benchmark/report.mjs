export const BENCHMARK_SCHEMA_VERSION = 1;
export const BENCHMARK_KIND = 'copc-adapter-performance';

export const BENCHMARK_SCENARIOS = [
  'initial-load',
  'zoom-refine',
  'pan-new-region',
  'return-to-previous-region',
  'constrained-cache-eviction',
  'large-fixture',
];

const METRICS = [
  ['timings.loadCompletionMs', 'time to load() completion', 'lower'],
  ['timings.timeToFirstRenderedPointsMs', 'time to first rendered points', 'lower'],
  ['timings.timeToSteadyViewMs', 'time to steady representative view', 'lower'],
  ['timings.timeToStreamingUpdateMs', 'time to streaming update', 'lower'],
  ['timings.timeToSteadyStreamingMs', 'time to steady streaming view', 'lower'],
  ['requests.fixtureRequestCount', 'fixture request count', 'lower'],
  ['requests.rangeRequestCount', 'Range request count', 'lower'],
  ['requests.bytesServed', 'fixture bytes served', 'lower'],
  ['requests.rangeBytesServed', 'Range bytes served', 'lower'],
  ['diagnostics.renderedPointCount', 'rendered point count', 'higher'],
  ['diagnostics.renderedNodeCount', 'rendered node count', 'higher'],
  ['diagnostics.hierarchy.requestCount', 'hierarchy network request count', 'lower'],
  ['diagnostics.hierarchy.cacheHitCount', 'hierarchy cache hit count', 'higher'],
  ['diagnostics.hierarchy.cacheMissCount', 'hierarchy cache miss count', 'lower'],
  ['diagnostics.hierarchy.bytesFetched', 'hierarchy bytes fetched', 'lower'],
  ['diagnostics.cache.cacheBytes', 'decoded CPU point-cache bytes', 'lower'],
  ['diagnostics.cache.cacheHitCount', 'point-cache hit count', 'higher'],
  ['diagnostics.cache.cacheMissCount', 'point-cache miss count', 'lower'],
  ['diagnostics.cache.evictionCount', 'point-cache eviction count', 'lower'],
  ['diagnostics.cache.bytesEvicted', 'point-cache bytes evicted', 'lower'],
  ['diagnostics.performance.rangeFetchBytes', 'public performance Range bytes', 'lower'],
  ['diagnostics.performance.decodeDurationMs', 'public decode duration', 'lower'],
  ['diagnostics.performance.longestMainThreadBlockingSectionMs', 'longest public main-thread blocking section', 'lower'],
  ['responsiveness.maxFrameMs', 'maximum observed animation-frame gap', 'lower'],
];

function valueAt(object, path) {
  return path.split('.').reduce((value, key) => (
    value && typeof value === 'object' ? value[key] : undefined
  ), object);
}

function finiteValues(records, path) {
  return records
    .map((record) => valueAt(record, path))
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
}

export function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return undefined;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

export function metricDefinitions() {
  return METRICS.map(([path, label, direction]) => ({ path, label, direction }));
}

export function benchmarkKey(record) {
  const identity = record.identity ?? record;
  return [
    identity.appId,
    identity.renderer,
    identity.backend,
    identity.browser,
    identity.fixtureId,
    record.scenario,
  ].join('|');
}

export function summarizeRecord(record) {
  const samples = (record.samples ?? []).filter((sample) => sample.status !== 'not-applicable');
  const metrics = Object.fromEntries(METRICS.flatMap(([path]) => {
    const values = finiteValues(samples, path);
    const value = median(values);
    return value === undefined ? [] : [[path, value]];
  }));
  return {
    key: benchmarkKey(record),
    sampleCount: samples.length,
    metrics,
  };
}

function comparableSummaries(report) {
  const summaries = new Map();
  for (const record of report?.results ?? []) {
    const summary = summarizeRecord(record);
    if (summary.sampleCount > 0) summaries.set(summary.key, summary);
  }
  return summaries;
}

function change(baseline, current, direction) {
  if (baseline === undefined || current === undefined) return undefined;
  const delta = current - baseline;
  const deltaPercent = baseline === 0 ? undefined : (delta / Math.abs(baseline)) * 100;
  const improved = direction === 'lower' ? delta < 0 : delta > 0;
  const regressed = direction === 'lower' ? delta > 0 : delta < 0;
  return {
    baseline,
    current,
    delta,
    ...(deltaPercent === undefined ? { deltaPercent: null } : { deltaPercent }),
    classification: regressed ? 'regression' : improved ? 'improvement' : 'unchanged',
  };
}

/**
 * Compare median measurements. Timing and public performance fields are always
 * informational; only repeatable, large request/point-count changes can be
 * promoted to a hard regression by the caller.
 */
export function compareReports(currentReport, baselineReport, options = {}) {
  const current = comparableSummaries(currentReport);
  const baseline = comparableSummaries(baselineReport);
  const minSamples = options.minSamples ?? 2;
  const thresholds = {
    'requests.fixtureRequestCount': 1,
    'requests.rangeRequestCount': 1,
    'requests.bytesServed': 0.5,
    'requests.rangeBytesServed': 0.5,
    'diagnostics.hierarchy.requestCount': 1,
    'diagnostics.hierarchy.bytesFetched': 0.5,
    'diagnostics.renderedPointCount': 0.5,
    ...(options.thresholds ?? {}),
  };
  const comparisons = [];
  const hardRegressions = [];

  for (const [key, currentSummary] of current) {
    const baselineSummary = baseline.get(key);
    if (!baselineSummary) {
      comparisons.push({ key, status: 'new', current: currentSummary });
      continue;
    }
    const metrics = {};
    for (const [path, label, direction] of METRICS) {
      const metricChange = change(baselineSummary.metrics[path], currentSummary.metrics[path], direction);
      if (!metricChange) continue;
      const threshold = thresholds[path];
      const repeatable = currentSummary.sampleCount >= minSamples && baselineSummary.sampleCount >= minSamples;
      const magnitude = baselineSummary.metrics[path] === 0
        ? (currentSummary.metrics[path] === 0 ? 0 : Infinity)
        : Math.abs(metricChange.deltaPercent ?? 0) / 100;
      const hard = repeatable && metricChange.classification === 'regression'
        && threshold !== undefined && magnitude >= threshold;
      metrics[path] = {
        label,
        ...metricChange,
        significance: hard ? 'hard-regression' : 'informational',
        ...(threshold === undefined ? {} : { threshold, repeatable }),
      };
      if (hard) hardRegressions.push({ key, path, label, ...metricChange, threshold });
    }
    comparisons.push({
      key,
      status: 'matched',
      sampleCount: { baseline: baselineSummary.sampleCount, current: currentSummary.sampleCount },
      metrics,
    });
  }

  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    baselineGeneratedAt: baselineReport?.generatedAt,
    currentGeneratedAt: currentReport?.generatedAt,
    comparisons,
    hardRegressions,
  };
}

export function formatComparison(comparison) {
  const lines = [];
  lines.push(`Compared ${comparison.comparisons.length} benchmark keys.`);
  if (comparison.hardRegressions.length === 0) {
    lines.push('No repeatable hard regressions detected. Timing changes remain informational.');
  } else {
    lines.push(`${comparison.hardRegressions.length} hard regression(s) detected:`);
    for (const regression of comparison.hardRegressions) {
      const percent = typeof regression.deltaPercent !== 'number' ? 'n/a' : `${regression.deltaPercent.toFixed(1)}%`;
      lines.push(`- ${regression.key}: ${regression.label} ${percent} (threshold ${regression.threshold * 100}%)`);
    }
  }
  return lines.join('\n');
}
