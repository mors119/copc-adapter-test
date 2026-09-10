import { startBundlerThreeSmoke } from '../../../apps/shared/bundlerThreeSmoke';

startBundlerThreeSmoke({
  appId: 'esbuild-three',
  host: 'esbuild',
  backend: 'rust',
  bundlerLabel: 'esbuild',
});
