import type { HarnessResult } from '@copc-test/test-contract';
import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';

export type ProjectMetadata = {
  appId: string;
  origin: string;
  host: 'vite' | 'next' | 'nuxt' | 'sveltekit' | 'astro' | 'angular' | 'webpack' | 'rollup' | 'esbuild' | 'parcel';
  bundler?: string;
  renderer: 'cesium' | 'three' | 'r3f';
  backend: 'copc-js' | 'rust';
  fixtureId: string;
  browser: 'chromium' | 'firefox' | 'webkit';
  packageSource: 'npm' | 'tarball';
  packageVersion: string;
  appScenarios: string[];
};

export const READY_TIMEOUT = Number(process.env.COPC_E2E_READY_TIMEOUT ?? 90_000);

export function projectMetadata(testInfo: TestInfo): ProjectMetadata {
  return testInfo.project.metadata as ProjectMetadata;
}

export async function harnessResult(page: Page): Promise<HarnessResult | null> {
  try {
    return await page.evaluate(() => window.__COPC_TEST__?.getResult() ?? null) as HarnessResult | null;
  } catch {
    return null;
  }
}

export async function waitForReady(page: Page): Promise<HarnessResult> {
  await expect.poll(async () => (await harnessResult(page))?.status, {
    timeout: READY_TIMEOUT,
    message: 'The consumer did not reach ready through the browser harness contract.',
  }).toBe('ready');
  const current = await harnessResult(page);
  if (!current) throw new Error('window.__COPC_TEST__ did not expose a result.');
  return current;
}

export async function waitForRenderedPoints(page: Page): Promise<HarnessResult> {
  await waitForReady(page);
  await expect.poll(async () => (await harnessResult(page))?.diagnostics.renderedPointCount ?? 0, {
    timeout: READY_TIMEOUT,
    message: 'The adapter became ready but did not publish rendered points.',
  }).toBeGreaterThan(0);
  const current = await harnessResult(page);
  if (!current) throw new Error('Missing result after point rendering.');
  return current;
}

export function fixturePathForHost(host: ProjectMetadata['host'], fixtureId: string): string {
  const apiHosts: ProjectMetadata['host'][] = ['next', 'nuxt', 'sveltekit', 'astro'];
  return `${apiHosts.includes(host) ? '/api/fixtures' : '/fixtures'}/${fixtureId}`;
}

export function fixtureStatsPath(host: ProjectMetadata['host']): string {
  if (host === 'next') return '/api/fixture-control/stats';
  if (['nuxt', 'sveltekit', 'astro'].includes(host)) return '/api/__fixture__/stats';
  return '/__fixture__/stats';
}

export function fixtureCatalogPath(host: ProjectMetadata['host']): string {
  return ['next', 'nuxt', 'sveltekit', 'astro'].includes(host)
    ? '/api/fixtures.json'
    : '/fixtures.json';
}

export function fixtureResetPath(host: ProjectMetadata['host']): string {
  if (host === 'next') return '/api/fixture-control/reset';
  if (['nuxt', 'sveltekit', 'astro'].includes(host)) return '/api/__fixture__/reset';
  return '/__fixture__/reset';
}

export type FixtureStats = {
  bytesServed?: number;
  requestCount?: number;
  failures?: number;
  requestedRanges?: string[];
  requests?: Array<{ fixtureId?: string; status?: number; scenario?: string; range?: string; bytesServed?: number }>;
};

export async function fixtureStats(page: Page, host: ProjectMetadata['host']): Promise<FixtureStats> {
  return page.evaluate(async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    return response.json() as Promise<FixtureStats>;
  }, fixtureStatsPath(host));
}

export async function resetFixtureStats(page: Page, host: ProjectMetadata['host'], info?: ProjectMetadata): Promise<void> {
  const response = await page.request.post(fixtureResetPath(host), {
    headers: info?.origin ? { origin: info.origin } : undefined,
  });
  if (!response.ok()) throw new Error(`Unable to reset fixture stats (${response.status()}).`);
}

export async function fixtureRecord(page: Page, info: ProjectMetadata) {
  const response = await page.request.get(fixtureCatalogPath(info.host));
  if (!response.ok()) throw new Error(`Unable to load fixture catalog (${response.status()}).`);
  const catalog = await response.json() as { fixtures: Array<Record<string, unknown>> };
  const fixture = catalog.fixtures.find((candidate) => candidate.id === info.fixtureId);
  if (!fixture) throw new Error(`Fixture ${info.fixtureId} is missing from the served catalog.`);
  return fixture;
}

export async function openConsumer(
  page: Page,
  query = '',
  resetHost?: ProjectMetadata['host'],
  info?: ProjectMetadata,
): Promise<void> {
  if (resetHost) await resetFixtureStats(page, resetHost, info);
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

export async function invokeHarnessCommand(
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

export async function movePointerToCanvas(page: Page): Promise<void> {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The consumer did not expose a visible renderer canvas.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

export async function moveCameraForStreaming(page: Page): Promise<void> {
  const hasCommand = await page.evaluate(() => typeof window.__COPC_TEST__?.commands.setView === 'function');
  if (hasCommand) {
    await invokeHarnessCommand(page, 'setView', 'near');
    return;
  }
  await movePointerToCanvas(page);
  await page.mouse.wheel(0, -700);
}

export async function panCanvas(page: Page, direction: 1 | -1 = 1): Promise<void> {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The consumer did not expose a visible renderer canvas.');
  const startX = box.x + box.width * 0.5;
  const startY = box.y + box.height * 0.5;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + direction * box.width * 0.22, startY + direction * box.height * 0.08, { steps: 8 });
  await page.mouse.up();
}

export async function waitForStreamingUpdate(page: Page, previousCount: number): Promise<HarnessResult> {
  await expect.poll(async () => (await harnessResult(page))?.diagnostics.streamingUpdateCount ?? 0, {
    timeout: READY_TIMEOUT,
    message: 'The view change did not produce a streaming update.',
  }).toBeGreaterThan(previousCount);
  const current = await harnessResult(page);
  if (!current) throw new Error('Missing result after streaming update.');
  return current;
}

export async function waitForSteadyView(page: Page): Promise<HarnessResult> {
  let stableSamples = 0;
  let previous = await harnessResult(page);
  if (!previous) throw new Error('Missing harness result while waiting for a steady view.');

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.waitForTimeout(150);
    const current = await harnessResult(page);
    if (!current) continue;
    if (current.diagnostics.streamingUpdateCount === previous.diagnostics.streamingUpdateCount) {
      stableSamples += 1;
      if (stableSamples >= 2) return current;
    } else {
      stableSamples = 0;
    }
    previous = current;
  }

  return previous;
}

export async function sampleAnimationFrames(page: Page, durationMs = 900): Promise<{
  frameCount: number;
  medianFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
}> {
  return page.evaluate(async (duration) => {
    const intervals: number[] = [];
    let previous = performance.now();
    const end = previous + duration;
    await new Promise<void>((resolve) => {
      const tick = (now: number): void => {
        intervals.push(now - previous);
        previous = now;
        if (now >= end) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const sorted = intervals.slice(5).sort((left, right) => left - right);
    const percentile = (fraction: number): number => sorted[Math.min(
      sorted.length - 1,
      Math.floor(sorted.length * fraction),
    )] ?? 0;
    return {
      frameCount: intervals.length,
      medianFrameMs: percentile(0.5),
      p95FrameMs: percentile(0.95),
      maxFrameMs: percentile(1),
    };
  }, durationMs);
}
