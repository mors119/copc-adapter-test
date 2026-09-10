import { defineConfig, devices } from '@playwright/test';
import { selectMatrix } from './tools/matrix/manifest.mjs';

const FAST_APPS = 'vite-react-cesium,vite-react-three,next-r3f-webpack';
const mode = process.env.COPC_E2E_MODE ?? 'fast';
const appSelector = process.env.COPC_E2E_APPS ?? (mode === 'full' ? undefined : FAST_APPS);
const apps = selectMatrix(appSelector).filter((app) =>
  !app.expectedFailure || process.env.COPC_E2E_INCLUDE_EXPECTED_FAILURES === '1');
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

const matrixIdFor = (app) => app.matrixId ?? app.appId;
const appPorts = new Map(apps.map((app, index) => [matrixIdFor(app), firstPort + index]));
const baseUrlFor = (app) => `http://${host}:${appPorts.get(matrixIdFor(app))}`;

function devCommand(app) {
  const port = appPorts.get(matrixIdFor(app));
  const hostFlag = app.host === 'next' ? `--hostname ${host}` : `--host ${host}`;
  // Astro detects agent environments and daemonizes by default. Disable that
  // detection so Playwright can own the server lifecycle in the foreground.
  const foregroundEnv = app.host === 'astro' ? 'ASTRO_DEV_BACKGROUND=0 ' : '';
  return `${foregroundEnv}npm run ${app.devScript ?? 'dev'} --workspace ${app.workspace} -- ${hostFlag} --port ${port}`;
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 15_000 },
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
    name: `${matrixIdFor(app)}-${browser}`,
    metadata: {
      appId: app.appId,
      matrixId: matrixIdFor(app),
      origin: baseUrlFor(app),
      host: app.host,
      renderer: app.renderer,
      bundler: app.bundler,
      expectedFailure: app.expectedFailure,
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
