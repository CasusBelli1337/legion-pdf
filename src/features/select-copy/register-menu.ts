/**
 * Handing `SelectionMenu` to the viewer's menu slot.
 *
 * Registration happens at IMPORT time, not on mount, because that is what the
 * slot is built for: it is a module-level singleton precisely so a lane can
 * fill it before any component exists. The viewer then owns where the menu
 * appears and when it goes away, and this lane owns what is on it.
 *
 * THE IMPORT IS DELIBERATELY THE LEAF FILE, not `components/viewer`. The
 * viewer's public surface pulls in `PdfViewer`, which mounts the host that
 * renders this menu, while the viewer's classifier loader lazily imports this
 * lane — going through the index would close that loop into a module cycle.
 * The slot itself imports nothing from here, so the leaf import cannot.
 */

import { registerSelectionMenu } from '../../components/viewer/selection-menu-slot';
import { SelectionMenu } from './selection-menu';

let unregister: (() => void) | null = null;

/** Puts the menu in the viewer's slot. Idempotent; safe to call repeatedly. */
export function ensureSelectionMenuRegistered(): boolean {
  unregister ??= registerSelectionMenu(SelectionMenu);
  return true;
}

export function isSelectionMenuRegistered(): boolean {
  return unregister !== null;
}

/** Takes the menu back out — for tests and for a hot reload. */
export function unregisterSelectionMenu(): void {
  unregister?.();
  unregister = null;
}

ensureSelectionMenuRegistered();
