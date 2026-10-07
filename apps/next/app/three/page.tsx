import { RendererClient } from '../renderer-client';

type PageProps = { searchParams: Promise<{ backend?: string; fixtureId?: string }> };

export default async function ThreePage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <RendererClient renderer="three" backend={params.backend} fixtureId={params.fixtureId} />;
}
