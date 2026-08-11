/**
 * No edit leaves this app without the attorney being asked about it. Closing
 * the window and quitting both raise the same native three-way choice a dirty
 * tab does, and a cancelled Save As cancels the quit.
 *
 * Both events are guarded, not just `before-quit`: clicking the window's X
 * closes the window FIRST and only then quits, so a `before-quit`-only guard
 * would put the prompt up over an app whose window was already gone. The
 * decision itself is in services/close-guard, which is where it is tested.
 */

import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { resolveQuit } from './services/close-guard';
import type { QuitGuardDeps } from './services/close-guard';
import { askConfirm, saveAsWithDialog, showSaveFailure } from './services/native-dialogs';
import type { DocStore } from './services/doc-store';

function guardDeps(store: DocStore, getWindow: () => BrowserWindow | null): QuitGuardDeps {
  return {
    dirtyDocuments: () =>
      store
        .list()
        .filter((document) => document.dirty)
        .map(({ id, fileName, filePath }) => ({ id, fileName, filePath })),
    ask: (prompt) => askConfirm(getWindow(), prompt),
    save: async (docId) => {
      await store.save(docId);
    },
    saveAs: async (docId) => (await saveAsWithDialog(store, getWindow(), docId)) !== null,
  };
}

export function installUnsavedGuard(store: DocStore, getWindow: () => BrowserWindow | null): void {
  const deps = guardDeps(store, getWindow);
  /** Set once the attorney has answered; keeps the re-issued quit from re-asking. */
  let cleared = false;

  const decide = async (): Promise<boolean> => {
    try {
      cleared = await resolveQuit(deps);
    } catch (error) {
      // A save that failed is a reason to stay open, and to say so out loud.
      cleared = false;
      showSaveFailure(error instanceof Error ? error.message : String(error));
    }
    return cleared;
  };

  app.on('before-quit', (event) => {
    if (cleared) return;
    event.preventDefault();
    void decide().then((allowed) => {
      if (allowed) app.quit();
    });
  });

  app.on('browser-window-created', (_event, window) => {
    window.on('close', (event) => {
      if (cleared) return;
      event.preventDefault();
      void decide().then((allowed) => {
        if (allowed) window.destroy();
      });
    });
  });
}
