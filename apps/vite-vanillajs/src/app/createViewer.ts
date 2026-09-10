import * as Cesium from 'cesium';

export function createViewer(): Cesium.Viewer {
  const appBaseUrl = import.meta.env.BASE_URL;

  (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL =
    `${appBaseUrl}cesium/`;

  const viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false,
    timeline: false,
    geocoder: false,
    baseLayerPicker: false,
    baseLayer: false,
    skyBox: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    homeButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  });

  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#07111f');
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#182536');
  viewer.scene.globe.depthTestAgainstTerrain = false;
  viewer.scene.globe.enableLighting = false;
  viewer.scene.renderError.addEventListener((_scene, error) => {
    console.error('Cesium rendering error:', error);
  });

  return viewer;
}

export function getRenderedCopcBoundingSphere(
  viewer: Cesium.Viewer,
): Cesium.BoundingSphere | undefined {
  const positions: Cesium.Cartesian3[] = [];

  for (
    let collectionIndex = 0;
    collectionIndex < viewer.scene.primitives.length;
    collectionIndex += 1
  ) {
    const primitive = viewer.scene.primitives.get(collectionIndex);

    if (!(primitive instanceof Cesium.PointPrimitiveCollection)) {
      continue;
    }

    const stride = Math.max(1, Math.floor(primitive.length / 2000));

    for (
      let pointIndex = 0;
      pointIndex < primitive.length;
      pointIndex += stride
    ) {
      const point = primitive.get(pointIndex);

      if (point.position) {
        positions.push(Cesium.Cartesian3.clone(point.position));
      }
    }
  }

  return positions.length > 0
    ? Cesium.BoundingSphere.fromPoints(positions)
    : undefined;
}

export async function waitForCopcBoundingSphere(
  viewer: Cesium.Viewer,
  timeoutMs = 15_000,
): Promise<Cesium.BoundingSphere> {
  const deadline = performance.now() + timeoutMs;

  while (performance.now() < deadline) {
    const sphere = getRenderedCopcBoundingSphere(viewer);

    if (sphere) {
      return sphere;
    }

    await sleep(150);
  }

  throw new Error('COPC points were not rendered before the camera timeout.');
}

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function flyToBoundingSphere(
  viewer: Cesium.Viewer,
  sphere: Cesium.BoundingSphere,
  headingDegrees: number,
  pitchDegrees: number,
  rangeMultiplier: number,
  duration: number,
): Promise<void> {
  const range = Math.max(sphere.radius * rangeMultiplier, 150);
  const offset = new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(headingDegrees),
    Cesium.Math.toRadians(pitchDegrees),
    range,
  );

  if (duration <= 0) {
    viewer.camera.viewBoundingSphere(sphere, offset);
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    viewer.camera.flyToBoundingSphere(sphere, {
      offset,
      duration,
      complete: resolve,
      cancel: resolve,
    });
  });
}

export function waitForGlobeTiles(
  viewer: Cesium.Viewer,
  timeoutMs = 2_000,
): Promise<void> {
  if (viewer.scene.globe.tilesLoaded) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let finished = false;
    let removeListener: () => void = () => {};

    const finish = (): void => {
      if (finished) {
        return;
      }

      finished = true;
      removeListener();
      resolve();
    };

    removeListener = viewer.scene.globe.tileLoadProgressEvent.addEventListener(
      (remainingTiles) => {
        if (remainingTiles === 0) {
          finish();
        }
      },
    );

    window.setTimeout(finish, timeoutMs);
  });
}
