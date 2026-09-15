/**
 * The Word-export fidelity suite: `npm run test:word`. Kept out of `npm test`
 * because every case renders a .docx in REAL Word on the Windows host (a few
 * seconds each, and it needs the interactive session) — the suite skips itself
 * cleanly when Word is not reachable, but the default gate should not pay for
 * it on every commit.
 */
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
    include: ['qa/word-export/**/*.test.ts'],
    exclude: ['node_modules/**', 'out/**', 'release/**'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
