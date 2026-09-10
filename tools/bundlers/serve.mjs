import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { FixtureServer } from '../../packages/fixture-server/src/index.ts';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] ?? fallback;
}

const distRoot = resolve(option('--dist', 'dist'));
const host = option('--host', '127.0.0.1');
const port = Number(option('--port', process.env.PORT ?? 4173));
const fixtureServer = new FixtureServer({ staticRoot: distRoot });

const fixturePath = (pathname) => pathname === '/fixtures.json'
  || pathname === '/samples.json'
  || pathname === '/__fixture__/stats'
  || pathname === '/__fixture__/reset'
  || pathname.startsWith('/fixtures/')
  || pathname.startsWith('/samples/');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function safeStaticPath(pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidate = resolve(distRoot, relative);
  return candidate === distRoot || candidate.startsWith(`${distRoot}${sep}`) ? candidate : undefined;
}

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(body);
}

async function handle(request, response) {
  const url = new URL(request.url ?? '/', `http://${host}`);
  if (fixturePath(url.pathname)) {
    const result = await fixtureServer.handle({ method: request.method, url: request.url ?? '/', headers: request.headers });
    if (!result) return send(response, 404, 'Not found');
    response.writeHead(result.status, result.headers);
    if (result.body) result.body.pipe(response);
    else response.end();
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') return send(response, 405, 'Method not allowed');
  const requested = safeStaticPath(url.pathname);
  const filePath = requested && existsSync(requested) && statSync(requested).isFile()
    ? requested
    : join(distRoot, 'index.html');
  if (!existsSync(filePath)) return send(response, 404, 'Build output is missing. Run the bundler build first.');
  const headers = { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream' };
  response.writeHead(200, headers);
  if (request.method === 'HEAD') response.end();
  else createReadStream(filePath).pipe(response);
}

createServer((request, response) => {
  void handle(request, response).catch((error) => send(response, 500, error instanceof Error ? error.message : String(error)));
}).listen(port, host, () => {
  console.log(`Bundler smoke server listening on http://${host}:${port}`);
  console.log(`Bundler phase=runtime dist=${distRoot}`);
});
