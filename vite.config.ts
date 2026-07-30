import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `base: './'` emits relative asset URLs so the same `dist/` works when served
 * from a domain root, from a GitHub Pages project subpath (`/<repo>/`), or from
 * the local `file://` filesystem — no rebuild or repo-name configuration needed.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    // The Stockfish WASM binary lives in `public/` and is copied verbatim.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
  },
});
