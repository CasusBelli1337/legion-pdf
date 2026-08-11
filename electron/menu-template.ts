/**
 * The application menu, as data. Every item that touches a document forwards a
 * plain MenuAction to the renderer on `app:menu` — the menu holds no logic.
 *
 * Split out from menu.ts, which does the Electron half, for one reason: the
 * menu BAR is hidden (electron/main.ts) and this template is now the ONLY thing
 * registering the keyboard shortcuts. Nothing on screen would show an
 * accelerator going missing, so the template is a pure function with a test
 * over it (menu-template.test.ts) rather than something an eye has to catch.
 */

import type { MenuItemConstructorOptions } from 'electron';
import { PRODUCT_NAME } from '@shared/product';
import type { MenuAction } from '@shared/types';

export type SendAction = (action: MenuAction) => void;

function item(label: string, accelerator: string, action: MenuAction, send: SendAction) {
  return { label, accelerator, click: () => send(action) } satisfies MenuItemConstructorOptions;
}

function fileMenu(send: SendAction): MenuItemConstructorOptions {
  return {
    label: '&File',
    submenu: [
      item('Open...', 'CmdOrCtrl+O', 'open', send),
      { type: 'separator' },
      item('Save', 'CmdOrCtrl+S', 'save', send),
      item('Save As...', 'CmdOrCtrl+Shift+S', 'saveAs', send),
      { type: 'separator' },
      item('Print...', 'CmdOrCtrl+P', 'print', send),
      { type: 'separator' },
      { role: 'quit', label: `Quit ${PRODUCT_NAME}` },
    ],
  };
}

/**
 * Undo/Redo here are the DOCUMENT's history, not the text-field roles they
 * replace: Ctrl+Z has to step the PDF back, which is what the attorney means by
 * "undo" in a PDF editor. Typing inside a text box still gets native undo — the
 * renderer hands the keystroke back to the focused field before it touches the
 * document (see src/app/undo-actions.ts).
 */
function editMenu(send: SendAction): MenuItemConstructorOptions {
  return {
    label: '&Edit',
    submenu: [
      item('Undo', 'CmdOrCtrl+Z', 'undo', send),
      item('Redo', 'CmdOrCtrl+Y', 'redo', send),
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  };
}

function viewMenu(send: SendAction, isDevelopment: boolean): MenuItemConstructorOptions {
  const developerItems: MenuItemConstructorOptions[] = isDevelopment
    ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]
    : [];
  return {
    label: '&View',
    submenu: [
      item('Zoom In', 'CmdOrCtrl+Plus', 'zoomIn', send),
      item('Zoom Out', 'CmdOrCtrl+-', 'zoomOut', send),
      item('Actual Size', 'CmdOrCtrl+0', 'zoomReset', send),
      { type: 'separator' },
      { role: 'togglefullscreen' },
      ...developerItems,
    ],
  };
}

function helpMenu(send: SendAction, version: string): MenuItemConstructorOptions {
  return {
    label: '&Help',
    submenu: [
      { label: `Version ${version}`, enabled: false },
      { label: `About ${PRODUCT_NAME}`, click: () => send('about') },
    ],
  };
}

/** The whole menu bar, top level down. Pure — `version` is injected by menu.ts. */
export function appMenuTemplate(
  send: SendAction,
  isDevelopment: boolean,
  version: string
): MenuItemConstructorOptions[] {
  return [fileMenu(send), editMenu(send), viewMenu(send, isDevelopment), helpMenu(send, version)];
}
