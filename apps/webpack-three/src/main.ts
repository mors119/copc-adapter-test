import { startBundlerThreeSmoke } from '../../../apps/shared/bundlerThreeSmoke';

startBundlerThreeSmoke({
  appId: 'webpack-three',
  host: 'webpack',
  backend: 'rust',
  bundlerLabel: 'Webpack 5',
});
