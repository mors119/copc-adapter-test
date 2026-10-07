import type * as THREE_TYPES from 'three';
import type { OrbitControls as OrbitControlsType } from 'three/addons/controls/OrbitControls.js';
import type { CopcThreeLayer, CopcThreeLayerSnapshot } from '@frillab/copc-adapter/three';
import type { HarnessView } from '@copc-test/core';
import type { RendererOptions, TestRenderer } from './types';

export function mountThreeRenderer(container: HTMLElement, options: RendererOptions): TestRenderer {
  let disposed = false;
  let frame = 0;
  let timer: number | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let scene: THREE_TYPES.Scene | undefined;
  let camera: THREE_TYPES.PerspectiveCamera | undefined;
  let renderer: THREE_TYPES.WebGLRenderer | undefined;
  let controls: OrbitControlsType | undefined;
  let layer: CopcThreeLayer | undefined;
  options.onStatus('loading');

  const ready = (async (): Promise<void> => {
    try {
      const [THREE, adapter, controlModule] = await Promise.all([
        import('three'),
        import('@frillab/copc-adapter/three'),
        import('three/addons/controls/OrbitControls.js'),
      ]);
      if (disposed) return;

      scene = new THREE.Scene();
      scene.background = new THREE.Color('#06101d');
      camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20_000);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.append(renderer.domElement);
      controls = new controlModule.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      const currentLayer = new adapter.CopcThreeLayer({
        url: options.fixtureUrl,
        backend: options.backend,
        colorMode: 'elevation',
        pointSize: 3,
        maxRenderedPoints: 1_000_000,
        streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20_000 },
        debug: true,
      });
      layer = currentLayer;
      const resize = (): void => {
        if (!camera || !renderer) return;
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();

      const render = (): void => {
        if (disposed || !scene || !camera || !renderer || !controls) return;
        controls.update();
        renderer.render(scene, camera);
        frame = window.requestAnimationFrame(render);
      };
      render();
      controls.addEventListener('change', () => { void currentLayer.update(); });
      timer = window.setInterval(() => {
        if (!disposed) options.onSnapshot(currentLayer.getSnapshot());
      }, 250);
      currentLayer.attachTo({ scene, camera, renderer });
      options.onAttached();
      await currentLayer.load();
      if (disposed) return;
      await currentLayer.update();
      if (disposed || !fitCamera(THREE, currentLayer, camera, controls.target)) {
        if (!disposed) throw new Error('COPC loaded, but Three.js rendered no points.');
        return;
      }
      controls.update();
      await currentLayer.update();
      options.onSnapshot(currentLayer.getSnapshot() satisfies CopcThreeLayerSnapshot);
      options.onStatus('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!disposed) options.onStatus('error', message);
      throw error;
    }
  })();

  const setView = async (view: Exclude<HarnessView, 'visual'>): Promise<void> => {
    await ready;
    if (!layer || !camera || !controls || disposed) return;
    if (view === 'overview') {
      const THREE = await import('three');
      fitCamera(THREE, layer, camera, controls.target);
    } else {
      const scale = view === 'near' ? 0.65 : 1.5;
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(scale);
      camera.position.copy(controls.target).add(offset);
      camera.updateMatrixWorld(true);
    }
    controls.update();
    await layer.update();
    options.onSnapshot(layer.getSnapshot());
  };

  return {
    ready,
    setView,
    snapshot: () => layer?.getSnapshot(),
    unload: () => {
      layer?.unload();
      options.onSnapshot(undefined);
    },
    destroy: () => {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) window.clearInterval(timer);
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      controls?.dispose();
      layer?.destroy();
      renderer?.dispose();
      renderer?.domElement.remove();
      options.onSnapshot(undefined);
    },
  };
}

function fitCamera(
  THREE: typeof import('three'),
  layer: CopcThreeLayer,
  camera: THREE_TYPES.PerspectiveCamera,
  target: THREE_TYPES.Vector3,
): boolean {
  const bounds = new THREE.Box3().setFromObject(layer.getRoot());
  if (bounds.isEmpty()) return false;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 10);
  camera.position.set(center.x + radius * 1.55, center.y - radius * 1.55, center.z + radius * 0.95);
  camera.lookAt(center);
  camera.near = Math.max(radius / 10_000, 0.1);
  camera.far = Math.max(radius * 12, 20_000);
  camera.updateProjectionMatrix();
  target.copy(center);
  camera.updateMatrixWorld(true);
  return true;
}
