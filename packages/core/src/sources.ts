import { fixtureUrlForId } from './fixtures.ts';

export type RemoteCopcSource = {
  id: string;
  name: string;
  url: string;
  description?: string;
  approximateSize?: string;
  expectedCapabilities: {
    range: true;
    rgb?: boolean;
    intensity?: boolean;
    classification?: boolean;
  };
};

/** Browser-verified public COPC origins; never route these through the testbed. */
export const REMOTE_COPC_SOURCES: readonly RemoteCopcSource[] = [
  {
    id: 'autzen',
    name: 'Autzen Stadium',
    url: 'https://data.pointcloud.org/autzen/autzen-classified.copc.laz',
    description: 'Classified 2010 airborne lidar survey over Autzen Stadium, Oregon.',
    approximateSize: '81 MB',
    expectedCapabilities: { range: true, rgb: true, intensity: true, classification: true },
  },
  {
    id: 'chicago-downtown',
    name: 'Chicago Downtown',
    url: 'https://data.pointcloud.org/chicago-downtown/chicago-downtown.copc.laz',
    description: 'Downtown Chicago airborne lidar; a geographically distinct source-switch target.',
    approximateSize: '204 MB',
    expectedCapabilities: { range: true, rgb: false, intensity: true, classification: true },
  },
];

export const DEFAULT_REMOTE_SOURCE_ID = 'autzen';
export const DEFAULT_SOURCE_SELECTION = `remote:${DEFAULT_REMOTE_SOURCE_ID}`;

export type CopcSourceKind = 'remote' | 'local-fixture' | 'custom-remote';

export type ResolvedCopcSource = {
  id: string;
  name: string;
  url: string;
  kind: CopcSourceKind;
  remote?: RemoteCopcSource;
};

/** Resolve the shared panel's remote, fixture, or custom-URL selection. */
export function resolveCopcSourceSelection(selection: string): ResolvedCopcSource {
  if (selection.startsWith('remote:')) {
    const id = selection.slice('remote:'.length);
    const remote = REMOTE_COPC_SOURCES.find((source) => source.id === id);
    if (!remote) throw new Error(`Unknown remote COPC source: ${id}`);
    return { id: remote.id, name: remote.name, url: remote.url, kind: 'remote', remote };
  }
  if (selection.startsWith('custom:')) {
    const url = selection.slice('custom:'.length);
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error('Enter a valid absolute HTTP or HTTPS COPC URL.'); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Custom COPC URLs must use HTTP or HTTPS.');
    }
    return { id: 'custom', name: 'Custom URL', url: parsed.href, kind: 'custom-remote' };
  }
  return {
    id: selection,
    name: selection,
    url: fixtureUrlForId(selection),
    kind: 'local-fixture',
  };
}

/** Remote selections are stable in URLs, while existing fixtureId overrides remain valid. */
export function sourceSelectionFromSearch(params: URLSearchParams): string {
  const sourceId = params.get('sourceId');
  if (sourceId) {
    if (sourceId.startsWith('remote:') || sourceId.startsWith('custom:')) return sourceId;
    return `remote:${sourceId}`;
  }
  return params.get('fixtureId') ?? DEFAULT_SOURCE_SELECTION;
}
