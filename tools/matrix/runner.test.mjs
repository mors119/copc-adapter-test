import assert from 'node:assert/strict';
import test from 'node:test';
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
