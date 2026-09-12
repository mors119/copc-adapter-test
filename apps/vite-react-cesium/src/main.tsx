import 'cesium/Build/Cesium/Widgets/widgets.css';
import '../../../apps/shared/styles.css';

import * as Cesium from 'cesium';
import { CopcCesiumLayer, type CopcCesiumLayerSnapshot } from '@frillab/copc-adapter/cesium';
import { DEFAULT_FIXTURE_ID, fixtureUrlForId } from '@copc-test/fixture-client';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import { StrictMode, useCallback, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HarnessPanel } from '../../../apps/shared/HarnessPanel';
import { benchmarkCacheOptions } from '../../../apps/shared/benchmarkOptions';
import { withPublicHierarchyDiagnostics } from '../../../apps/shared/publicDiagnostics';

const harnessConfig = createHarnessConfig({
  appId: 'vite-react-cesium',
  host: 'vite',
  renderer: 'cesium',
  fixtureUrl: fixtureUrlForId(DEFAULT_FIXTURE_ID),
  backend: 'copc-js',
  scenario: 'load-and-stream',
}, import.meta.env, 'VITE_');
const testContract = createTestContract(harnessConfig);

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
      backend: harnessConfig.backend,
      pointSize: 2,
      debug: true,
      streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8 },
      ...benchmarkCacheOptions(),
    });

    let disposed = false;
    onStatus('loading');
    const publicSnapshot = (): CopcCesiumLayerSnapshot & { hierarchy?: Record<string, number> } =>
      withPublicHierarchyDiagnostics(layer.getSnapshot(), layer);
    const timer = window.setInterval(() => onSnapshot(publicSnapshot()), 250);

    void layer.load().then(() => {
      if (disposed) return;
      layer.attachTo(viewer);
      testContract.markAttached();
      onSnapshot(publicSnapshot());
      onStatus('ready');
    }).catch((error: unknown) => {
      if (disposed) return;
      testContract.markError(error);
      onStatus(error instanceof Error ? error.message : String(error));
    });

    return () => {
      disposed = true;
      window.clearInterval(timer);
      layer.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
      container.remove();
      testContract.markDestroyed();
      onSnapshot(undefined);
    };
  }, [onSnapshot, onStatus, url]);

  return null;
}

function App(): ReactNode {
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState('idle');
  const [snapshot, setSnapshot] = useState<CopcCesiumLayerSnapshot>();
  useEffect(() => {
    testContract.registerCommand('reload', () => setReloadKey((value) => value + 1));
    return () => testContract.unregisterCommand('reload');
  }, []);
  const reportStatus = useCallback((value: string): void => {
    setStatus(value);
    if (value === 'loading') testContract.markLoading();
    else if (value === 'ready') testContract.markReady();
    else if (value !== 'idle') testContract.markError(value);
  }, []);
  const reportSnapshot = useCallback((value: CopcCesiumLayerSnapshot | undefined): void => {
    setSnapshot(value);
    testContract.setSnapshot(value);
  }, []);

  return (
    <main className="harness-root">
      <CesiumViewport
        key={`${harnessConfig.fixtureUrl}:${reloadKey}`}
        url={harnessConfig.fixtureUrl}
        onStatus={reportStatus}
        onSnapshot={reportSnapshot}
      />
      <HarnessPanel
        config={harnessConfig}
        framework="Vite + React"
        renderer="Cesium"
        status={status}
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
