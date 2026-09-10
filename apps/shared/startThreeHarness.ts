import type * as ThreeTypes from 'three';
import type { OrbitControls as OrbitControlsType } from 'three/addons/controls/OrbitControls.js';
import type { CopcThreeLayer, CopcThreeLayerSnapshot } from '@frillab/copc-adapter/three';
import type { CopcTestContract, HarnessConfig } from '@copc-test/harness-core';

type ThreeHarnessOptions = {
  container: HTMLDivElement;
  config: HarnessConfig;
  contract: CopcTestContract;
  onStatus: (status: string) => void;
  onSnapshot: (snapshot: CopcThreeLayerSnapshot | undefined) => void;
};

function fitThreeCamera(
  layer: CopcThreeLayer,
  THREE: typeof import('three'),
  camera: ThreeTypes.Camera,
  target?: { copy(value: ThreeTypes.Vector3): unknown },
): boolean {
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

/** Mount the caller-owned Three scene after a framework's client hook runs. */
export function startThreeHarness({
  container,
  config,
  contract,
  onStatus,
  onSnapshot,
}: ThreeHarnessOptions): () => void {
  let disposed = false;
  let animationFrame = 0;
  let timer: number | undefined;
  let layer: CopcThreeLayer | undefined;
  let renderer: ThreeTypes.WebGLRenderer | undefined;
  let controls: OrbitControlsType | undefined;
  let removeResize: (() => void) | undefined;

  onStatus('loading');
  void (async (): Promise<void> => {
    try {
      const [THREE, adapter, controlsModule] = await Promise.all([
        import('three'),
        import('@frillab/copc-adapter/three'),
        import('three/addons/controls/OrbitControls.js'),
      ]);
      if (disposed) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#06101d');
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20_000);
      const currentRenderer = new THREE.WebGLRenderer({ antialias: true });
      renderer = currentRenderer;
      currentRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(currentRenderer.domElement);
      const currentControls = new controlsModule.OrbitControls(camera, currentRenderer.domElement);
      controls = currentControls;
      currentControls.enableDamping = true;

      const currentLayer = new adapter.CopcThreeLayer({
        url: config.fixtureUrl,
        colorMode: 'elevation',
        backend: config.backend,
        pointSize: 3,
        maxRenderedPoints: 1_000_000,
        streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
        debug: true,
      });
      layer = currentLayer;
      currentControls.addEventListener('change', () => {
        if (!disposed) void currentLayer.update();
      });

      const resize = (): void => {
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
        currentRenderer.setSize(width, height, false);
      };
      window.addEventListener('resize', resize);
      removeResize = () => window.removeEventListener('resize', resize);
      resize();

      const render = (): void => {
        if (disposed) return;
        currentControls.update();
        currentRenderer.render(scene, camera);
        animationFrame = window.requestAnimationFrame(render);
      };
      render();
      timer = window.setInterval(() => onSnapshot(currentLayer.getSnapshot()), 250);

      currentLayer.attachTo({ scene, camera, renderer: currentRenderer });
      contract.markAttached();
      await currentLayer.load();
      if (disposed) return;
      await currentLayer.update();
      if (disposed) return;
      if (!fitThreeCamera(currentLayer, THREE, camera, currentControls.target)) {
        throw new Error('COPC loaded, but no Three.js points were rendered.');
      }
      currentControls.update();
      await currentLayer.update();
      onSnapshot(currentLayer.getSnapshot());
      onStatus('ready');
    } catch (error: unknown) {
      if (!disposed) {
        contract.markError(error);
        onStatus('error');
      }
    }
  })();

  let cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    if (timer !== undefined) window.clearInterval(timer);
    window.cancelAnimationFrame(animationFrame);
    removeResize?.();
    controls?.dispose();
    layer?.destroy();
    renderer?.dispose();
    renderer?.domElement.remove();
    contract.markDestroyed();
    onSnapshot(undefined);
  };

  return () => cleanup();
}
