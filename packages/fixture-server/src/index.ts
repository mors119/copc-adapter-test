import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

export const FIXTURE_SERVER_VERSION = 1 as const;
export const DEFAULT_FIXTURE_PORT = 8787;
const FIXTURE_CATALOG_RELATIVE_PATH = join('fixtures', 'catalog.json');

function repositoryRoot(): string {
  let candidate = resolve(process.cwd());
  while (candidate !== dirname(candidate)) {
    if (existsSync(join(candidate, FIXTURE_CATALOG_RELATIVE_PATH))) return candidate;
    candidate = dirname(candidate);
  }
  return resolve(process.cwd());
}

const DEFAULT_REPOSITORY_ROOT = repositoryRoot();
export const DEFAULT_FIXTURE_ROOT = resolve(DEFAULT_REPOSITORY_ROOT, '.cache/copc-fixtures');
export const DEFAULT_FIXTURE_CATALOG = resolve(DEFAULT_REPOSITORY_ROOT, FIXTURE_CATALOG_RELATIVE_PATH);

export const FIXTURE_SCENARIOS = [
  'default',
  'no-range',
  'ignore-range',
  'malformed-range',
  'not-found',
  'truncated',
  'delayed',
  'transient-failure',
] as const;

export type FixtureScenario = (typeof FIXTURE_SCENARIOS)[number];
export type FixtureChecksum = {
  algorithm: 'sha256';
  value: string | null;
};

export type FixtureSource = {
  url: string;
  provenance: string;
  license: string;
};

export type FixtureRecord = {
  id: string;
  title: string;
  filename: string;
  capabilities: string[];
  source: FixtureSource;
  checksum: FixtureChecksum;
  cachePath: string;
};

export type FixtureCatalog = {
  version: number;
  defaultFixtureId: string;
  fixtures: FixtureRecord[];
};

export type FixtureRequest = {
  method?: string;
  url: string;
  headers?: Record<string, string | string[] | undefined> | IncomingHttpHeaders;
};

export type FixtureRequestLog = {
  timestamp: string;
  method: string;
  url: string;
  fixtureId?: string;
  range?: string;
  scenario: FixtureScenario;
  status: number;
  bytesServed: number;
  failure?: string;
};

export type FixtureStats = {
  requestCount: number;
  requestedRanges: string[];
  bytesServed: number;
  failures: number;
  requests: FixtureRequestLog[];
};

export type FixtureServerOptions = {
  rootDir?: string;
  catalogPath?: string;
  staticRoot?: string;
  scenario?: FixtureScenario;
  delayMs?: number;
  transientFailures?: number;
  maxLogEntries?: number;
  corsOrigin?: string | false;
  corsAllowHeaders?: string;
  corsExposeHeaders?: string;
};

export type FixtureResponse = {
  status: number;
  headers: Record<string, string>;
  body?: Readable;
};

export type FixtureByteRange = { start: number; end: number };
type FixtureTarget = { id?: string; filePath: string; record?: FixtureRecord; invalid?: boolean };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function parseCatalog(value: unknown, source: string): FixtureCatalog {
  const root = asRecord(value);
  const fixtures = root?.fixtures;
  if (!root || typeof root.version !== 'number' || typeof root.defaultFixtureId !== 'string' || !Array.isArray(fixtures)) {
    throw new Error(`Invalid fixture catalog: ${source}`);
  }

  const records = fixtures.flatMap((item): FixtureRecord[] => {
    const record = asRecord(item);
    const sourceValue = asRecord(record?.source);
    const checksum = asRecord(record?.checksum);
    if (
      !record ||
      typeof record.id !== 'string' ||
      typeof record.title !== 'string' ||
      typeof record.filename !== 'string' ||
      !Array.isArray(record.capabilities) ||
      !sourceValue ||
      typeof sourceValue.url !== 'string' ||
      typeof sourceValue.provenance !== 'string' ||
      typeof sourceValue.license !== 'string' ||
      !checksum ||
      checksum.algorithm !== 'sha256' ||
      (checksum.value !== null && typeof checksum.value !== 'string') ||
      typeof record.cachePath !== 'string'
    ) {
      return [];
    }

    return [{
      id: record.id,
      title: record.title,
      filename: record.filename,
      capabilities: record.capabilities.filter((capability): capability is string => typeof capability === 'string'),
      source: {
        url: sourceValue.url,
        provenance: sourceValue.provenance,
        license: sourceValue.license,
      },
      checksum: { algorithm: 'sha256', value: checksum.value as string | null },
      cachePath: record.cachePath,
    }];
  });

  if (records.length !== fixtures.length || !records.some((record) => record.id === root.defaultFixtureId)) {
    throw new Error(`Invalid fixture records: ${source}`);
  }

  return { version: root.version, defaultFixtureId: root.defaultFixtureId, fixtures: records };
}

