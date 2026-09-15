import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { IPC, invokeChannelsOf } from '@shared/ipc';
import type { InvokeResponse } from '@shared/ipc';
import type { TextEditBlock } from '@shared/types';

/**
 * The handlers are thin wrappers over core/edit (unit-tested there) and are
 * exercised in the live app — `ipcMain` is not available here. What is checked
 * is the contract: every edit:* channel has a handler, a dry run never writes
 * to the store, and a real edit is tagged so undo can say what it stepped over.
 */
const MAIN_HANDLERS = resolve(import.meta.dirname, './edit.ts');

function sourceOf(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('edit handler registration', () => {
  it('registers a handler for every edit:* channel the contract declares', () => {
    const source = sourceOf(MAIN_HANDLERS);
    const names = invokeChannelsOf('edit').map(
      (channel) => Object.entries(IPC.edit).find(([, value]) => value === channel)?.[0]
    );
    expect(names).toHaveLength(2);
    for (const name of names) {
      expect(name).toBeDefined();
      expect(source).toContain(`IPC.edit.${name}`);
    }
    expect(source.match(/ipcMain\.handle\(/g)).toHaveLength(names.length);
  });

  it('keeps a dry run out of the store and tags a real edit for undo', () => {
    const source = sourceOf(MAIN_HANDLERS);
    expect(source).toContain(
      'if (options.dryRun !== true) await store.setBytes(docId, result.bytes, TEXT_EDIT_TAG)'
    );
    expect(source).toContain("export const TEXT_EDIT_TAG = 'text-edit'");
  });

  it('answers the shapes the renderer builds its editor from', () => {
    expectTypeOf<InvokeResponse<'edit:inspect'>>().toEqualTypeOf<TextEditBlock | null>();
    expectTypeOf<InvokeResponse<'edit:replaceText'>['detail']['fontMode']>().toEqualTypeOf<
      'document-font' | 'built-in-font'
    >();
  });
});
