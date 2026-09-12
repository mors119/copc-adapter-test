import type { HarnessResult, RuntimeScenarioId } from '@copc-test/test-contract';
import type { FixtureCatalog } from '@copc-test/fixture-client';
import type { Page, TestInfo } from '@playwright/test';
import { assertRuntimeScenario } from '@copc-test/harness-core';
import { test, expect } from './fixtures.ts';
import {
  assertBackendIdentity,
  assertBoundedRangeStreaming,
  assertCopcHeader,
  assertSelectedPoint,
  parseCopcHeader,
} from './fixture-contract.ts';

type ProjectMetadata = {
  appId: string;
  origin: string;
  host: 'vite' | 'next' | 'nuxt' | 'sveltekit' | 'astro' | 'angular' | 'webpack' | 'rollup' | 'esbuild' | 'parcel';
  bundler?: string;
  renderer: 'cesium' | 'three' | 'r3f';
  backend: 'copc-js' | 'rust';
  fixtureId: string;
  browser: 'chromium' | 'firefox' | 'webkit';
  packageSource: 'checkout' | 'tarball' | 'npm';
  packageVersion: string;
  appScenarios: RuntimeScenarioId[];
};

const READY_TIMEOUT = Number(process.env.COPC_E2E_READY_TIMEOUT ?? 90_000);
function projectMetadata(testInfo: TestInfo): ProjectMetadata {
  return testInfo.project.metadata as ProjectMetadata;
}

async function result(page: Page): Promise<HarnessResult | null> {
  try {
    return await page.evaluate(() => window.__COPC_TEST__?.getResult() ?? null) as HarnessResult | null;
  } catch {
    return null;
  }
}

async function waitForReady(page: Page): Promise<HarnessResult> {
  await expect.poll(async () => (await result(page))?.status, {
    timeout: READY_TIMEOUT,
    message: 'The consumer did not reach ready through the browser harness contract.',
  }).toBe('ready');
  const current = await result(page);
  if (!current) throw new Error('window.__COPC_TEST__ did not expose a result.');
  return current;
}

async function waitForRenderedPoints(page: Page): Promise<HarnessResult> {
  await waitForReady(page);
  await expect.poll(async () => (await result(page))?.diagnostics.renderedPointCount ?? 0, {
    timeout: READY_TIMEOUT,
    message: 'The adapter became ready but did not publish rendered points.',
  }).toBeGreaterThan(0);
  const current = await result(page);
  if (!current) throw new Error('Missing result after point rendering.');
  return current;
}

function fixturePathForHost(host: ProjectMetadata['host'], fixtureId: string): string {
  const apiHosts: ProjectMetadata['host'][] = ['next', 'nuxt', 'sveltekit', 'astro'];
  return `${apiHosts.includes(host) ? '/api/fixtures' : '/fixtures'}/${fixtureId}`;
}

function fixtureStatsPath(host: ProjectMetadata['host']): string {
  if (host === 'next') return '/api/fixture-control/stats';
  if (['nuxt', 'sveltekit', 'astro'].includes(host)) return '/api/__fixture__/stats';
  return '/__fixture__/stats';
}

function fixtureCatalogPath(host: ProjectMetadata['host']): string {
  return ['next', 'nuxt', 'sveltekit', 'astro'].includes(host)
    ? '/api/fixtures.json'
    : '/fixtures.json';
}

function fixtureResetPath(host: ProjectMetadata['host']): string {
  if (host === 'next') return '/api/fixture-control/reset';
  if (['nuxt', 'sveltekit', 'astro'].includes(host)) return '/api/__fixture__/reset';
  return '/__fixture__/reset';
}

type FixtureStats = {
  bytesServed?: number;
  requestCount?: number;
  failures?: number;
  requestedRanges?: string[];
  requests?: Array<{ fixtureId?: string; status?: number; scenario?: string; range?: string; bytesServed?: number }>;
};

async function fixtureStats(page: Page, host: ProjectMetadata['host']): Promise<FixtureStats> {
  return page.evaluate(async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    return response.json() as Promise<FixtureStats>;
  }, fixtureStatsPath(host));
}

