import { expect, expectBrowserConsoleError, openHarness, origins, test } from './harness.mjs';

test('Vanilla Rust backend remains explicitly selected and reports real output', async ({ page }) => {
  const result = await openHarness(page, 'vanilla', 'three', 'rust');
  expect(result.diagnostics.backend).toBe('rust');
  expect(result.diagnostics.renderedPointCount).toBeGreaterThan(0);
});

test('React switches renderer and backend through lifecycle cleanup and remount', async ({ page }) => {
  await openHarness(page, 'react', 'cesium');
  const before = await page.evaluate(() => window.__COPC_TEST__.getResult().lifecycleCounts);
  await page.getByTestId('renderer-select').selectOption('three');
  await page.getByTestId('backend-select').selectOption('rust');
  await page.getByTestId('apply-settings').click();
  await expect.poll(() => page.evaluate(() => {
    const result = window.__COPC_TEST__?.getResult();
    return result?.status === 'ready' && result.config.renderer === 'three' && result.config.backend === 'rust';
  })).toBe(true);
  const after = await page.evaluate(() => window.__COPC_TEST__.getResult());
  expect(after.config.renderer).toBe('three');
  expect(after.config.backend).toBe('rust');
  expect(after.diagnostics.backend).toBe('rust');
  expect(after.lifecycleCounts.mounts).toBeGreaterThan(before.mounts);
  expect(after.lifecycleCounts.unmounts).toBeGreaterThan(before.unmounts);
});

test('React fixture selection synchronizes panel state and remounts the consumer', async ({ page }) => {
  const initial = await openHarness(page, 'react', 'three');
  const expectedRangeError = expectBrowserConsoleError(page, /status of 416/u);
  await page.getByTestId('fixture-select').selectOption('invalid-truncated');
  await page.getByTestId('apply-settings').click();

  await expect.poll(() => page.evaluate(() => window.__COPC_TEST__?.getResult().config.fixtureUrl))
    .toBe('/fixtures/invalid-truncated');
  await expect(page.getByTestId('fixture-select')).toHaveValue('invalid-truncated');
  await expect(page.locator('[data-field="fixture"]')).toHaveText('invalid-truncated');
  await expect.poll(() => page.evaluate(() => window.__COPC_TEST__?.getResult().lifecycleCounts.mounts ?? 0))
    .toBeGreaterThan(initial.lifecycleCounts.mounts);
  await expect.poll(async () => {
    const response = await page.request.get(`${origins.react}/__fixture__/stats`);
    const stats = await response.json();
    return stats.requests.some((request) => request.fixtureId === 'invalid-truncated');
  }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__COPC_TEST__?.getResult().status)).toBe('error');
  await expect(page.getByTestId('harness-error')).toContainText('Invalid EVLR header length');
  await expectedRangeError;

  const updated = await page.evaluate(() => window.__COPC_TEST__.getResult());
  expect(updated.lifecycleCounts.unmounts).toBeGreaterThan(initial.lifecycleCounts.unmounts);
});

test('Next Cesium client boundary hydrates and renders after SSR', async ({ page }) => {
  const response = await page.request.get(`${origins.next}/cesium?backend=copc-js&fixtureId=small-valid-copc`);
  expect(response.ok()).toBe(true);
  const serverHtml = await response.text();
  expect(serverHtml).toContain('data-host="next" data-renderer="cesium"');
  expect(serverHtml).toContain('class="copc-panel-host"');
  expect(serverHtml).not.toMatch(/<canvas|cesium-viewer/u);
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
