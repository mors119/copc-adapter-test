import { resolve } from 'node:path';
import type { ServerResponse } from 'node:http';
import { FixtureServer } from '@copc-test/fixture-server';

const fixtureServer = new FixtureServer({
  staticRoot: resolve(process.cwd(), '../../node_modules/cesium/Build/Cesium'),
});

export async function handleFixtureRequest(event: {
  node: { req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined> }; res: ServerResponse };
}): Promise<void> {
  const requestUrl = new URL(event.node.req.url ?? '/', 'http://nuxt.local');
  const sharedPath = requestUrl.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const result = await fixtureServer.handle({
    method: event.node.req.method,
    url: `${sharedPath}${requestUrl.search}`,
    headers: event.node.req.headers,
  });
  const response = event.node.res;
  if (!result) {
    response.statusCode = 404;
    response.end();
    return;
  }
  response.statusCode = result.status;
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  if (!result.body) {
    response.end();
    return;
  }
  await new Promise<void>((resolvePromise, reject) => {
    result.body?.once('error', reject).once('end', resolvePromise).pipe(response);
  });
}
