import { resolve } from 'node:path';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  devtools: { enabled: false },
  css: [resolve(process.cwd(), '../../apps/shared/styles.css')],
  // The workspace-level Nuxt typecheck includes sibling apps because this
  // fixture intentionally shares source files. The narrow script owns the
  // explicit app typecheck; Nuxt's build should only run the compiler.
  typescript: { strict: true, typeCheck: false },
  vite: {
    optimizeDeps: { exclude: ['@frillab/copc-adapter'] },
  },
});
