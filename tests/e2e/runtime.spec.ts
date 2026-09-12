import type { RuntimeScenarioId } from '@copc-test/test-contract';
import type { Page, TestInfo } from '@playwright/test';
import { assertRuntimeScenario } from '@copc-test/harness-core';
import { test, expect } from './fixtures.ts';
import {
  READY_TIMEOUT,
  fixturePathForHost,
  fixtureRecord,
  fixtureStats,
  harnessResult as result,
  invokeHarnessCommand,
  moveCameraForStreaming,
  movePointerToCanvas,
  openConsumer,
  projectMetadata,
  type ProjectMetadata,
  waitForReady,
  waitForRenderedPoints,
} from './support.ts';
import {
  assertBackendIdentity,
  assertBoundedRangeStreaming,
  assertCopcHeader,
  assertSelectedPoint,
  parseCopcHeader,
} from './fixture-contract.ts';

async function fixtureHeader(page: Page, info: ProjectMetadata) {
  const response = await page.request.get(fixturePathForHost(info.host, info.fixtureId), {
    headers: { Range: 'bytes=0-588' },
  });
  if (!response.ok()) throw new Error(`Unable to probe fixture header (${response.status()}).`);
  return parseCopcHeader(new Uint8Array(await response.body()));
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