function safeResolve(root: string, relativePath: string): string | undefined {
  const candidate = resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return undefined;
  return candidate;
}

function contentType(path: string): string {
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.wasm')) return 'application/wasm';
  if (path.endsWith('.laz')) return 'application/octet-stream';
  return 'application/octet-stream';
}

/** Parse one RFC 9110 byte range. Invalid and unsatisfiable ranges return undefined. */
export function parseByteRange(header: string | undefined, size: number): FixtureByteRange | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return undefined;

  const requestedStart = match[1] ? Number(match[1]) : undefined;
  const requestedEnd = match[2] ? Number(match[2]) : undefined;
  if (requestedStart === undefined) {
    if (requestedEnd === undefined || requestedEnd <= 0 || !Number.isSafeInteger(requestedEnd)) return undefined;
    return { start: Math.max(size - Math.min(requestedEnd, size), 0), end: size - 1 };
  }

  if (!Number.isSafeInteger(requestedStart) || requestedStart < 0 || requestedStart >= size) return undefined;
  if (requestedEnd !== undefined && (!Number.isSafeInteger(requestedEnd) || requestedEnd < requestedStart)) return undefined;
  return { start: requestedStart, end: Math.min(requestedEnd ?? size - 1, size - 1) };
}

function headerValue(headers: FixtureRequest['headers'], name: string): string | undefined {
  if (!headers) return undefined;
  const value = headers[name] ?? headers[name.toLowerCase()]
    ?? Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  if (Array.isArray(value)) return value[0];
  return value;
}

function scenarioValue(value: string | null | undefined): FixtureScenario | undefined {
  return FIXTURE_SCENARIOS.includes(value as FixtureScenario) ? value as FixtureScenario : undefined;
}

function requestScenario(request: FixtureRequest, fallback: FixtureScenario): FixtureScenario {
  const url = new URL(request.url, 'http://fixture.local');
  return scenarioValue(url.searchParams.get('fixtureScenario'))
    ?? scenarioValue(headerValue(request.headers, 'x-copc-fixture-scenario'))
    ?? fallback;
}

function fixtureTarget(url: string, catalog: FixtureCatalog, rootDir: string, staticRoot: string): FixtureTarget | undefined {
  const pathname = new URL(url, 'http://fixture.local').pathname;
  const fixtureMatch = /^\/fixtures\/([^/]+)$/.exec(pathname);
  if (fixtureMatch) {
    const id = decodeURIComponent(fixtureMatch[1]!);
    const record = catalog.fixtures.find((fixture) => fixture.id === id);
    if (!record) return { id, filePath: '' };
    const filePath = safeResolve(rootDir, record.cachePath);
    return { id, record, filePath: filePath ?? '', invalid: filePath === undefined };
  }

  const sampleMatch = /^\/samples\/(.+)$/.exec(pathname);
  if (sampleMatch) {
    const relativePath = decodeURIComponent(sampleMatch[1]!);
    const record = catalog.fixtures.find((fixture) => fixture.filename === relativePath || fixture.cachePath === relativePath);
    if (record) {
      const filePath = safeResolve(rootDir, record.cachePath);
      return { id: record.id, record, filePath: filePath ?? '', invalid: filePath === undefined };
    }
    const filePath = safeResolve(rootDir, relativePath);
    return { filePath: filePath ?? '', invalid: filePath === undefined };
  }

  const cesiumMatch = /^\/cesium\/(.+)$/.exec(pathname);
  if (cesiumMatch) {
    const filePath = safeResolve(staticRoot, decodeURIComponent(cesiumMatch[1]!));
    return { filePath: filePath ?? '', invalid: filePath === undefined };
  }
  return undefined;
}

