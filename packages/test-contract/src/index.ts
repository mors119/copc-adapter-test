export const TEST_CONTRACT_VERSION = 1 as const;
export const TEST_CONTRACT_GLOBAL = '__COPC_TEST__' as const;

export type HarnessHost = 'vite' | 'next' | 'nuxt' | 'sveltekit' | 'astro' | 'angular' | 'webpack' | 'rollup' | 'esbuild' | 'parcel';
export type HarnessRenderer = 'cesium' | 'three' | 'r3f';
export type HarnessBackend = 'copc-js' | 'rust';
export type HarnessScenario = 'load-and-stream' | 'camera-stream' | 'static';
export type HarnessPackageSource = 'checkout' | 'tarball' | 'npm';
export type HarnessStatus = 'idle' | 'loading' | 'ready' | 'error' | 'destroyed';
export const RUNTIME_SCENARIO_IDS = [
  'metadata-root-hierarchy',
  'attach-to-caller-renderer',
  'initial-point-rendering',
  'camera-streaming-update',
  'equivalent-view-is-stable',
  'reload-to-ready',
  'detach-preserves-host-resources',
  'unload-releases-point-state',
  'destroy-releases-layer-resources',
  'color-mode-change',
  'point-picking',
  'diagnostics-observable',
  'public-entrypoints',
  'api-lifecycle',
  'color-mode-matrix',
  'source-probe',
  'renderer-neutral-streaming',
  'source-error-is-visible',
  'rust-failure-is-not-retried',
] as const;
export type RuntimeScenarioId = (typeof RUNTIME_SCENARIO_IDS)[number];

export type HarnessView = 'far' | 'near' | 'overview';

export type HarnessSelectedPoint = {
  index?: number;
  nodeKey?: string;
  position?: [number, number, number];
  attributes?: Record<string, string | number | boolean>;
};

export type HarnessCacheDiagnostics = {
  loadedNodeCount?: number;
  cacheBytes?: number;
  cacheBudgetBytes?: number;
  cacheHitCount?: number;
  cacheMissCount?: number;
};

export type HarnessOperationStatus = 'passed' | 'unsupported' | 'error';

export type HarnessOperation = {
  status: HarnessOperationStatus;
  message?: string;
};

export type HarnessProbeResult = {
  reachable: boolean;
  rangeSupported: boolean | 'unknown';
  corsReadable: boolean | 'unknown';
  copcDetected: boolean | 'unknown';
  status?: number;
  partialStatus?: number;
  warnings: string[];
};

/** Results from explicit public API calls made by a browser consumer. */
export type HarnessApiDiagnostics = {
  entrypoints?: string[];
  operations: Record<string, HarnessOperation>;
  colorModes?: Record<string, HarnessOperation>;
  probes?: Record<string, HarnessProbeResult>;
  metadata?: {
    pointCount?: number;
    hasBounds?: boolean;
    hasCrs?: boolean;
    lasVersion?: string;
    pointFormat?: number;
    crsFamily?: 'projected' | 'geographic' | 'unknown';
    wktVariants?: string[];
    scale?: [number, number, number];
    offset?: [number, number, number];
  };
  hierarchy?: {
    requestCount?: number;
    cacheHitCount?: number;
    cacheMissCount?: number;
  };
  streaming?: {
    lifecycle?: string;
    updateCount?: number;
    selectedNodeCount?: number;
  };
};
export type HarnessLifecycle =
  | 'idle'
  | 'loading'
  | 'attached'
  | 'ready'
  | 'error'
  | 'destroyed'
  | string;

export type HarnessConfig = {
  appId: string;
  host: HarnessHost;
  renderer: HarnessRenderer;
  fixtureUrl: string;
  backend: HarnessBackend;
  scenario: HarnessScenario;
  packageSource: HarnessPackageSource;
  packageVersion: string;
};

export type HarnessDiagnostics = {
  backend?: string;
  lifecycle?: HarnessLifecycle;
  datasetUrl?: string;
  attached?: boolean;
  selectedNodeKeys: string[];
  renderedNodeKeys: string[];
  renderedPointCount?: number;
  streamingUpdateCount?: number;
  metadataLoaded?: boolean;
  hierarchyLoaded?: boolean;
  selectedPoint?: HarnessSelectedPoint;
  cache?: HarnessCacheDiagnostics;
  sourceErrorCategory?: string;
  api?: HarnessApiDiagnostics;
};

