import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteFixtureServer } from '../shared/viteFixtureServer.ts';

export default defineConfig({
  publicDir: false,
  plugins: [vue(), viteFixtureServer()],
  optimizeDeps: { exclude: ['@frillab/copc-adapter'] },
});
