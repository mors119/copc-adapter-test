import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FixtureServer, parseByteRange, type FixtureCatalog } from '../src/index.ts';

type FixtureResult = NonNullable<Awaited<ReturnType<FixtureServer['handle']>>>;

async function bodyText(body: NonNullable<FixtureResult['body']>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function createServer(options: ConstructorParameters<typeof FixtureServer>[0] = {}) {
  const root = await mkdtemp(join(tmpdir(), 'copc-fixture-server-'));
  const catalogPath = join(root, 'catalog.json');
  const fixturePath = join(root, 'fixture.copc.laz');
  const catalog: FixtureCatalog = {
    version: 1,
    defaultFixtureId: 'test-fixture',
    fixtures: [{
      id: 'test-fixture',
      title: 'Test fixture',
      filename: 'fixture.copc.laz',
      capabilities: ['valid-copc'],
      source: { url: 'https://example.test/fixture.copc.laz', provenance: 'test', license: 'MIT' },
      checksum: { algorithm: 'sha256', value: null },
      cachePath: 'fixture.copc.laz',
    }],
  };
  await writeFile(fixturePath, '0123456789');
  await writeFile(catalogPath, JSON.stringify(catalog));
  return {
    root,
    server: new FixtureServer({ rootDir: root, catalogPath, corsOrigin: 'https://test.example', ...options }),
  };
}

test('parses normal and suffix byte ranges', () => {
  assert.deepEqual(parseByteRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(parseByteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.equal(parseByteRange('bytes=9-2', 10), undefined);
  assert.equal(parseByteRange('bytes=10-10', 10), undefined);
});

test('serves a catalog fixture with range and CORS headers and records stats', async () => {
  const { root, server } = await createServer();
  try {
    const result = await server.handle({
      method: 'GET',
      url: '/fixtures/test-fixture',
      headers: { range: 'bytes=2-5' },
    });
    assert.ok(result);
    assert.equal(result.status, 206);
    assert.equal(result.headers['Content-Range'], 'bytes 2-5/10');
    assert.equal(result.headers['Access-Control-Allow-Origin'], 'https://test.example');
    assert.equal(await bodyText(result.body!), '2345');
    assert.deepEqual(server.getStats().requestedRanges, ['bytes=2-5']);
    assert.equal(server.getStats().bytesServed, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('supports deterministic ignored-range and transient-failure scenarios', async () => {
  const { root, server } = await createServer();
  try {
    const ignored = await server.handle({
      url: '/fixtures/test-fixture?fixtureScenario=ignore-range',
      headers: { range: 'bytes=0-1' },
    });
    assert.ok(ignored);
    assert.equal(ignored.status, 200);
    assert.equal(ignored.headers['Accept-Ranges'], undefined);
    assert.equal(await bodyText(ignored.body!), '0123456789');

    const firstFailure = await server.handle({
      url: '/fixtures/test-fixture?fixtureScenario=transient-failure',
    });
    assert.ok(firstFailure);
    assert.equal(firstFailure.status, 503);
    const retry = await server.handle({
      url: '/fixtures/test-fixture?fixtureScenario=transient-failure',
    });
    assert.ok(retry);
    assert.equal(retry.status, 200);
    assert.equal(server.getStats().failures, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('uses configured delay, rejects ranges beyond truncated content, and excludes HEAD bodies from stats', async () => {
  const { root, server } = await createServer({ delayMs: 20 });
  try {
    const delayedStart = Date.now();
    const delayed = await server.handle({
      method: 'HEAD',
      url: '/fixtures/test-fixture?fixtureScenario=delayed',
    });
    assert.ok(delayed);
    assert.ok(Date.now() - delayedStart >= 15);

    const ordinaryStart = Date.now();
    const ordinary = await server.handle({
      method: 'HEAD',
      url: '/fixtures/test-fixture',
    });
    assert.ok(ordinary);
    assert.ok(Date.now() - ordinaryStart >= 15);

    const truncated = await server.handle({
      url: '/fixtures/test-fixture?fixtureScenario=truncated',
      headers: { range: 'bytes=7-8' },
    });
    assert.ok(truncated);
    assert.equal(truncated.status, 416);
    assert.equal(truncated.headers['Content-Range'], 'bytes */10');

    const beforeHead = server.getStats();
    const head = await server.handle({
      method: 'HEAD',
      url: '/fixtures/test-fixture',
      headers: { range: 'bytes=2-5' },
    });
    assert.ok(head);
    assert.equal(head.status, 206);
    assert.equal(head.headers['Content-Length'], '4');
    assert.equal(head.body, undefined);
    assert.equal(server.getStats().bytesServed, beforeHead.bytesServed);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
