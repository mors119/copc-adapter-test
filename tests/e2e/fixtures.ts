import { test as base, type Page, type TestInfo } from '@playwright/test';

type NetworkEntry = {
  method: string;
  url: string;
  range?: string;
  status?: number;
  resourceType: string;
};

type BrowserLog = {
  type: string;
  text: string;
  location?: string;
};

type ObservedPage = Page;

function metadata(testInfo: TestInfo): Record<string, unknown> {
  return testInfo.project.metadata as Record<string, unknown>;
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const network: NetworkEntry[] = [];
    const browserLogs: BrowserLog[] = [];
    const pageErrors: string[] = [];

    page.on('console', (message) => {
      browserLogs.push({
        type: message.type(),
        text: message.text(),
        location: message.location().url || undefined,
      });
    });
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    page.on('request', (request) => {
      network.push({
        method: request.method(),
        url: request.url(),
        range: request.headers()['range'],
        resourceType: request.resourceType(),
      });
    });
    page.on('response', (response) => {
      const request = response.request();
      const entry = network.findLast((candidate) =>
        candidate.url === request.url()
        && candidate.method === request.method()
        && candidate.status === undefined);
      if (entry) entry.status = response.status();
    });

    try {
      await use(page as ObservedPage);
    } finally {
      let harnessResult: unknown = null;
      try {
        harnessResult = await page.evaluate(() => window.__COPC_TEST__?.getResult() ?? null);
      } catch {
        harnessResult = null;
      }

      const identity = metadata(testInfo);
      const resultRecord = harnessResult as {
        config?: { backend?: string; fixtureUrl?: string };
      } | null;
      const artifact = {
        app: identity.appId,
        host: identity.host,
        renderer: identity.renderer,
        backend: resultRecord?.config?.backend ?? identity.backend,
        fixtureId: identity.fixtureId,
        browser: identity.browser,
        scenario: testInfo.title,
        url: page.url(),
        matrix: identity,
        harnessResult,
        network: {
          requestCount: network.length,
          rangeRequests: network.filter((request) => request.range !== undefined),
          requests: network,
        },
        browserLogs,
        pageErrors,
      };
      await testInfo.attach('harness-result.json', {
        body: JSON.stringify(artifact, null, 2),
        contentType: 'application/json',
      });
      await testInfo.attach('browser-console.log', {
        body: browserLogs.map((entry) => `[${entry.type}] ${entry.text}`).join('\n'),
        contentType: 'text/plain',
      });
      await testInfo.attach('network-summary.json', {
        body: JSON.stringify(artifact.network, null, 2),
        contentType: 'application/json',
      });

      if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
        try {
          await testInfo.attach('failure-screenshot.png', {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          });
        } catch {
          // The page may have crashed before a screenshot can be captured.
        }
      }
    }
  },
});

export { expect } from '@playwright/test';
