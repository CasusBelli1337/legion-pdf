/**
 * Application menu. Every item that touches a document forwards a plain
 * MenuAction to the renderer on `app:menu` — the menu holds no logic of its own.
 */

import { Menu, app } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '@shared/types';

type SendAction = (action: MenuAction) => void;

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
      { role: 'quit', label: 'Quit Librarius' },
    ],
  };
}

function editMenu(): MenuItemConstructorOptions {
  return {
    label: '&Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
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

function helpMenu(send: SendAction): MenuItemConstructorOptions {
  return {
    label: '&Help',
    submenu: [
      { label: `Version ${app.getVersion()}`, enabled: false },
      { label: 'About Librarius', click: () => send('about') },
    ],
  };
}

/** Builds and installs the application menu. */
export function installAppMenu(send: SendAction, isDevelopment: boolean): void {
  const template: MenuItemConstructorOptions[] = [
    fileMenu(send),
    editMenu(),
    viewMenu(send, isDevelopment),
    helpMenu(send),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
