export type CopcSample = {
  name: string;
  path: string;
  url: string;
};

type SampleManifest = {
  files?: unknown;
};

export async function loadSampleCatalog(baseUrl: string): Promise<CopcSample[]> {
  const response = await fetch(`${baseUrl}samples.json`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`샘플 목록을 불러오지 못했습니다. (${response.status})`);
  }

  const manifest: SampleManifest = await response.json();

  if (!Array.isArray(manifest.files)) {
    throw new Error('샘플 목록 형식이 올바르지 않습니다.');
  }

  return manifest.files
    .flatMap((file) => {
      if (typeof file !== 'string') {
        return [];
      }

      const path = file.trim();
      if (!path.toLowerCase().endsWith('.copc.laz')) {
        return [];
      }

      return [{
        name: path.split('/').at(-1) ?? path,
        path,
        url: `${baseUrl}samples/${path
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/')}`,
      }];
    });
}
