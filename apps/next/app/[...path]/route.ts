import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { FixtureServer } from '@copc-test/fixture-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const fixtureServer = new FixtureServer({ staticRoot: resolve(process.cwd(), '../../node_modules/cesium/Build/Cesium') });

async function handle(request: Request): Promise<Response> {
  const result = await fixtureServer.handle({ method: request.method, url: request.url, headers: Object.fromEntries(request.headers.entries()) });
  if (!result) return new Response('Not found', { status: 404 });
  const body = result.body ? Readable.toWeb(result.body) as ReadableStream<Uint8Array> : null;
  return new Response(body, { status: result.status, headers: result.headers });
}

export const GET = handle;
export const HEAD = handle;
export const OPTIONS = handle;
export async function POST(request: Request): Promise<Response> {
  if (new URL(request.url).pathname !== '/__fixture__/reset') return new Response('Not found', { status: 404 });
  return handle(request);
}
