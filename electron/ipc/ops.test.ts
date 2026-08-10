import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IPC, invokeChannelsOf } from '@shared/ipc';

/**
 * Drift guard for `#seam:ops-new-document`. Combine, split, and extract create
 * documents the IPC contract has no id field for, so the main process announces
 * the new document on `ops:progress` and the renderer listens for one exact
 * phrase. Reading both files as text is the point: it fails when either side is
 * edited alone, which no import could catch.
 *
 * Handlers themselves are exercised through core/ops (unit-tested there) and the
 * live app — `ipcMain` is not available in this test environment.
 */
const MAIN_HANDLERS = resolve(import.meta.dirname, './ops.ts');
const RENDERER_WATCHER = resolve(
  import.meta.dirname,
  '../../src/features/organize/new-documents.ts'
);

function sourceOf(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('#seam:ops-new-document', () => {
  it('is marked on both sides of the seam', () => {
    expect(sourceOf(MAIN_HANDLERS)).toContain('#seam:ops-new-document');
    expect(sourceOf(RENDERER_WATCHER)).toContain('#seam:ops-new-document');
  });

  it('declares the same announcement phase on both sides', () => {
    const declaration = "export const NEW_DOCUMENT_PHASE = 'New document ready';";
    expect(sourceOf(MAIN_HANDLERS)).toContain(declaration);
    expect(sourceOf(RENDERER_WATCHER)).toContain(declaration);
  });

  it('declares the same combine progress id on both sides', () => {
    const declaration = "export const COMBINE_PROGRESS_ID = 'combine';";
    expect(sourceOf(MAIN_HANDLERS)).toContain(declaration);
    expect(sourceOf(RENDERER_WATCHER)).toContain(declaration);
  });

  it('points each file at the other, so the pair is greppable from either end', () => {
    expect(sourceOf(MAIN_HANDLERS)).toContain('src/features/organize/new-documents.ts');
    expect(sourceOf(RENDERER_WATCHER)).toContain('electron/ipc/ops.ts');
  });
});

describe('ops handler registration', () => {
  it('registers a handler for every ops:* channel the contract declares', () => {
    const source = sourceOf(MAIN_HANDLERS);
    const names = invokeChannelsOf('ops').map(
      (channel) => Object.entries(IPC.ops).find(([, value]) => value === channel)?.[0]
    );

    expect(names).toHaveLength(12);
    for (const name of names) {
      expect(name).toBeDefined();
      expect(source).toContain(`IPC.ops.${name}`);
    }
    expect(source.match(/ipcMain\.handle\(/g)).toHaveLength(names.length);
  });
});
