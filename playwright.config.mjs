import { defineConfig, devices } from '@playwright/test';
import { selectMatrixCases } from './tools/matrix/manifest.mjs';

const mode = process.env.COPC_E2E_MODE ?? 'fast';
const tier = mode === 'full' || mode === 'release' ? mode : 'fast';
const benchmark = process.env.COPC_BENCHMARK === '1';
const includeExpectedFailures = process.env.COPC_E2E_INCLUDE_EXPECTED_FAILURES === '1';
const cases = selectMatrixCases(tier, {
  apps: process.env.COPC_E2E_APPS,
  browsers: process.env.COPC_E2E_BROWSERS,
  backends: process.env.COPC_E2E_BACKENDS,
  fixtures: process.env.COPC_E2E_FIXTURES,
  packageSource: process.env.COPC_E2E_PACKAGE_SOURCE,
  packageVersion: process.env.COPC_E2E_PACKAGE_VERSION,
}).filter((entry) => includeExpectedFailures || !entry.expectedFailure);

// A Next app can have separate webpack and Turbopack matrix entries. Browser
// projects use the first runnable entry as their server definition while the
// build matrix still visits both entries independently.
const appsById = new Map();
for (const entry of cases) {
  const existing = appsById.get(entry.appId);
  if (!existing || (existing.expectedFailure && !entry.expectedFailure)) appsById.set(entry.appId, entry);
}
const apps = [...appsById.values()];
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
    const command = app.host === 'next' ? 'start' : (app.startScript ?? 'preview');
    return `npm run ${command} --workspace ${app.workspace} -- ${hostFlag} --port ${port}`;
  }
  // Astro detects agent environments and daemonizes by default. Disable that
  // detection so Playwright can own the server lifecycle in the foreground.
  const foregroundEnv = app.host === 'astro' ? 'ASTRO_DEV_BACKGROUND=0 ' : '';
  return `${foregroundEnv}npm run ${app.devScript ?? 'dev'} --workspace ${app.workspace} -- ${hostFlag} --port ${port}`;
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
  testMatch: benchmark ? '**/performance.spec.ts' : '**/*.spec.ts',
  testIgnore: benchmark ? [] : '**/performance.spec.ts',
  timeout: testTimeout,
  expect: { timeout: expectTimeout },
  fullyParallel: false,
  workers: Number(process.env.COPC_E2E_WORKERS ?? 1),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: benchmark
    ? [['./tools/benchmark/reporter.mjs', {
        outputFile: process.env.COPC_BENCHMARK_OUTPUT ?? 'benchmark-results/latest.json',
      }]]
    : process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['list']],
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
      matrixId: matrixCase.matrixId ?? matrixCase.appId,
      origin: baseUrlFor(matrixCase),
      host: matrixCase.host,
      bundler: matrixCase.bundler ?? matrixCase.host,
      renderer: matrixCase.renderer,
      expectedFailure: matrixCase.expectedFailure,
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
