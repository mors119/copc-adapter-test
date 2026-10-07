'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_FIXTURE_ID, createHarnessConfig, createTestContract, fixtureUrlForId, loadFixtureCatalog, type FixtureCatalogEntry, type HarnessRenderer, type HarnessView } from '@copc-test/core';
import { ReactControlPanel, panelStateFromConfig, type PanelActions, type PanelSelection, type PanelState } from '@copc-test/ui/react';
import type { TestRenderer, RendererStatus } from '@copc-test/renderers';

type RendererName = 'cesium' | 'three';
type BackendName = 'copc-js' | 'rust';
function validBackend(value: string | undefined): BackendName {
  return value === 'rust' ? 'rust' : 'copc-js';
}
function validFixture(value: string | undefined): string {
  return value && /^[a-z0-9-]+$/u.test(value) ? value : DEFAULT_FIXTURE_ID;
}
const nextConfig = createHarnessConfig({
  appId: 'next', host: 'next', renderer: 'cesium', fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
  backend: 'copc-js', scenario: 'load-and-stream',
}, process.env, 'NEXT_PUBLIC_');
const contract = createTestContract(nextConfig);
if (typeof window !== 'undefined') window.__COPC_TEST__ = contract;

export function RendererClient({ renderer, backend, fixtureId }: { renderer: RendererName; backend?: string; fixtureId?: string }): ReactNode {
  const [selection, setSelection] = useState<PanelSelection>({ renderer, backend: validBackend(backend), fixtureId: validFixture(fixtureId) });
  const [status, setStatus] = useState<PanelState['status']>('idle');
  const [snapshot, setSnapshot] = useState<unknown>();
  const [error, setError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const [fixtures, setFixtures] = useState<FixtureCatalogEntry[]>([]);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<TestRenderer | undefined>(undefined);
  const demoTimerRef = useRef<number | undefined>(undefined);
  const fixtureUrl = fixtureUrlForId(selection.fixtureId);
  const config = useMemo(() => ({ ...nextConfig, renderer, backend: selection.backend, fixtureUrl }), [renderer, selection.backend, fixtureUrl]);
  const [panelState, setPanelState] = useState<PanelState>(() => panelStateFromConfig(config, 'next', selection.fixtureId));

  useEffect(() => () => {
    if (demoTimerRef.current !== undefined) window.clearInterval(demoTimerRef.current);
  }, []);

  const onStatus = useCallback((next: RendererStatus, message?: string): void => {
    setStatus(next); setError(message);
    if (next === 'loading') contract.markLoading();
    else if (next === 'ready') contract.markReady();
    else if (next === 'error') contract.markError(message ?? 'Renderer failed.');
  }, []);
  const onSnapshot = useCallback((value: unknown): void => { setSnapshot(value); contract.setSnapshot(value); }, []);
  const onAttached = useCallback((): void => contract.markAttached(), []);

  useEffect(() => {
    contract.setConfig({ renderer, backend: selection.backend, fixtureUrl });
    setPanelState((previous) => ({ ...previous, ...selection, host: 'next', renderer, fixtureUrl, status, snapshot, error }));
  }, [renderer, selection, fixtureUrl, status, snapshot, error]);
  useEffect(() => {
    void loadFixtureCatalog().then((catalog) => setFixtures(catalog.fixtures)).catch((cause: unknown) => onStatus('error', cause instanceof Error ? cause.message : String(cause)));
  }, [onStatus]);

  useEffect(() => {
    let disposed = false;
    let mounted: TestRenderer | undefined;
    const container = viewportRef.current;
    if (!container) return undefined;
    contract.recordMount();
    onStatus('loading');
    // This dynamic import is intentionally inside the client effect. The server-rendered module graph stays browser safe.
    void import('@copc-test/renderers').then(({ mountTestRenderer }) =>
      mountTestRenderer(renderer, container, { fixtureUrl, backend: selection.backend, onStatus, onSnapshot, onAttached })
    ).then((handle) => {
      if (disposed) { handle.destroy(); return; }
      mounted = handle; rendererRef.current = handle;
      return handle.ready.catch((cause: unknown) => { if (!disposed) onStatus('error', cause instanceof Error ? cause.message : String(cause)); });
    }).catch((cause: unknown) => { if (!disposed) onStatus('error', cause instanceof Error ? cause.message : String(cause)); });
    return () => {
      disposed = true; mounted?.destroy();
      if (rendererRef.current === mounted) rendererRef.current = undefined;
      contract.recordUnmount(); contract.markDestroyed();
    };
  }, [renderer, fixtureUrl, selection.backend, reloadKey, onStatus, onSnapshot, onAttached]);

  useEffect(() => {
    contract.registerCommand('reload', () => setReloadKey((value) => value + 1));
    contract.registerCommand('setView', (view) => rendererRef.current?.setView(view === 'visual' ? 'overview' : view));
    contract.registerCommand('unload', () => rendererRef.current?.unload());
    contract.registerCommand('destroy', () => { rendererRef.current?.destroy(); setReloadKey((value) => value + 1); });
    return () => { contract.unregisterCommand('reload'); contract.unregisterCommand('setView'); contract.unregisterCommand('unload'); contract.unregisterCommand('destroy'); };
  }, []);

  const apply = useCallback((next: PanelSelection): void => {
    if (demoTimerRef.current !== undefined) window.clearInterval(demoTimerRef.current);
    demoTimerRef.current = undefined;
    if (next.renderer !== renderer) {
      const params = new URLSearchParams({ backend: next.backend, fixtureId: next.fixtureId });
      window.location.assign(`${next.renderer === 'three' ? '/three' : '/cesium'}?${params}`);
      return;
    }
    setSelection(next); setSnapshot(undefined); setError(undefined);
    if (next.backend === selection.backend && next.fixtureId === selection.fixtureId) setReloadKey((value) => value + 1);
  }, [renderer, selection]);
  const setView = (view: Exclude<HarnessView, 'visual'>): void => { void rendererRef.current?.setView(view); };
  const actions: PanelActions = {
    apply, reload: () => setReloadKey((value) => value + 1),
    startDemo: () => {
      if (demoTimerRef.current !== undefined) window.clearInterval(demoTimerRef.current);
      const views = ['near', 'far', 'overview'] as const; let index = 0;
      void setView(views[index++]!);
      demoTimerRef.current = window.setInterval(() => { void setView(views[index++ % views.length]!); }, 1200);
    },
    stopDemo: () => { if (demoTimerRef.current !== undefined) window.clearInterval(demoTimerRef.current); demoTimerRef.current = undefined; },
    overview: () => setView('overview'), far: () => setView('far'), near: () => setView('near'),
  };
  const displayedState: PanelState = { ...panelState, ...selection, renderer, fixtureUrl, status, snapshot, error };

  return <main className="copc-renderer-root" data-host="next" data-renderer={renderer}>
    <div ref={viewportRef} className="copc-renderer-root" data-testid="renderer-viewport" />
    <ReactControlPanel config={config} state={displayedState} renderers={['cesium', 'three'] as HarnessRenderer[]} actions={actions} fixtures={fixtures} />
  </main>;
}
