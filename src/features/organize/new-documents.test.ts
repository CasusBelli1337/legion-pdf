import { describe, expect, it } from 'vitest';
import { COMBINE_PROGRESS_ID, NEW_DOCUMENT_PHASE } from './new-documents';

/**
 * The renderer half of `#seam:ops-new-document`. These two literals are the
 * whole agreement with the main process — nothing in the type system connects
 * them — so they are pinned here, and electron/ipc/ops.test.ts proves the main
 * process still declares exactly the same values.
 */
describe('#seam:ops-new-document (renderer side)', () => {
  it('pins the announcement phase the main process sends', () => {
    expect(NEW_DOCUMENT_PHASE).toBe('New document ready');
  });

  it('pins the synthetic document id used for combine progress', () => {
    expect(COMBINE_PROGRESS_ID).toBe('combine');
  });
});