function baseHeaders(options: FixtureServerOptions): Record<string, string> {
  const headers: Record<string, string> = {};
  const origin = options.corsOrigin === undefined ? '*' : options.corsOrigin;
  if (origin !== false) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
    headers['Access-Control-Allow-Headers'] = options.corsAllowHeaders ?? 'Range, Content-Type, X-COPC-Fixture-Scenario';
    headers['Access-Control-Expose-Headers'] = options.corsExposeHeaders ?? 'Accept-Ranges, Content-Range, Content-Length, X-COPC-Fixture-Scenario';
  }
  return headers;
}

function jsonResponse(value: unknown, options: FixtureServerOptions): FixtureResponse {
  const body = JSON.stringify(value, null, 2);
  return {
    status: 200,
    headers: { ...baseHeaders(options), 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(Buffer.byteLength(body)) },
    body: Readable.from([body]),
  };
}

export class FixtureServer {
  readonly catalog: FixtureCatalog;
  readonly rootDir: string;
  readonly staticRoot: string;

  private readonly options: FixtureServerOptions;
  private readonly requests: FixtureRequestLog[] = [];
  private readonly requestedRanges: string[] = [];
  private readonly transientAttempts = new Map<string, number>();
  private totalBytesServed = 0;
  private totalFailures = 0;
  private totalRequestCount = 0;

  constructor(options: FixtureServerOptions = {}) {
    const configuredOrigin = process.env.COPC_FIXTURE_CORS_ORIGIN;
    this.options = {
      ...options,
      scenario: options.scenario ?? scenarioValue(process.env.COPC_FIXTURE_SCENARIO),
      delayMs: options.delayMs ?? Number(process.env.COPC_FIXTURE_DELAY_MS ?? 0),
      transientFailures: options.transientFailures ?? Number(process.env.COPC_FIXTURE_TRANSIENT_FAILURES ?? 1),
      ...(options.corsOrigin === undefined && configuredOrigin !== undefined
        ? { corsOrigin: configuredOrigin === 'false' ? false : configuredOrigin }
        : {}),
    };
    this.rootDir = resolve(options.rootDir ?? process.env.COPC_FIXTURE_ROOT ?? DEFAULT_FIXTURE_ROOT);
    this.staticRoot = resolve(options.staticRoot ?? process.env.COPC_FIXTURE_STATIC_ROOT ?? resolve(DEFAULT_REPOSITORY_ROOT, 'public'));
    const catalogPath = resolve(options.catalogPath ?? process.env.COPC_FIXTURE_CATALOG ?? DEFAULT_FIXTURE_CATALOG);
    this.catalog = parseCatalog(JSON.parse(readFileSync(catalogPath, 'utf8')) as unknown, catalogPath);
  }

  getStats(): FixtureStats {
    return {
      requestCount: this.totalRequestCount,
      requestedRanges: [...this.requestedRanges],
      bytesServed: this.totalBytesServed,
      failures: this.totalFailures,
      requests: this.requests.map((request) => ({ ...request })),
    };
  }

  resetStats(): void {
    this.requests.length = 0;
    this.requestedRanges.length = 0;
    this.totalBytesServed = 0;
    this.totalFailures = 0;
    this.totalRequestCount = 0;
    this.transientAttempts.clear();
  }

  getCatalogResponse(): FixtureResponse {
    return jsonResponse(this.catalog, this.options);
  }

  getStatsResponse(): FixtureResponse {
    return jsonResponse(this.getStats(), this.options);
  }

