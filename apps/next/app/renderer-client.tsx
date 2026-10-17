'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_SOURCE_SELECTION,
  createHarnessConfig,
  createTestContract,
  loadFixtureCatalog,
  pointSizeFromSearch,
  renderDistanceFromSearch,
  resolveCopcSourceSelection,
  sourceSelectionFromSearch,
  startCameraDemo,
  streamingSettingsFromSearch,
  type FixtureCatalogEntry,
  type HarnessRenderer,
  type HarnessView,
} from '@copc-test/core';
import {
  ReactControlPanel,
  panelStateFromConfig,
  type PanelActions,
  type PanelSelection,
  type PanelState,
} from '@copc-test/ui/react';
import type { TestRenderer, RendererStatus } from '@copc-test/renderers';

type RendererName = 'cesium' | 'three';
type BackendName = 'copc-js' | 'rust';
type ColorMode = 'rgb' | 'elevation' | 'intensity' | 'classification';
function validBackend(value: string | undefined): BackendName {
  return value === 'rust' ? 'rust' : 'copc-js';
}
function firstSearchValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
function validSourceSelection(
  sourceId: string | undefined,
  fixtureId: string | undefined,
): string {
  const params = new URLSearchParams();
  if (sourceId) params.set('sourceId', sourceId);
  if (fixtureId) params.set('fixtureId', fixtureId);
  const selection = sourceSelectionFromSearch(params);
  if (selection.startsWith('remote:') || selection.startsWith('custom:')) {
    try {
      resolveCopcSourceSelection(selection);
      return selection;
    } catch {
      return DEFAULT_SOURCE_SELECTION;
    }
  }
  return /^[a-z0-9-]+$/u.test(selection) ? selection : DEFAULT_SOURCE_SELECTION;
}
const nextConfig = createHarnessConfig(
  {
    appId: 'next',
    host: 'next',
    renderer: 'cesium',
    fixtureUrl: resolveCopcSourceSelection(DEFAULT_SOURCE_SELECTION).url,
    backend: 'copc-js',
    scenario: 'load-and-stream',
  },
  process.env,
  'NEXT_PUBLIC_',
);
const contract = createTestContract(nextConfig);
if (typeof window !== 'undefined') window.__COPC_TEST__ = contract;

