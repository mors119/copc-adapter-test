import type { HarnessResult } from '@copc-test/test-contract';
import { test } from './fixtures.ts';
import {
  BENCHMARK_SCHEMA_VERSION,
  BENCHMARK_SCENARIOS,
} from '../../tools/benchmark/report.mjs';
import {
  fixtureRecord,
  fixtureStats,
  harnessResult,
  moveCameraForStreaming,
  openConsumer,
  panCanvas,
  projectMetadata,
  resetFixtureStats,
  sampleAnimationFrames,
  type ProjectMetadata,
  waitForRenderedPoints,
  waitForSteadyView,
  waitForStreamingUpdate,
} from './support.ts';

type FixtureRecord = {
  id: string;
  title?: string;
  sizeBytes?: number | null;
  capabilities?: string[];
  rangePolicy?: { maxSingleRequestBytes?: number; maxTotalBytesRatio?: number };
};

type BenchmarkSample = {
  iteration: number;
  status: 'complete' | 'not-applicable';
  observedAt: string;
  timings?: Record<string, number>;
  requests?: {
    fixtureRequestCount: number;
    rangeRequestCount: number;
    bytesServed: number;
    rangeBytesServed: number;
    failedRequestCount: number;
  };
  diagnostics?: Record<string, unknown>;
  responsiveness?: {
    frameCount: number;
    medianFrameMs: number;
    p95FrameMs: number;
    maxFrameMs: number;
  };
  reason?: string;
};

type BenchmarkRecord = {
  identity: Record<string, unknown>;
  scenario: string;
  fixture: FixtureRecord;
  samples: BenchmarkSample[];
};

const REPEAT = Math.max(1, Number(process.env.COPC_BENCHMARK_REPEAT ?? 1));
const CACHE_BUDGET_BYTES = Math.max(1, Number(process.env.COPC_BENCHMARK_CACHE_BYTES ?? 8_388_608));

function now(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => Date.now());
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function diagnosticsForBenchmark(result: HarnessResult): Record<string, unknown> {
  const diagnostics = result.diagnostics;
  return {
    renderedPointCount: diagnostics.renderedPointCount,
    renderedNodeCount: diagnostics.renderedNodeKeys.length,
    selectedNodeCount: diagnostics.selectedNodeKeys.length,
    streamingUpdateCount: diagnostics.streamingUpdateCount,
    cache: diagnostics.cache,
    hierarchy: diagnostics.hierarchy ?? diagnostics.api?.hierarchy,
    performance: diagnostics.performance,
    transition: diagnostics.transition,
    worker: diagnostics.worker,
    backend: diagnostics.backend,
  };
}

function requestMetrics(stats: Awaited<ReturnType<typeof fixtureStats>>, fixtureId: string) {
  const requests = stats.requests?.filter((request) => request.fixtureId === fixtureId) ?? [];
  const ranged = requests.filter((request) => request.range !== undefined);
  const bytesServed = requests.reduce((total, request) => total + (request.bytesServed ?? 0), 0);
  return {
    fixtureRequestCount: requests.length,
    rangeRequestCount: ranged.length,
    bytesServed,
    rangeBytesServed: ranged.reduce((total, request) => total + (request.bytesServed ?? 0), 0),
    failedRequestCount: requests.filter((request) => (request.status ?? 200) >= 400).length,
  };
}

function cacheDelta(before: HarnessResult, after: HarnessResult): Record<string, number> | undefined {
  const beforeCache = before.diagnostics.cache;
  const afterCache = after.diagnostics.cache;
  if (!beforeCache || !afterCache) return undefined;
  const fields = [
    'cacheHitCount',
    'cacheMissCount',
    'evictionCount',
    'bytesEvicted',
  ] as const;
  const result = Object.fromEntries(fields.flatMap((field) => {
    const beforeValue = numeric(beforeCache[field]);
    const afterValue = numeric(afterCache[field]);
    return beforeValue === undefined || afterValue === undefined
      ? []
      : [[field, afterValue - beforeValue]];
  }));
  return Object.keys(result).length > 0 ? result : undefined;
}

