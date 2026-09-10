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
const testTimeout = Number(process.env.COPC_E2E_TIMEOUT ?? 120_000);
const expectTimeout = Number(process.env.COPC_E2E_EXPECT_TIMEOUT ?? 30_000);

function devCommand(app) {
  const port = appPorts.get(app.appId);
  const hostFlag = app.host === 'next' ? `--hostname ${host}` : `--host ${host}`;
  if (process.env.COPC_E2E_TARGET === 'preview') {
    const command = app.host === 'next' ? 'start' : 'preview';
    return `npm run ${command} --workspace ${app.workspace} -- ${hostFlag} --port ${port}`;
  }
  return `npm run dev --workspace ${app.workspace} -- ${hostFlag} --port ${port}`;
}

const reuseExistingServer = process.env.COPC_E2E_REUSE_SERVER === '1';
const sharedFixtureServer = apps.some((app) => app.host === 'angular')
  ? [{
    command: 'npm run fixtures:serve -- --host 127.0.0.1 --port 8787',
    url: 'http://127.0.0.1:8787/__fixture__/stats',
    cwd: process.cwd(),
    reuseExistingServer,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  }]
  : [];

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
  webServer: [...sharedFixtureServer, ...apps.map((app) => ({
    command: devCommand(app),
    url: `${baseUrlFor(app)}/`,
    cwd: process.cwd(),
    // Avoid accidentally attaching to a different worktree's server.
    reuseExistingServer,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  }))],
  projects: cases.map((matrixCase) => ({
    name: matrixCase.caseId,
    metadata: {
      appId: matrixCase.appId,
      host: matrixCase.host,
      bundler: matrixCase.bundler ?? matrixCase.host,
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
