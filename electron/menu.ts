/**
 * Installs the application menu.
 *
 * The menu BAR is hidden (electron/main.ts): its commands live on the app's own
 * toolbar, and two rows of the same buttons is the double chrome we removed.
 * The menu itself stays installed precisely because it is what registers the
 * accelerators — Ctrl+O/S/Shift+S/P/Z/Y and the zoom keys all fire from here
 * with nothing on screen. Deleting the menu would silently delete them.
 */

import { Menu, app } from 'electron';
import { appMenuTemplate } from './menu-template';
import type { SendAction } from './menu-template';

export function installAppMenu(send: SendAction, isDevelopment: boolean): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(appMenuTemplate(send, isDevelopment, app.getVersion()))
  );
}
