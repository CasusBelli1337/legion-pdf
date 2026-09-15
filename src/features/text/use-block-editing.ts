/**
 * The state behind "Edit text": which paragraph is open, what has been typed
 * into it, and what the engine says the edit will do. A dry run follows the
 * typing (debounced) so the note under the box says "this will be set in
 * Times" BEFORE the attorney commits, never after.
 *
 * Committing goes through the shared document-op runner, so the page re-reads
 * the new bytes, the footer gets the receipt, and Undo covers the edit like
 * any other change.
 */

import { useCallback, useEffect, useState } from 'react';
import type { DocumentSession, PdfPoint, TextEditBlock } from '@shared/types';
import { describeError, type StampRunner } from '@renderer/features/stamps/use-stamp-runner';
import { NOTHING_TO_EDIT, editReceipt, openingNote, planNote, type EditNote } from './edit-notes';

/** How long after the last keystroke the plan is refreshed. */
const DRY_RUN_DELAY_MS = 300;

export type BlockPhase = 'idle' | 'opening' | 'typing' | 'saving';

export interface BlockEditing {
  block: TextEditBlock | null;
  phase: BlockPhase;
  text: string;
  note: EditNote | null;
  open(page: number, at: PdfPoint): Promise<void>;
  setText(text: string): void;
  commit(): Promise<void>;
  cancel(): void;
}

interface Open {
  block: TextEditBlock;
  text: string;
}

function useDryRun(docId: string, open: Open | null, setNote: (note: EditNote) => void): void {
  useEffect(() => {
    if (open === null || open.text === open.block.text) return;
    const { block, text } = open;
    const timer = setTimeout(() => {
      void window.librarius.edit
        .replaceText(docId, { page: block.page, block, text, dryRun: true })
        .then((result) => setNote(planNote(block, result.detail)))
        .catch((error: unknown) => setNote({ kind: 'error', text: describeError(error) }));
    }, DRY_RUN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [docId, open, setNote]);
}

type Opened = { block: TextEditBlock; note: EditNote } | { block: null; note: EditNote };

/** Asks the engine what paragraph sits under the click. Never throws. */
async function inspectAt(docId: string, page: number, at: PdfPoint): Promise<Opened> {
  try {
    const block = await window.librarius.edit.inspect(docId, { page, at });
    if (block === null) return { block: null, note: { kind: 'warn', text: NOTHING_TO_EDIT } };
    return { block, note: openingNote(block) };
  } catch (error) {
    return { block: null, note: { kind: 'error', text: describeError(error) } };
  }
}

/** Writes the edit through the runner; resolves true when it landed. */
async function commitThrough(runner: StampRunner, docId: string, open: Open): Promise<boolean> {
  let landed = false;
  await runner.run('Replacing the text', async () => {
    const { block, text } = open;
    const result = await window.librarius.edit.replaceText(docId, {
      page: block.page,
      block,
      text,
    });
    landed = true;
    return editReceipt(block, result.detail);
  });
  return landed;
}

export function useBlockEditing(session: DocumentSession, runner: StampRunner): BlockEditing {
  const [open, setOpen] = useState<Open | null>(null);
  const [phase, setPhase] = useState<BlockPhase>('idle');
  const [note, setNote] = useState<EditNote | null>(null);
  const docId = session.id;

  useDryRun(docId, open, setNote);

  const cancel = useCallback((): void => {
    setOpen(null);
    setPhase('idle');
    setNote(null);
  }, []);

  const openAt = useCallback(
    async (page: number, at: PdfPoint): Promise<void> => {
      setPhase('opening');
      const opened = await inspectAt(docId, page, at);
      setNote(opened.note);
      setOpen(opened.block === null ? null : { block: opened.block, text: opened.block.text });
      setPhase(opened.block === null ? 'idle' : 'typing');
    },
    [docId]
  );

  const commit = useCallback(async (): Promise<void> => {
    if (open === null || phase === 'saving') return;
    if (open.text === open.block.text) return cancel();
    setPhase('saving');
    if (await commitThrough(runner, docId, open)) cancel();
    else setPhase('typing');
  }, [cancel, docId, open, phase, runner]);

  return {
    block: open?.block ?? null,
    phase,
    text: open?.text ?? '',
    note,
    open: openAt,
    setText: (text) => setOpen((current) => (current === null ? null : { ...current, text })),
    commit,
    cancel,
  };
}
