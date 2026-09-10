import type {
  HarnessResult,
  RuntimeScenarioId,
} from '@copc-test/test-contract';

export type RuntimeAssertionOptions = {
  baseline?: HarnessResult;
  maxEquivalentViewUpdates?: number;
};

function fail(scenario: RuntimeScenarioId, message: string): never {
  throw new Error(`[${scenario}] ${message}`);
}

function requireReady(result: HarnessResult, scenario: RuntimeScenarioId): void {
  if (result.status !== 'ready') {
    fail(scenario, `expected ready status, received ${result.status}`);
  }
}

/**
 * Assertions shared by every Playwright consumer. They intentionally inspect
 * only the public browser contract, never adapter decoder internals.
 */
export function assertRuntimeScenario(
  scenario: RuntimeScenarioId,
  result: HarnessResult,
  options: RuntimeAssertionOptions = {},
): void {
  switch (scenario) {
    case 'metadata-root-hierarchy':
      requireReady(result, scenario);
      if (!result.diagnostics.metadataLoaded || !result.diagnostics.hierarchyLoaded) {
        fail(scenario, 'metadata and root hierarchy must be loaded');
      }
      return;

    case 'attach-to-caller-renderer':
      requireReady(result, scenario);
      if (result.diagnostics.attached !== true) {
        fail(scenario, 'layer is not attached to the caller-owned renderer host');
      }
      return;

    case 'initial-point-rendering':
      requireReady(result, scenario);
      if ((result.diagnostics.renderedPointCount ?? 0) <= 0) {
        fail(scenario, 'initial rendered point count must be non-zero');
      }
      return;

    case 'camera-streaming-update':
      requireReady(result, scenario);
      if ((result.diagnostics.streamingUpdateCount ?? 0)
        <= (options.baseline?.diagnostics.streamingUpdateCount ?? 0)) {
        fail(scenario, 'camera/view change did not produce a streaming update');
      }
      return;

    case 'equivalent-view-is-stable': {
      requireReady(result, scenario);
      const before = options.baseline?.diagnostics.streamingUpdateCount ?? 0;
      const after = result.diagnostics.streamingUpdateCount ?? 0;
      const maxUpdates = options.maxEquivalentViewUpdates ?? 2;
      if (after - before > maxUpdates) {
        fail(scenario, `equivalent view caused ${after - before} updates (max ${maxUpdates})`);
      }
      return;
    }

    case 'reload-to-ready':
      requireReady(result, scenario);
      if (result.readyAt === undefined || result.startedAt === undefined) {
        fail(scenario, 'reload did not publish lifecycle timestamps');
      }
      return;

    case 'detach-preserves-host-resources':
      if (result.status !== 'ready' && result.status !== 'destroyed') {
        fail(scenario, `detach left the harness in ${result.status}`);
      }
      return;

    case 'unload-releases-point-state':
      if (!['ready', 'destroyed'].includes(result.status)
        || (result.diagnostics.renderedPointCount ?? 0) !== 0) {
        fail(scenario, 'unload did not release rendered point state');
      }
      return;

    case 'destroy-releases-layer-resources':
      if (result.status !== 'destroyed' || result.lifecycle !== 'destroyed') {
        fail(scenario, 'destroy did not publish the destroyed lifecycle');
      }
      return;

    case 'color-mode-change':
      requireReady(result, scenario);
      return;

    case 'point-picking':
      requireReady(result, scenario);
      if (!result.diagnostics.selectedPoint) {
        fail(scenario, 'point picking did not publish a selected point');
      }
      return;

    case 'diagnostics-observable':
      if (!result.config.appId || !result.config.renderer || !result.config.backend
        || !result.config.fixtureUrl || !result.diagnostics) {
        fail(scenario, 'required identity or diagnostics fields are missing');
      }
      return;

    case 'source-error-is-visible':
      if (result.status !== 'error' || !result.error?.message || result.error.message === 'error') {
        fail(scenario, 'source failure is not visible in project-owned error state');
      }
      return;

    case 'rust-failure-is-not-retried':
      if (result.config.backend !== 'rust' || result.status !== 'error'
        || !result.error?.message || result.error.message === 'error') {
        fail(scenario, 'Rust/backend failure was not preserved as a visible failure');
      }
      return;

    default: {
      const exhaustive: never = scenario;
      return exhaustive;
    }
  }
}
