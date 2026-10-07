import { expect, openHarness, origins, test } from './harness.mjs';

test('Vanilla Rust backend remains explicitly selected and reports real output', async ({ page }) => {
  const result = await openHarness(page, 'vanilla', 'three', 'rust');
  expect(result.diagnostics.backend).toBe('rust');
  expect(result.diagnostics.renderedPointCount).toBeGreaterThan(0);
});

test('React switches renderer and backend through lifecycle cleanup and remount', async ({ page }) => {
  await openHarness(page, 'react', 'three');
  const before = await page.evaluate(() => window.__COPC_TEST__.getResult().lifecycleCounts);
  await page.getByTestId('renderer-select').selectOption('cesium');
  await page.getByTestId('backend-select').selectOption('rust');
  await page.getByTestId('apply-settings').click();
  await expect.poll(() => page.evaluate(() => {
    const result = window.__COPC_TEST__?.getResult();
    return result?.status === 'ready' && result.config.renderer === 'cesium' && result.config.backend === 'rust';
  })).toBe(true);
  const after = await page.evaluate(() => window.__COPC_TEST__.getResult());
  expect(after.config.renderer).toBe('cesium');
  expect(after.config.backend).toBe('rust');
  expect(after.diagnostics.backend).toBe('rust');
  expect(after.lifecycleCounts.mounts).toBeGreaterThan(before.mounts);
  expect(after.lifecycleCounts.unmounts).toBeGreaterThan(before.unmounts);
});

test('Next Cesium client boundary hydrates and renders after SSR', async ({ page }) => {
  const response = await page.request.get(`${origins.next}/cesium?backend=copc-js&fixtureId=small-valid-copc`);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toMatch(/data-testid="harness-status"[^>]*>idle</u);
  const result = await openHarness(page, 'next', 'cesium');
  expect(result.lifecycleCounts.mounts).toBeGreaterThan(0);
  await expect(page.locator('.cesium-widget canvas')).toBeVisible();
});

test('Next Three client boundary resolves packed worker and WASM assets with Rust', async ({ page }) => {
  const result = await openHarness(page, 'next', 'three', 'rust');
  expect(result.diagnostics.backend).toBe('rust');
  expect(result.diagnostics.renderedPointCount).toBeGreaterThan(0);
  expect(result.diagnostics.worker?.completedCount ?? result.diagnostics.worker?.submittedCount ?? 0).toBeGreaterThan(0);
});
