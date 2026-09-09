import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const publicRoot = fileURLToPath(new URL('../../public', import.meta.url));

function contentType(path: string): string {
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.wasm')) return 'application/wasm';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.laz')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function rangeFor(header: string | undefined, size: number): { start: number; end: number } | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return undefined;
  const start = match[1] ? Number(match[1]) : undefined;
  const end = match[2] ? Number(match[2]) : undefined;

  if (start === undefined) {
    const suffix = Math.min(end ?? 0, size);
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }
  if (!Number.isSafeInteger(start) || start >= size) return undefined;
  return { start, end: Math.min(end ?? size - 1, size - 1) };
}

function serveFixture(request: IncomingMessage, response: ServerResponse): boolean {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const match = /^\/(samples|cesium)\/(.+)$/.exec(pathname);
  let filePath: string;

  if (match) {
    const category = match[1];
    const relativePath = match[2]
      .split('/')
      .map((segment) => decodeURIComponent(segment));
    const categoryRoot = resolve(publicRoot, category);
    filePath = resolve(categoryRoot, ...relativePath);
    if (filePath !== categoryRoot && !filePath.startsWith(`${categoryRoot}${sep}`)) {
      response.statusCode = 400;
      response.end('Invalid fixture path');
      return true;
    }
  } else if (/^\/(samples\.json|favicon\.svg|icons\.svg)$/.test(pathname)) {
    filePath = resolve(publicRoot, pathname.slice(1));
  } else {
    return false;
  }

  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    response.statusCode = 404;
    response.end('Fixture not found');
    return true;
  }

  const range = rangeFor(request.headers.range, size);
  if (request.headers.range && !range) {
    response.statusCode = 416;
    response.setHeader('Content-Range', `bytes */${size}`);
    response.end('Range not satisfiable');
    return true;
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  response.statusCode = range ? 206 : 200;
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Length', String(end - start + 1));
  response.setHeader('Content-Type', contentType(filePath));
  if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  createReadStream(filePath, { start, end }).pipe(response);
  return true;
}

export function viteFixtureServer(): Plugin {
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    if (!serveFixture(request, response)) next();
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
