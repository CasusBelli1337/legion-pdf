import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '@shared/types';
import { appMenuTemplate } from './menu-template';

type Item = MenuItemConstructorOptions;

function build(isDevelopment = false) {
  const send = vi.fn<(action: MenuAction) => void>();
  return { send, template: appMenuTemplate(send, isDevelopment, '9.9.9') };
}

function items(template: Item[]): Item[] {
  return template.flatMap((menu) => (Array.isArray(menu.submenu) ? menu.submenu : []));
}

function withAccelerator(template: Item[], accelerator: string): Item | undefined {
  return items(template).find((entry) => entry.accelerator === accelerator);
}

/**
 * The menu bar is hidden, so these accelerators are the ONLY key path to these
 * commands and nothing on screen would show one going missing. Each row is a
 * shortcut an attorney's hands already know.
 */
describe('the keyboard shortcuts the hidden menu registers', () => {
  const expected: ReadonlyArray<readonly [string, MenuAction]> = [
    ['CmdOrCtrl+O', 'open'],
    ['CmdOrCtrl+S', 'save'],
    ['CmdOrCtrl+Shift+S', 'saveAs'],
    ['CmdOrCtrl+P', 'print'],
    ['CmdOrCtrl+Z', 'undo'],
    ['CmdOrCtrl+Y', 'redo'],
    ['CmdOrCtrl+Plus', 'zoomIn'],
    ['CmdOrCtrl+-', 'zoomOut'],
    ['CmdOrCtrl+0', 'zoomReset'],
  ];

  it.each(expected)('%s sends "%s"', (accelerator, action) => {
    const { send, template } = build();
    const entry = withAccelerator(template, accelerator);
    expect(entry, `no menu item is bound to ${accelerator}`).toBeDefined();
    entry?.click?.(undefined as never, undefined as never, undefined as never);
    expect(send).toHaveBeenCalledWith(action);
  });

  it('binds each accelerator exactly once, so two items cannot fight over a key', () => {
    const { template } = build(true);
    const accelerators = items(template)
      .map((entry) => entry.accelerator)
      .filter((value): value is string => value !== undefined);
    expect(new Set(accelerators).size).toBe(accelerators.length);
  });
});

describe('the rest of the menu', () => {
  it('names the product on Quit and About', () => {
    const { template } = build();
    const labels = items(template).map((entry) => entry.label);
    expect(labels).toContain('Quit Legion PDF');
    expect(labels).toContain('About Legion PDF');
  });

  it('shows the version it was handed, and does not let it be clicked', () => {
    const { template } = build();
    const version = items(template).find((entry) => entry.label === 'Version 9.9.9');
    expect(version?.enabled).toBe(false);
  });

  it('keeps the developer items out of a packaged build', () => {
    const roles = (isDevelopment: boolean) =>
      items(build(isDevelopment).template).map((entry) => entry.role);
    expect(roles(true)).toContain('toggleDevTools');
    expect(roles(false)).not.toContain('toggleDevTools');
  });
});
