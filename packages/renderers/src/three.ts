import type * as THREE_TYPES from 'three';
import type { OrbitControls as OrbitControlsType } from 'three/addons/controls/OrbitControls.js';
import type { CopcThreeLayer } from '@frillab/copc-adapter/three';
import type { HarnessView } from '@copc-test/core';
import type { RendererOptions, TestRenderer } from './types';
import {
  animateThreeCameraToPose,
  applyThreeCameraPose,
  getThreeCameraPose,
} from './camera-transition';

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
  let threeModule: typeof import('three') | undefined;
  let pendingPointSizeLayer: CopcThreeLayer | undefined;
  let destroyPendingPointSizeLayer: (() => void) | undefined;
  let adapterModule: typeof import('@frillab/copc-adapter/three') | undefined;
  let pointSize = options.pointSize;
  let pointSizeGeneration = 0;
  let viewTransitionGeneration = 0;
  let cancelViewTransition: (() => void) | undefined;
  let cameraAnimating = false;
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
      threeModule = THREE;
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
        if (!cameraAnimating && layer) void layer.update();
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
    const activeLayer = layer;
    const THREE = threeModule;
    if (!THREE) return;
    const pose = getThreeCameraPose(
      THREE,
      activeLayer.getRoot(),
      view,
      options.renderDistance,
    );
    if (!pose) return;
    const currentGeneration = ++viewTransitionGeneration;
    cancelViewTransition?.();
    cameraAnimating = true;
    const transition = animateThreeCameraToPose(
      THREE,
      camera,
      controls,
      pose,
    );
    cancelViewTransition = transition.cancel;
    await transition.finished;
    if (
      disposed ||
      currentGeneration !== viewTransitionGeneration ||
      layer !== activeLayer
    )
      return;
    cancelViewTransition = undefined;
    try {
      await activeLayer.update();
    } finally {
      if (currentGeneration === viewTransitionGeneration)
        cameraAnimating = false;
    }
    if (
      disposed ||
      currentGeneration !== viewTransitionGeneration ||
      layer !== activeLayer
    )
      return;
    options.onSnapshot(snapshotWithPointSize(activeLayer));
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
      viewTransitionGeneration += 1;
      cancelViewTransition?.();
      cancelViewTransition = undefined;
      cameraAnimating = false;
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
      viewTransitionGeneration += 1;
      cancelViewTransition?.();
      cancelViewTransition = undefined;
      cameraAnimating = false;
      layer?.unload();
      options.onSnapshot(undefined);
    },
    destroy: () => {
      if (disposed) return;
      disposed = true;
      pointSizeGeneration += 1;
      viewTransitionGeneration += 1;
      cancelViewTransition?.();
      cancelViewTransition = undefined;
      cameraAnimating = false;
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
  const pose = getThreeCameraPose(
    THREE,
    layer.getRoot(),
    'overview',
    renderDistance,
  );
  if (!pose) return false;
  applyThreeCameraPose(THREE, camera, target, pose);
  return true;
}
