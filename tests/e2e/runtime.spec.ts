import type { HarnessResult, RuntimeScenarioId } from '@copc-test/test-contract';
import type { Page, TestInfo } from '@playwright/test';
import { assertRuntimeScenario } from '@copc-test/harness-core';
import { test, expect } from './fixtures.ts';

type ProjectMetadata = {
  appId: string;
  host: 'vite' | 'next' | 'angular';
  renderer: 'cesium' | 'three' | 'r3f';
  backend: 'copc-js' | 'rust';
  fixtureId: string;
  appScenarios: RuntimeScenarioId[];
};

const READY_TIMEOUT = Number(process.env.COPC_E2E_READY_TIMEOUT ?? 90_000);
const fixturePath = '/fixtures/small-valid-copc';

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

function fixturePathForHost(host: ProjectMetadata['host']): string {
  return host === 'next' ? '/api/fixtures/small-valid-copc' : fixturePath;
}

function fixtureStatsPath(host: ProjectMetadata['host']): string {
  return host === 'next' ? '/api/__fixture__/stats' : '/__fixture__/stats';
}

function fixtureResetPath(host: ProjectMetadata['host']): string {
  return host === 'next' ? '/api/__fixture__/reset' : '/__fixture__/reset';
}

type FixtureStats = {
  requestCount?: number;
  failures?: number;
  requestedRanges?: string[];
  requests?: Array<{ fixtureId?: string; status?: number; scenario?: string; range?: string }>;
};

async function fixtureStats(page: Page, host: ProjectMetadata['host']): Promise<FixtureStats> {
  return page.evaluate(async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    return response.json() as Promise<FixtureStats>;
  }, fixtureStatsPath(host));
}

async function openConsumer(
  page: Page,
  query = '',
  resetHost?: ProjectMetadata['host'],
): Promise<void> {
  if (resetHost) {
    const response = await page.request.post(fixtureResetPath(resetHost));
    if (!response.ok()) throw new Error(`Unable to reset fixture stats (${response.status()}).`);
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
  host: ProjectMetadata['host'],
  backend?: 'copc-js' | 'rust',
): string {
  const params = new URLSearchParams();
  params.set('fixture', `${fixturePathForHost(host)}?fixtureScenario=${scenario}`);
  if (backend) params.set('backend', backend);
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
      await openConsumer(page, '', info.host);
      const current = await waitForRenderedPoints(page);
      assertRuntimeScenario('initial-point-rendering', current);
      const stats = await fixtureStats(page, info.host);
      expect(stats.requestedRanges?.length ?? 0, 'runtime test must observe byte-range streaming').toBeGreaterThan(0);
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
    run: async (page) => {
      await waitForRenderedPoints(page);
      await invokeHarnessCommand(page, 'pick', 640, 360);
      const current = await result(page);
      if (!current) throw new Error('Missing result after point picking.');
      assertRuntimeScenario('point-picking', current);
    },
  },
  {
    id: 'diagnostics-observable',
    run: async (page, info) => {
      const current = await waitForReady(page);
      assertRuntimeScenario('diagnostics-observable', current);
      expect(current.config.appId).toBe(info.appId);
      expect(current.config.renderer).toBe(info.renderer);
      expect(current.config.fixtureUrl).toContain(info.fixtureId);
    },
  },
  {
    id: 'api-lifecycle',
    run: async (page) => {
      await openConsumer(page, '?apiCoverage=1');
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
        `${fixturePathForHost(info.host)}?fixtureScenario=ignore-range`,
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
      await openConsumer(page, withFixtureScenario('not-found', info.host), info.host);
      await expect.poll(async () => (await result(page))?.status, { timeout: READY_TIMEOUT }).toBe('error');
      const current = await result(page);
      if (!current) throw new Error('Missing source failure result.');
      assertRuntimeScenario('source-error-is-visible', current);
    },
  },
  {
    id: 'rust-failure-is-not-retried',
    run: async (page, info) => {
      await openConsumer(page, withFixtureScenario('not-found', info.host, 'rust'), info.host);
      await expect.poll(async () => (await result(page))?.status, { timeout: READY_TIMEOUT }).toBe('error');
      const current = await result(page);
      if (!current) throw new Error('Missing Rust failure result.');
      assertRuntimeScenario('rust-failure-is-not-retried', current);
      expect(current.diagnostics.backend).toBe('rust');
      const stats = await fixtureStats(page, info.host);
      const fixtureRequests = stats.requests?.filter((request) => request.fixtureId === info.fixtureId) ?? [];
      expect(fixtureRequests.length, JSON.stringify(stats)).toBe(1);
      expect(fixtureRequests[0]?.status).toBe(404);
      expect(fixtureRequests[0]?.range).toBeDefined();
    },
  },
];

for (const scenario of scenarios) {
  test(scenario.id, async ({ page }, testInfo) => {
    const info = projectMetadata(testInfo);
    test.skip(!info.appScenarios.includes(scenario.id), `Scenario is not enabled for ${info.appId}.`);
    const resetsFixtureStats = scenario.id === 'initial-point-rendering'
      || scenario.id === 'source-error-is-visible'
      || scenario.id === 'rust-failure-is-not-retried';
    if (!resetsFixtureStats) await openConsumer(page);
    await scenario.run(page, info);
  });
}
