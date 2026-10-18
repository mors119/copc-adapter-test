import assert from 'node:assert/strict';
import test from 'node:test';
import { pointSizeFromSearch } from '../src/index.ts';

test('point size query values stay within the supported renderer range', () => {
  assert.equal(pointSizeFromSearch(new URLSearchParams()), 3);
  assert.equal(pointSizeFromSearch(new URLSearchParams('pointSize=7')), 7);
  assert.equal(pointSizeFromSearch(new URLSearchParams('pointSize=0')), 1);
  assert.equal(pointSizeFromSearch(new URLSearchParams('pointSize=12')), 10);
  assert.equal(pointSizeFromSearch(new URLSearchParams('pointSize=invalid')), 3);
});
