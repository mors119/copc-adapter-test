import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { ADAPTER_PACKAGE, ADAPTER_VERSION } from '../adapter-source/index.mjs';

const remoteUrl =
  'https://data.pointcloud.org/autzen/autzen-classified.copc.laz';
const project = await mkdtemp(join(tmpdir(), 'copc-adapter-npm-consumer-'));
let succeeded = false;
let serverProcess;
let browser;

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0
        ? resolvePromise()
        : reject(
            new Error(
              `${command} ${args.join(' ')} failed (${signal ?? code}).`,
            ),
          ),
    );
  });
}

async function unusedPort() {
  const socket = createServer();
  await new Promise((resolvePromise, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = socket.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not choose a consumer test port.');
  await new Promise((resolvePromise, reject) =>
    socket.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return address.port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* Vite has not started yet. */
    }
    await delay(250);
  }
  throw new Error(`Vite consumer did not start at ${url}.`);
}

try {
  await run('npm', ['init', '-y'], project);
  await run(
    'npm',
    ['install', 'cesium', 'vite', '--no-audit', '--no-fund'],
    project,
  );
  await run(
    'npm',
    [
      'install',
      `${ADAPTER_PACKAGE}@${ADAPTER_VERSION}`,
      '--no-audit',
      '--no-fund',
    ],
    project,
  );

  const installedAdapter = JSON.parse(
    await readFile(
      join(project, 'node_modules/@frillab/copc-adapter/package.json'),
      'utf8',
    ),
  );
  assert.equal(installedAdapter.version, ADAPTER_VERSION);
  const cesiumBuild = join(project, 'node_modules/cesium/Build/Cesium');
  await mkdir(join(project, 'public/cesium'), { recursive: true });
  for (const directory of ['Assets', 'ThirdParty', 'Widgets', 'Workers']) {
    await cp(
      join(cesiumBuild, directory),
      join(project, 'public/cesium', directory),
      { recursive: true },
    );
  }
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(
    join(project, 'index.html'),
    `<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Registry Cesium Consumer</title></head>
<body><main><h1>Registry Cesium Consumer</h1><div id="status">starting</div><div id="details"></div><div id="viewer"></div></main><script type="module" src="/src/main.js"></script></body></html>\n`,
  );
  await writeFile(
    join(project, 'src/main.js'),
    `
import 'cesium/Build/Cesium/Widgets/widgets.css';
const sourceUrl = ${JSON.stringify(remoteUrl)};
const status = document.querySelector('#status');
const details = document.querySelector('#details');
try {
  window.CESIUM_BASE_URL = '/cesium/';
  const [Cesium, adapter, rootAdapter] = await Promise.all([
    import('cesium'),
    import('@frillab/copc-adapter/cesium'),
    import('@frillab/copc-adapter'),
  ]);
  const probe = await rootAdapter.probeCopcSource(sourceUrl);
  if (!probe.reachable || !probe.corsReadable || !probe.rangeSupported || probe.partialStatus !== 206 || !probe.copcDetected) {
    throw new Error('Remote source probe did not confirm browser-readable COPC byte ranges: ' + JSON.stringify(probe));
  }
  const viewer = new Cesium.Viewer(document.querySelector('#viewer'), {
    animation: false, timeline: false, geocoder: false, baseLayerPicker: false, baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(), sceneModePicker: false,
    navigationHelpButton: false, homeButton: false, fullscreenButton: false, infoBox: false,
    selectionIndicator: false,
  });
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#06101d');
  const layer = new adapter.CopcCesiumLayer({
    url: sourceUrl,
    colorMode: 'rgb',
    pointSize: 3,
    streaming: { maxNodes: 8, maxDepth: 8, maxScreenSpaceError: 8, maxRenderDistanceMeters: 20000 },
    debug: true,
  });
  await layer.load();
  layer.attachTo(viewer);
  const deadline = Date.now() + 60000;
  let snapshot = layer.getSnapshot();
  while (snapshot.renderedPointCount === 0 && Date.now() < deadline) {
    viewer.scene.requestRender();
    await new Promise((resolve) => setTimeout(resolve, 200));
    snapshot = layer.getSnapshot();
  }
  if (snapshot.renderedPointCount === 0) throw new Error('Registry-installed adapter rendered no Cesium points.');
  window.__NPM_CONSUMER__ = { viewer, layer, probe, snapshot, sourceUrl };
  details.textContent = JSON.stringify({ sourceUrl, probe, renderedPointCount: snapshot.renderedPointCount });
  status.textContent = 'ready';
  window.setInterval(() => {
    const current = layer.getSnapshot();
    window.__NPM_CONSUMER__.snapshot = current;
    details.textContent = JSON.stringify({ sourceUrl, probe, renderedPointCount: current.renderedPointCount });
  }, 250);
} catch (error) {
  status.textContent = 'error';
  details.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
  throw error;
}
`,
  );

  const viteEntry = join(project, 'node_modules/vite/bin/vite.js');
  await run(process.execPath, [viteEntry, 'build'], project);

  const port = await unusedPort();
  serverProcess = spawn(
    process.execPath,
    [viteEntry, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: project,
      stdio: 'inherit',
    },
  );
  await waitForServer(`http://127.0.0.1:${port}`);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const copcResponses = [];
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (!response.url().includes('.copc.laz')) return;
    const record = {
      url: response.url(),
      status: response.status(),
      range: response.request().headers().range,
      contentRange: response.headers()['content-range'],
    };
    copcResponses.push(record);
  });
  await page.goto(`http://127.0.0.1:${port}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    () => document.querySelector('#status')?.textContent === 'ready',
    undefined,
    { timeout: 90_000 },
  );
  assert.equal(
    await page.locator('.cesium-viewer').count(),
    1,
    'Cesium Viewer should be alive',
  );
  assert.ok(
    await page.evaluate(
      () => window.__NPM_CONSUMER__.snapshot.renderedPointCount > 0,
    ),
    'adapter should render points',
  );
  assert.ok(
    copcResponses.length > 2,
    'browser should make multiple direct remote COPC requests',
  );
  for (const response of copcResponses) {
    const url = new URL(response.url);
    assert.equal(url.hostname, 'data.pointcloud.org');
    assert.notEqual(url.hostname, '127.0.0.1');
    assert.match(response.range ?? '', /^bytes=\d+-\d+$/u);
    assert.equal(response.status, 206);
    const contentRange = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(
      response.contentRange ?? '',
    );
    assert.ok(
      contentRange,
      `valid browser-readable Content-Range expected for ${response.url}`,
    );
  }
  assert.deepEqual(browserErrors, []);
  console.log(
    `PASS: clean registry consumer rendered ${await page.locator('#details').textContent()} using direct HTTP Range requests.`,
  );
  succeeded = true;
} finally {
  await browser?.close();
  if (
    serverProcess &&
    serverProcess.exitCode === null &&
    serverProcess.signalCode === null
  ) {
    serverProcess.kill('SIGTERM');
    await new Promise((resolvePromise) =>
      serverProcess.once('exit', resolvePromise),
    );
  }
  if (succeeded) await rm(project, { recursive: true, force: true });
  else console.log(`Consumer project retained for inspection: ${project}`);
}
