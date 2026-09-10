import { resolve } from 'node:path';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  devtools: { enabled: false },
  css: [resolve(process.cwd(), '../../apps/shared/styles.css')],
  typescript: { strict: true, typeCheck: false },
  vite: {
    optimizeDeps: { exclude: ['@frillab/copc-adapter'] },
  },
});
