import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPATIBILITY_CASES,
  NODE_TRACKS,
  PACKAGE_MANAGER_TRACKS,
  PACKAGE_MANAGERS,
  selectCompatibilityCases,
} from './manifest.mjs';

test('keeps minimum and current peer versions explicit', () => {
  assert.deepEqual(COMPATIBILITY_CASES['cesium-min'].peers, { cesium: '1.142.0' });
  assert.deepEqual(COMPATIBILITY_CASES['cesium-current'].peers, { cesium: '1.145.0' });
  assert.deepEqual(COMPATIBILITY_CASES['three-min'].peers, { three: '0.170.0' });
  assert.equal(COMPATIBILITY_CASES['three-current'].peers.three, '0.186.0');
  assert.equal(COMPATIBILITY_CASES['r3f-current'].peers.react, '19.2.8');
});

test('defaults to every representative compatibility case', () => {
  assert.deepEqual(
    selectCompatibilityCases().map((testCase) => testCase.id),
    ['cesium-min', 'cesium-current', 'three-min', 'three-current', 'r3f-current'],
  );
});

test('declares the Node and package-manager tracks used by CI', () => {
  assert.deepEqual(NODE_TRACKS, { minimum: '18.x', current: '22.x' });
  assert.deepEqual(PACKAGE_MANAGERS, ['npm', 'pnpm', 'yarn', 'bun']);
  assert.deepEqual(Object.values(PACKAGE_MANAGER_TRACKS).map(({ status }) => status), [
    'required-pass',
    'required-pass',
    'required-pass',
    'required-pass',
  ]);
});
