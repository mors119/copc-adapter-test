import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { FixtureServer } from './index.ts';

function isFixtureRequest(request: IncomingMessage): boolean {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  return pathname === '/fixtures.json' || pathname === '/samples.json'
    || pathname === '/__fixture__/stats' || pathname === '/__fixture__/reset'
    || pathname.startsWith('/fixtures/') || pathname.startsWith('/samples/')
    || pathname.startsWith('/cesium/');
}

function send(response: ServerResponse, status: number, message: string): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(message);
}

/** Vite adapter to the one shared fixture server; fixture bytes stay outside app builds. */
export function viteFixtureServer(): Plugin {
  const appCesium = resolve(process.cwd(), 'node_modules/cesium/Build/Cesium');
  const rootCesium = resolve(process.cwd(), '../../node_modules/cesium/Build/Cesium');
  const fixtureServer = new FixtureServer({ staticRoot: existsSync(appCesium) ? appCesium : rootCesium });
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    if (!isFixtureRequest(request)) return next();
    void fixtureServer.handle({ method: request.method, url: request.url ?? '/', headers: request.headers })
      .then((result) => {
        if (!result) return send(response, 404, 'Not found');
        response.writeHead(result.status, result.headers);
        if (result.body) result.body.pipe(response);
        else response.end();
      })
      .catch((error: unknown) => send(response, 500, error instanceof Error ? error.message : String(error)));
  };
  return {
    name: 'copc-shared-fixture-server',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
