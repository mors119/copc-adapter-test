import 'cesium/Build/Cesium/Widgets/widgets.css';
import '../../../apps/shared/styles.css';

import * as Cesium from 'cesium';
import { CopcCesiumLayer, type CopcCesiumLayerSnapshot } from '@frillab/copc-adapter';
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HarnessPanel } from '../../../apps/shared/HarnessPanel';

const SAMPLE_URL = '/samples/sofi.copc.laz';

type ViewportProps = {
  url: string;
  onStatus: (status: string) => void;
  onSnapshot: (snapshot: CopcCesiumLayerSnapshot | undefined) => void;
};

function CesiumViewport({ url, onStatus, onSnapshot }: ViewportProps): ReactNode {
  useEffect(() => {
    const baseUrl = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '/')}`;
    (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = `${baseUrl}cesium/`;

    const container = document.createElement('div');
    container.className = 'harness-canvas';
    document.body.appendChild(container);

    const viewer = new Cesium.Viewer(container, {
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
    const layer = new CopcCesiumLayer({
      url,
      colorMode: 'elevation',
      backend: 'copc-js',
      pointSize: 2,
      debug: true,
      streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8 },
    });

    let disposed = false;
    onStatus('loading');
    const timer = window.setInterval(() => onSnapshot(layer.getSnapshot()), 250);

    void layer.load().then(() => {
      if (disposed) return;
      layer.attachTo(viewer);
      onSnapshot(layer.getSnapshot());
      onStatus('ready');
    }).catch((error: unknown) => {
      if (disposed) return;
      onStatus(error instanceof Error ? error.message : String(error));
    });

    return () => {
      disposed = true;
      window.clearInterval(timer);
      layer.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
      container.remove();
      onSnapshot(undefined);
    };
  }, [onSnapshot, onStatus, url]);

  return null;
}

function App(): ReactNode {
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState('idle');
  const [snapshot, setSnapshot] = useState<CopcCesiumLayerSnapshot>();

  return (
    <main className="harness-root">
      <CesiumViewport
        key={`${SAMPLE_URL}:${reloadKey}`}
        url={SAMPLE_URL}
        onStatus={setStatus}
        onSnapshot={setSnapshot}
      />
      <HarnessPanel
        framework="Vite + React"
        renderer="Cesium"
        status={status}
        sampleUrl={SAMPLE_URL}
        snapshot={snapshot}
        onReload={() => setReloadKey((value) => value + 1)}
      >
        <p className="hint">Published package의 Cesium entry를 직접 로드합니다. 카메라는 어댑터가 fixture bounds로 이동시킵니다.</p>
      </HarnessPanel>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
