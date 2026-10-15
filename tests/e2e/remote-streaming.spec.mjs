import { allowBrowserConsoleError, expect, origins, test } from './harness.mjs';

function watchRemoteRanges(page) {
  const records = [];
  page.on('response', (response) => {
    const request = response.request();
    const url = response.url();
    if (!url.includes('.copc.laz')) return;
    const record = {
      url,
      status: response.status(),
      requestRange: request.headers().range,
      contentRange: response.headers()['content-range'],
      bodyBytes: 0,
    };
    record.body = response
      .body()
      .then((body) => {
        record.bodyBytes = body.byteLength;
      })
      .catch(() => undefined);
    records.push(record);
  });
  return records;
}

function asCount(value) {
  return Number(
    String(value ?? '')
      .replaceAll(',', '')
      .match(/\d+/u)?.[0] ?? 0,
  );
}

async function streamingState(page) {
  return page
    .evaluate(() => {
      const text = (id) =>
        document.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';
      const diagnostics = window.__COPC_TEST__.getResult().diagnostics;
      return {
        selectedNodes: diagnostics.selectedNodeKeys.length,
        renderedNodes: diagnostics.renderedNodeKeys.length,
        streamUpdates: diagnostics.streamingUpdateCount ?? 0,
        rangeRequests: text('range-requests'),
        hierarchyRequests: text('hierarchy-requests'),
        lod: text('visible-lod-levels'),
      };
    })
    .then((state) => ({
      selectedNodes:
        typeof state.selectedNodes === 'number'
          ? state.selectedNodes
          : asCount(state.selectedNodes),
      renderedNodes:
        typeof state.renderedNodes === 'number'
          ? state.renderedNodes
          : asCount(state.renderedNodes),
      streamUpdates:
        typeof state.streamUpdates === 'number'
          ? state.streamUpdates
          : asCount(state.streamUpdates),
      rangeRequests: asCount(state.rangeRequests),
      hierarchyRequests: asCount(state.hierarchyRequests),
      lod: state.lod,
    }));
}

async function waitForActiveUrl(page, urlPart) {
  await expect
    .poll(() => page.getByTestId('active-dataset').textContent(), {
      timeout: 90_000,
    })
    .toContain(urlPart);
  await expect(page.getByTestId('harness-status')).toHaveText('ready');
}

