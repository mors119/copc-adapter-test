import { Readable } from 'node:stream';
import { FixtureServer } from '../../packages/fixture-server/src/index.ts';
import { NextResponse, type NextRequest } from 'next/server';

type FixtureRouteContext = {
  params: Promise<{ path: string[] }>;
};

const fixtureServer = new FixtureServer();

function nextResponse(result: Awaited<ReturnType<FixtureServer['handle']>>): NextResponse {
  if (!result) return new NextResponse('Fixture route not found', { status: 404 });
  const body = result.body ? Readable.toWeb(result.body) as unknown as BodyInit : undefined;
  return new NextResponse(body, { status: result.status, headers: result.headers });
}

/** Adapt one shared FixtureServer request to a Next route handler. */
export function createFixtureRoute(routePath: 'fixtures' | 'samples' | 'cesium') {
  return async function fixtureRoute(request: NextRequest, context: FixtureRouteContext): Promise<NextResponse> {
    const { path } = await Promise.resolve(context.params);
    const relativePath = (path ?? []).map((segment) => encodeURIComponent(segment)).join('/');
    const url = `/${routePath}/${relativePath}${request.nextUrl.search}`;
    const result = await fixtureServer.handle({
      method: request.method,
      url,
      headers: Object.fromEntries(request.headers.entries()),
    });
    return nextResponse(result);
  };
}

export async function fixtureCatalogRoute(): Promise<NextResponse> {
  return nextResponse(await fixtureServer.handle({ method: 'GET', url: '/fixtures.json' }));
}

export async function fixtureStatsRoute(): Promise<NextResponse> {
  return nextResponse(await fixtureServer.handle({ method: 'GET', url: '/__fixture__/stats' }));
}

export async function fixtureResetRoute(): Promise<NextResponse> {
  return nextResponse(await fixtureServer.handle({ method: 'POST', url: '/__fixture__/reset' }));
}
