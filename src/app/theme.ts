/**
 * Light or dark, and where that choice lives.
 *
 * The theme is applied to <html data-theme> by an inline script in index.html
 * BEFORE React loads, so the app never paints one theme and then flips to the
 * other. Everything here reads that attribute rather than deciding again —
 * one source of truth for what is currently on screen.
 *
 * Light is the default on purpose: the app goes out to attorneys, and a white
 * document workbench is what they expect from a PDF editor.
 */

export type Theme = 'light' | 'dark';

/** localStorage key. Also hard-coded in the index.html boot script — keep both. */
export const THEME_STORAGE_KEY = 'legion-pdf-theme';

export const DEFAULT_THEME: Theme = 'light';

/** A stored value we do not recognise is not a theme — it is a first run. */
export function resolveTheme(stored: string | null | undefined): Theme {
  return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
}

/** The theme the toggle would switch to. */
export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/** Plain English for the toggle's tooltip and screen-reader label. */
export function switchThemeLabel(target: Theme): string {
  return target === 'dark' ? 'Switch to the dark theme' : 'Switch to the light theme';
}

/** What the boot script already put on <html>. */
export function currentTheme(): Theme {
  return resolveTheme(document.documentElement.dataset['theme']);
}

/** Repaints the app and remembers the choice for next launch. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A storage that will not take the value still leaves the app usable —
    // the theme simply reverts to the default next launch.
  }
}
