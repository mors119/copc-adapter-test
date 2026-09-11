import type { FixtureCatalogEntry } from '@copc-test/fixture-client';
import type { HarnessResult } from '@copc-test/test-contract';

export type FixtureRequestStats = {
  bytesServed?: number;
  requestedRanges?: string[];
  requests?: Array<{
    fixtureId?: string;
    range?: string;
    bytesServed?: number;
    status?: number;
  }>;
};

export type CopcHeaderSummary = {
  signature: string;
  lasVersion: string;
  pointFormat: number;
};

export function assertBackendIdentity(result: HarnessResult, requested: string): void {
  if (result.diagnostics.backend !== requested) {
    throw new Error(
      `Requested backend ${requested}, but the public diagnostics reported ${result.diagnostics.backend ?? 'unknown'}.`,
    );
  }
}

/** Validate the renderer-neutral point-picking shape without inventing fields. */
export function assertSelectedPoint(result: HarnessResult, fixture: FixtureCatalogEntry): void {
  const point = result.diagnostics.selectedPoint;
  if (!point?.position || point.position.length !== 3
    || point.position.some((value) => !Number.isFinite(value))) {
    throw new Error(`Fixture ${fixture.id} did not publish finite picked-point coordinates.`);
  }

  const attributes = point.attributes ?? {};
  const sourceAttributes = new Set(fixture.coverage.attributes ?? []);
  const scalarAttributes = ['intensity', 'classification'] as const;
  for (const attribute of scalarAttributes) {
    if (attribute in attributes && !sourceAttributes.has(attribute)) {
      throw new Error(`Fixture ${fixture.id} published unsupported picked attribute ${attribute}.`);
    }
  }

  const rgbAttributes = ['red', 'green', 'blue'];
  const hasRgb = rgbAttributes.some((attribute) => attribute in attributes);
  if (hasRgb && !sourceAttributes.has('rgb')) {
    throw new Error(`Fixture ${fixture.id} published RGB picked attributes without RGB source data.`);
  }
  if (hasRgb && rgbAttributes.some((attribute) => !(attribute in attributes))) {
    throw new Error(`Fixture ${fixture.id} published an incomplete RGB picked attribute set.`);
  }
}

export function parseCopcHeader(bytes: Uint8Array): CopcHeaderSummary {
  if (bytes.length < 105) throw new Error(`COPC header probe was only ${bytes.length} bytes.`);
  const signature = new TextDecoder().decode(bytes.subarray(0, 4));
  const lasVersion = `${bytes[24]}.${bytes[25]}`;
  // LASzip sets the high compression bits on the point format byte.
  const pointFormat = bytes[104]! & 0x3f;
  return { signature, lasVersion, pointFormat };
}

export function assertCopcHeader(
  header: CopcHeaderSummary,
  fixture: FixtureCatalogEntry,
): void {
  const coverage = fixture.coverage;
  if (header.signature !== 'LASF') throw new Error(`Fixture ${fixture.id} is not a LAS/COPC resource.`);
  if (coverage.lasVersion && header.lasVersion !== coverage.lasVersion) {
    throw new Error(`Fixture ${fixture.id} expected LAS ${coverage.lasVersion}, received ${header.lasVersion}.`);
  }
  if (coverage.pointFormat && header.pointFormat !== coverage.pointFormat) {
    throw new Error(`Fixture ${fixture.id} expected point format ${coverage.pointFormat}, received ${header.pointFormat}.`);
  }
}

function rangeLength(range: string): number | undefined {
  const match = /^bytes=(\d+)-(\d+)$/.exec(range);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && end >= start
    ? end - start + 1
    : undefined;
}

/**
 * Assert that the successful browser load used partial reads and stayed below
 * the dataset budget recorded next to the fixture provenance.
 */
export function assertBoundedRangeStreaming(
  stats: FixtureRequestStats,
  fixture: FixtureCatalogEntry,
): void {
  const requests = stats.requests?.filter((request) => request.fixtureId === fixture.id) ?? [];
  const ranges = requests.map((request) => request.range).filter((range): range is string => Boolean(range));
  if (ranges.length === 0) throw new Error(`Fixture ${fixture.id} was loaded without an HTTP Range request.`);

  const maxSingle = fixture.rangePolicy?.maxSingleRequestBytes;
  if (maxSingle !== undefined) {
    for (const range of ranges) {
      const length = rangeLength(range);
      if (length !== undefined && length > maxSingle) {
        throw new Error(`Fixture ${fixture.id} requested ${length} bytes in one range; budget is ${maxSingle}.`);
      }
    }
  }

  if (fixture.sizeBytes && fixture.rangePolicy?.maxTotalBytesRatio !== undefined) {
    const bytesServed = requests.reduce((total, request) => total + (request.bytesServed ?? 0), 0);
    const budget = fixture.sizeBytes * fixture.rangePolicy.maxTotalBytesRatio;
    if (bytesServed > budget) {
      throw new Error(`Fixture ${fixture.id} served ${bytesServed} bytes; budget is ${Math.floor(budget)}.`);
    }
  }
}
