import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { FixtureServer } from '../../packages/fixture-server/src/index.ts';

function isFixtureRequest(request: IncomingMessage): boolean {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  return pathname === '/fixtures.json'
    || pathname === '/samples.json'
    || pathname === '/__fixture__/stats'
    || pathname === '/__fixture__/reset'
    || pathname.startsWith('/fixtures/')
    || pathname.startsWith('/samples/')
    || pathname.startsWith('/cesium/');
}

function send(response: ServerResponse, status: number, message: string): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(message);
}

async function serveFixture(
  fixtureServer: FixtureServer,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const result = await fixtureServer.handle({
    method: request.method,
    url: request.url ?? '/',
    headers: request.headers,
  });

  if (!result) {
    send(response, 404, 'Not found');
    return;
  }

  response.writeHead(result.status, result.headers);
  if (result.body) result.body.pipe(response);
  else response.end();
}

/** Vite adapter for the shared fixture server. It never copies fixture bytes into dist. */
export function viteFixtureServer(): Plugin {
  const fixtureServer = new FixtureServer();
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    if (!isFixtureRequest(request)) {
      next();
      return;
    }

    void serveFixture(fixtureServer, request, response).catch((error: unknown) => {
      send(response, 500, error instanceof Error ? error.message : String(error));
    });
  };

  return {
    name: 'copc-fixture-server',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
