import { expect, openHarness, test } from './harness.mjs';

test('Vanilla mounts a real Cesium globe and streams a COPC fixture', async ({
  page,
}) => {
  const result = await openHarness(page, 'vanilla', 'cesium');
  expect(result.config.packageSource).toMatch(/^(checkout|tarball|npm)$/);
  await expect(page.locator('.cesium-viewer')).toBeVisible();
  await expect(page.locator('.cesium-widget canvas')).toBeVisible();
});

test('shared panel applies point size in Cesium and preserves it when switching to Three', async ({
  page,
}) => {
  await openHarness(page, 'vanilla', 'cesium');
  const activePointSize = () =>
    page.evaluate(() => {
      const result = window.__COPC_TEST__?.getResult();
      return {
        status: result?.status,
        renderer: result?.config.pointSize,
        rendererPointSize: result?.diagnostics.rendererPointSize,
        renderedPoints: result?.diagnostics.renderedPointCount ?? 0,
      };
    });

  const slider = page.getByTestId('point-size-slider');
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('4');
  await expect(page.getByTestId('settings-state')).toContainText('pending');
  await page.getByTestId('advanced-settings').locator('summary').click();
  const preciseInput = page.getByTestId('point-size-input');
  await expect(preciseInput).toHaveValue('4');
  await preciseInput.fill('6');
  await expect(slider).toHaveValue('6');
  await expect(page.getByTestId('point-size-slider').locator('..')).toContainText(
    '6 px',
  );
  await page.getByTestId('apply-settings').click();
  await expect.poll(activePointSize).toMatchObject({
    status: 'ready',
    renderer: 6,
    rendererPointSize: 6,
  });

  const cesiumViewer = await page
    .locator('#renderer')
    .getAttribute('data-cesium-viewer-instance');
  await page.getByTestId('renderer-option-cesium').focus();
  await page.getByTestId('renderer-option-cesium').press('ArrowRight');
  await expect(page.getByTestId('renderer-option-three')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('renderer-option-cesium')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.getByTestId('apply-settings').click();
  await expect.poll(activePointSize).toMatchObject({
    status: 'ready',
    renderer: 6,
    rendererPointSize: 6,
  });
  await expect(page.locator('#renderer')).not.toHaveAttribute(
    'data-cesium-viewer-instance',
    cesiumViewer,
  );

  await expect
    .poll(() =>
      page.evaluate(
        () => window.__COPC_TEST__.getResult().diagnostics.renderedPointCount,
      ),
    )
    .toBeGreaterThan(0);
});

test('Three point size update survives a renderer reload', async ({ page }) => {
  await openHarness(page, 'vanilla', 'three');
  await page.getByTestId('advanced-settings').locator('summary').click();
  const preciseInput = page.getByTestId('point-size-input');
  await preciseInput.fill('7');
  await expect(page.getByTestId('point-size-slider')).toHaveValue('7');
  await page.getByTestId('apply-settings').click();

  const activePointSize = () =>
    page.evaluate(() => {
      const result = window.__COPC_TEST__?.getResult();
      return {
        status: result?.status,
        renderer: result?.config.pointSize,
        rendererPointSize: result?.diagnostics.rendererPointSize,
        renderedPoints: result?.diagnostics.renderedPointCount ?? 0,
      };
    });
  await expect.poll(activePointSize).toMatchObject({
    status: 'ready',
    renderer: 7,
    rendererPointSize: 7,
  });
  await expect.poll(async () => (await activePointSize()).renderedPoints).toBeGreaterThan(0);

  const mountsBeforeReload = await page.evaluate(
    () => window.__COPC_TEST__.getResult().lifecycleCounts.mounts,
  );
  await page.getByTestId('reload-renderer').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__COPC_TEST__.getResult().lifecycleCounts.mounts),
    )
    .toBeGreaterThan(mountsBeforeReload);
  await expect.poll(activePointSize).toMatchObject({
    status: 'ready',
    renderer: 7,
    rendererPointSize: 7,
  });
  await expect.poll(async () => (await activePointSize()).renderedPoints).toBeGreaterThan(0);
});

test('control panel fits desktop and mobile viewports while the streaming HUD stays visible', async ({
  page,
}, testInfo) => {
  await openHarness(page, 'vanilla', 'cesium');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: testInfo.outputPath('copc-control-panel-desktop.png') });
  await expect(page.getByTestId('control-panel')).toBeVisible();
  await expect(page.getByTestId('streaming-hud')).toBeVisible();
  const desktopLayout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    panel: document.querySelector('[data-testid="control-panel"]').getBoundingClientRect().toJSON(),
    hud: document.querySelector('[data-testid="streaming-hud"]').getBoundingClientRect().toJSON(),
  }));
  expect(desktopLayout.width).toBeLessThanOrEqual(1280);
  expect(desktopLayout.panel.right).toBeLessThan(desktopLayout.hud.left);
  expect(desktopLayout.panel.bottom).toBeLessThanOrEqual(720);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('copc-control-panel-mobile.png') });
  await expect(page.getByTestId('streaming-hud')).toBeVisible();
  const mobileLayout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    panel: document.querySelector('[data-testid="control-panel"]').getBoundingClientRect().toJSON(),
    hud: document.querySelector('[data-testid="streaming-hud"]').getBoundingClientRect().toJSON(),
  }));
  expect(mobileLayout.width).toBeLessThanOrEqual(390);
  expect(mobileLayout.panel.right).toBeLessThanOrEqual(390);
  expect(mobileLayout.panel.bottom).toBeLessThanOrEqual(844);
  expect(mobileLayout.hud.right).toBeLessThanOrEqual(390);
  expect(mobileLayout.hud.bottom).toBeLessThanOrEqual(844);
});

test('Vanilla mounts a real Three scene and renders COPC points', async ({
  page,
}) => {
  const result = await openHarness(page, 'vanilla', 'three');
  expect(result.diagnostics.renderedNodeKeys.length).toBeGreaterThan(0);
  await expect(
    page.getByTestId('renderer-viewport').locator('canvas'),
  ).toBeVisible();
  const before = result.diagnostics.streamingUpdateCount ?? 0;
  await page.getByRole('radio', { name: 'Far' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__COPC_TEST__?.getResult().diagnostics.streamingUpdateCount ??
          0,
      ),
    )
    .toBeGreaterThan(before);
});

test('React Three Fiber mounts through Canvas and renders COPC points', async ({
  page,
}) => {
  const result = await openHarness(page, 'react', 'r3f');
  expect(result.lifecycleCounts.mounts).toBeGreaterThan(0);
  await expect(page.locator('canvas')).toBeVisible();
});
