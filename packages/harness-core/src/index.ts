import type {
  HarnessBackend,
  HarnessConfig,
  HarnessPackageSource,
  HarnessScenario,
} from '@copc-test/test-contract';

export type {
  HarnessBackend,
  HarnessConfig,
  HarnessHost,
  HarnessPackageSource,
  HarnessRenderer,
  HarnessScenario,
  HarnessDiagnostics,
} from '@copc-test/test-contract';
export { createTestContract, normalizeSnapshot, TEST_CONTRACT_GLOBAL, TEST_CONTRACT_VERSION } from '@copc-test/test-contract';
export {
  assertRuntimeScenario,
  type RuntimeAssertionOptions,
} from './runtime-scenarios.ts';
export {
  RUNTIME_SCENARIO_IDS,
  type RuntimeScenarioId,
} from '@copc-test/test-contract';

export const DEFAULT_PACKAGE_VERSION = '0.3.0';

export type HarnessDefaults = Omit<HarnessConfig, 'fixtureUrl' | 'backend' | 'scenario' | 'packageSource' | 'packageVersion'> & {
  fixtureUrl: string;
  backend?: HarnessBackend;
  scenario?: HarnessScenario;
  packageSource?: HarnessPackageSource;
  packageVersion?: string;
};

export type HarnessEnvironment = Record<string, unknown>;

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const candidate = stringValue(value);
  return candidate !== undefined && allowed.includes(candidate as T) ? (candidate as T) : undefined;
}

function environmentValue(environment: HarnessEnvironment, prefix: string, key: string): string | undefined {
  return stringValue(environment[`${prefix}${key}`]) ?? stringValue(environment[key]);
}

function definedConfig(values: Partial<HarnessConfig>): Partial<HarnessConfig> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<HarnessConfig>;
}

function environmentConfig(environment: HarnessEnvironment, prefix: string): Partial<HarnessConfig> {
  return definedConfig({
    fixtureUrl: environmentValue(environment, prefix, 'COPC_FIXTURE_URL'),
    backend: enumValue(environmentValue(environment, prefix, 'COPC_BACKEND'), ['copc-js', 'rust']),
    scenario: enumValue(environmentValue(environment, prefix, 'COPC_SCENARIO'), ['load-and-stream', 'camera-stream', 'static']),
    packageSource: enumValue(environmentValue(environment, prefix, 'COPC_PACKAGE_SOURCE'), ['npm', 'tarball']),
    packageVersion: environmentValue(environment, prefix, 'COPC_PACKAGE_VERSION'),
  });
}

function queryConfig(): Partial<HarnessConfig> {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  return definedConfig({
    fixtureUrl: params.get('fixture') ?? undefined,
    backend: enumValue(params.get('backend'), ['copc-js', 'rust']),
    scenario: enumValue(params.get('scenario'), ['load-and-stream', 'camera-stream', 'static']),
    packageSource: enumValue(params.get('packageSource'), ['npm', 'tarball']),
    packageVersion: params.get('packageVersion') ?? undefined,
  });
}

function runtimeConfig(): Partial<HarnessConfig> {
  return typeof window === 'undefined' ? {} : (window.__COPC_HARNESS_CONFIG__ ?? {});
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
    scenario: values.scenario ?? defaults.scenario ?? 'load-and-stream',
    packageSource: values.packageSource ?? defaults.packageSource ?? 'npm',
    packageVersion: values.packageVersion ?? defaults.packageVersion ?? DEFAULT_PACKAGE_VERSION,
  };
}
