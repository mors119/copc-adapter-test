'use client';

import type * as CesiumTypes from 'cesium';
import type { CopcCesiumLayer, CopcCesiumLayerSnapshot } from '@frillab/copc-adapter/cesium';
import { createHarnessConfig, createTestContract } from '@copc-test/harness-core';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { HarnessPanel } from '../../../apps/shared/HarnessPanel';

const harnessConfig = createHarnessConfig({
  appId: 'next-cesium',
  host: 'next',
  renderer: 'cesium',
  fixtureUrl: '/api/samples/sofi.copc.laz',
  backend: 'copc-js',
  scenario: 'load-and-stream',
}, process.env, 'NEXT_PUBLIC_');
const testContract = createTestContract(harnessConfig);

type ViewportProps = {
  url: string;
  onStatus: (status: string) => void;
  onSnapshot: (snapshot: CopcCesiumLayerSnapshot | undefined) => void;
};

function CesiumViewport({ url, onStatus, onSnapshot }: ViewportProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = '/api/cesium/';
    let disposed = false;
    let viewer: CesiumTypes.Viewer | undefined;
    let layer: CopcCesiumLayer | undefined;
    let timer: number | undefined;

    onStatus('loading');
    void (async (): Promise<void> => {
      try {
        const [Cesium, adapter] = await Promise.all([
          import('cesium'),
          import('@frillab/copc-adapter/cesium'),
        ]);
        if (disposed) return;

        viewer = new Cesium.Viewer(container, {
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
        layer = new adapter.CopcCesiumLayer({
          url,
          colorMode: 'elevation',
          backend: harnessConfig.backend,
          pointSize: 2,
          debug: true,
          streaming: { maxNodes: 8, maxDepth: 6, maxScreenSpaceError: 8 },
        });
        timer = window.setInterval(() => onSnapshot(layer?.getSnapshot()), 250);
        await layer.load();
        if (disposed) return;
        layer.attachTo(viewer);
        testContract.markAttached();
        onSnapshot(layer.getSnapshot());
        onStatus('ready');
      } catch (error: unknown) {
        if (!disposed) {
          testContract.markError(error);
          onStatus(error instanceof Error ? error.message : String(error));
        }
      }
    })();

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearInterval(timer);
      layer?.destroy();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      testContract.markDestroyed();
      onSnapshot(undefined);
    };
  }, [onSnapshot, onStatus, url]);

  return <div ref={containerRef} className="harness-canvas" aria-label="COPC Cesium viewport" />;
}

export default function CesiumClient(): ReactNode {
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState('idle');
  const [snapshot, setSnapshot] = useState<CopcCesiumLayerSnapshot>();
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
        framework="Next.js"
        renderer="Cesium"
        status={status}
        snapshot={snapshot}
        onReload={() => setReloadKey((value) => value + 1)}
      >
        <p className="hint">Cesium/adapter는 서버에서 import하지 않고 client effect 안에서만 로드합니다. Next route handler가 Range 요청을 공용 2GB fixture로 전달합니다.</p>
      </HarnessPanel>
    </main>
  );
}
