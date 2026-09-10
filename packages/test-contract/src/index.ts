export const TEST_CONTRACT_VERSION = 1 as const;
export const TEST_CONTRACT_GLOBAL = '__COPC_TEST__' as const;

export type HarnessHost = 'vite' | 'next';
export type HarnessRenderer = 'cesium' | 'three' | 'r3f';
export type HarnessBackend = 'copc-js' | 'rust';
export type HarnessScenario = 'load-and-stream' | 'camera-stream' | 'static';
export type HarnessPackageSource = 'npm' | 'tarball';
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
};

export type HarnessError = {
  name: string;
  message: string;
  stack?: string;
  category?: string;
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
};

export type CopcTestContract = {
  readonly config: HarnessConfig;
  readonly result: HarnessResult;
  getResult(): HarnessResult;
  setConfig(config: Partial<HarnessConfig>): void;
  setSnapshot(snapshot: unknown): void;
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
  };
}

function toError(error: unknown): HarnessError {
  if (error instanceof Error) {
    const errorWithCategory = error as Error & { category?: unknown };
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(typeof errorWithCategory.category === 'string' ? { category: errorWithCategory.category } : {}),
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
    diagnostics: normalizeSnapshot(undefined),
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
      publish({
        ...current,
        config: { ...current.config, ...configPatch },
      });
    },
    setSnapshot(snapshot: unknown): void {
      const diagnostics = normalizeSnapshot(snapshot);
      publish({
        ...current,
        lifecycle: diagnostics.lifecycle ?? current.lifecycle,
        diagnostics,
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
