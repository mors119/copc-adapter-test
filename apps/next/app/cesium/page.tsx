import { RendererClient } from '../renderer-client';

type PageProps = { searchParams: Promise<{ backend?: string; fixtureId?: string }> };

export default async function CesiumPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <RendererClient renderer="cesium" backend={params.backend} fixtureId={params.fixtureId} />;
}
