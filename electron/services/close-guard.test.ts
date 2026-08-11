import { describe, expect, it, vi } from 'vitest';
import { choiceOf, closePrompt, quitPrompt, resolveQuit } from './close-guard';
import type { QuitGuardDeps, UnsavedDocument } from './close-guard';

/**
 * F-4. Live QA closed a dirty tab and the edit was gone with no dialog, no
 * toast, and no undo. Every branch below is a branch that decides whether an
 * attorney's work survives, so all of them are pinned here rather than
 * eyeballed in the app.
 */

const SAVED: UnsavedDocument = { id: 'doc-1', fileName: 'Deposition.pdf', filePath: 'C:\\D.pdf' };
const NEVER_SAVED: UnsavedDocument = { id: 'doc-2', fileName: 'Combined.pdf', filePath: null };

interface Harness {
  deps: QuitGuardDeps;
  ask: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  saveAs: ReturnType<typeof vi.fn>;
}

function harness(dirty: UnsavedDocument[], button: number, saveAsOk = true): Harness {
  const ask = vi.fn(async () => button);
  const save = vi.fn(async () => undefined);
  const saveAs = vi.fn(async () => saveAsOk);
  return { ask, save, saveAs, deps: { dirtyDocuments: () => dirty, ask, save, saveAs } };
}

describe('the button the attorney pressed', () => {
  it('reads the three buttons in the order the prompt lists them', () => {
    expect(choiceOf(0)).toBe('save');
    expect(choiceOf(1)).toBe('discard');
    expect(choiceOf(2)).toBe('cancel');
  });

  // A dialog dismissed with Escape or closed by the window manager can answer
  // with an index that is not a button. That must never mean "discard".
  it('treats any other answer as a cancel', () => {
    expect(choiceOf(-1)).toBe('cancel');
    expect(choiceOf(7)).toBe('cancel');
  });
});

describe('the words on the close prompt', () => {
  const prompt = closePrompt('Smith Deposition.pdf');

  it('names the document being closed', () => {
    expect(prompt.message).toBe('Save your changes to Smith Deposition.pdf?');
  });

  it('offers exactly three choices, saving first and cancelling last', () => {
    expect(prompt.buttons).toEqual(['Save and close', 'Close without saving', 'Cancel']);
    expect(prompt.defaultId).toBe(0);
    expect(prompt.cancelId).toBe(2);
  });

  it('says in plain English what is lost, with no jargon', () => {
    expect(prompt.detail).toBe(
      'If you close without saving, the work you have done on this document is gone for good.'
    );
  });
});

describe('the words on the quit prompt', () => {
  it('names the one document when only one is unsaved', () => {
    const prompt = quitPrompt(['Exhibit A.pdf']);
    expect(prompt.message).toBe('Save your changes to Exhibit A.pdf?');
    expect(prompt.buttons).toEqual(['Save and quit', 'Quit without saving', 'Cancel']);
  });

  it('summarises and then lists them when several are unsaved', () => {
    const prompt = quitPrompt(['A.pdf', 'B.pdf', 'C.pdf']);
    expect(prompt.message).toBe('3 documents have unsaved changes.');
    expect(prompt.detail).toContain('A.pdf\nB.pdf\nC.pdf');
    expect(prompt.buttons).toEqual(['Save all and quit', 'Quit without saving', 'Cancel']);
  });
});

describe('quitting with unsaved work', () => {
  it('quits without asking when nothing is dirty', async () => {
    const { deps, ask } = harness([], 0);
    expect(await resolveQuit(deps)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('stays open and saves nothing when the attorney cancels', async () => {
    const { deps, save, saveAs } = harness([SAVED], 2);
    expect(await resolveQuit(deps)).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(saveAs).not.toHaveBeenCalled();
  });

  it('quits and saves nothing when the attorney chooses to discard', async () => {
    const { deps, save } = harness([SAVED], 1);
    expect(await resolveQuit(deps)).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('saves every dirty document before quitting', async () => {
    const other = { id: 'doc-3', fileName: 'B.pdf', filePath: 'C:\\B.pdf' };
    const { deps, save } = harness([SAVED, other], 0);
    expect(await resolveQuit(deps)).toBe(true);
    expect(save.mock.calls.map((call) => call[0])).toEqual(['doc-1', 'doc-3']);
  });

  it('asks where to put a document that has never been saved', async () => {
    const { deps, save, saveAs } = harness([NEVER_SAVED], 0);
    expect(await resolveQuit(deps)).toBe(true);
    expect(saveAs).toHaveBeenCalledWith('doc-2');
    expect(save).not.toHaveBeenCalled();
  });

  // The whole point: backing out of the location dialog must back out of the
  // quit too, or the document is closed with the work still not on disk.
  it('cancels the quit when the Save As dialog is cancelled', async () => {
    const { deps } = harness([NEVER_SAVED, SAVED], 0, false);
    expect(await resolveQuit(deps)).toBe(false);
  });

  it('leaves the documents behind a cancelled Save As alone, never half-saved', async () => {
    const { deps, save } = harness([NEVER_SAVED, SAVED], 0, false);
    await resolveQuit(deps);
    expect(save).not.toHaveBeenCalled();
  });
});
