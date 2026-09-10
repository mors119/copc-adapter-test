import { defineConfig, devices } from '@playwright/test';
import { selectMatrix } from './tools/matrix/manifest.mjs';

const FAST_APPS = 'vite-react-cesium,vite-react-three,next-r3f';
const mode = process.env.COPC_E2E_MODE ?? 'fast';
const appSelector = process.env.COPC_E2E_APPS ?? (mode === 'full' ? undefined : FAST_APPS);
const apps = selectMatrix(appSelector);
const browsers = (process.env.COPC_E2E_BROWSERS
  ?? (mode === 'full' ? 'chromium,firefox,webkit' : 'chromium'))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const host = '127.0.0.1';
const firstPort = Number(process.env.COPC_E2E_PORT ?? 4173);

const browserDevices = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};

const selectedBrowsers = browsers.filter((browser) => browser in browserDevices);
if (selectedBrowsers.length === 0) {
  throw new Error(`No supported browsers selected. Use chromium,firefox,webkit; received: ${browsers.join(',')}`);
}

const appPorts = new Map(apps.map((app, index) => [app.appId, firstPort + index]));
const baseUrlFor = (app) => `http://${host}:${appPorts.get(app.appId)}`;
const testTimeout = Number(process.env.COPC_E2E_TIMEOUT ?? 120_000);
const expectTimeout = Number(process.env.COPC_E2E_EXPECT_TIMEOUT ?? 30_000);

function devCommand(app) {
  const port = appPorts.get(app.appId);
  const hostFlag = app.host === 'next' ? `--hostname ${host}` : `--host ${host}`;
  return `npm run dev --workspace ${app.workspace} -- ${hostFlag} --port ${port}`;
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: testTimeout,
  expect: { timeout: expectTimeout },
  fullyParallel: false,
  workers: Number(process.env.COPC_E2E_WORKERS ?? 1),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results',
  webServer: apps.map((app) => ({
    command: devCommand(app),
    url: `${baseUrlFor(app)}/`,
    cwd: process.cwd(),
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  })),
  projects: apps.flatMap((app) => selectedBrowsers.map((browser) => ({
    name: `${app.appId}-${browser}`,
    metadata: {
      appId: app.appId,
      host: app.host,
      renderer: app.renderer,
      entry: app.entry,
      backend: 'copc-js',
      fixtureId: 'small-valid-copc',
      appScenarios: app.runtimeScenarios,
    },
    use: {
      ...browserDevices[browser],
      baseURL: baseUrlFor(app),
      screenshot: 'only-on-failure',
      trace: 'retain-on-failure',
      video: 'retain-on-failure',
      actionTimeout: 15_000,
    },
  }))),
});
