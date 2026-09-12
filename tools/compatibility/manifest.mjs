/**
 * Compatibility cases intentionally use exact versions. Do not replace these
 * with ranges: the point of this matrix is to keep the supported boundary and
 * the repository's normal current dependency set visible in CI.
 */
export const COMPATIBILITY_CASES = {
  'cesium-min': {
    id: 'cesium-min',
    renderer: 'cesium',
    track: 'minimum',
    peers: { cesium: '1.142.0' },
    imports: [
      "import * as Cesium from 'cesium';",
      "import { CopcCesiumLayer } from '@frillab/copc-adapter/cesium';",
      'void Cesium; void CopcCesiumLayer;',
    ],
  },
  'cesium-current': {
    id: 'cesium-current',
    renderer: 'cesium',
    track: 'current',
    peers: { cesium: '1.145.0' },
    imports: [
      "import * as Cesium from 'cesium';",
      "import { CopcCesiumLayer } from '@frillab/copc-adapter/cesium';",
      'void Cesium; void CopcCesiumLayer;',
    ],
  },
  'three-min': {
    id: 'three-min',
    renderer: 'three',
    track: 'minimum',
    peers: { three: '0.170.0' },
    imports: [
      "import * as THREE from 'three';",
      "import { CopcThreeLayer } from '@frillab/copc-adapter/three';",
      'void THREE; void CopcThreeLayer;',
    ],
  },
  'three-current': {
    id: 'three-current',
    renderer: 'three',
    track: 'current',
    peers: { three: '0.186.0' },
    imports: [
      "import * as THREE from 'three';",
      "import { CopcThreeLayer } from '@frillab/copc-adapter/three';",
      'void THREE; void CopcThreeLayer;',
    ],
  },
  'r3f-current': {
    id: 'r3f-current',
    renderer: 'r3f',
    track: 'current',
    peers: {
      '@react-three/fiber': '9.7.0',
      '@types/three': '0.185.4',
      react: '19.2.8',
      'react-dom': '19.2.8',
      three: '0.186.0',
    },
    imports: [
      "import * as THREE from 'three';",
      "import { createRoot } from 'react-dom/client';",
      "import { Canvas } from '@react-three/fiber';",
      "import { CopcThreeLayer } from '@frillab/copc-adapter/three';",
      'void THREE; void createRoot; void Canvas; void CopcThreeLayer;',
    ],
  },
};

export const NODE_TRACKS = {
  minimum: '18.x',
  current: '22.x',
};

export const PACKAGE_MANAGER_TRACKS = {
  npm: { status: 'required-pass' },
  pnpm: { status: 'required-pass' },
  yarn: { status: 'required-pass' },
  // The packed adapter has no native runtime dependency, so Bun is a required
  // pass track rather than an expected failure or unsupported combination.
  bun: { status: 'required-pass' },
};

export const PACKAGE_MANAGERS = Object.keys(PACKAGE_MANAGER_TRACKS);

export const BUILD_TOOL_VERSIONS = {
  // Vite 5 keeps the clean consumer build runnable on the declared Node 18
  // floor while still exercising a real production bundler.
  vite: '5.4.19',
  typescript: '5.6.3',
};

export function selectCompatibilityCases(selector) {
  const requested = (selector ?? Object.keys(COMPATIBILITY_CASES).join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const selected = requested.map((id) => COMPATIBILITY_CASES[id]);
  const unknown = requested.filter((id) => !COMPATIBILITY_CASES[id]);
  if (unknown.length > 0) {
    throw new Error(`Unknown compatibility case(s): ${unknown.join(', ')}. Use: ${Object.keys(COMPATIBILITY_CASES).join(', ')}`);
  }
  return selected;
}

export function selectPackageManagers(selector) {
  const requested = (selector ?? 'npm')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const unknown = requested.filter((manager) => !PACKAGE_MANAGERS.includes(manager));
  if (unknown.length > 0) {
    throw new Error(`Unknown package manager(s): ${unknown.join(', ')}. Use: ${PACKAGE_MANAGERS.join(', ')}`);
  }
  return requested;
}