export type HarnessError = {
  name: string;
  message: string;
  stack?: string;
  category?: string;
  stage?: string;
  code?: string;
};

export type HarnessResult = {
  contractVersion: typeof TEST_CONTRACT_VERSION;
  config: HarnessConfig;
  status: HarnessStatus;
  lifecycle: HarnessLifecycle;
  diagnostics: HarnessDiagnostics;
  startedAt?: number;
  readyAt?: number;
  destroyedAt?: number;
  updatedAt: number;
  error?: HarnessError;
};

export type HarnessCommandMap = {
  reload: () => void | Promise<void>;
  setView: (view: HarnessView) => void | Promise<void>;
  setColorMode: (mode: string) => void | Promise<void>;
  pick: (x: number, y: number) => HarnessSelectedPoint | undefined | Promise<HarnessSelectedPoint | undefined>;
  detach: () => void | Promise<void>;
  unload: () => void | Promise<void>;
  destroy: () => void | Promise<void>;
  runApiCoverage: () => void | Promise<void>;
  probeSource: (label: string, url: string) => void | Promise<void>;
};

export type CopcTestContract = {
  readonly config: HarnessConfig;
  readonly result: HarnessResult;
  getResult(): HarnessResult;
  setConfig(config: Partial<HarnessConfig>): void;
  setSnapshot(snapshot: unknown): void;
  setApiDiagnostics(diagnostics: Partial<HarnessApiDiagnostics>): void;
  registerCommand<K extends keyof HarnessCommandMap>(name: K, command: HarnessCommandMap[K]): void;
  unregisterCommand<K extends keyof HarnessCommandMap>(name: K): void;
  getCapabilities(): string[];
  readonly commands: Partial<HarnessCommandMap>;
  markLoading(): void;
  markAttached(): void;
  markReady(): void;
  markError(error: unknown, category?: string): void;
  markDestroyed(): void;
};