async function fixtureRecord(page: Page, info: ProjectMetadata) {
  const response = await page.request.get(fixtureCatalogPath(info.host));
  if (!response.ok()) throw new Error(`Unable to load fixture catalog (${response.status()}).`);
  const catalog = await response.json() as FixtureCatalog;
  const fixture = catalog.fixtures.find((candidate) => candidate.id === info.fixtureId);
  if (!fixture) throw new Error(`Fixture ${info.fixtureId} is missing from the served catalog.`);
  return fixture;
}

async function fixtureHeader(page: Page, info: ProjectMetadata) {
  const response = await page.request.get(fixturePathForHost(info.host, info.fixtureId), {
    headers: { Range: 'bytes=0-588' },
  });
  if (!response.ok()) throw new Error(`Unable to probe fixture header (${response.status()}).`);
  return parseCopcHeader(new Uint8Array(await response.body()));
}

async function openConsumer(
  page: Page,
  query = '',
  resetHost?: ProjectMetadata['host'],
  info?: ProjectMetadata,
): Promise<void> {
  if (resetHost) {
    const response = await page.request.post(fixtureResetPath(resetHost), {
      headers: info?.origin ? { origin: info.origin } : undefined,
    });
    if (!response.ok()) throw new Error(`Unable to reset fixture stats (${response.status()}).`);
  }
  if (info) {
    const params = new URLSearchParams(query.replace(/^\?/, ''));
    if (!params.has('fixture')) params.set('fixture', fixturePathForHost(info.host, info.fixtureId));
    if (!params.has('backend')) params.set('backend', info.backend);
    if (!params.has('packageSource')) params.set('packageSource', info.packageSource);
    if (!params.has('packageVersion')) params.set('packageVersion', info.packageVersion);
    query = `?${params.toString()}`;
  }
  await page.goto(`/${query}`, { waitUntil: 'domcontentloaded' });
}

async function reloadHarness(page: Page): Promise<void> {
  const hasCommand = await page.evaluate(() => typeof window.__COPC_TEST__?.commands.reload === 'function');
  if (hasCommand) {
    try {
      await page.evaluate(() => window.__COPC_TEST__?.commands.reload?.());
    } catch {
      // A full-page reload destroys the evaluation context by design.
    }
    return;
  }
  await page.getByTestId('harness-reload').click();
}

async function invokeHarnessCommand(
  page: Page,
  name: 'detach' | 'unload' | 'destroy' | 'setColorMode' | 'pick' | 'setView' | 'runApiCoverage' | 'probeSource',
  ...args: unknown[]
): Promise<void> {
  await page.evaluate(({ commandName, commandArgs }) => {
    const command = window.__COPC_TEST__?.commands[commandName] as
      ((...values: unknown[]) => void | Promise<unknown>) | undefined;
    if (!command) throw new Error(`Harness command ${commandName} is not registered.`);
    return command(...commandArgs);
  }, { commandName: name, commandArgs: args });
}

