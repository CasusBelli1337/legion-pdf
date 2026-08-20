import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { IPC, invokeChannelsOf } from '@shared/ipc';
import type { InvokeResponse } from '@shared/ipc';

/**
 * `ipcMain` is not available in this environment, so what is pinned here is the
 * contract and the wiring: undo/redo/undoState are handled for real (not the
 * loud stubs they shipped as), every file:* channel has a handler, and the
 * answers carry the honest can-undo/can-redo state. The behaviour itself is
 * exercised in electron/services/doc-store-history.test.ts.
 */
const FILE_HANDLERS = resolve(import.meta.dirname, './file.ts');

function source(): string {
  return readFileSync(FILE_HANDLERS, 'utf8');
}

describe('undo/redo handlers', () => {
  // `tag` rides along with the bytes so the renderer can roll its own state
  // back to match them; it is optional because most ops record no tag at all.
  it('answers with the applied flag, the op tag, and the state after the step', () => {
    expectTypeOf<InvokeResponse<'file:undo'>>().toEqualTypeOf<{
      applied: boolean;
      tag?: string;
      canUndo: boolean;
      canRedo: boolean;
    }>();
    expectTypeOf<InvokeResponse<'file:redo'>>().toEqualTypeOf<InvokeResponse<'file:undo'>>();
    expectTypeOf<InvokeResponse<'file:undoState'>>().toEqualTypeOf<{
      canUndo: boolean;
      canRedo: boolean;
    }>();
  });

  it('no longer registers the three history channels as NotImplemented stubs', () => {
    expect(source()).not.toContain('registerNotImplemented');
    expect(source()).not.toContain('not-implemented');
  });

  // The store owns the history; a handler that answered from anywhere else
  // would drift from the bytes it is meant to describe.
  it('answers every history channel straight from the doc store', () => {
    const text = source();
    expect(text).toMatch(/IPC\.file\.undo,[\s\S]{0,160}store\.undo\(docId\)/);
    expect(text).toMatch(/IPC\.file\.redo,[\s\S]{0,160}store\.redo\(docId\)/);
    expect(text).toMatch(/IPC\.file\.undoState,[\s\S]{0,160}store\.undoState\(docId\)/);
  });
});

describe('file handler registration', () => {
  it('registers a handler for every file:* channel the contract declares', () => {
    const text = source();
    const names = invokeChannelsOf('file').map(
      (channel) => Object.entries(IPC.file).find(([, value]) => value === channel)?.[0]
    );

    expect(names).toContain('undo');
    expect(names).toContain('redo');
    expect(names).toContain('undoState');
    for (const name of names) {
      expect(name).toBeDefined();
      expect(text).toContain(`IPC.file.${name}`);
    }
    expect(text.match(/ipcMain\.handle\(/g)).toHaveLength(names.length);
  });
});
