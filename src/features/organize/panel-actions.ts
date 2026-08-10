/**
 * The Organize Pages action list. Config over code: a new page operation is a
 * new entry here, and the toolbar renders whatever it is given.
 */

import {
  Combine,
  Copy,
  Eraser,
  FileInput,
  FileOutput,
  Layers,
  RotateCcw,
  RotateCw,
  Scissors,
  Square,
  Trash2,
} from 'lucide-react';
import type { DocumentSession } from '@shared/types';
import type { PanelAction } from './organize-toolbar';
import {
  deletePages,
  extractPages,
  flattenDocument,
  insertBlankPage,
  insertPagesFromFile,
  rotatePages,
  scrubForProduction,
} from './organize-actions';

export interface ActionContext {
  session: DocumentSession;
  selected: number[];
  busy: boolean;
  run(label: string, work: () => Promise<string>): void;
  openSplit(): void;
  openCombine(): void;
}

/** Where an insert lands: before the first selected page, or at the very end. */
function insertPosition(context: ActionContext): number {
  return context.selected[0] ?? context.session.pageCount + 1;
}

async function chooseFileThen(work: (filePath: string) => Promise<string>): Promise<string> {
  const [filePath] = await window.librarius.file.openDialog();
  if (filePath === undefined) return 'No file was chosen, so nothing changed.';
  return work(filePath);
}

/** Actions that work on the selected pages; all disabled with nothing selected. */
function selectionActions(context: ActionContext): PanelAction[] {
  const { session, selected, busy, run } = context;
  const none = selected.length === 0;
  return [
    {
      id: 'rotate-ccw',
      label: 'Turn left',
      icon: RotateCcw,
      disabled: busy || none,
      run: () => run('Turning pages', () => rotatePages(session.id, selected, 'counter-clockwise')),
    },
    {
      id: 'rotate-cw',
      label: 'Turn right',
      icon: RotateCw,
      disabled: busy || none,
      run: () => run('Turning pages', () => rotatePages(session.id, selected, 'clockwise')),
    },
    {
      id: 'copy-out',
      label: 'Copy to new file',
      icon: Copy,
      disabled: busy || none,
      run: () => run('Copying pages', () => extractPages(session.id, selected, false)),
    },
    {
      id: 'move-out',
      label: 'Move to new file',
      icon: FileOutput,
      disabled: busy || none,
      run: () => run('Moving pages', () => extractPages(session.id, selected, true)),
    },
    {
      id: 'delete',
      label: 'Delete pages',
      icon: Trash2,
      disabled: busy || none,
      danger: true,
      run: () => run('Removing pages', () => deletePages(session.id, selected)),
    },
  ];
}

/** Actions that add pages or build new documents; these never need a selection. */
function assemblyActions(context: ActionContext): PanelAction[] {
  const { session, busy, run } = context;
  return [
    {
      id: 'insert-blank',
      label: 'Insert blank page',
      icon: Square,
      disabled: busy,
      run: () =>
        run('Adding a blank page', () => insertBlankPage(session.id, insertPosition(context))),
    },
    {
      id: 'insert-from',
      label: 'Insert from file...',
      icon: FileInput,
      disabled: busy,
      run: () =>
        run('Inserting pages', () =>
          chooseFileThen((filePath) =>
            insertPagesFromFile(session.id, insertPosition(context), filePath)
          )
        ),
    },
    { id: 'split', label: 'Split...', icon: Scissors, disabled: busy, run: context.openSplit },
    {
      id: 'combine',
      label: 'Combine...',
      icon: Combine,
      disabled: busy,
      run: context.openCombine,
    },
  ];
}

export function pageActions(context: ActionContext): PanelAction[] {
  return [...selectionActions(context), ...assemblyActions(context)];
}

export function productionActions({ session, busy, run }: ActionContext): PanelAction[] {
  return [
    {
      id: 'scrub',
      label: 'Remove hidden data',
      icon: Eraser,
      disabled: busy,
      run: () => run('Removing hidden data', () => scrubForProduction(session.id)),
    },
    {
      id: 'flatten',
      label: 'Flatten markups',
      icon: Layers,
      disabled: busy,
      run: () => run('Flattening annotations', () => flattenDocument(session.id)),
    },
  ];
}
