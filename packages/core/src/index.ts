import type {
  HarnessBackend,
  HarnessConfig,
  HarnessPackageSource,
  HarnessRenderer,
  HarnessScenario,
  HarnessView as HarnessViewType,
} from './test-contract.ts';
export type { CopcTestContract } from './test-contract.ts';

export type {
  HarnessBackend,
  HarnessConfig,
  HarnessHost,
  HarnessPackageSource,
  HarnessRenderer,
  HarnessScenario,
  HarnessDiagnostics,
  HarnessView,
} from './test-contract.ts';
export {
  createTestContract,
  normalizeSnapshot,
  TEST_CONTRACT_GLOBAL,
  TEST_CONTRACT_VERSION,
} from './test-contract.ts';

export * from './fixtures.ts';
export * from './sources.ts';
export * from './fixture-assertions.ts';

export type HarnessStreamingSettings = {
  maxNodes: number;
  maxRenderedPoints: number;
  maxDepth: number;
  maxScreenSpaceError: number;
  maxRenderDistanceMeters: number;
};

export const DEFAULT_HARNESS_STREAMING_SETTINGS: HarnessStreamingSettings = {
  maxNodes: 8,
  maxRenderedPoints: 1_000_000,
  maxDepth: 8,
  maxScreenSpaceError: 8,
  maxRenderDistanceMeters: 20_000,
};

export const HARNESS_STREAMING_SETTING_LIMITS = {
  maxNodes: { min: 1, max: 128, step: 1 },
  maxRenderedPoints: { min: 1, max: 10_000_000, step: 1 },
  maxDepth: { min: 0, max: 32, step: 1 },
  maxScreenSpaceError: { min: 0.1, max: 64, step: 0.1 },
  maxRenderDistanceMeters: { min: 1, max: 10_000_000, step: 1 },
} as const satisfies Record<
  keyof HarnessStreamingSettings,
  { min: number; max: number; step: number }
>;

export const HARNESS_RENDER_DISTANCE_LIMITS = {
  min: 150,
  max: 10_000_000,
  step: 50,
} as const;

export const DEFAULT_HARNESS_POINT_SIZE = 3;
export const HARNESS_POINT_SIZE_LIMITS = {
  min: 1,
  max: 10,
  step: 1,
} as const;

const CAMERA_DEMO_VIEWS = ['near', 'far', 'overview'] as const;

export function startCameraDemo(
  setView: (view: Exclude<HarnessViewType, 'visual'>) => Promise<void>,
  pauseMs = 350,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let viewIndex = 0;

  const stop = (): void => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };

  const advance = async (): Promise<void> => {
    if (stopped) return;
    const view = CAMERA_DEMO_VIEWS[viewIndex]!;
    viewIndex = (viewIndex + 1) % CAMERA_DEMO_VIEWS.length;
    try {
      await setView(view);
    } catch {
      stop();
      return;
    }
    if (!stopped) timer = setTimeout(() => void advance(), pauseMs);
  };

  void advance();
  return stop;
}

export function defaultStreamingSettings(
  renderer: HarnessRenderer,
): HarnessStreamingSettings {
  return {
    ...DEFAULT_HARNESS_STREAMING_SETTINGS,
    maxDepth: renderer === 'cesium' ? 8 : 6,
  };
}

export function streamingSettingsFromSearch(
  params: URLSearchParams,
  renderer: HarnessRenderer = 'cesium',
): HarnessStreamingSettings {
  const defaults = defaultStreamingSettings(renderer);
  const read = (
    key: keyof HarnessStreamingSettings,
    fallback: number,
    integer: boolean,
  ): number => {
    const raw = params.get(key);
    const parsed = raw === null || raw.trim() === '' ? fallback : Number(raw);
    const limits = HARNESS_STREAMING_SETTING_LIMITS[key];
    const value = Number.isFinite(parsed) ? parsed : fallback;
    const constrained = Math.min(limits.max, Math.max(limits.min, value));
    const stepped =
      limits.min +
      Math.round((constrained - limits.min) / limits.step) * limits.step;
    return integer ? Math.round(stepped) : Number(stepped.toPrecision(12));
  };
  return {
    maxNodes: read('maxNodes', defaults.maxNodes, true),
    maxRenderedPoints: read(
      'maxRenderedPoints',
      defaults.maxRenderedPoints,
      true,
    ),
    maxDepth: read('maxDepth', defaults.maxDepth, true),
    maxScreenSpaceError: read(
      'maxScreenSpaceError',
      defaults.maxScreenSpaceError,
      false,
    ),
    maxRenderDistanceMeters: read(
      'maxRenderDistanceMeters',
      defaults.maxRenderDistanceMeters,
      true,
    ),
  };
}

