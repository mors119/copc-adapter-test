import * as THREE from 'three';
import { type CopcThreeLayer } from '@frillab/copc-adapter/three';

export function fitThreeCamera(
  layer: CopcThreeLayer,
  camera: THREE.Camera,
  target?: { copy(value: THREE.Vector3): unknown },
): boolean {
  // The metadata bounds are in the source CRS (UTM for the bundled sample),
  // while Three renders the adapter's local, origin-relative coordinates.
  // Fit the camera to the objects that were actually decoded instead.
  const bounds = new THREE.Box3().setFromObject(layer.getRoot());
  if (bounds.isEmpty()) return false;

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 10);

  camera.position.set(
    center.x + radius * 1.55,
    center.y - radius * 1.55,
    center.z + radius * 0.95,
  );
  camera.lookAt(center);

  if (camera instanceof THREE.PerspectiveCamera) {
    camera.near = Math.max(radius / 10_000, 0.1);
    camera.far = Math.max(radius * 12, 20_000);
    camera.updateProjectionMatrix();
  }

  target?.copy(center);
  camera.updateMatrixWorld(true);
  return true;
}
