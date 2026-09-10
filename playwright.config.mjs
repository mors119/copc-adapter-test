import { defineConfig, devices } from '@playwright/test';
import { selectMatrix, selectMatrixCases } from './tools/matrix/manifest.mjs';

const mode = process.env.COPC_E2E_MODE ?? 'fast';
const tier = mode === 'full' || mode === 'release' ? mode : 'fast';
const cases = selectMatrixCases(tier, {
  apps: process.env.COPC_E2E_APPS,
  browsers: process.env.COPC_E2E_BROWSERS,
  backends: process.env.COPC_E2E_BACKENDS,
  fixtures: process.env.COPC_E2E_FIXTURES,
  packageSource: process.env.COPC_E2E_PACKAGE_SOURCE,
  packageVersion: process.env.COPC_E2E_PACKAGE_VERSION,
});
const apps = selectMatrix([...new Set(cases.map((entry) => entry.appId))].join(','));
const host = '127.0.0.1';
const firstPort = Number(process.env.COPC_E2E_PORT ?? 4173);

const browserDevices = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};

const appPorts = new Map(apps.map((app, index) => [app.appId, firstPort + index]));
const baseUrlFor = (app) => `http://${host}:${appPorts.get(app.appId)}`;

function devCommand(app) {
  const port = appPorts.get(app.appId);
  const hostFlag = app.host === 'next' ? `--hostname ${host}` : `--host ${host}`;
  return `npm run dev --workspace ${app.workspace} -- ${hostFlag} --port ${port}`;
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
    // Avoid accidentally attaching to a different worktree's Vite/Next server.
    // Set COPC_E2E_REUSE_SERVER=1 only when intentionally reusing a known server.
    reuseExistingServer: process.env.COPC_E2E_REUSE_SERVER === '1',
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  })),
  projects: cases.map((matrixCase) => ({
    name: matrixCase.caseId,
    metadata: {
      appId: matrixCase.appId,
      host: matrixCase.host,
      renderer: matrixCase.renderer,
      entry: matrixCase.entry,
      backend: matrixCase.backend,
      fixtureId: matrixCase.fixtureId,
      browser: matrixCase.browser,
      packageSource: matrixCase.packageSource,
      packageVersion: matrixCase.packageVersion,
      caseId: matrixCase.caseId,
      appScenarios: matrixCase.runtimeScenarios,
    },
    use: {
      ...browserDevices[matrixCase.browser],
      baseURL: baseUrlFor(matrixCase),
      screenshot: 'only-on-failure',
      trace: 'retain-on-failure',
      video: 'retain-on-failure',
      actionTimeout: 15_000,
    },
  })),
});