function completeSample(
  iteration: number,
  startedAt: number,
  endedAt: number,
  result: HarnessResult,
  stats: Awaited<ReturnType<typeof fixtureStats>>,
  fixtureId: string,
  timings: Record<string, number>,
  responsiveness?: BenchmarkSample['responsiveness'],
  extra: Record<string, unknown> = {},
): BenchmarkSample {
  return {
    iteration,
    status: 'complete',
    observedAt: new Date(endedAt).toISOString(),
    timings: {
      ...timings,
      durationMs: endedAt - startedAt,
    },
    requests: requestMetrics(stats, fixtureId),
    diagnostics: {
      ...diagnosticsForBenchmark(result),
      ...extra,
    },
    ...(responsiveness ? { responsiveness } : {}),
  };
}

async function measureInitial(
  page: import('@playwright/test').Page,
  info: ProjectMetadata,
  fixtureId: string,
  iteration: number,
): Promise<{ sample: BenchmarkSample; result: HarnessResult }> {
  const resultAfterPoints = await waitForRenderedPoints(page);
  const firstRenderedAt = await now(page);
  const startedAt = resultAfterPoints.startedAt ?? firstRenderedAt;
  const readyAt = resultAfterPoints.readyAt ?? firstRenderedAt;
  const steady = await waitForSteadyView(page);
  const endedAt = await now(page);
  const stats = await fixtureStats(page, info.host);
  return {
    sample: completeSample(
      iteration,
      startedAt,
      endedAt,
      steady,
      stats,
      fixtureId,
      {
        loadCompletionMs: Math.max(0, readyAt - startedAt),
        timeToFirstRenderedPointsMs: Math.max(0, firstRenderedAt - startedAt),
        timeToSteadyViewMs: Math.max(0, endedAt - startedAt),
      },
    ),
    result: steady,
  };
}

async function measureTransition(
  page: import('@playwright/test').Page,
  info: ProjectMetadata,
  fixtureId: string,
  iteration: number,
  action: () => Promise<void>,
  actionName: string,
  resetStats = true,
): Promise<{ sample: BenchmarkSample; result: HarnessResult }> {
  if (resetStats) await resetFixtureStats(page, info.host, info);
  const before = await harnessResult(page);
  if (!before) throw new Error(`Missing harness result before ${actionName}.`);
  const startedAt = await now(page);
  const framesPromise = sampleAnimationFrames(page);
  await action();
  const afterUpdate = await waitForStreamingUpdate(page, before.diagnostics.streamingUpdateCount ?? 0);
  const firstUpdateAt = await now(page);
  const steady = await waitForSteadyView(page);
  const endedAt = await now(page);
  const responsiveness = await framesPromise;
  const stats = await fixtureStats(page, info.host);
  return {
    sample: completeSample(
      iteration,
      startedAt,
      endedAt,
      steady,
      stats,
      fixtureId,
      {
        timeToStreamingUpdateMs: Math.max(0, firstUpdateAt - startedAt),
        timeToSteadyStreamingMs: Math.max(0, endedAt - startedAt),
      },
      responsiveness,
      {
        action: actionName,
        cacheDelta: cacheDelta(before, afterUpdate),
      },
    ),
    result: steady,
  };
}

function identity(info: ProjectMetadata, userAgent: string): Record<string, unknown> {
  return {
    appId: info.appId,
    host: info.host,
    bundler: info.bundler,
    renderer: info.renderer,
    backend: info.backend,
    browser: info.browser,
    userAgent,
    fixtureId: info.fixtureId,
    packageSource: info.packageSource,
    packageVersion: info.packageVersion,
  };
}

function notApplicableSample(iteration: number, reason: string): BenchmarkSample {
  return {
    iteration,
    status: 'not-applicable',
    observedAt: new Date().toISOString(),
    reason,
  };
}

test.describe.configure({ mode: 'serial' });

