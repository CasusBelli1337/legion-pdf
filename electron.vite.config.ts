import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = import.meta.dirname;

const alias = {
  '@shared': resolve(root, 'shared'),
  '@core': resolve(root, 'core'),
  '@renderer': resolve(root, 'src'),
};

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(root, 'out/main'),
      lib: { entry: resolve(root, 'electron/main.ts') },
      rollupOptions: { output: { entryFileNames: 'index.js' } },
    },
  },
  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(root, 'out/preload'),
      lib: { entry: resolve(root, 'electron/preload.ts') },
      // CJS preload keeps the renderer sandbox on; an ESM (.mjs) preload would
      // force `sandbox: false`, which we are not willing to trade away.
      rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } },
    },
  },
  renderer: {
    root: resolve(root, 'src'),
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolve(root, 'out/renderer'),
      rollupOptions: { input: resolve(root, 'src/index.html') },
    },
  },
});
