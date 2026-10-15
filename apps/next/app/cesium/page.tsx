import { RendererClient } from '../renderer-client';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CesiumPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <RendererClient
      renderer="cesium"
      initialSearchParams={params}
    />
  );
}
