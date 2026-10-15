import { defineConfig } from '@playwright/test';
import { validateInstalledPackage } from './tools/adapter-source/index.mjs';
import { assertFixturesReady } from './tools/fixtures/assert-ready.mjs';

// Fail before any browser application is started if the consumer package is wrong.
await validateInstalledPackage();

const mode = process.env.COPC_E2E_MODE ?? 'all';
const full = mode === 'full' || mode === 'all';
const remote = mode === 'remote';
const vanillaPort = remote
  ? (process.env.COPC_REMOTE_PORT ?? process.env.COPC_VANILLA_PORT ?? '4173')
  : (process.env.COPC_VANILLA_PORT ?? '4173');
if (!remote) await assertFixturesReady(['small-valid-copc']);
const webServer = [
  {
    command: `npm run dev --workspace @copc-test/vanilla -- --port ${vanillaPort} --strictPort`,
    url: `http://127.0.0.1:${vanillaPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  ...(!remote ? [{
    command: 'npm run dev:react',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  }] : []),
  ...(full ? [{
    command: 'npm run start:next',
    url: 'http://127.0.0.1:4175/cesium',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  }] : []),
];

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: remote ? '**/remote-streaming.spec.mjs' : full ? '**/*.spec.mjs' : '**/runtime.spec.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
  use: {
    baseURL: `http://127.0.0.1:${vanillaPort}`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer,
  outputDir: 'test-results',
});
