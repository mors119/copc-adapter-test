import { RendererClient } from '../renderer-client';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ThreePage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <RendererClient
      renderer="three"
      backend={params.backend}
      fixtureId={params.fixtureId}
      sourceId={params.sourceId}
      initialSearchParams={params}
    />
  );
}
