import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { IPC, invokeChannelsOf } from '@shared/ipc';
import type { InvokeResponse } from '@shared/ipc';
import type { EsignReceipt } from '@shared/types';

/**
 * `ipcMain` is not available in this test environment, so — as with ops — the
 * handlers themselves are exercised through the services and core (unit-tested
 * there) and the live app. What is checked here is the contract: every
 * declared esign:* channel has exactly one handler, and the secrets stay out
 * of the renderer-facing shapes.
 */
const MAIN_HANDLERS = resolve(import.meta.dirname, './esign.ts');

function sourceOf(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('esign handler registration', () => {
  it('registers a handler for every esign:* channel the contract declares', () => {
    const source = sourceOf(MAIN_HANDLERS);
    const names = invokeChannelsOf('esign').map(
      (channel) => Object.entries(IPC.esign).find(([, value]) => value === channel)?.[0]
    );

    expect(names).toHaveLength(10);
    for (const name of names) {
      expect(name).toBeDefined();
      expect(source).toContain(`IPC.esign.${name}`);
    }
    expect(source.match(/ipcMain\.handle\(/g)).toHaveLength(names.length);
  });

  it('carries the ipc-contract seam marker like every handler file', () => {
    expect(sourceOf(MAIN_HANDLERS)).toContain('#seam:ipc-contract');
  });
});

describe('esign renderer-facing shapes', () => {
  // Drift guards: the renderer only ever learns `configured` plus the
  // non-secret half of each credential pair. The moment a key or password
  // field appears in a status response, these stop compiling.
  it('exposes no secret in the service and mail status responses', () => {
    expectTypeOf<InvokeResponse<'esign:serviceStatus'>>().toEqualTypeOf<{
      configured: boolean;
      baseUrl: string;
    }>();
    expectTypeOf<InvokeResponse<'esign:mailStatus'>>().toEqualTypeOf<{
      configured: boolean;
      address: string;
    }>();
  });

  it('resolves createRequest with the receipt, links included', () => {
    expectTypeOf<InvokeResponse<'esign:createRequest'>>().toEqualTypeOf<EsignReceipt>();
  });
});
