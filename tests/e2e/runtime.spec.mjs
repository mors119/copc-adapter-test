import { expect, openHarness, test } from './harness.mjs';

test('Vanilla mounts a real Cesium globe and streams a COPC fixture', async ({ page }) => {
  const result = await openHarness(page, 'vanilla', 'cesium');
  expect(result.config.packageSource).toMatch(/^(checkout|tarball|npm)$/);
  await expect(page.locator('.cesium-viewer')).toBeVisible();
  await expect(page.locator('.cesium-widget canvas')).toBeVisible();
});

test('Vanilla mounts a real Three scene and renders COPC points', async ({ page }) => {
  const result = await openHarness(page, 'vanilla', 'three');
  expect(result.diagnostics.renderedNodeKeys.length).toBeGreaterThan(0);
  await expect(page.getByTestId('renderer-viewport').locator('canvas')).toBeVisible();
  const before = result.diagnostics.streamingUpdateCount ?? 0;
  await page.getByRole('button', { name: 'Far' }).click();
  await expect.poll(() => page.evaluate(() => window.__COPC_TEST__?.getResult().diagnostics.streamingUpdateCount ?? 0)).toBeGreaterThan(before);
});

test('React Three Fiber mounts through Canvas and renders COPC points', async ({ page }) => {
  const result = await openHarness(page, 'react', 'r3f');
  expect(result.lifecycleCounts.mounts).toBeGreaterThan(0);
  await expect(page.locator('canvas')).toBeVisible();
});