declare global {
  interface Window {
    __COPC_HARNESS_CONFIG__?: Partial<HarnessConfig>;
    __COPC_TEST__?: CopcTestContract;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function selectedPoint(value: unknown): HarnessSelectedPoint | undefined {
  if (!isRecord(value)) return undefined;

  const position = Array.isArray(value.position) && value.position.length === 3
    && value.position.every((item) => typeof item === 'number' && Number.isFinite(item))
    ? value.position as [number, number, number]
    : undefined;
  const attributes = isRecord(value.attributes)
    ? Object.fromEntries(
      Object.entries(value.attributes).filter(([, item]) =>
        typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'),
    ) as Record<string, string | number | boolean>
    : undefined;

  return {
    ...(finiteNumber(value.index) !== undefined ? { index: finiteNumber(value.index) } : {}),
    ...(typeof value.nodeKey === 'string' ? { nodeKey: value.nodeKey } : {}),
    ...(position ? { position } : {}),
    ...(attributes ? { attributes } : {}),
  };
}

function cacheDiagnostics(value: unknown): HarnessCacheDiagnostics | undefined {
  if (!isRecord(value)) return undefined;
  const aliases = {
    loadedNodeCount: ['loadedNodeCount', 'cachedNodeCount'],
    cacheBytes: ['cacheBytes', 'currentCacheBytes'],
    cacheBudgetBytes: ['cacheBudgetBytes', 'cacheByteBudget'],
    cacheHitCount: ['cacheHitCount', 'hits'],
    cacheMissCount: ['cacheMissCount', 'misses'],
  } as const;
  const result = Object.fromEntries(
    Object.entries(aliases).flatMap(([field, candidates]) => {
      const number = candidates
        .map((candidate) => finiteNumber(value[candidate]))
        .find((candidate): candidate is number => candidate !== undefined);
      return number === undefined ? [] : [[field, number]];
    }),
  ) as HarnessCacheDiagnostics;
  return Object.keys(result).length > 0 ? result : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function apiDiagnostics(value: unknown): HarnessApiDiagnostics | undefined {
  if (!isRecord(value) || !isRecord(value.operations)) return undefined;

  const operation = (candidate: unknown): HarnessOperation | undefined => {
    if (!isRecord(candidate)
      || !['passed', 'unsupported', 'error'].includes(String(candidate.status))) {
      return undefined;
    }
    return {
      status: candidate.status as HarnessOperationStatus,
      ...(typeof candidate.message === 'string' ? { message: candidate.message } : {}),
    };
  };
  const operationMap = (candidate: unknown): Record<string, HarnessOperation> => {
    if (!isRecord(candidate)) return {};
    return Object.fromEntries(
      Object.entries(candidate).flatMap(([key, item]) => {
        const normalized = operation(item);
        return normalized ? [[key, normalized]] : [];
      }),
    );
  };
  const probes = isRecord(value.probes)
    ? Object.fromEntries(
      Object.entries(value.probes).flatMap(([key, item]) => {
        if (!isRecord(item)
          || typeof item.reachable !== 'boolean'
          || !['boolean', 'unknown'].includes(typeof item.rangeSupported === 'boolean'
            ? 'boolean'
            : String(item.rangeSupported))
          || !['boolean', 'unknown'].includes(typeof item.corsReadable === 'boolean'
            ? 'boolean'
            : String(item.corsReadable))
          || !['boolean', 'unknown'].includes(typeof item.copcDetected === 'boolean'
            ? 'boolean'
            : String(item.copcDetected))) {
          return [];
        }
        return [[key, {
          reachable: item.reachable,
          rangeSupported: item.rangeSupported as boolean | 'unknown',
          corsReadable: item.corsReadable as boolean | 'unknown',
          copcDetected: item.copcDetected as boolean | 'unknown',
          ...(finiteNumber(item.status) !== undefined ? { status: finiteNumber(item.status) } : {}),
          ...(finiteNumber(item.partialStatus) !== undefined ? { partialStatus: finiteNumber(item.partialStatus) } : {}),
          warnings: stringArray(item.warnings),
        } satisfies HarnessProbeResult]];
      }),
    ) as Record<string, HarnessProbeResult>
    : undefined;

  return {
    ...(Array.isArray(value.entrypoints)
      ? { entrypoints: stringArray(value.entrypoints) }
      : {}),
    operations: operationMap(value.operations),
    ...(isRecord(value.colorModes) ? { colorModes: operationMap(value.colorModes) } : {}),
    ...(probes ? { probes } : {}),
    ...(isRecord(value.metadata)
      ? {
          metadata: {
            ...(finiteNumber(value.metadata.pointCount) !== undefined
              ? { pointCount: finiteNumber(value.metadata.pointCount) } : {}),
            ...(typeof value.metadata.hasBounds === 'boolean' ? { hasBounds: value.metadata.hasBounds } : {}),
            ...(typeof value.metadata.hasCrs === 'boolean' ? { hasCrs: value.metadata.hasCrs } : {}),
            ...(typeof value.metadata.lasVersion === 'string' ? { lasVersion: value.metadata.lasVersion } : {}),
            ...(finiteNumber(value.metadata.pointFormat) !== undefined
              ? { pointFormat: finiteNumber(value.metadata.pointFormat) } : {}),
            ...(typeof value.metadata.crsFamily === 'string'
              && ['projected', 'geographic', 'unknown'].includes(value.metadata.crsFamily)
              ? { crsFamily: value.metadata.crsFamily as 'projected' | 'geographic' | 'unknown' } : {}),
            ...(Array.isArray(value.metadata.wktVariants)
              ? { wktVariants: stringArray(value.metadata.wktVariants) } : {}),
            ...(Array.isArray(value.metadata.scale) && value.metadata.scale.length === 3
              && value.metadata.scale.every((item) => finiteNumber(item) !== undefined)
              ? { scale: value.metadata.scale as [number, number, number] } : {}),
            ...(Array.isArray(value.metadata.offset) && value.metadata.offset.length === 3
              && value.metadata.offset.every((item) => finiteNumber(item) !== undefined)
              ? { offset: value.metadata.offset as [number, number, number] } : {}),
          },
        }
      : {}),
    ...(isRecord(value.hierarchy)
      ? {
          hierarchy: {
            ...(finiteNumber(value.hierarchy.requestCount) !== undefined
              ? { requestCount: finiteNumber(value.hierarchy.requestCount) } : {}),
            ...(finiteNumber(value.hierarchy.cacheHitCount) !== undefined
              ? { cacheHitCount: finiteNumber(value.hierarchy.cacheHitCount) } : {}),
            ...(finiteNumber(value.hierarchy.cacheMissCount) !== undefined
              ? { cacheMissCount: finiteNumber(value.hierarchy.cacheMissCount) } : {}),
          },
        }
      : {}),
    ...(isRecord(value.streaming)
      ? {
          streaming: {
            ...(typeof value.streaming.lifecycle === 'string' ? { lifecycle: value.streaming.lifecycle } : {}),
            ...(finiteNumber(value.streaming.updateCount) !== undefined
              ? { updateCount: finiteNumber(value.streaming.updateCount) } : {}),
            ...(finiteNumber(value.streaming.selectedNodeCount) !== undefined
              ? { selectedNodeCount: finiteNumber(value.streaming.selectedNodeCount) } : {}),
          },
        }
      : {}),
  };
}

/** Convert an adapter-specific getSnapshot() object into the shared contract. */
export function normalizeSnapshot(snapshot: unknown): HarnessDiagnostics {
  const source = isRecord(snapshot) ? snapshot : {};
  const metadata = isRecord(source.metadata) ? source.metadata : undefined;
  const lifecycle = typeof source.lifecycle === 'string' ? source.lifecycle : undefined;
  const ready = lifecycle === 'ready';

  return {
    backend: typeof source.backend === 'string' ? source.backend : undefined,
    lifecycle,
    datasetUrl: typeof source.datasetUrl === 'string' ? source.datasetUrl : undefined,
    attached: typeof source.attached === 'boolean' ? source.attached : undefined,
    selectedNodeKeys: stringArray(source.selectedNodeKeys),
    renderedNodeKeys: stringArray(source.renderedNodeKeys),
    renderedPointCount: finiteNumber(source.renderedPointCount),
    streamingUpdateCount: finiteNumber(source.streamingUpdateCount),
    metadataLoaded:
      typeof source.metadataLoaded === 'boolean'
        ? source.metadataLoaded
        : metadata !== undefined || ready,
    hierarchyLoaded:
      typeof source.hierarchyLoaded === 'boolean'
        ? source.hierarchyLoaded
        : ready,
    ...(selectedPoint(source.selectedPoint) ? { selectedPoint: selectedPoint(source.selectedPoint) } : {}),
    ...(cacheDiagnostics(source.cache ?? source.pointCache)
      ? { cache: cacheDiagnostics(source.cache ?? source.pointCache) }
      : {}),
    ...(typeof source.sourceErrorCategory === 'string'
      ? { sourceErrorCategory: source.sourceErrorCategory }
      : {}),
    ...(apiDiagnostics(source.api) ? { api: apiDiagnostics(source.api) } : {}),
  };
}

function toError(error: unknown): HarnessError {
  if (error instanceof Error) {
    const errorWithDetails = error as Error & { category?: unknown; stage?: unknown; code?: unknown };
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(typeof errorWithDetails.category === 'string' ? { category: errorWithDetails.category } : {}),
      ...(typeof errorWithDetails.stage === 'string' ? { stage: errorWithDetails.stage } : {}),
      ...(typeof errorWithDetails.code === 'string' ? { code: errorWithDetails.code } : {}),
    };
  }

  return { name: 'Error', message: String(error) };
}

function now(): number {
  return Date.now();
}

/**
 * Create and publish the renderer-neutral browser result contract.
 * The object remains usable during SSR, but is only exposed on window in a browser.
 */
export function createTestContract(config: HarnessConfig): CopcTestContract {
  const commands: Partial<HarnessCommandMap> = {};
  let current: HarnessResult = {
    contractVersion: TEST_CONTRACT_VERSION,
    config,
    status: 'idle',
    lifecycle: 'idle',
    diagnostics: { ...normalizeSnapshot(undefined), backend: config.backend },
    updatedAt: now(),
  };

  const publish = (result: HarnessResult): void => {
    current = { ...result, updatedAt: now() };
  };

  const contract: CopcTestContract = {
    get config(): HarnessConfig {
      return current.config;
    },
    get result(): HarnessResult {
      return current;
    },
    getResult(): HarnessResult {
      return current;
    },
    setConfig(configPatch: Partial<HarnessConfig>): void {
      const nextConfig = { ...current.config, ...configPatch };
      publish({
        ...current,
        config: nextConfig,
        diagnostics: { ...current.diagnostics, backend: nextConfig.backend },
      });
    },
    setSnapshot(snapshot: unknown): void {
      const normalized = normalizeSnapshot(snapshot);
      const diagnostics = {
        ...normalized,
        backend: normalized.backend ?? current.config.backend,
        ...(current.diagnostics.api && !normalized.api ? { api: current.diagnostics.api } : {}),
      };
      publish({
        ...current,
        lifecycle: diagnostics.lifecycle ?? current.lifecycle,
        diagnostics,
      });
    },
    setApiDiagnostics(diagnosticsPatch: Partial<HarnessApiDiagnostics>): void {
      const previous = current.diagnostics.api;
      const next: HarnessApiDiagnostics = {
        operations: {
          ...(previous?.operations ?? {}),
          ...(diagnosticsPatch.operations ?? {}),
        },
        ...(diagnosticsPatch.entrypoints
          ? { entrypoints: [...diagnosticsPatch.entrypoints] }
          : previous?.entrypoints ? { entrypoints: [...previous.entrypoints] } : {}),
        ...(diagnosticsPatch.colorModes || previous?.colorModes
          ? { colorModes: { ...(previous?.colorModes ?? {}), ...(diagnosticsPatch.colorModes ?? {}) } }
          : {}),
        ...(diagnosticsPatch.probes || previous?.probes
          ? { probes: { ...(previous?.probes ?? {}), ...(diagnosticsPatch.probes ?? {}) } }
          : {}),
        ...(diagnosticsPatch.metadata || previous?.metadata
          ? { metadata: { ...(previous?.metadata ?? {}), ...(diagnosticsPatch.metadata ?? {}) } }
          : {}),
        ...(diagnosticsPatch.hierarchy || previous?.hierarchy
          ? { hierarchy: { ...(previous?.hierarchy ?? {}), ...(diagnosticsPatch.hierarchy ?? {}) } }
          : {}),
        ...(diagnosticsPatch.streaming || previous?.streaming
          ? { streaming: { ...(previous?.streaming ?? {}), ...(diagnosticsPatch.streaming ?? {}) } }
          : {}),
      };
      publish({
        ...current,
        diagnostics: { ...current.diagnostics, api: next },
      });
    },
    registerCommand<K extends keyof HarnessCommandMap>(name: K, command: HarnessCommandMap[K]): void {
      commands[name] = command;
    },
    unregisterCommand<K extends keyof HarnessCommandMap>(name: K): void {
      delete commands[name];
    },
    getCapabilities(): string[] {
      return Object.keys(commands);
    },
    get commands(): Partial<HarnessCommandMap> {
      return commands;
    },
    markLoading(): void {
      publish({
        ...current,
        status: 'loading',
        lifecycle: 'loading',
        startedAt: current.startedAt ?? now(),
        readyAt: undefined,
        destroyedAt: undefined,
        error: undefined,
      });
    },
    markAttached(): void {
      publish({ ...current, lifecycle: 'attached' });
    },
    markReady(): void {
      publish({
        ...current,
        status: 'ready',
        lifecycle: current.diagnostics.lifecycle ?? 'ready',
        readyAt: now(),
        error: undefined,
      });
    },
    markError(error: unknown, category?: string): void {
      // Consumer status callbacks may report the same failure as a message
      // immediately after publishing the original Error. Preserve structured
      // backend details instead of replacing them with `name: Error`.
      if (typeof error === 'string' && current.status === 'error' && current.error) {
        return;
      }
      const normalized = toError(error);
      publish({
        ...current,
        status: 'error',
        lifecycle: 'error',
        error: category ? { ...normalized, category } : normalized,
      });
    },
    markDestroyed(): void {
      publish({
        ...current,
        status: 'destroyed',
        lifecycle: 'destroyed',
        destroyedAt: now(),
      });
    },
  };

  if (typeof window !== 'undefined') {
    window.__COPC_TEST__ = contract;
  }

  return contract;
}
