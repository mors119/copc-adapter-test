import type { FixtureCatalog } from '@copc-test/fixture-client';
import type { HarnessResult } from '@copc-test/test-contract';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures.ts';

test.skip(
  process.env.COPC_E2E_MODE !== 'visual',
  'Deterministic visual snapshots only run in the dedicated visual tier.',
);

const VIEWPORT = { width: 1280, height: 720 } as const;
const READY_TIMEOUT = Number(process.env.COPC_E2E_READY_TIMEOUT ?? 90_000);

type VisualColorMode = 'fixed' | 'elevation' | 'rgb';
type VisualCase = {
  appId: 'vite-react-cesium' | 'vite-react-three' | 'vite-r3f';
  renderer: 'cesium' | 'three' | 'r3f';
  colorMode: VisualColorMode;
  requires?: string;
};

const VISUAL_CASES: VisualCase[] = [
  { appId: 'vite-react-cesium', renderer: 'cesium', colorMode: 'fixed' },
  { appId: 'vite-react-cesium', renderer: 'cesium', colorMode: 'elevation' },
  { appId: 'vite-react-cesium', renderer: 'cesium', colorMode: 'rgb', requires: 'rgb' },
  { appId: 'vite-react-three', renderer: 'three', colorMode: 'fixed' },
  { appId: 'vite-react-three', renderer: 'three', colorMode: 'elevation' },
  { appId: 'vite-react-three', renderer: 'three', colorMode: 'rgb', requires: 'rgb' },
  { appId: 'vite-r3f', renderer: 'r3f', colorMode: 'elevation' },
];

type ProjectMetadata = {
  appId: string;
  renderer: string;
  backend: string;
  fixtureId: string;
  browser: string;
  packageSource: string;
  packageVersion: string;
};

function metadata(testInfo: TestInfo): ProjectMetadata {
  return testInfo.project.metadata as ProjectMetadata;
}

async function result(page: Page): Promise<HarnessResult | null> {
  try {
    return await page.evaluate(() => window.__COPC_TEST__?.getResult() ?? null) as HarnessResult | null;
  } catch {
    return null;
  }
}

async function visualFixture(page: Page, fixtureId: string): Promise<FixtureCatalog['fixtures'][number]> {
  const response = await page.request.get('/fixtures.json');
  if (!response.ok()) throw new Error(`Unable to load fixture catalog (${response.status()}).`);
  const catalog = await response.json() as FixtureCatalog;
  const fixture = catalog.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture) throw new Error(`Fixture ${fixtureId} is missing from the served catalog.`);
  return fixture;
}

async function openVisualConsumer(page: Page, info: ProjectMetadata, visualCase: VisualCase): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  const params = new URLSearchParams({
    fixture: `/fixtures/${info.fixtureId}`,
    backend: info.backend,
    packageSource: info.packageSource,
    packageVersion: info.packageVersion,
    visual: '1',
    colorMode: visualCase.colorMode,
  });
  await page.goto(`/?${params.toString()}`, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      .harness-panel, .cesium-viewer-bottom, .cesium-widget-credits {
        display: none !important;
      }
    `,
  });
}

async function waitForRenderedPoints(page: Page): Promise<HarnessResult> {
  await expect.poll(async () => (await result(page))?.status, {
    timeout: READY_TIMEOUT,
    message: 'The visual consumer did not reach ready through the browser harness contract.',
  }).toBe('ready');
  await expect.poll(async () => (await result(page))?.diagnostics.renderedPointCount ?? 0, {
    timeout: READY_TIMEOUT,
    message: 'The visual consumer did not publish rendered points.',
  }).toBeGreaterThan(0);
  const current = await result(page);
  if (!current) throw new Error('Missing harness result after visual point rendering.');
  return current;
}

async function setDeterministicView(page: Page): Promise<void> {
  const hasCommand = await page.evaluate(() => typeof window.__COPC_TEST__?.commands.setView === 'function');
  if (!hasCommand) throw new Error('Visual consumer did not expose the deterministic setView command.');
  await page.evaluate(() => window.__COPC_TEST__?.commands.setView?.('visual'));
  await page.evaluate(async () => { await document.fonts?.ready; });
  // Let the renderer finish the command-triggered streaming update. The
  // screenshot matcher also waits for two equal frames before comparison.
  await page.waitForTimeout(300);
}

async function attachVisualContext(
  page: Page,
  testInfo: TestInfo,
  info: ProjectMetadata,
  visualCase: VisualCase,
): Promise<void> {
  const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
  await testInfo.attach('visual-context.json', {
    body: JSON.stringify({
      fixtureId: info.fixtureId,
      renderer: visualCase.renderer,
      appId: info.appId,
      colorMode: visualCase.colorMode,
      backend: info.backend,
      browser: info.browser,
      packageSource: info.packageSource,
      packageVersion: info.packageVersion,
      viewport: VIEWPORT,
      devicePixelRatio,
      baselinePolicy: 'Chromium-only; renderer canvas only; software SwiftShader path',
    }, null, 2),
    contentType: 'application/json',
  });
}

for (const visualCase of VISUAL_CASES) {
  test(`visual / ${visualCase.renderer} / ${visualCase.colorMode}`, async ({ page }, testInfo) => {
    const info = metadata(testInfo);
    test.skip(info.appId !== visualCase.appId, `Visual case belongs to ${visualCase.appId}.`);
    test.skip(info.renderer !== visualCase.renderer, `Visual case belongs to ${visualCase.renderer}.`);

    const fixture = await visualFixture(page, info.fixtureId);
    test.skip(
      visualCase.requires !== undefined && !fixture.coverage.attributes?.includes(visualCase.requires),
      `${visualCase.colorMode} visual coverage requires ${visualCase.requires} attributes in ${fixture.id}.`,
    );

    await openVisualConsumer(page, info, visualCase);
    const current = await waitForRenderedPoints(page);
    expect(current.status).toBe('ready');
    expect(current.diagnostics.renderedPointCount).toBeGreaterThan(0);
    await setDeterministicView(page);
    await attachVisualContext(page, testInfo, info, visualCase);

    const rendererCanvas = page.getByTestId('renderer-viewport').locator('canvas').first();
    await expect(rendererCanvas).toBeVisible();
    await expect(rendererCanvas).toHaveScreenshot(
      `visual-${info.fixtureId}-${visualCase.renderer}-${visualCase.colorMode}-${VIEWPORT.width}x${VIEWPORT.height}-${info.packageSource}-${info.packageVersion}.png`,
      {
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        maxDiffPixels: 64,
        maxDiffPixelRatio: 0.0005,
      },
    );
  });
}
