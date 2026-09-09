import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteFixtureServer } from '../shared/viteFixtureServer.ts';

export default defineConfig({
  publicDir: false,
  plugins: [viteFixtureServer()],
  optimizeDeps: {
    exclude: ['@frillab/copc-adapter'],
  },
});
