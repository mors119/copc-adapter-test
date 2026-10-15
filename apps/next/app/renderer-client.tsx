'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SOURCE_SELECTION, createHarnessConfig, createTestContract, loadFixtureCatalog, resolveCopcSourceSelection, type FixtureCatalogEntry, type HarnessRenderer, type HarnessView } from '@copc-test/core';
import { ReactControlPanel, panelStateFromConfig, type PanelActions, type PanelSelection, type PanelState } from '@copc-test/ui/react';
import type { TestRenderer, RendererStatus } from '@copc-test/renderers';

type RendererName = 'cesium' | 'three';
type BackendName = 'copc-js' | 'rust';
type ColorMode = 'rgb' | 'elevation' | 'intensity' | 'classification';
function validBackend(value: string | undefined): BackendName {
  return value === 'rust' ? 'rust' : 'copc-js';
}
function validSourceSelection(sourceId: string | undefined, fixtureId: string | undefined): string {
  if (sourceId?.startsWith('remote:')) {
    try { resolveCopcSourceSelection(sourceId); return sourceId; } catch { return DEFAULT_SOURCE_SELECTION; }
  }
  return fixtureId && /^[a-z0-9-]+$/u.test(fixtureId) ? fixtureId : DEFAULT_SOURCE_SELECTION;
}
const nextConfig = createHarnessConfig({
  appId: 'next', host: 'next', renderer: 'cesium', fixtureUrl: resolveCopcSourceSelection(DEFAULT_SOURCE_SELECTION).url,
  backend: 'copc-js', scenario: 'load-and-stream',
}, process.env, 'NEXT_PUBLIC_');
const contract = createTestContract(nextConfig);
if (typeof window !== 'undefined') window.__COPC_TEST__ = contract;

export function RendererClient({ renderer, backend, fixtureId, sourceId }: { renderer: RendererName; backend?: string; fixtureId?: string; sourceId?: string }): ReactNode {
  const initialSourceId = validSourceSelection(sourceId, fixtureId);
  const [selection, setSelection] = useState<PanelSelection>({ renderer, backend: validBackend(backend), fixtureId: initialSourceId });
  const [status, setStatus] = useState<PanelState['status']>('idle');
  const [snapshot, setSnapshot] = useState<unknown>();
  const [error, setError] = useState<string>();
  const [sourceProbe, setSourceProbe] = useState<PanelState['sourceProbe']>();
  const [colorMode, setColorMode] = useState<ColorMode>('elevation');
  const [reloadKey, setReloadKey] = useState(0);
  const [fixtures, setFixtures] = useState<FixtureCatalogEntry[]>([]);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<TestRenderer | undefined>(undefined);
  const colorModeRef = useRef<ColorMode>(colorMode);
  colorModeRef.current = colorMode;
  const demoTimerRef = useRef<number | undefined>(undefined);
  const source = resolveCopcSourceSelection(selection.fixtureId);
  const fixtureUrl = source.url;
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
  const onSourceProbe = useCallback((probe: PanelState['sourceProbe']): void => setSourceProbe(probe), []);

  useEffect(() => {
    contract.setConfig({ renderer, backend: selection.backend, fixtureUrl });
    setPanelState((previous) => ({ ...previous, ...selection, host: 'next', renderer, fixtureUrl, status, snapshot, error, sourceProbe,
      activeDatasetUrl: (snapshot as { datasetUrl?: string } | undefined)?.datasetUrl,
      activeSourceKind: (snapshot as { sourceKind?: PanelState['activeSourceKind'] } | undefined)?.sourceKind,
      pickedPoint: (snapshot as { pickedPoint?: unknown } | undefined)?.pickedPoint,
      colorMode,
    }));
  }, [renderer, selection, fixtureUrl, status, snapshot, error, sourceProbe, colorMode]);
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
      mountTestRenderer(renderer, container, { fixtureUrl, sourceKind: source.kind, colorMode: colorModeRef.current, backend: selection.backend, onStatus, onSnapshot, onAttached, onSourceProbe })
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
  }, [renderer, fixtureUrl, source.kind, selection.backend, reloadKey, onStatus, onSnapshot, onAttached, onSourceProbe]);

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
      const params = new URLSearchParams({ backend: next.backend, ...(next.fixtureId.startsWith('remote:') ? { sourceId: next.fixtureId } : { fixtureId: next.fixtureId }) });
      window.location.assign(`${next.renderer === 'three' ? '/three' : '/cesium'}?${params}`);
      return;
    }
    let nextSource: ReturnType<typeof resolveCopcSourceSelection>;
    try { nextSource = resolveCopcSourceSelection(next.fixtureId); }
    catch (cause) { setStatus('error'); setError(cause instanceof Error ? cause.message : String(cause)); return; }
    if (colorMode !== 'elevation' && nextSource.remote?.expectedCapabilities[colorMode] === false) setColorMode('elevation');
    setSelection(next); setSnapshot(undefined); setError(undefined); setSourceProbe(undefined);
    if (next.backend === selection.backend && next.fixtureId === selection.fixtureId) setReloadKey((value) => value + 1);
  }, [renderer, selection, colorMode]);
  const setView = (view: Exclude<HarnessView, 'visual'>): void => { void rendererRef.current?.setView(view); };
  const setStyle = (mode: ColorMode): void => {
    setColorMode(mode);
    rendererRef.current?.setStyle?.(mode);
  };
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
    setStyle,
  };
  const displayedState: PanelState = { ...panelState, ...selection, renderer, fixtureUrl, status, snapshot, error, sourceProbe, colorMode };

  return <main className="copc-renderer-root" data-host="next" data-renderer={renderer}>
    <div ref={viewportRef} className="copc-renderer-root" data-testid="renderer-viewport" />
    <ReactControlPanel config={config} state={displayedState} renderers={['cesium', 'three'] as HarnessRenderer[]} actions={actions} fixtures={fixtures} />
  </main>;
}
