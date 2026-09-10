import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import { startThreeHarness } from '../../../../apps/shared/startThreeHarness';

const config = createHarnessConfig({
  appId: 'astro-three',
  host: 'astro',
  renderer: 'three',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID, '/api'),
  backend: 'copc-js',
  scenario: 'load-and-stream',
});
const contract = createTestContract(config);
const statusElement = document.querySelector<HTMLElement>('#harness-status');
const snapshotElements = {
  lifecycle: document.querySelector<HTMLElement>('#harness-lifecycle'),
  backend: document.querySelector<HTMLElement>('#harness-backend'),
  nodes: document.querySelector<HTMLElement>('#harness-nodes'),
  points: document.querySelector<HTMLElement>('#harness-points'),
  updates: document.querySelector<HTMLElement>('#harness-updates'),
};

function setStatus(value: string): void {
  if (statusElement) {
    statusElement.textContent = value;
    statusElement.dataset.status = value;
  }
  if (value === 'loading') contract.markLoading();
  else if (value === 'ready') contract.markReady();
  else if (value !== 'idle') contract.markError(value);
}

const stop = startThreeHarness({
  container: document.querySelector<HTMLDivElement>('#three-viewport')!,
  config,
  contract,
  onStatus: setStatus,
  onSnapshot: (snapshot) => {
    contract.setSnapshot(snapshot);
    if (!snapshot) return;
    if (snapshotElements.lifecycle) snapshotElements.lifecycle.textContent = snapshot.lifecycle;
    if (snapshotElements.backend) snapshotElements.backend.textContent = snapshot.backend;
    if (snapshotElements.nodes) snapshotElements.nodes.textContent = String(snapshot.renderedNodeKeys.length);
    if (snapshotElements.points) snapshotElements.points.textContent = String(snapshot.renderedPointCount);
    if (snapshotElements.updates) snapshotElements.updates.textContent = String(snapshot.streamingUpdateCount);
  },
});

function reload(): void {
  window.location.reload();
}

contract.registerCommand('reload', reload);
document.querySelector<HTMLButtonElement>('#harness-reload')?.addEventListener('click', reload);
window.addEventListener('pagehide', stop, { once: true });
