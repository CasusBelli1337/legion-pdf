import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { IPC, invokeChannelsOf } from '@shared/ipc';
import type { InvokeResponse } from '@shared/ipc';

/**
 * Handlers themselves are exercised through core/ops (unit-tested there) and the
 * live app — `ipcMain` is not available in this test environment, so what is
 * checked here is the contract: every op that creates a document reports the
 * store ids, and every declared ops:* channel has a handler.
 */
const MAIN_HANDLERS = resolve(import.meta.dirname, './ops.ts');

function sourceOf(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('ops that create documents', () => {
  // Drift guard: combine, split, and extract build WHOLE NEW documents, and the
  // renderer opens them by id. These assertions stop compiling the moment one of
  // those details loses its id, which is what the old announcement seam guarded
  // by matching strings in two files.
  it('reports the adopted store ids in the op detail', () => {
    expectTypeOf<InvokeResponse<'ops:merge'>['detail']['docId']>().toEqualTypeOf<string>();
    expectTypeOf<InvokeResponse<'ops:split'>['detail']['partDocIds']>().toEqualTypeOf<string[]>();
    expectTypeOf<InvokeResponse<'ops:extract'>['detail']['docId']>().toEqualTypeOf<string>();
  });

  // The compiler cannot prove the ids came from the store rather than thin air.
  it('adopts a document into the store at each of the three creation sites', () => {
    expect(sourceOf(MAIN_HANDLERS).match(/adopt\(context,/g)).toHaveLength(3);
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
