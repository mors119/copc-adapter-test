import assert from 'node:assert/strict';
import test from 'node:test';
import { MATRIX_FIXTURE_GAPS, selectMatrixCases } from './manifest.mjs';
import { matchesExpectedFailure } from './runner.mjs';

const expectedFailure = {
  outputIncludes: ['copc_wasm.wasm_.loader.mjs', '?url&no-inline'],
};

test('accepts a failure that matches every recorded expected-failure fragment', () => {
  assert.equal(matchesExpectedFailure(
    "Error: Module not found in copc_wasm.wasm_.loader.mjs for ./copc_wasm.wasm?url&no-inline",
    expectedFailure,
  ), true);
});

test('rejects an unrelated failure even when the matrix entry expects a failure', () => {
  assert.equal(matchesExpectedFailure(
    'Error: Turbopack configuration is invalid',
    expectedFailure,
  ), false);
});

test('rejects an expected-failure record without an output signature', () => {
  assert.equal(matchesExpectedFailure('any failure', {}), false);
});

test('selects runnable CRS coverage and keeps the documented PDRF 8 gap out of the matrix', () => {
  const cases = selectMatrixCases('full', {
    apps: 'vite-react-three',
    browsers: 'chromium',
    backends: 'rust',
  });
  assert.deepEqual([...new Set(cases.map((entry) => entry.fixtureId))], [
    'small-valid-copc',
    'point-format-7-rgb',
    'geographic-crs',
  ]);
  assert.deepEqual(MATRIX_FIXTURE_GAPS, ['point-format-8-rgb-nir']);
  assert.throws(() => selectMatrixCases('full', { fixtures: 'point-format-8-rgb-nir' }), /fixture gap/);
});

test('keeps the visual tier narrow, Chromium-only, and copc-js-only', () => {
  const cases = selectMatrixCases('visual');

  assert.deepEqual(cases.map((entry) => entry.appId), [
    'vite-react-cesium',
    'vite-react-three',
    'vite-r3f',
  ]);
  assert.deepEqual([...new Set(cases.map((entry) => entry.browser))], ['chromium']);
  assert.deepEqual([...new Set(cases.map((entry) => entry.backend))], ['copc-js']);
  assert.deepEqual([...new Set(cases.map((entry) => entry.fixtureId))], ['small-valid-copc']);
});
