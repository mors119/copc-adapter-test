import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteFixtureServer } from '../shared/viteFixtureServer.ts';

export default defineConfig({
  publicDir: false,
  plugins: [svelte(), viteFixtureServer()],
  optimizeDeps: { exclude: ['@frillab/copc-adapter'] },
});
