import type * as THREE_TYPES from 'three';
import type { OrbitControls as OrbitControlsType } from 'three/addons/controls/OrbitControls.js';
import type { HarnessView } from '@copc-test/core';

export type ThreeCameraPose = {
  position: THREE_TYPES.Vector3;
  target: THREE_TYPES.Vector3;
  near: number;
  far: number;
};

export function getThreeCameraPose(
  THREE: typeof import('three'),
  root: THREE_TYPES.Object3D,
  view: Exclude<HarnessView, 'visual'>,
  renderDistance?: number,
): ThreeCameraPose | undefined {
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return undefined;
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 10);
  const offset = new THREE.Vector3(
    radius * 1.55,
    -radius * 1.55,
    radius * 0.95,
  );
  if (renderDistance !== undefined) offset.setLength(renderDistance);
  const viewScale = view === 'near' ? 0.5 : view === 'far' ? 2 : 1;
  offset.multiplyScalar(viewScale);

  return {
    position: center.clone().add(offset),
    target: center,
    near: Math.max(radius / 10_000, 0.1),
    far: Math.max(
      radius * 12,
      (renderDistance ?? 0) * 2 + radius,
      20_000,
    ),
  };
}

export function applyThreeCameraPose(
  THREE: typeof import('three'),
  camera: THREE_TYPES.Camera,
  target: THREE_TYPES.Vector3,
  pose: ThreeCameraPose,
): void {
  camera.position.copy(pose.position);
  target.copy(pose.target);
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.near = pose.near;
    camera.far = pose.far;
    camera.updateProjectionMatrix();
  }
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}

export type ThreeCameraTransition = {
  finished: Promise<void>;
  cancel(): void;
};

export function animateThreeCameraToPose(
  THREE: typeof import('three'),
  camera: THREE_TYPES.Camera,
  controls: OrbitControlsType,
  pose: ThreeCameraPose,
  durationMs = 850,
): ThreeCameraTransition {
  const wasEnabled = controls.enabled;
  const wasDamping = controls.enableDamping;
  controls.enabled = false;
  controls.enableDamping = false;
  controls.update();

  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  let frame = 0;
  let settled = false;
  let resolveFinished = (): void => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const finish = (): void => {
    if (settled) return;
    settled = true;
    window.cancelAnimationFrame(frame);
    controls.enabled = wasEnabled;
    controls.enableDamping = wasDamping;
    resolveFinished();
  };

  const startedAt = performance.now();
  const step = (now: number): void => {
    if (settled) return;
    const progress = Math.min((now - startedAt) / durationMs, 1);
    const eased = progress * progress * (3 - 2 * progress);
    camera.position.lerpVectors(startPosition, pose.position, eased);
    controls.target.lerpVectors(startTarget, pose.target, eased);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld(true);
    controls.update();

    if (progress === 1) {
      applyThreeCameraPose(THREE, camera, controls.target, pose);
      controls.update();
      finish();
      return;
    }
    frame = window.requestAnimationFrame(step);
  };

  frame = window.requestAnimationFrame(step);
  return { finished, cancel: finish };
}
