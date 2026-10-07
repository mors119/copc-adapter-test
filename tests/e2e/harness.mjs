import { expect, test as base } from '@playwright/test';

const browserErrorsByPage = new WeakMap();
const expectedErrorsByPage = new WeakMap();

export const origins = {
  vanilla: 'http://127.0.0.1:4173',
  react: 'http://127.0.0.1:4174',
  next: 'http://127.0.0.1:4175',
};

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    const expectedErrors = [];
    browserErrorsByPage.set(page, errors);
    expectedErrorsByPage.set(page, expectedErrors);
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await use(page);
    const unexpected = errors.filter((error) => !expectedErrors.some((pattern) => pattern.test(error)));
    expect(unexpected, 'unexpected browser console and uncaught errors').toEqual([]);
  },
});

export { expect };

export async function expectBrowserConsoleError(page, pattern) {
  const expectedErrors = expectedErrorsByPage.get(page);
  const errors = browserErrorsByPage.get(page);
  if (!expectedErrors || !errors) throw new Error('The test page is not using the shared browser error collector.');
  expectedErrors.push(pattern);
  await expect.poll(() => errors.filter((error) => pattern.test(error)).length).toBe(1);
}

export async function openHarness(page, host, renderer, backend = 'copc-js', fixture = 'small-valid-copc') {
  const path = host === 'next' ? `/${renderer === 'three' ? 'three' : 'cesium'}` : '/';
  const query = new URLSearchParams({ renderer, backend, fixtureId: fixture });
  await page.goto(`${origins[host]}${path}?${query}`);
  await expect.poll(
    () => page.evaluate(() => window.__COPC_TEST__?.result.status),
    { timeout: 60_000 },
  ).toBe('ready');
  const result = await page.evaluate(() => window.__COPC_TEST__.getResult());
  expect(result.config.host).toBe(host);
  expect(result.config.renderer).toBe(renderer);
  expect(result.config.backend).toBe(backend);
  expect(result.config.fixtureUrl).toContain(fixture);
  expect(result.config.packageVersion).toBe('0.4.0');
  expect(result.diagnostics.renderedPointCount).toBeGreaterThan(0);
  expect(result.diagnostics.metadataLoaded).toBe(true);
  expect(result.diagnostics.hierarchyLoaded).toBe(true);
  await expect(page.getByTestId('harness-status')).toHaveText('ready');

  const range = await page.request.get(`${origins[host]}/fixtures/${fixture}`, {
    headers: { Range: 'bytes=0-31' },
  });
  expect(range.status()).toBe(206);
  expect(range.headers()['accept-ranges']).toBe('bytes');
  expect(range.headers()['content-range']).toMatch(/^bytes 0-31\/\d+$/u);
  expect(range.headers()['access-control-allow-origin']).toBe('*');
  return result;
}
