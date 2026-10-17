import type * as THREE_TYPES from 'three';
import type { OrbitControls as OrbitControlsType } from 'three/addons/controls/OrbitControls.js';
import type { CopcThreeLayer } from '@frillab/copc-adapter/three';
import type { HarnessView } from '@copc-test/core';
import type { RendererOptions, TestRenderer } from './types';

export function mountThreeRenderer(
  container: HTMLElement,
  options: RendererOptions,
): TestRenderer {
  let disposed = false;
  let frame = 0;
  let timer: number | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let scene: THREE_TYPES.Scene | undefined;
  let camera: THREE_TYPES.PerspectiveCamera | undefined;
  let renderer: THREE_TYPES.WebGLRenderer | undefined;
  let controls: OrbitControlsType | undefined;
  let layer: CopcThreeLayer | undefined;
  let pendingPointSizeLayer: CopcThreeLayer | undefined;
  let destroyPendingPointSizeLayer: (() => void) | undefined;
  let adapterModule: typeof import('@frillab/copc-adapter/three') | undefined;
  let pointSize = options.pointSize;
  let pointSizeGeneration = 0;
  options.onStatus('loading');

  const snapshotWithPointSize = (current: CopcThreeLayer): unknown => ({
    ...current.getSnapshot(),
    rendererPointSize: pointSize,
  });

  const ready = (async (): Promise<void> => {
    try {
      const [THREE, adapter, controlModule] = await Promise.all([
        import('three'),
        import('@frillab/copc-adapter/three'),
        import('three/addons/controls/OrbitControls.js'),
      ]);
      if (disposed) return;
      adapterModule = adapter;

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
        pointSize,
        maxRenderedPoints: options.streaming.maxRenderedPoints,
        streaming: {
          maxNodes: options.streaming.maxNodes,
          maxDepth: options.streaming.maxDepth,
          maxScreenSpaceError: options.streaming.maxScreenSpaceError,
          maxRenderDistanceMeters: options.streaming.maxRenderDistanceMeters,
        },
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
      controls.addEventListener('change', () => {
        if (layer) void layer.update();
      });
      timer = window.setInterval(() => {
        if (!disposed && layer) options.onSnapshot(snapshotWithPointSize(layer));
      }, 250);
      currentLayer.attachTo({ scene, camera, renderer });
      options.onAttached();
      await currentLayer.load();
      if (disposed) return;
      await currentLayer.update();
      if (
        disposed ||
        !fitCamera(
          THREE,
          currentLayer,
          camera,
          controls.target,
          options.renderDistance,
        )
      ) {
        if (!disposed)
          throw new Error('COPC loaded, but Three.js rendered no points.');
        return;
      }
      controls.update();
      await currentLayer.update();
      options.onSnapshot(snapshotWithPointSize(currentLayer));
      options.onStatus('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!disposed) options.onStatus('error', message);
      throw error;
    }
  })();

  const setView = async (
    view: Exclude<HarnessView, 'visual'>,
  ): Promise<void> => {
    await ready;
    if (!layer || !camera || !controls || disposed) return;
    const THREE = await import('three');
    if (
      !fitCamera(
        THREE,
        layer,
        camera,
        controls.target,
        options.renderDistance,
      )
    )
      return;
    if (view !== 'overview') {
      const scale = view === 'near' ? 0.5 : 2;
      const offset = camera.position
        .clone()
        .sub(controls.target)
        .multiplyScalar(scale);
      camera.position.copy(controls.target).add(offset);
      camera.updateMatrixWorld(true);
    }
    controls.update();
    await layer.update();
    options.onSnapshot(snapshotWithPointSize(layer));
  };

  return {
    ready,
    setView,
    snapshot: () => (layer ? snapshotWithPointSize(layer) : undefined),
    async setPointSize(nextPointSize): Promise<void> {
      await ready;
      if (disposed || !layer || !scene || !camera || !renderer || !adapterModule)
        return;
      if (nextPointSize === pointSize) return;
      const currentGeneration = ++pointSizeGeneration;
      const previousLayer = layer;
      options.onStatus('loading');
      const candidate = new adapterModule.CopcThreeLayer({
        url: options.fixtureUrl,
        backend: options.backend,
        colorMode: 'elevation',
        pointSize: nextPointSize,
        maxRenderedPoints: options.streaming.maxRenderedPoints,
        streaming: {
          maxNodes: options.streaming.maxNodes,
          maxDepth: options.streaming.maxDepth,
          maxScreenSpaceError: options.streaming.maxScreenSpaceError,
          maxRenderDistanceMeters: options.streaming.maxRenderDistanceMeters,
        },
        debug: true,
      });
      let candidateDestroyed = false;
      const destroyCandidate = (): void => {
        if (candidateDestroyed) return;
        candidateDestroyed = true;
        candidate.destroy();
        if (pendingPointSizeLayer === candidate)
          pendingPointSizeLayer = undefined;
        if (destroyPendingPointSizeLayer === destroyCandidate)
          destroyPendingPointSizeLayer = undefined;
      };
      pendingPointSizeLayer = candidate;
      destroyPendingPointSizeLayer = destroyCandidate;
      try {
        candidate.attachTo({ scene, camera, renderer });
        await candidate.load();
        if (
          disposed ||
          currentGeneration !== pointSizeGeneration ||
          layer !== previousLayer
        ) {
          destroyCandidate();
          return;
        }
        await candidate.update();
        if (candidate.getRenderedPointCount() <= 0)
          throw new Error('Three.js point-size update rendered no points.');
        await candidate.update();
        previousLayer.detachFrom();
        layer = candidate;
        pendingPointSizeLayer = undefined;
        destroyPendingPointSizeLayer = undefined;
        pointSize = nextPointSize;
        previousLayer.destroy();
        options.onSnapshot(snapshotWithPointSize(candidate));
        options.onStatus('ready');
      } catch (error) {
        destroyCandidate();
        if (!disposed && currentGeneration === pointSizeGeneration) {
          options.onSnapshot(snapshotWithPointSize(previousLayer));
          options.onStatus(
            'error',
            error instanceof Error ? error.message : String(error),
          );
        }
        throw error;
      }
    },
    unload: () => {
      layer?.unload();
      options.onSnapshot(undefined);
    },
    destroy: () => {
      if (disposed) return;
      disposed = true;
      pointSizeGeneration += 1;
      destroyPendingPointSizeLayer?.();
      pendingPointSizeLayer = undefined;
      destroyPendingPointSizeLayer = undefined;
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
  renderDistance?: number,
): boolean {
  const bounds = new THREE.Box3().setFromObject(layer.getRoot());
  if (bounds.isEmpty()) return false;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 10);
  const offset = new THREE.Vector3(
    radius * 1.55,
    -radius * 1.55,
    radius * 0.95,
  );
  if (renderDistance !== undefined) offset.setLength(renderDistance);
  camera.position.copy(center).add(offset);
  camera.lookAt(center);
  camera.near = Math.max(radius / 10_000, 0.1);
  camera.far = Math.max(
    radius * 12,
    (renderDistance ?? 0) * 2 + radius,
    20_000,
  );
  camera.updateProjectionMatrix();
  target.copy(center);
  camera.updateMatrixWorld(true);
  return true;
}
