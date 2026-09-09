import { defineConfig } from 'vite';
import { viteFixtureServer } from '../shared/viteFixtureServer.ts';

export default defineConfig({
  envDir: '../../',
  publicDir: false,
  plugins: [viteFixtureServer()],
  optimizeDeps: {
    exclude: ['@frillab/copc-adapter', '@frillab/copc-adapter-local'],
  },
});
