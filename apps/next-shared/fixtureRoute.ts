import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { resolve, sep } from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';

type FixtureRouteContext = {
  params: Promise<{ path: string[] }>;
};

function fixtureRoot(): string {
  return resolve(process.cwd(), process.env.COPC_FIXTURES_ROOT ?? '../../public');
}

function contentType(path: string): string {
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.wasm')) return 'application/wasm';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.laz')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function getSafeFile(assetDirectory: string, segments: string[]): string {
  const root = resolve(fixtureRoot(), assetDirectory);
  const candidate = resolve(root, ...segments);

  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    throw new Error('Invalid fixture path');
  }

  return candidate;
}

function parseRange(header: string | null, size: number): { start: number; end: number } | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return undefined;

  const requestedStart = match[1] ? Number(match[1]) : undefined;
  const requestedEnd = match[2] ? Number(match[2]) : undefined;
  if (requestedStart === undefined && requestedEnd === undefined) return undefined;

  if (requestedStart === undefined) {
    const suffixLength = Math.min(requestedEnd ?? 0, size);
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  if (!Number.isSafeInteger(requestedStart) || requestedStart >= size) return undefined;
  return {
    start: requestedStart,
    end: Math.min(requestedEnd ?? size - 1, size - 1),
  };
}

export function createFixtureRoute(assetDirectory: string) {
  return async function GET(request: NextRequest, context: FixtureRouteContext): Promise<NextResponse> {
    const { path } = await Promise.resolve(context.params);
    let filePath: string;

    try {
      filePath = getSafeFile(assetDirectory, path ?? []);
    } catch {
      return new NextResponse('Invalid fixture path', { status: 400 });
    }

    let size: number;
    try {
      size = statSync(filePath).size;
    } catch {
      return new NextResponse('Fixture not found', { status: 404 });
    }

    const range = parseRange(request.headers.get('range'), size);
    if (request.headers.has('range') && !range) {
      return new NextResponse('Range not satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }

    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    const stream = createReadStream(filePath, { start, end });
    const body = Readable.toWeb(stream) as unknown as BodyInit;
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Length': String(end - start + 1),
      'Content-Type': contentType(filePath),
    });

    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    return new NextResponse(body, { status: range ? 206 : 200, headers });
  };
}