export function renderDistanceFromSearch(
  params: URLSearchParams,
): number | undefined {
  const raw = params.get('renderDistance');
  if (raw === null || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  const constrained = Math.min(
    HARNESS_RENDER_DISTANCE_LIMITS.max,
    Math.max(HARNESS_RENDER_DISTANCE_LIMITS.min, parsed),
  );
  return (
    HARNESS_RENDER_DISTANCE_LIMITS.min +
    Math.round(
      (constrained - HARNESS_RENDER_DISTANCE_LIMITS.min) /
        HARNESS_RENDER_DISTANCE_LIMITS.step,
    ) *
      HARNESS_RENDER_DISTANCE_LIMITS.step
  );
}

export function pointSizeFromSearch(
  params: URLSearchParams,
  fallback = DEFAULT_HARNESS_POINT_SIZE,
): number {
  const raw = params.get('pointSize');
  const parsed = raw === null || raw.trim() === '' ? fallback : Number(raw);
  const constrained = Math.min(
    HARNESS_POINT_SIZE_LIMITS.max,
    Math.max(
      HARNESS_POINT_SIZE_LIMITS.min,
      Number.isFinite(parsed) ? parsed : fallback,
    ),
  );
  return (
    HARNESS_POINT_SIZE_LIMITS.min +
    Math.round(
      (constrained - HARNESS_POINT_SIZE_LIMITS.min) /
        HARNESS_POINT_SIZE_LIMITS.step,
    ) *
      HARNESS_POINT_SIZE_LIMITS.step
  );
}

export const DEFAULT_PACKAGE_VERSION = '0.5.0';

export type HarnessDefaults = Omit<
  HarnessConfig,
  | 'fixtureUrl'
  | 'backend'
  | 'pointSize'
  | 'scenario'
  | 'packageSource'
  | 'packageVersion'
> & {
  fixtureUrl: string;
  backend?: HarnessBackend;
  pointSize?: number;
  scenario?: HarnessScenario;
  packageSource?: HarnessPackageSource;
  packageVersion?: string;
};

export type HarnessEnvironment = Record<string, unknown>;

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  const candidate = stringValue(value);
  return candidate !== undefined && allowed.includes(candidate as T)
    ? (candidate as T)
    : undefined;
}

function environmentValue(
  environment: HarnessEnvironment,
  prefix: string,
  key: string,
): string | undefined {
  return (
    stringValue(environment[`${prefix}${key}`]) ?? stringValue(environment[key])
  );
}

function definedConfig(values: Partial<HarnessConfig>): Partial<HarnessConfig> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<HarnessConfig>;
}

function environmentConfig(
  environment: HarnessEnvironment,
  prefix: string,
): Partial<HarnessConfig> {
  return definedConfig({
    fixtureUrl: environmentValue(environment, prefix, 'COPC_FIXTURE_URL'),
    backend: enumValue(environmentValue(environment, prefix, 'COPC_BACKEND'), [
      'copc-js',
      'rust',
    ]),
    pointSize: (() => {
      const raw = environmentValue(environment, prefix, 'COPC_POINT_SIZE');
      if (raw === undefined) return undefined;
      const value = Number(raw);
      if (!Number.isFinite(value)) return undefined;
      const bounded = Math.min(
        HARNESS_POINT_SIZE_LIMITS.max,
        Math.max(HARNESS_POINT_SIZE_LIMITS.min, value),
      );
      return Math.round(bounded);
    })(),
    scenario: enumValue(
      environmentValue(environment, prefix, 'COPC_SCENARIO'),
      ['load-and-stream', 'camera-stream', 'static'],
    ),
    packageSource: enumValue(
      environmentValue(environment, prefix, 'COPC_PACKAGE_SOURCE'),
      ['checkout', 'tarball', 'npm'],
    ),
    packageVersion: environmentValue(
      environment,
      prefix,
      'COPC_PACKAGE_VERSION',
    ),
  });
}

function queryConfig(): Partial<HarnessConfig> {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  return definedConfig({
    fixtureUrl: params.get('fixture') ?? undefined,
    backend: enumValue(params.get('backend'), ['copc-js', 'rust']),
    pointSize:
      params.has('pointSize') ? pointSizeFromSearch(params) : undefined,
    scenario: enumValue(params.get('scenario'), [
      'load-and-stream',
      'camera-stream',
      'static',
    ]),
  });
}

function runtimeConfig(): Partial<HarnessConfig> {
  return typeof window === 'undefined'
    ? {}
    : (window.__COPC_HARNESS_CONFIG__ ?? {});
}

/**
 * Resolve one app's defaults with build environment, runtime config, and URL
 * query overrides. This keeps configuration uniform without importing Vite or
 * Next APIs into shared code.
 */
export function createHarnessConfig(
  defaults: HarnessDefaults,
  environment: HarnessEnvironment = {},
  environmentPrefix = '',
): HarnessConfig {
  const values = {
    ...defaults,
    ...environmentConfig(environment, environmentPrefix),
    ...runtimeConfig(),
    ...queryConfig(),
  };

  return {
    appId: defaults.appId,
    host: defaults.host,
    renderer: defaults.renderer,
    fixtureUrl: values.fixtureUrl ?? defaults.fixtureUrl,
    backend: values.backend ?? defaults.backend ?? 'copc-js',
    pointSize:
      values.pointSize ?? defaults.pointSize ?? DEFAULT_HARNESS_POINT_SIZE,
    scenario: values.scenario ?? defaults.scenario ?? 'load-and-stream',
    packageSource: values.packageSource ?? defaults.packageSource ?? 'npm',
    packageVersion:
      values.packageVersion ??
      defaults.packageVersion ??
      DEFAULT_PACKAGE_VERSION,
  };
}
