/**
 * Menu action → shell behaviour. A lookup table, not an if-chain: adding a
 * menu item means adding a MenuAction and one entry here.
 */

import type { MenuAction } from '@shared/types';
import { openDialog, printActive, saveActive, saveActiveAs, showVersion } from './document-actions';
import { redoActive, undoActive } from './undo-actions';
import { useAppStore } from './store';

export const MENU_ACTIONS: Record<MenuAction, () => void> = {
  open: () => void openDialog(),
  save: () => void saveActive(),
  saveAs: () => void saveActiveAs(),
  print: () => void printActive(),
  undo: () => void undoActive(),
  redo: () => void redoActive(),
  zoomIn: () => useAppStore.getState().nudgeZoom(1),
  zoomOut: () => useAppStore.getState().nudgeZoom(-1),
  zoomReset: () => useAppStore.getState().setZoom(1),
  about: () => void showVersion(),
};

export function runMenuAction(action: MenuAction): void {
  MENU_ACTIONS[action]();
}
