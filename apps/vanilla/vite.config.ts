import { defineConfig } from 'vite';
import { viteFixtureServer } from '@copc-test/fixture-server/vite';
import { vitePackageDefines } from '../../tools/adapter-source/index.mjs';

export default defineConfig({
  envDir: '../../',
  plugins: [viteFixtureServer()],
  define: vitePackageDefines(),
  optimizeDeps: { exclude: ['@frillab/copc-adapter'] },
});
