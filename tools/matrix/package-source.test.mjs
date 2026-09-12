import assert from 'node:assert/strict';
import test from 'node:test';
import { ADAPTER_PACKAGE, ADAPTER_TARGET_VERSION, validatePackageMetadata } from './package-source.mjs';

const metadata = {
  name: ADAPTER_PACKAGE,
  version: ADAPTER_TARGET_VERSION,
  exports: {
    '.': { import: './dist/index.js' },
    './cesium': { import: './dist/cesium.js' },
    './three': { import: './dist/three.js' },
  },
};

test('accepts the current adapter package boundary', () => {
  assert.doesNotThrow(() => validatePackageMetadata(metadata, 'fixture'));
});

test('rejects an older adapter version instead of silently downgrading', () => {
  assert.throws(
    () => validatePackageMetadata({ ...metadata, version: '0.3.0' }, 'fixture'),
    /expected @frillab\/copc-adapter@0\.4\.0/,
  );
});

test('requires every public renderer entrypoint', () => {
  const missingThree = {
    ...metadata,
    exports: { ...metadata.exports, './three': undefined },
  };
  assert.throws(() => validatePackageMetadata(missingThree, 'fixture'), /does not expose @frillab\/copc-adapter\/three/);
});
