import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(root, 'shared'),
      '@core': resolve(root, 'core'),
      '@renderer': resolve(root, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'core/**/*.test.ts',
      'electron/**/*.test.ts',
      'shared/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    exclude: ['node_modules/**', 'out/**', 'release/**'],
  },
});