test('records external streaming performance scenarios', async ({ page }, testInfo) => {
  const info = projectMetadata(testInfo);
  let userAgent = 'unknown';
  let fixture: FixtureRecord | undefined;
  const records = new Map<string, BenchmarkRecord>();
  const add = (scenario: string, sample: BenchmarkSample): void => {
    if (!fixture) throw new Error('Fixture metadata was not loaded before recording a benchmark sample.');
    const current = records.get(scenario) ?? {
      identity: identity(info, userAgent),
      scenario,
      fixture,
      samples: [],
    };
    current.samples.push(sample);
    records.set(scenario, current);
  };

  for (let iteration = 1; iteration <= REPEAT; iteration += 1) {
    await openConsumer(page, '', info.host, info);
    if (!fixture) {
      userAgent = await page.evaluate(() => navigator.userAgent).catch(() => 'unknown');
      fixture = await fixtureRecord(page, info) as FixtureRecord;
    }
    const initial = await measureInitial(page, info, fixture.id, iteration);
    add('initial-load', initial.sample);

    const zoom = await measureTransition(
      page,
      info,
      fixture.id,
      iteration,
      () => moveCameraForStreaming(page),
      'zoom-refine',
    );
    add('zoom-refine', zoom.sample);

    const pan = await measureTransition(
      page,
      info,
      fixture.id,
      iteration,
      () => panCanvas(page, 1),
      'pan-new-region',
    );
    add('pan-new-region', pan.sample);

    const returned = await measureTransition(
      page,
      info,
      fixture.id,
      iteration,
      () => panCanvas(page, -1),
      'return-to-previous-region',
    );
    add('return-to-previous-region', returned.sample);

    await openConsumer(page, `?benchmarkCacheBudgetBytes=${CACHE_BUDGET_BYTES}`, info.host, info);
    const constrainedInitial = await measureInitial(page, info, fixture.id, iteration);
    const actualBudget = constrainedInitial.result.diagnostics.cache?.cacheBudgetBytes;
    if (actualBudget !== CACHE_BUDGET_BYTES) {
      add('constrained-cache-eviction', notApplicableSample(
        iteration,
        `consumer did not expose the requested public cache budget (${CACHE_BUDGET_BYTES} bytes)`,
      ));
    } else {
      const constrainedZoom = await measureTransition(
        page,
        info,
        fixture.id,
        iteration,
        () => moveCameraForStreaming(page),
        'constrained-cache-eviction',
        false,
      );
      const constrainedPan = await measureTransition(
        page,
        info,
        fixture.id,
        iteration,
        () => panCanvas(page, 1),
        'constrained-cache-eviction',
        false,
      );
      add('constrained-cache-eviction', {
        ...constrainedPan.sample,
        timings: {
          ...constrainedInitial.sample.timings,
          ...constrainedZoom.sample.timings,
          ...constrainedPan.sample.timings,
        },
        diagnostics: {
          ...constrainedInitial.sample.diagnostics,
          ...constrainedZoom.sample.diagnostics,
          ...constrainedPan.sample.diagnostics,
          cacheBudgetBytes: actualBudget,
        },
      });
    }

    const isLargeFixture = fixture.capabilities?.includes('large-streaming') === true;
    if (!isLargeFixture) {
      add('large-fixture', notApplicableSample(iteration, `${fixture.id} is not marked large-streaming`));
    } else {
      await openConsumer(page, '', info.host, info);
      const largeInitial = await measureInitial(page, info, fixture.id, iteration);
      const largeZoom = await measureTransition(
        page,
        info,
        fixture.id,
        iteration,
        () => moveCameraForStreaming(page),
        'large-fixture',
      );
      add('large-fixture', {
        ...largeZoom.sample,
        timings: {
          ...largeInitial.sample.timings,
          ...largeZoom.sample.timings,
        },
        diagnostics: largeZoom.sample.diagnostics,
      });
    }
  }

  await testInfo.attach('benchmark.json', {
    body: JSON.stringify({
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      scenarios: BENCHMARK_SCENARIOS,
      results: [...records.values()],
    }, null, 2),
    contentType: 'application/json',
  });
});
