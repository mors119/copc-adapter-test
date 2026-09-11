import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertBoundedRangeStreaming,
  assertCopcHeader,
  parseCopcHeader,
} from './fixture-contract.ts';

const fixture = {
  id: 'fixture',
  title: 'fixture',
  filename: 'fixture.copc.laz',
  capabilities: ['valid-copc'],
  source: { url: 'https://example.test/fixture.copc.laz', provenance: 'test', license: 'MIT' },
  checksum: { algorithm: 'sha256' as const, value: null },
  sizeBytes: 1000,
  coverage: {
    status: 'covered' as const,
    lasVersion: '1.4' as const,
    pointFormat: 7 as const,
  },
  rangePolicy: { maxSingleRequestBytes: 512, maxTotalBytesRatio: 0.9 },
  cachePath: 'fixture.copc.laz',
};

test('parses and validates the LAS/COPC header contract', () => {
  const bytes = new Uint8Array(589);
  bytes.set(new TextEncoder().encode('LASF'), 0);
  bytes[24] = 1;
  bytes[25] = 4;
  bytes[104] = 0x87;
  const header = parseCopcHeader(bytes);
  assert.deepEqual(header, { signature: 'LASF', lasVersion: '1.4', pointFormat: 7 });
  assert.doesNotThrow(() => assertCopcHeader(header, fixture));
});
test('rejects a whole-file or over-budget streaming load', () => {
  assert.throws(() => assertBoundedRangeStreaming({
    requests: [{ fixtureId: 'fixture', range: 'bytes=0-600', bytesServed: 601 }],
  }, fixture), /one range/);
  assert.throws(() => assertBoundedRangeStreaming({
    requests: [{ fixtureId: 'fixture', range: 'bytes=0-400', bytesServed: 950 }],
  }, fixture), /served 950 bytes/);
});