  private log(request: FixtureRequest, details: Omit<FixtureRequestLog, 'timestamp' | 'method' | 'url'>): void {
    const entry: FixtureRequestLog = {
      timestamp: new Date().toISOString(),
      method: request.method ?? 'GET',
      url: request.url,
      ...details,
    };
    this.totalRequestCount += 1;
    this.totalBytesServed += details.bytesServed;
    if (details.failure !== undefined || details.status >= 400) this.totalFailures += 1;
    if (details.range) this.requestedRanges.push(details.range);
    this.requests.push(entry);
    const maxEntries = this.options.maxLogEntries ?? 1000;
    if (this.requests.length > maxEntries) this.requests.splice(0, this.requests.length - maxEntries);
  }

  async handle(request: FixtureRequest): Promise<FixtureResponse | undefined> {
    const url = new URL(request.url, 'http://fixture.local');
    if (request.method === 'OPTIONS') {
      return { status: 204, headers: baseHeaders(this.options) };
    }
    if (url.pathname === '/fixtures.json' || url.pathname === '/samples.json') return this.getCatalogResponse();
    if (url.pathname === '/__fixture__/stats') return this.getStatsResponse();
    if (url.pathname === '/__fixture__/reset' && (request.method ?? 'GET') === 'POST') {
      this.resetStats();
      return { status: 204, headers: baseHeaders(this.options) };
    }

    const target = fixtureTarget(request.url, this.catalog, this.rootDir, this.staticRoot);
    if (!target) return undefined;

    const scenario = requestScenario(
      request,
      this.options.scenario ?? (target.id === 'invalid-truncated' ? 'truncated' : 'default'),
    );
    const rangeHeader = headerValue(request.headers, 'range');
    const fixtureKey = target.id ?? target.filePath;
    const delayParameter = url.searchParams.get('delayMs');
    const requestedDelay = delayParameter === null ? undefined : Number(delayParameter);
    const hasValidDelayOverride = requestedDelay !== undefined
      && Number.isFinite(requestedDelay)
      && requestedDelay >= 0;
    const delayMs = hasValidDelayOverride ? requestedDelay : this.options.delayMs ?? 0;
    const effectiveDelayMs = scenario === 'delayed' && !hasValidDelayOverride && delayMs === 0 ? 100 : delayMs;
    if (effectiveDelayMs > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, effectiveDelayMs));

    if (target.invalid) {
      this.log(request, { fixtureId: target.id, range: rangeHeader, scenario, status: 400, bytesServed: 0, failure: 'invalid-path' });
      return { status: 400, headers: { ...baseHeaders(this.options), 'Content-Type': 'text/plain; charset=utf-8' }, body: Readable.from(['Invalid fixture path']) };
    }

    if (scenario === 'not-found' || !target.filePath) {
      this.log(request, { fixtureId: target.id, range: rangeHeader, scenario, status: 404, bytesServed: 0, failure: 'not-found' });
      return { status: 404, headers: { ...baseHeaders(this.options), 'Content-Type': 'text/plain; charset=utf-8' }, body: Readable.from(['Fixture not found']) };
    }

    let size: number;
    try {
      size = statSync(target.filePath).size;
    } catch {
      this.log(request, { fixtureId: target.id, range: rangeHeader, scenario, status: 404, bytesServed: 0, failure: 'not-cached' });
      return { status: 404, headers: { ...baseHeaders(this.options), 'Content-Type': 'text/plain; charset=utf-8' }, body: Readable.from(['Fixture not found']) };
    }

    if (scenario === 'transient-failure') {
      const attempt = (this.transientAttempts.get(fixtureKey) ?? 0) + 1;
      this.transientAttempts.set(fixtureKey, attempt);
      const failures = this.options.transientFailures ?? 1;
      if (attempt <= failures) {
        this.log(request, { fixtureId: target.id, range: rangeHeader, scenario, status: 503, bytesServed: 0, failure: `transient-${attempt}` });
        return { status: 503, headers: { ...baseHeaders(this.options), 'Retry-After': '0', 'Content-Type': 'text/plain; charset=utf-8', 'X-COPC-Fixture-Scenario': scenario }, body: Readable.from(['Transient fixture failure']) };
      }
    }

