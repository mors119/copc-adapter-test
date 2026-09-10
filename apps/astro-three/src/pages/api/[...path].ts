import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import type { APIRoute } from 'astro';
import { FixtureServer } from '@copc-test/fixture-server';

const fixtureServer = new FixtureServer({
  staticRoot: resolve(process.cwd(), '../../node_modules/cesium/Build/Cesium'),
});

const handle: APIRoute = async ({ request, url }) => {
  const sharedPath = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const result = await fixtureServer.handle({
    method: request.method,
    url: `${sharedPath}${url.search}`,
    headers: Object.fromEntries(request.headers.entries()),
  });
  if (!result) return new Response('Not found', { status: 404 });
  const body = result.body ? Readable.toWeb(result.body) as unknown as BodyInit : undefined;
  return new Response(body, { status: result.status, headers: result.headers });
};

export const GET = handle;
export const HEAD = handle;
export const OPTIONS = handle;
export const POST = handle;
