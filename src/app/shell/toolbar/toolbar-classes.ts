/**
 * The one chrome row's button styling. Shared by the shell's file actions and
 * the viewer's own controls so the merged toolbar reads as a single bar rather
 * than two sets of buttons that happen to sit next to each other.
 */

export const TOOLBAR_BUTTON =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted ' +
  'transition-colors duration-150 hover:bg-armory-interactive hover:text-text-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

export const TOOLBAR_PRESET =
  'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors ' +
  'duration-150 hover:bg-armory-interactive hover:text-text-primary';

/** The hairline between groups of controls. */
export const TOOLBAR_DIVIDER = 'mx-1 h-4 w-px shrink-0 bg-armory-border';

/**
 * The row itself. Identical whether a document is open or not, so the chrome
 * does not jump when the first PDF arrives. It scrolls rather than wrapping at
 * narrow widths — a second row would put the double bar straight back.
 */
export const TOOLBAR_ROW =
  'no-scrollbar flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b ' +
  'border-armory-border bg-armory-surface px-3';

/**
 * The right-hand group. Sticky, not merely `ml-auto`: at the 1100px minimum
 * window with a tool panel and the rail open the row runs out of width, and a
 * find button or theme toggle scrolled off the edge is a button the attorney
 * cannot reach. The page controls slide under this group instead.
 */
export const TOOLBAR_TRAILING =
  'sticky right-0 ml-auto flex shrink-0 items-center gap-2 bg-armory-surface pl-2';