    const parsedRange = parseByteRange(rangeHeader, size);
    if (rangeHeader && !parsedRange && !['ignore-range', 'no-range', 'malformed-range'].includes(scenario)) {
      this.log(request, { fixtureId: target.id, range: rangeHeader, scenario, status: 416, bytesServed: 0, failure: 'unsatisfiable-range' });
      return {
        status: 416,
        headers: { ...baseHeaders(this.options), 'Content-Range': `bytes */${size}`, 'Content-Type': 'text/plain; charset=utf-8' },
        body: Readable.from(['Range not satisfiable']),
      };
    }

    const useRange = Boolean(parsedRange) && !['ignore-range', 'no-range'].includes(scenario);
    const start = useRange ? parsedRange!.start : 0;
    const configuredEnd = useRange ? parsedRange!.end : size - 1;
    const truncation = scenario === 'truncated' ? Math.max(1, Math.floor(size / 2)) : size;
    const end = Math.min(configuredEnd, truncation - 1);
    if (scenario === 'truncated' && start >= truncation) {
      this.log(request, { fixtureId: target.id, range: rangeHeader, scenario, status: 416, bytesServed: 0, failure: 'truncated-range' });
      return {
        status: 416,
        headers: { ...baseHeaders(this.options), 'Content-Range': `bytes */${size}`, 'Content-Type': 'text/plain; charset=utf-8' },
        body: Readable.from(['Range not satisfiable for truncated fixture']),
      };
    }
    const bytesServed = Math.max(end - start + 1, 0);
    const status = useRange ? 206 : 200;
    const headers: Record<string, string> = {
      ...baseHeaders(this.options),
      'Cache-Control': 'no-store',
      'Content-Length': String(bytesServed),
      'Content-Type': contentType(target.filePath),
      'X-COPC-Fixture-Scenario': scenario,
    };
    if (!['ignore-range', 'no-range'].includes(scenario)) headers['Accept-Ranges'] = 'bytes';
    if (useRange) {
      headers['Content-Range'] = scenario === 'malformed-range'
        ? `bytes ${start}-${end}`
        : `bytes ${start}-${end}/${size}`;
    }

    const transferredBytes = request.method === 'HEAD' ? 0 : bytesServed;
    this.log(request, { fixtureId: target.id, range: rangeHeader, scenario, status, bytesServed: transferredBytes });
    if (request.method === 'HEAD' || bytesServed === 0) return { status, headers };
    return { status, headers, body: createReadStream(target.filePath, { start, end }) };
  }
}

export function createFixtureServer(options: FixtureServerOptions = {}): FixtureServer {
  return new FixtureServer(options);
}

function writeNodeResponse(response: ServerResponse, result: FixtureResponse): void {
  response.writeHead(result.status, result.headers);
  if (result.body) result.body.pipe(response);
  else response.end();
}

/** Create the standalone Node server used by local browser/E2E tests. */
export function createFixtureHttpServer(options: FixtureServerOptions = {}): Server {
  const fixtureServer = new FixtureServer(options);
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    void fixtureServer.handle({ method: request.method, url: request.url ?? '/', headers: request.headers }).then((result) => {
      if (!result) {
        response.statusCode = 404;
        response.end('Not found');
        return;
      }
      writeNodeResponse(response, result);
    }).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
}

export function startFixtureHttpServer(options: FixtureServerOptions & { host?: string; port?: number } = {}): Server {
  const server = createFixtureHttpServer(options);
  const host = options.host ?? process.env.COPC_FIXTURE_HOST ?? '127.0.0.1';
  const port = options.port ?? Number(process.env.COPC_FIXTURE_PORT ?? DEFAULT_FIXTURE_PORT);
  server.listen(port, host, () => {
    console.log(`COPC fixture server listening on http://${host}:${port}`);
    console.log(`Fixture root: ${resolve(options.rootDir ?? process.env.COPC_FIXTURE_ROOT ?? DEFAULT_FIXTURE_ROOT)}`);
  });
  return server;
}
