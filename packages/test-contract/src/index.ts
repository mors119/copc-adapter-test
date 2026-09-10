export const TEST_CONTRACT_VERSION = 1 as const;
export const TEST_CONTRACT_GLOBAL = '__COPC_TEST__' as const;

export type HarnessHost = 'vite' | 'next';
export type HarnessRenderer = 'cesium' | 'three' | 'r3f';
export type HarnessBackend = 'copc-js' | 'rust';
export type HarnessScenario = 'load-and-stream' | 'camera-stream' | 'static';
export type HarnessPackageSource = 'npm' | 'tarball';
export type HarnessStatus = 'idle' | 'loading' | 'ready' | 'error' | 'destroyed';
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
};

export type HarnessError = {
  name: string;
  message: string;
  stack?: string;
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

export type CopcTestContract = {
  readonly config: HarnessConfig;
  readonly result: HarnessResult;
  getResult(): HarnessResult;
  setConfig(config: Partial<HarnessConfig>): void;
  setSnapshot(snapshot: unknown): void;
  markLoading(): void;
  markAttached(): void;
  markReady(): void;
  markError(error: unknown): void;
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
  };
}

function toError(error: unknown): HarnessError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
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
    markError(error: unknown): void {
      publish({
        ...current,
        status: 'error',
        lifecycle: 'error',
        error: toError(error),
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
