import type { HarnessResult, RuntimeScenarioId } from '@copc-test/test-contract';
import type { Page, TestInfo } from '@playwright/test';
import { assertRuntimeScenario } from '@copc-test/harness-core';
import { test, expect } from './fixtures.ts';

type ProjectMetadata = {
  appId: string;
  host: 'vite' | 'next';
  renderer: 'cesium' | 'three' | 'r3f';
  backend: 'copc-js' | 'rust';
  fixtureId: string;
  appScenarios: RuntimeScenarioId[];
};

const READY_TIMEOUT = 30_000;
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

function fixtureStatsPath(host: ProjectMetadata['host']): string {
  return host === 'next' ? '/api/__fixture__/stats' : '/__fixture__/stats';
}

async function fixtureStats(page: Page, host: ProjectMetadata['host']): Promise<{ requestedRanges?: string[] }> {
  return page.evaluate(async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    return response.json() as Promise<{ requestedRanges?: string[] }>;
  }, fixtureStatsPath(host));
}

async function openConsumer(page: Page, query = ''): Promise<void> {
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
  name: 'detach' | 'unload' | 'destroy' | 'setColorMode' | 'pick',
  ...args: unknown[]
): Promise<void> {
  await page.evaluate(({ commandName, commandArgs }) => {
    const command = window.__COPC_TEST__?.commands[commandName] as
      ((...values: unknown[]) => void | Promise<unknown>) | undefined;
    if (!command) throw new Error(`Harness command ${commandName} is not registered.`);
    return command(...commandArgs);
  }, { commandName: name, commandArgs: args });
}

function withFixtureScenario(scenario: string, backend?: 'copc-js' | 'rust'): string {
  const params = new URLSearchParams();
  params.set('fixture', `${fixturePath}?fixtureScenario=${scenario}`);
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
      const current = await waitForRenderedPoints(page);
      assertRuntimeScenario('initial-point-rendering', current);
      const stats = await fixtureStats(page, info.host);
      expect(stats.requestedRanges?.length ?? 0, 'runtime test must observe byte-range streaming').toBeGreaterThan(0);
    },
  },
  {
    id: 'camera-streaming-update',
    run: async (page) => {
      const before = await waitForRenderedPoints(page);
      await page.locator('canvas').first().hover();
      await page.mouse.wheel(0, -700);
      await expect.poll(async () => (await result(page))?.diagnostics.streamingUpdateCount ?? 0, {
        timeout: 10_000,
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
      await page.locator('canvas').first().hover();
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
    id: 'source-error-is-visible',
    run: async (page) => {
      await openConsumer(page, withFixtureScenario('not-found'));
      await expect.poll(async () => (await result(page))?.status, { timeout: READY_TIMEOUT }).toBe('error');
      const current = await result(page);
      if (!current) throw new Error('Missing source failure result.');
      assertRuntimeScenario('source-error-is-visible', current);
    },
  },
  {
    id: 'rust-failure-is-not-retried',
    run: async (page) => {
      await openConsumer(page, withFixtureScenario('not-found', 'rust'));
      await expect.poll(async () => (await result(page))?.status, { timeout: READY_TIMEOUT }).toBe('error');
      const current = await result(page);
      if (!current) throw new Error('Missing Rust failure result.');
      assertRuntimeScenario('rust-failure-is-not-retried', current);
    },
  },
];

for (const scenario of scenarios) {
  test(scenario.id, async ({ page }, testInfo) => {
    const info = projectMetadata(testInfo);
    test.skip(!info.appScenarios.includes(scenario.id), `Scenario is not enabled for ${info.appId}.`);
    await openConsumer(page);
    await scenario.run(page, info);
  });
}
