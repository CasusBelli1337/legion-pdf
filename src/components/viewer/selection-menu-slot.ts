/**
 * The slot a selection menu registers into.
 *
 * The viewer owns WHERE a menu appears and WHEN it goes away; it does not own
 * what is on it. `src/features/select-copy` calls `registerSelectionMenu` with
 * its Copy / Copy-with-cite / Highlight / Redact menu, and the viewer renders
 * whatever is in the slot anchored to the end of the selection — on a mouseup
 * that left something selected, and on a right-click inside a selection. With
 * nothing registered the viewer does nothing at all, which is today's
 * behaviour, so the two lanes can land in either order.
 *
 * Registration is a module-level singleton rather than React state on purpose:
 * the lane registers at import time, long before any component that would hold
 * the state has mounted.
 */

import { useSyncExternalStore } from 'react';
import type { ComponentType } from 'react';

/**
 * What the viewer hands the registered menu. Client (viewport) coordinates of
 * the point the menu hangs off — the end of the selection, or the pointer for a
 * right-click. The menu keeps ITSELF inside the window; the viewer only says
 * where the gesture was.
 */
export interface SelectionMenuSlotProps {
  x: number;
  y: number;
  /** Called by the menu when it is finished; the viewer then unmounts it. */
  onClose?: () => void;
}

export type SelectionMenuComponent = ComponentType<SelectionMenuSlotProps>;

let registered: SelectionMenuComponent | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * Puts a menu in the slot. Returns the function that takes it out again; a
 * second registration replaces the first, so a hot reload cannot stack menus.
 */
export function registerSelectionMenu(component: SelectionMenuComponent | null): () => void {
  registered = component;
  announce();
  return () => {
    if (registered !== component) return;
    registered = null;
    announce();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What is in the slot right now. Outside React — the viewer uses the hook. */
export function getSelectionMenu(): SelectionMenuComponent | null {
  return registered;
}

function snapshot(): SelectionMenuComponent | null {
  return registered;
}

/** The registered menu, or null while the slot is empty. */
export function useRegisteredSelectionMenu(): SelectionMenuComponent | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
