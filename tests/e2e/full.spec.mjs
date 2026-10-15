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
  }), { timeout: 60_000 }).toBe(true);
  const after = await page.evaluate(() => window.__COPC_TEST__.getResult());
  expect(after.config.renderer).toBe('three');
  expect(after.config.backend).toBe('rust');
  expect(after.diagnostics.backend).toBe('rust');
  expect(after.lifecycleCounts.mounts).toBeGreaterThan(before.mounts);
  expect(after.lifecycleCounts.unmounts).toBeGreaterThan(before.unmounts);
});

test('React shared source selector loads and switches a remote Cesium dataset with lifecycle cleanup', async ({ page }) => {
  test.setTimeout(240_000);
  const remoteResponses = [];
  page.on('response', (response) => {
    if (!response.url().includes('/chicago-downtown/chicago-downtown.copc.laz')) return;
    remoteResponses.push({
      url: response.url(),
      range: response.request().headers().range,
      status: response.status(),
      contentRange: response.headers()['content-range'],
    });
  });
  await page.goto(origins.react, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('harness-status')).toHaveText('ready', { timeout: 90_000 });
  const initial = await page.evaluate(() => window.__COPC_TEST__.getResult());
  expect(initial.config.fixtureUrl).toBe('https://data.pointcloud.org/autzen/autzen-classified.copc.laz');
  expect(initial.diagnostics.renderedPointCount).toBeGreaterThan(0);

  await page.getByTestId('fixture-select').selectOption('remote:chicago-downtown');
  await expect.poll(() => page.evaluate(() => window.__COPC_TEST__?.getResult().config.fixtureUrl))
    .toBe('https://data.pointcloud.org/chicago-downtown/chicago-downtown.copc.laz');
  await expect.poll(() => page.evaluate(() => {
    const result = window.__COPC_TEST__?.getResult();
    return result?.status === 'ready' && (result.diagnostics.renderedPointCount ?? 0) > 0;
  }), { timeout: 120_000 }).toBe(true);
  const switched = await page.evaluate(() => window.__COPC_TEST__.getResult());
  expect(switched.diagnostics.metadataLoaded).toBe(true);
  expect(switched.diagnostics.hierarchyLoaded).toBe(true);
  expect(switched.lifecycleCounts.mounts).toBeGreaterThan(initial.lifecycleCounts.mounts);
  expect(switched.lifecycleCounts.unmounts).toBeGreaterThan(initial.lifecycleCounts.unmounts);
  await expect(page.getByTestId('active-dataset')).toContainText('chicago-downtown');
  await expect.poll(() => remoteResponses.length).toBeGreaterThan(0);
  for (const remoteResponse of remoteResponses) {
    expect(new URL(remoteResponse.url).hostname).toBe('data.pointcloud.org');
    expect(remoteResponse.range).toMatch(/^bytes=\d+-\d+$/u);
    expect(remoteResponse.status).toBe(206);
    expect(remoteResponse.contentRange).toMatch(/^bytes \d+-\d+\/\d+$/u);
  }
});

test('React fixture selection synchronizes panel state and remounts the consumer', async ({ page }) => {
  const initial = await openHarness(page, 'react', 'three');
  const expectedRangeError = expectBrowserConsoleError(page, /status of 416/u);
  await page.getByTestId('fixture-select').selectOption('invalid-truncated');
  await page.getByTestId('apply-settings').click();

  await expect.poll(() => page.evaluate(() => window.__COPC_TEST__?.getResult().config.fixtureUrl))
    .toBe('/fixtures/invalid-truncated');
  await expect(page.getByTestId('fixture-select')).toHaveValue('invalid-truncated');
  await expect(page.locator('[data-field="fixture"]')).toHaveText('Truncated COPC response (derived negative case)');
  await expect.poll(() => page.evaluate(() => window.__COPC_TEST__?.getResult().lifecycleCounts.mounts ?? 0))
    .toBeGreaterThan(initial.lifecycleCounts.mounts);
  await expect.poll(async () => {
    const response = await page.request.get(`${origins.react}/__fixture__/stats`);
    const stats = await response.json();
    return stats.requests.some((request) => request.fixtureId === 'invalid-truncated');
  }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__COPC_TEST__?.getResult().status)).toBe('error');
  await expect(page.getByTestId('harness-error')).toContainText('Failed to create COPC source context');
  await expectedRangeError;

  const updated = await page.evaluate(() => window.__COPC_TEST__.getResult());
  expect(updated.lifecycleCounts.unmounts).toBeGreaterThan(initial.lifecycleCounts.unmounts);
});

test('Next Cesium client boundary hydrates and renders a remote COPC after SSR', async ({ page }) => {
  const response = await page.request.get(`${origins.next}/cesium`);
  expect(response.ok()).toBe(true);
  const serverHtml = await response.text();
  expect(serverHtml).toContain('data-host="next" data-renderer="cesium"');
  expect(serverHtml).toContain('class="copc-panel-host"');
  expect(serverHtml).not.toMatch(/<canvas|cesium-viewer/u);
  const remoteResponses = [];
  page.on('response', (remoteResponse) => {
    if (!remoteResponse.url().includes('/autzen/autzen-classified.copc.laz')) return;
    remoteResponses.push({
      url: remoteResponse.url(),
      range: remoteResponse.request().headers().range,
      status: remoteResponse.status(),
      contentRange: remoteResponse.headers()['content-range'],
    });
  });
  await page.goto(`${origins.next}/cesium`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('harness-status')).toHaveText('ready', { timeout: 90_000 });
  const result = await page.evaluate(() => window.__COPC_TEST__.getResult());
  expect(result.config.fixtureUrl).toBe('https://data.pointcloud.org/autzen/autzen-classified.copc.laz');
  expect(result.lifecycleCounts.mounts).toBeGreaterThan(0);
  expect(result.diagnostics.metadataLoaded).toBe(true);
  expect(result.diagnostics.hierarchyLoaded).toBe(true);
  expect(result.diagnostics.renderedPointCount).toBeGreaterThan(0);
  await expect(page.locator('.cesium-widget canvas')).toBeVisible();
  await expect.poll(() => remoteResponses.length).toBeGreaterThan(0);
  for (const remoteResponse of remoteResponses) {
    expect(new URL(remoteResponse.url).hostname).toBe('data.pointcloud.org');
    expect(remoteResponse.range).toMatch(/^bytes=\d+-\d+$/u);
    expect(remoteResponse.status).toBe(206);
    expect(remoteResponse.contentRange).toMatch(/^bytes \d+-\d+\/\d+$/u);
  }
});

test('Next Three client boundary resolves packed worker and WASM assets with Rust', async ({ page }) => {
  const result = await openHarness(page, 'next', 'three', 'rust');
  expect(result.diagnostics.backend).toBe('rust');
  expect(result.diagnostics.renderedPointCount).toBeGreaterThan(0);
  expect(result.diagnostics.worker?.completedCount ?? result.diagnostics.worker?.submittedCount ?? 0).toBeGreaterThan(0);
});
