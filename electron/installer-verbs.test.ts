/**
 * Drift guard for `#seam:openable-extensions`.
 *
 * The Explorer verbs are written by an NSIS script (build/installer.nsh) that
 * cannot import TypeScript, so its extension list is a hand-kept copy of
 * `OPENABLE_EXTENSIONS`. The failure it guards against is silent and only
 * visible on an installed build: the convert lane learns to open .heic, nobody
 * touches the .nsh, and right-clicking a .heic offers nothing. Here the two
 * lists are compared directly, so the drift fails in CI instead of in Explorer.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONVERTIBLE_EXTENSIONS, OPENABLE_EXTENSIONS } from '@shared/convert-inputs';

const SCRIPT = readFileSync(join(import.meta.dirname, '../build/installer.nsh'), 'utf8');

/** The extensions one `!macro <name> _VERB` block hands to its verb macro. */
function extensionsIn(macroName: string): string[] {
  const block = new RegExp(`!macro ${macroName} _VERB\\b([\\s\\S]*?)!macroend`).exec(SCRIPT);
  if (block === null) throw new Error(`build/installer.nsh has no "${macroName}" macro.`);
  return [...(block[1] ?? '').matchAll(/!insertmacro \$\{_VERB\} "(\.[a-z0-9]+)"/g)].map(
    (match) => match[1] ?? ''
  );
}

describe('build/installer.nsh', () => {
  it('offers Combine on every file type Legion PDF can open', () => {
    // The PDF entry sits in LegionEachOpenable; the rest come from the
    // convertible macro it chains to, exactly as OPENABLE_EXTENSIONS is built.
    const openable = [
      ...extensionsIn('LegionEachOpenable'),
      ...extensionsIn('LegionEachConvertible'),
    ];
    expect([...openable].sort()).toEqual([...OPENABLE_EXTENSIONS].sort());
  });

  it('offers Convert to PDF on every type that is not already a PDF', () => {
    expect([...extensionsIn('LegionEachConvertible')].sort()).toEqual(
      [...CONVERTIBLE_EXTENSIONS].sort()
    );
  });

  it('lists no extension twice, so no key is written twice', () => {
    const openable = [
      ...extensionsIn('LegionEachOpenable'),
      ...extensionsIn('LegionEachConvertible'),
    ];
    expect(openable).toHaveLength(new Set(openable).size);
  });

  it('launches the app with --combine, and installs an uninstall macro that removes the verbs', () => {
    expect(SCRIPT).toContain('"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" --combine "%1"');
    expect(SCRIPT).toContain('"MultiSelectModel" "Player"');
    expect(SCRIPT).toContain('!macro customInstall');
    expect(SCRIPT).toContain('!macro customUnInstall');
    expect(SCRIPT).toContain(
      'DeleteRegKey HKCU "${LEGION_VERB_ROOT}\\${EXT}\\shell\\${LEGION_COMBINE_VERB}"'
    );
  });

  it('is the script electron-builder is told to include', () => {
    const config = readFileSync(join(import.meta.dirname, '../electron-builder.yml'), 'utf8');
    expect(config).toMatch(/^\s+include: build\/installer\.nsh$/m);
  });
});