function cameraPair(text) {
  const match = /(-?\d+(?:\.\d+)?)°?,\s*(-?\d+(?:\.\d+)?)°?/u.exec(text ?? '');
  if (!match)
    throw new Error(
      `Could not read camera center from ${JSON.stringify(text)}.`,
    );
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

test('Vanilla Cesium streams remote COPC sources directly and keeps its Viewer across transactional switches', async ({
  page,
}) => {
  test.setTimeout(480_000);
  const ranges = watchRemoteRanges(page);
  await page.goto(origins.vanilla, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.cesium-viewer')).toBeVisible();
  await expect(page.locator('.cesium-widget canvas')).toBeVisible();
  await expect(page.getByTestId('harness-status')).toHaveText('ready', {
    timeout: 90_000,
  });
  await expect(page.getByTestId('rendered-points')).not.toHaveText('0');
  await expect(page.getByTestId('streaming-hud')).toBeVisible();
  await expect(page.getByTestId('hud-selected-nodes')).toHaveText(/\d+ \/ 8/u);
  await expect(page.getByTestId('hud-rendered-nodes')).not.toHaveText('0');
  await expect(page.getByTestId('hud-rendered-points')).toHaveText(
    /[\d,]+ \/ 1,000,000/u,
  );
  expect(
    asCount(await page.getByTestId('hud-selected-nodes').textContent()),
  ).toBeLessThanOrEqual(8);
  expect(
    asCount(await page.getByTestId('hud-rendered-nodes').textContent()),
  ).toBeLessThanOrEqual(8);
  expect(
    asCount(await page.getByTestId('hud-rendered-points').textContent()),
  ).toBeLessThanOrEqual(1_000_000);
  const panelToggle = page.getByTestId('panel-toggle');
  await panelToggle.click();
  await expect(page.getByTestId('control-panel-body')).toBeHidden();
  await expect(page.getByTestId('streaming-hud')).toBeVisible();
  await page.getByTestId('panel-toggle').click();
  await expect(page.getByTestId('control-panel-body')).toBeVisible();

  const initial = await page.evaluate(() => window.__COPC_TEST__.getResult());
  expect(initial.config.fixtureUrl).toBe(
    'https://data.pointcloud.org/autzen/autzen-classified.copc.laz',
  );
  expect(initial.config.packageVersion).toBe('0.5.0');
  expect(initial.diagnostics.metadataLoaded).toBe(true);
  expect(initial.diagnostics.hierarchyLoaded).toBe(true);
  expect(initial.diagnostics.renderedPointCount).toBeGreaterThan(0);
  expect(await page.getByTestId('source-type').textContent()).toBe(
    'Remote HTTP',
  );
  expect(await page.getByTestId('source-range').textContent()).toBe(
    'Supported',
  );
  expect(await page.getByTestId('source-http-status').textContent()).toBe(
    '206',
  );
  expect(await page.getByTestId('source-content-range').textContent()).toMatch(
    /^bytes 0-\d+\/\d+$/u,
  );
  expect(await page.getByTestId('source-copc').textContent()).toBe('Supported');
  expect(await page.getByTestId('source-cors').textContent()).toBe('Supported');
  const autzenCamera = cameraPair(
    await page.getByTestId('camera-location').textContent(),
  );

  const autzenRanges = ranges.filter(({ url }) =>
    url.includes('/autzen/autzen-classified.copc.laz'),
  );
  await Promise.all(autzenRanges.map(({ body }) => body));
  expect(autzenRanges.length).toBeGreaterThan(3);
  expect(
    autzenRanges.every(
      ({ url }) => new URL(url).hostname === 'data.pointcloud.org',
    ),
  ).toBe(true);
  for (const record of autzenRanges) {
    const url = new URL(record.url);
    expect(url.hostname).toBe('data.pointcloud.org');
    expect(url.hostname).not.toBe('localhost');
    expect(url.hostname).not.toBe('127.0.0.1');
    expect(record.requestRange).toMatch(/^bytes=\d+-\d+$/u);
    expect(record.status).toBe(206);
    const contentRange = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(
      record.contentRange ?? '',
    );
    expect(
      contentRange,
      `missing or invalid Content-Range for ${record.url}`,
    ).not.toBeNull();
    expect(record.bodyBytes).toBe(
      Number(contentRange[2]) - Number(contentRange[1]) + 1,
    );
  }
  const objectSize = Number(
    /^bytes \d+-\d+\/(\d+)$/u.exec(autzenRanges[0].contentRange)[1],
  );
  const initialTransferredBytes = autzenRanges.reduce(
    (sum, record) => sum + record.bodyBytes,
    0,
  );
  expect(initialTransferredBytes).toBeGreaterThan(0);
  expect(initialTransferredBytes).toBeLessThan(objectSize * 0.5);

  const viewerInstance = await page
    .locator('#renderer')
    .getAttribute('data-cesium-viewer-instance');
  expect(await page.locator('.cesium-viewer').count()).toBe(1);
  await page.getByRole('button', { name: 'Overview' }).click();
  await page.waitForTimeout(800);
  const overview = await streamingState(page);
  await page.getByRole('button', { name: 'Near' }).click();
  await expect(page.getByTestId('hud-view')).toHaveText('Near');
  await expect
    .poll(
      async () => {
        const next = await streamingState(page);
        return (
          next.streamUpdates > overview.streamUpdates ||
          next.rangeRequests > overview.rangeRequests ||
          next.hierarchyRequests > overview.hierarchyRequests ||
          next.selectedNodes !== overview.selectedNodes ||
          next.renderedNodes !== overview.renderedNodes ||
          next.lod !== overview.lod
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const near = await streamingState(page);
  await page.getByRole('button', { name: 'Far' }).click();
  await page.waitForTimeout(800);
  const far = await streamingState(page);
  await page.getByRole('button', { name: 'Near' }).click();
  await page.waitForTimeout(1200);
  const returned = await streamingState(page);
  expect(returned.streamUpdates).toBeGreaterThanOrEqual(far.streamUpdates);
  const cacheStats = await page.getByTestId('point-cache').textContent();
  const cacheHits = /(\d+) entries · (\d+) hits/u.exec(cacheStats ?? '');
  expect(cacheHits).not.toBeNull();
  expect(Number(cacheHits[2])).toBeGreaterThan(0);
  expect(await page.getByTestId('harness-status').textContent()).toBe('ready');
  expect(near.renderedNodes + returned.renderedNodes).toBeGreaterThan(0);

  for (const mode of ['rgb', 'elevation', 'intensity', 'classification']) {
    await page.getByTestId('style-select').selectOption(mode);
    await expect(page.getByTestId('style-select')).toHaveValue(mode);
    await expect(page.getByTestId('harness-status')).toHaveText('ready');
    await expect(page.getByTestId('rendered-points')).not.toHaveText('0');
  }

  await page.getByTestId('style-select').selectOption('rgb');
  await expect(page.getByTestId('style-select')).toHaveValue('rgb');
  await page.getByRole('button', { name: 'Overview' }).click();
  await page.waitForTimeout(700);
  const canvas = page.locator('.cesium-widget canvas').first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.click(
    canvasBox.x + canvasBox.width / 2,
    canvasBox.y + canvasBox.height / 2,
  );
  await expect(page.getByTestId('point-inspection')).toBeVisible({
    timeout: 10_000,
  });
  for (const field of ['latitude', 'longitude', 'height']) {
    const value = await page.getByTestId(`point-${field}`).textContent();
    expect(Number.isFinite(Number(value))).toBe(true);
  }
  await expect(page.getByTestId('point-node')).not.toHaveText('—');
  await expect(page.getByTestId('point-index')).not.toHaveText('—');
  await expect(page.getByTestId('point-intensity-row')).toBeVisible();
  await expect(page.getByTestId('point-classification-row')).toBeVisible();
  await expect(page.getByTestId('point-rgb-row')).toBeVisible();

  await page.getByRole('button', { name: 'Far' }).click();
  await expect(page.getByTestId('hud-view')).toHaveText('Far');
  await page
    .getByTestId('fixture-select')
    .selectOption('remote:chicago-downtown');
  await waitForActiveUrl(page, '/chicago-downtown/chicago-downtown.copc.laz');
  await expect(page.getByTestId('hud-view')).toHaveText('Overview');
  await expect(page.getByTestId('style-select')).toHaveValue('elevation');
  const chicago = ranges.filter(({ url }) =>
    url.includes('/chicago-downtown/chicago-downtown.copc.laz'),
  );
  expect(chicago.length).toBeGreaterThan(2);
  for (const record of chicago) {
    expect(new URL(record.url).hostname).toBe('data.pointcloud.org');
    expect(record.requestRange).toMatch(/^bytes=\d+-\d+$/u);
    expect(record.status).toBe(206);
    expect(record.contentRange).toMatch(/^bytes \d+-\d+\/\d+$/u);
  }
  expect(
    await page.evaluate(
      () => window.__COPC_TEST__.getResult().diagnostics.renderedPointCount,
    ),
  ).toBeGreaterThan(0);
  expect(await page.getByTestId('source-capabilities').textContent()).toContain(
    'RGB unavailable',
  );
  expect(
    await page
      .getByTestId('style-select')
      .evaluate(
        (select) => select.querySelector('option[value="rgb"]').disabled,
      ),
  ).toBe(true);
  expect(
    await page.locator('#renderer').getAttribute('data-cesium-viewer-instance'),
  ).toBe(viewerInstance);
  expect(await page.locator('.cesium-viewer').count()).toBe(1);
  const chicagoCamera = cameraPair(
    await page.getByTestId('camera-location').textContent(),
  );
  expect(
    Math.abs(autzenCamera.longitude - chicagoCamera.longitude),
  ).toBeGreaterThan(20);
  expect(await page.getByTestId('active-dataset').textContent()).toContain(
    'chicago-downtown',
  );

  const activePoints = await page.getByTestId('rendered-points').textContent();
  const invalidUrl =
    'https://data.pointcloud.org/autzen/this-source-does-not-exist.copc.laz';
  allowBrowserConsoleError(
    page,
    /status of 404|status code 404|status: 404|status 404/u,
  );
  await page.getByTestId('custom-source-url').fill(invalidUrl);
  await page.getByTestId('load-custom-source').click();
  await expect(page.getByTestId('harness-status')).toHaveText('error', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('harness-error')).toContainText(
    'Remote COPC source probe failed',
  );
  await expect(page.getByTestId('source-http-status')).toHaveText('404');
  await expect(page.getByTestId('active-dataset')).toContainText(
    'chicago-downtown',
  );
  await expect(page.getByTestId('rendered-points')).toHaveText(activePoints);
  await expect(page.locator('.cesium-viewer')).toBeVisible();
  expect(
    await page.locator('#renderer').getAttribute('data-cesium-viewer-instance'),
  ).toBe(viewerInstance);

  const autzenRequestStarted = page.waitForRequest(
    (request) =>
      request.url().includes('/autzen/autzen-classified.copc.laz') &&
      /^bytes=\d+-\d+$/u.test(request.headers().range ?? ''),
  );
  await page.getByTestId('fixture-select').selectOption('remote:autzen');
  await autzenRequestStarted;
  await expect(page.getByTestId('harness-status')).toHaveText('loading');
  await page.getByTestId('style-select').selectOption('intensity');
  await waitForActiveUrl(page, '/autzen/autzen-classified.copc.laz');
  await expect(page.getByTestId('style-select')).toHaveValue('intensity');
  expect(
    await page.locator('#renderer').getAttribute('data-cesium-viewer-instance'),
  ).toBe(viewerInstance);
  expect(
    await page.evaluate(
      () => window.__COPC_TEST__.getResult().diagnostics.renderedPointCount,
    ),
  ).toBeGreaterThan(0);
});
