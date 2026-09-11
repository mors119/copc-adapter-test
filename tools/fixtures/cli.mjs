import { createHash } from 'node:crypto';
import { createWriteStream, readFileSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  DEFAULT_FIXTURE_CATALOG,
  DEFAULT_FIXTURE_PORT,
  DEFAULT_FIXTURE_ROOT,
  startFixtureHttpServer,
} from '../../packages/fixture-server/src/index.ts';

const command = process.argv[2] ?? 'list';
const args = process.argv.slice(3);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(name) {
  return args.includes(name);
}

function paths() {
  const root = resolve(process.env.COPC_FIXTURE_ROOT ?? DEFAULT_FIXTURE_ROOT);
  const catalogPath = resolve(process.env.COPC_FIXTURE_CATALOG ?? DEFAULT_FIXTURE_CATALOG);
  return { root, catalogPath };
}

function readCatalog() {
  const { catalogPath } = paths();
  return JSON.parse(readFileSync(catalogPath, 'utf8'));
}

function selectFixtures(catalog) {
  const requested = args.filter((value) => !value.startsWith('--'));
  const candidates = hasFlag('--all')
    ? catalog.fixtures
    : requested.length === 0
      ? [catalog.fixtures.find((fixture) => fixture.id === catalog.defaultFixtureId)]
      : requested.map((id) => {
        const fixture = catalog.fixtures.find((candidate) => candidate.id === id);
        if (!fixture) throw new Error(`Unknown fixture ID "${id}".`);
        return fixture;
      });

  const gaps = candidates.filter((fixture) => fixture?.coverage?.status === 'gap');
  if (gaps.length > 0 && !hasFlag('--include-gaps')) {
    if (requested.length > 0) {
      throw new Error(`${gaps.map((fixture) => fixture.id).join(', ')} is a documented fixture gap. Use --include-gaps only to attempt it explicitly.`);
    }
    return candidates.filter((fixture) => fixture?.coverage?.status !== 'gap');
  }
  return candidates;
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function sha256(path) {
  const hash = createHash('sha256');
  const stream = (await import('node:fs')).createReadStream(path);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function fetchFixture(fixture, force = false) {
  const { root } = paths();
  const destination = resolve(root, fixture.cachePath);
  if (!destination.startsWith(`${root}${sep}`)) throw new Error(`Unsafe cache path for ${fixture.id}.`);
  if (!force && await isFile(destination)) {
    console.log(`${fixture.id}: already cached at ${destination}`);
    return destination;
  }

  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.part-${process.pid}`;
  console.log(`${fixture.id}: downloading ${fixture.source.url}`);
  const response = await fetch(fixture.source.url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`${fixture.id}: download failed (${response.status}).`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  await rename(temporary, destination);

  const digest = await sha256(destination);
  if (fixture.checksum.value && fixture.checksum.value !== digest) {
    await rm(destination, { force: true });
    throw new Error(`${fixture.id}: checksum mismatch (expected ${fixture.checksum.value}, received ${digest}).`);
  }
  console.log(`${fixture.id}: cached (${digest})`);
  return destination;
}

async function listFixtures() {
  const catalog = readCatalog();
  const { root } = paths();
  for (const fixture of catalog.fixtures) {
    const cached = await isFile(resolve(root, fixture.cachePath));
    console.log(`${fixture.id}${fixture.id === catalog.defaultFixtureId ? ' (default)' : ''}`);
    console.log(`  ${fixture.title}`);
    console.log(`  capabilities: ${fixture.capabilities.join(', ')}`);
    console.log(`  coverage: ${fixture.coverage?.status ?? 'covered'}${fixture.coverage?.gapReason ? ` (${fixture.coverage.gapReason})` : ''}`);
    if (fixture.sizeBytes) console.log(`  size: ${fixture.sizeBytes} bytes`);
    console.log(`  cache: ${cached ? 'ready' : 'missing'} (${fixture.cachePath})`);
    console.log(`  source: ${fixture.source.url}`);
  }
}

async function verifyFixtures() {
  const catalog = readCatalog();
  const { root } = paths();
  let failures = 0;
  for (const fixture of selectFixtures(catalog)) {
    const path = resolve(root, fixture.cachePath);
    if (!(await isFile(path))) {
      console.error(`${fixture.id}: missing (${path})`);
      failures += 1;
      continue;
    }
    const digest = await sha256(path);
    if (fixture.sizeBytes && (await stat(path)).size !== fixture.sizeBytes) {
      console.error(`${fixture.id}: size mismatch (expected ${fixture.sizeBytes}, received ${(await stat(path)).size})`);
      failures += 1;
      continue;
    }
    if (!fixture.checksum.value) {
      console.log(`${fixture.id}: ${digest} (no publisher checksum recorded)`);
    } else if (fixture.checksum.value === digest) {
      console.log(`${fixture.id}: checksum OK (${digest})`);
    } else {
      console.error(`${fixture.id}: checksum mismatch (expected ${fixture.checksum.value}, received ${digest})`);
      failures += 1;
    }
  }
  if (failures > 0 || (hasFlag('--strict') && selectFixtures(catalog).some((fixture) => !fixture.checksum.value))) {
    process.exitCode = 1;
  }
}

async function cleanFixtures() {
  const { root } = paths();
  if (root.split(sep).at(-1) !== 'copc-fixtures') throw new Error(`Refusing to clean unexpected fixture root: ${root}`);
  await rm(root, { recursive: true, force: true });
  console.log(`Removed downloaded fixtures from ${root}`);
}

async function serveFixtures() {
  const port = Number(option('--port') ?? process.env.COPC_FIXTURE_PORT ?? DEFAULT_FIXTURE_PORT);
  const host = option('--host') ?? process.env.COPC_FIXTURE_HOST ?? '127.0.0.1';
  const server = startFixtureHttpServer({ port, host });
  await new Promise((resolvePromise, reject) => {
    server.once('listening', resolvePromise);
    server.once('error', reject);
  });
  await new Promise((resolvePromise) => {
    const close = () => server.close(() => resolvePromise());
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  });
}

if (command === 'list') {
  await listFixtures();
} else if (command === 'fetch') {
  const catalog = readCatalog();
  for (const fixture of selectFixtures(catalog)) await fetchFixture(fixture, hasFlag('--force'));
} else if (command === 'verify') {
  await verifyFixtures();
} else if (command === 'serve') {
  await serveFixtures();
} else if (command === 'clean') {
  await cleanFixtures();
} else {
  throw new Error(`Unknown fixture command "${command}". Use list, fetch, verify, serve, or clean.`);
}