export function RendererClient({
  renderer,
  initialSearchParams,
}: {
  renderer: RendererName;
  initialSearchParams: Record<string, string | string[] | undefined>;
}): ReactNode {
  const initialSourceId = validSourceSelection(
    firstSearchValue(initialSearchParams.sourceId),
    firstSearchValue(initialSearchParams.fixtureId),
  );
  const initialBackend = validBackend(
    firstSearchValue(initialSearchParams.backend),
  );
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(initialSearchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  const initialStreaming = streamingSettingsFromSearch(params, renderer);
  const initialRenderDistance = renderDistanceFromSearch(params);
  const initialPointSize = pointSizeFromSearch(params, nextConfig.pointSize);
  const [selection, setSelection] = useState<PanelSelection>({
    renderer,
    backend: initialBackend,
    pointSize: initialPointSize,
    fixtureId: initialSourceId,
    streaming: initialStreaming,
    renderDistance: initialRenderDistance,
  });
  const [status, setStatus] = useState<PanelState['status']>('idle');
  const [snapshot, setSnapshot] = useState<unknown>();
  const [error, setError] = useState<string>();
  const [sourceProbe, setSourceProbe] = useState<PanelState['sourceProbe']>();
  const [colorMode, setColorMode] = useState<ColorMode>('elevation');
  const [activeView, setActiveView] = useState<PanelState['activeView']>(
    'overview',
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [fixtures, setFixtures] = useState<FixtureCatalogEntry[]>([]);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<TestRenderer | undefined>(undefined);
  const colorModeRef = useRef<ColorMode>(colorMode);
  colorModeRef.current = colorMode;
  const stopDemoRef = useRef<(() => void) | undefined>(undefined);
  const source = resolveCopcSourceSelection(selection.fixtureId);
  const fixtureUrl = source.url;
  const config = useMemo(
    () => ({
      ...nextConfig,
      renderer,
      backend: selection.backend,
      pointSize: selection.pointSize,
      fixtureUrl,
    }),
    [renderer, selection.backend, selection.pointSize, fixtureUrl],
  );
  const [panelState, setPanelState] = useState<PanelState>(() =>
    ({
      ...panelStateFromConfig(config, 'next', selection.fixtureId),
      streaming: initialStreaming,
      renderDistance: initialRenderDistance,
    }),
  );

  useEffect(
    () => () => {
      stopDemoRef.current?.();
      stopDemoRef.current = undefined;
    },
    [],
  );

  const onStatus = useCallback(
    (next: RendererStatus, message?: string): void => {
      setStatus(next);
      setError(message);
      if (next === 'loading') contract.markLoading();
      else if (next === 'ready') contract.markReady();
      else if (next === 'error')
        contract.markError(message ?? 'Renderer failed.');
    },
    [],
  );
  const onSnapshot = useCallback((value: unknown): void => {
    setSnapshot(value);
    contract.setSnapshot(value);
  }, []);
  const onAttached = useCallback((): void => contract.markAttached(), []);
  const onSourceProbe = useCallback(
    (probe: PanelState['sourceProbe']): void => setSourceProbe(probe),
    [],
  );
  const setView = useCallback(
    async (view: Exclude<HarnessView, 'visual'>): Promise<void> => {
      const activeRenderer = rendererRef.current;
      if (!activeRenderer) return;
      try {
        await activeRenderer.setView(view);
        if (rendererRef.current === activeRenderer) setActiveView(view);
      } catch (cause) {
        onStatus(
          'error',
          cause instanceof Error ? cause.message : String(cause),
        );
      }
    },
    [onStatus],
  );

  useEffect(() => {
    contract.setConfig({
      renderer,
      backend: selection.backend,
      pointSize: selection.pointSize,
      fixtureUrl,
    });
    setPanelState((previous) => ({
      ...previous,
      ...selection,
      host: 'next',
      renderer,
      fixtureUrl,
      status,
      snapshot,
      error,
      sourceProbe,
      activeView,
      activeDatasetUrl: (snapshot as { datasetUrl?: string } | undefined)
        ?.datasetUrl,
      activeSourceKind: (
        snapshot as { sourceKind?: PanelState['activeSourceKind'] } | undefined
      )?.sourceKind,
      pickedPoint: (snapshot as { pickedPoint?: unknown } | undefined)
        ?.pickedPoint,
      pickedPointScreenPosition: (
        snapshot as
          | { pickedPointScreenPosition?: PanelState['pickedPointScreenPosition'] }
          | undefined
      )?.pickedPointScreenPosition,
      colorMode,
    }));
  }, [
    renderer,
    selection,
    fixtureUrl,
    status,
    snapshot,
    error,
    sourceProbe,
    activeView,
    colorMode,
  ]);
  useEffect(() => {
    void loadFixtureCatalog()
      .then((catalog) => setFixtures(catalog.fixtures))
      .catch((cause: unknown) =>
        onStatus(
          'error',
          cause instanceof Error ? cause.message : String(cause),
        ),
      );
  }, [onStatus]);

  useEffect(() => {
    let disposed = false;
    let mounted: TestRenderer | undefined;
    const container = viewportRef.current;
    if (!container) return undefined;
    contract.recordMount();
    onStatus('loading');
    // This dynamic import is intentionally inside the client effect. The server-rendered module graph stays browser safe.
    void import('@copc-test/renderers')
      .then(({ mountTestRenderer }) =>
        mountTestRenderer(renderer, container, {
          fixtureUrl,
          sourceKind: source.kind,
          colorMode: colorModeRef.current,
          backend: selection.backend,
          streaming: selection.streaming,
          renderDistance: selection.renderDistance,
          pointSize: selection.pointSize,
          cesiumIonToken:
            renderer === 'cesium'
              ? process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN
              : undefined,
          onStatus,
          onSnapshot,
          onAttached,
          onSourceProbe,
        }),
      )
      .then((handle) => {
        if (disposed) {
          handle.destroy();
          return;
        }
        mounted = handle;
        rendererRef.current = handle;
        return handle.ready.catch((cause: unknown) => {
          if (!disposed)
            onStatus(
              'error',
              cause instanceof Error ? cause.message : String(cause),
            );
        });
      })
      .catch((cause: unknown) => {
        if (!disposed)
          onStatus(
            'error',
            cause instanceof Error ? cause.message : String(cause),
          );
      });
    return () => {
      disposed = true;
      mounted?.destroy();
      if (rendererRef.current === mounted) rendererRef.current = undefined;
      contract.recordUnmount();
      contract.markDestroyed();
    };
  }, [
    renderer,
    fixtureUrl,
    source.kind,
    selection.backend,
    selection.streaming,
    selection.renderDistance,
    reloadKey,
    onStatus,
    onSnapshot,
    onAttached,
    onSourceProbe,
  ]);

  useEffect(() => {
    contract.registerCommand('reload', () =>
      setReloadKey((value) => value + 1),
    );
    contract.registerCommand('setView', (view) =>
      setView(view === 'visual' ? 'overview' : view),
    );
    contract.registerCommand('unload', () => rendererRef.current?.unload());
    contract.registerCommand('destroy', () => {
      rendererRef.current?.destroy();
      setReloadKey((value) => value + 1);
    });
    return () => {
      contract.unregisterCommand('reload');
      contract.unregisterCommand('setView');
      contract.unregisterCommand('unload');
      contract.unregisterCommand('destroy');
    };
  }, [setView]);

  const apply = useCallback(
    (next: PanelSelection): void => {
      stopDemoRef.current?.();
      stopDemoRef.current = undefined;
      if (next.renderer !== renderer) {
        const params = new URLSearchParams({
          backend: next.backend,
          pointSize: String(next.pointSize),
          ...(next.fixtureId.startsWith('remote:')
            ? { sourceId: next.fixtureId }
            : { fixtureId: next.fixtureId }),
          maxNodes: String(next.streaming.maxNodes),
          maxRenderedPoints: String(next.streaming.maxRenderedPoints),
          maxDepth: String(next.streaming.maxDepth),
          maxScreenSpaceError: String(next.streaming.maxScreenSpaceError),
          maxRenderDistanceMeters: String(
            next.streaming.maxRenderDistanceMeters,
          ),
        });
        if (next.renderDistance !== undefined)
          params.set('renderDistance', String(next.renderDistance));
        window.location.assign(
          `${next.renderer === 'three' ? '/three' : '/cesium'}?${params}`,
        );
        return;
      }
      let nextSource: ReturnType<typeof resolveCopcSourceSelection>;
      try {
        nextSource = resolveCopcSourceSelection(next.fixtureId);
      } catch (cause) {
        setStatus('error');
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      }
      if (
        colorMode !== 'elevation' &&
        nextSource.remote?.expectedCapabilities[colorMode] === false
      )
        setColorMode('elevation');
      const pointSizeOnly =
        next.pointSize !== selection.pointSize &&
        next.backend === selection.backend &&
        next.fixtureId === selection.fixtureId &&
        JSON.stringify(next.streaming) === JSON.stringify(selection.streaming) &&
        next.renderDistance === selection.renderDistance;
      const activeRenderer = rendererRef.current;
      if (pointSizeOnly && activeRenderer?.setPointSize) {
        setStatus('loading');
        setError(undefined);
        contract.markLoading();
        void activeRenderer
          .setPointSize(next.pointSize)
          .then(() => {
            if (rendererRef.current !== activeRenderer) return;
            setSelection(next);
            contract.setConfig({ pointSize: next.pointSize });
            setStatus('ready');
            setError(undefined);
            contract.markReady();
          })
          .catch((cause: unknown) => {
            onStatus(
              'error',
              cause instanceof Error ? cause.message : String(cause),
            );
          });
        return;
      }
      setSelection(next);
      setActiveView('overview');
      setSnapshot(undefined);
      setError(undefined);
      setSourceProbe(undefined);
      if (
        next.backend === selection.backend &&
        next.fixtureId === selection.fixtureId &&
        JSON.stringify(next.streaming) ===
          JSON.stringify(selection.streaming) &&
        next.renderDistance === selection.renderDistance
      )
        setReloadKey((value) => value + 1);
    },
    [renderer, selection, colorMode, onStatus],
  );
  const setStyle = (mode: ColorMode): void => {
    setColorMode(mode);
    rendererRef.current?.setStyle?.(mode);
  };
  const actions: PanelActions = {
    apply,
    reload: () => setReloadKey((value) => value + 1),
    startDemo: () => {
      stopDemoRef.current?.();
      stopDemoRef.current = startCameraDemo(setView);
    },
    stopDemo: () => {
      stopDemoRef.current?.();
      stopDemoRef.current = undefined;
    },
    overview: () => setView('overview'),
    far: () => setView('far'),
    near: () => setView('near'),
    setStyle,
  };
  const displayedState: PanelState = {
    ...panelState,
    ...selection,
    renderer,
    fixtureUrl,
    status,
    snapshot,
    error,
    sourceProbe,
    colorMode,
    activeView,
  };

  return (
    <main
      className="copc-renderer-root"
      data-host="next"
      data-renderer={renderer}>
      <div
        ref={viewportRef}
        className="copc-renderer-root"
        data-testid="renderer-viewport"
      />
      <ReactControlPanel
        config={config}
        state={displayedState}
        renderers={['cesium', 'three'] as HarnessRenderer[]}
        actions={actions}
        fixtures={fixtures}
      />
    </main>
  );
}