async function movePointerToCanvas(page: Page): Promise<void> {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The consumer did not expose a visible renderer canvas.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function moveCameraForStreaming(page: Page): Promise<void> {
  const hasCommand = await page.evaluate(() => typeof window.__COPC_TEST__?.commands.setView === 'function');
  if (hasCommand) {
    await invokeHarnessCommand(page, 'setView', 'near');
    return;
  }
  await movePointerToCanvas(page);
  await page.mouse.wheel(0, -700);
}

function withFixtureScenario(
  scenario: string,
  info: ProjectMetadata,
  backend: 'copc-js' | 'rust' = info.backend,
): string {
  const params = new URLSearchParams();
  params.set('fixture', `${fixturePathForHost(info.host, info.fixtureId)}?fixtureScenario=${scenario}`);
  params.set('backend', backend);
  return `?${params.toString()}`;
}

const scenarios: Array<{ id: RuntimeScenarioId; run: (page: Page, info: ProjectMetadata) => Promise<void> }> = [
  {
    id: 'metadata-root-hierarchy',
    run: async (page) => {
      const current = await waitForReady(page);
      assertRuntimeScenario('metadata-root-hierarchy', current);
    },
  },
  {
    id: 'attach-to-caller-renderer',
    run: async (page) => {
      const current = await waitForReady(page);
      assertRuntimeScenario('attach-to-caller-renderer', current);
    },
  },
  {
    id: 'initial-point-rendering',
    run: async (page, info) => {
      await openConsumer(page, '', info.host, info);
      const current = await waitForRenderedPoints(page);
      assertRuntimeScenario('initial-point-rendering', current);
      assertBackendIdentity(current, info.backend);
      const fixture = await fixtureRecord(page, info);
      assertCopcHeader(await fixtureHeader(page, info), fixture);
      const stats = await fixtureStats(page, info.host);
      assertBoundedRangeStreaming(stats, fixture);
      if (info.appId === 'angular-cesium') {
        const cesiumWorker = await page.request.get('/cesium/Workers/createTaskProcessorWorker.js');
        expect(cesiumWorker.ok(), 'Angular must serve Cesium worker assets from its build output').toBeTruthy();
      }
    },
  },
  {
    id: 'camera-streaming-update',
    run: async (page) => {
      const before = await waitForRenderedPoints(page);
      await moveCameraForStreaming(page);
      await expect.poll(async () => (await result(page))?.diagnostics.streamingUpdateCount ?? 0, {
        timeout: READY_TIMEOUT,
      }).toBeGreaterThan(before.diagnostics.streamingUpdateCount ?? 0);
      const current = await result(page);
      if (!current) throw new Error('Missing result after camera movement.');
      assertRuntimeScenario('camera-streaming-update', current, { baseline: before });
    },
  },
  {
    id: 'equivalent-view-is-stable',
    run: async (page) => {
      const before = await waitForReady(page);
      await movePointerToCanvas(page);
      await page.mouse.wheel(0, 0);
      await page.waitForTimeout(600);
      const current = await result(page);
      if (!current) throw new Error('Missing result after equivalent view.');
      assertRuntimeScenario('equivalent-view-is-stable', current, {
        baseline: before,
        maxEquivalentViewUpdates: 4,
      });
    },
  },
  {
    id: 'reload-to-ready',
    run: async (page) => {
      const before = await waitForReady(page);
      await reloadHarness(page);
      await expect.poll(async () => (await result(page))?.status, { timeout: READY_TIMEOUT }).toBe('ready');
      const current = await result(page);
      if (!current || current.readyAt === before.readyAt) throw new Error('Reload did not create a new ready lifecycle.');
      assertRuntimeScenario('reload-to-ready', current);
    },
  },
  {
    id: 'detach-preserves-host-resources',
    run: async (page) => {
      await waitForReady(page);
      await invokeHarnessCommand(page, 'detach');
      const current = await result(page);
      if (!current) throw new Error('Missing result after detach.');
      expect(current.diagnostics.attached).toBe(false);
      assertRuntimeScenario('detach-preserves-host-resources', current);
    },
  },
  {
    id: 'unload-releases-point-state',
    run: async (page) => {
      await waitForReady(page);
      await invokeHarnessCommand(page, 'unload');
      const current = await result(page);
      if (!current) throw new Error('Missing result after unload.');
      assertRuntimeScenario('unload-releases-point-state', current);
    },
  },
  {
    id: 'destroy-releases-layer-resources',
    run: async (page) => {
      await waitForReady(page);
      await invokeHarnessCommand(page, 'destroy');
      const current = await result(page);
      if (!current) throw new Error('Missing result after destroy.');
      assertRuntimeScenario('destroy-releases-layer-resources', current);
    },
  },
  {
    id: 'color-mode-change',
    run: async (page) => {
      const before = await waitForReady(page);
      await invokeHarnessCommand(page, 'setColorMode', 'rgb');
      const current = await result(page);
      if (!current) throw new Error('Missing result after color mode change.');
      expect(current.readyAt).toBeGreaterThanOrEqual(before.readyAt ?? 0);
      assertRuntimeScenario('color-mode-change', current);
    },
  },
  {
    id: 'point-picking',
    run: async (page, info) => {
      await waitForRenderedPoints(page);
      await invokeHarnessCommand(page, 'pick', 640, 360);
      const current = await result(page);
      if (!current) throw new Error('Missing result after point picking.');
      assertRuntimeScenario('point-picking', current);
      assertSelectedPoint(current, await fixtureRecord(page, info));
    },
  },
  {
    id: 'diagnostics-observable',
    run: async (page, info) => {
      const current = await waitForReady(page);
      assertRuntimeScenario('diagnostics-observable', current);
      assertBackendIdentity(current, info.backend);
      expect(current.config.appId).toBe(info.appId);
      expect(current.config.renderer).toBe(info.renderer);
      expect(current.config.fixtureUrl).toContain(info.fixtureId);
    },
  },
  {
    id: 'api-lifecycle',
    run: async (page, info) => {
      await openConsumer(page, '?apiCoverage=1', undefined, info);
      await waitForReady(page);
      await invokeHarnessCommand(page, 'runApiCoverage');
      const current = await result(page);
      if (!current) throw new Error('Missing public API coverage result.');
      assertRuntimeScenario('api-lifecycle', current);
      assertRuntimeScenario('public-entrypoints', current);
      assertRuntimeScenario('color-mode-matrix', current);
      assertRuntimeScenario('source-probe', current);
      assertRuntimeScenario('renderer-neutral-streaming', current);
      expect(current.diagnostics.api?.operations['CopcStreamingCore.updateView']?.status).toBe('passed');
    },
  },
  {
    id: 'source-probe',
    run: async (page, info) => {
      await waitForReady(page);
      await invokeHarnessCommand(
        page,
        'probeSource',
        'ignore-range',
        `${fixturePathForHost(info.host, info.fixtureId)}?fixtureScenario=ignore-range`,
      );
      const current = await result(page);
      if (!current) throw new Error('Missing source probe result.');
      const probe = current.diagnostics.api?.probes?.['ignore-range'];
      expect(probe?.reachable).toBe(true);
      expect(probe?.corsReadable).toBe(true);
      expect(probe?.rangeSupported).toBe(false);
    },
  },
  {
    id: 'source-error-is-visible',
    run: async (page, info) => {
      await openConsumer(page, withFixtureScenario('not-found', info), info.host, info);
      await expect.poll(async () => (await result(page))?.status, { timeout: READY_TIMEOUT }).toBe('error');
      const current = await result(page);
      if (!current) throw new Error('Missing source failure result.');
      assertRuntimeScenario('source-error-is-visible', current);
    },
  },
  {
    id: 'rust-failure-is-not-retried',
    run: async (page, info) => {
      await openConsumer(page, withFixtureScenario('not-found', info, 'rust'), info.host, info);
      await expect.poll(async () => (await result(page))?.status, { timeout: READY_TIMEOUT }).toBe('error');
      const current = await result(page);
      if (!current) throw new Error('Missing Rust failure result.');
      assertRuntimeScenario('rust-failure-is-not-retried', current);
      expect(current.diagnostics.backend).toBe('rust');
      expect(current.error?.name).toBe('CopcSourceError');
      expect(current.error?.stage).toBe('source');
      const stats = await fixtureStats(page, info.host);
      const fixtureRequests = stats.requests?.filter((request) => request.fixtureId === info.fixtureId) ?? [];
      // React StrictMode may mount a development consumer twice. Every
      // observed Rust attempt must still be the requested 404; a successful
      // second request would indicate fallback or retry behavior.
      expect(fixtureRequests.length, JSON.stringify(stats)).toBeGreaterThan(0);
      expect(fixtureRequests.length, JSON.stringify(stats)).toBeLessThanOrEqual(2);
      expect(fixtureRequests.every((request) => request.status === 404)).toBe(true);
      expect(fixtureRequests.every((request) => request.range !== undefined)).toBe(true);
    },
  },
];

for (const scenario of scenarios) {
  test(scenario.id, async ({ page }, testInfo) => {
    const info = projectMetadata(testInfo);
    test.skip(!info.appScenarios.includes(scenario.id), `Scenario is not enabled for ${info.appId}.`);
    test.skip(scenario.id === 'rust-failure-is-not-retried' && info.backend !== 'rust', 'Rust failure scenario only runs in the Rust matrix row.');
    const resetsFixtureStats = scenario.id === 'initial-point-rendering'
      || scenario.id === 'source-error-is-visible'
      || scenario.id === 'rust-failure-is-not-retried';
    if (!resetsFixtureStats) await openConsumer(page, '', undefined, info);
    await scenario.run(page, info);
  });
}
