/**
 * The source label an attorney puts in front of a record cite.
 *
 * Copying twenty passages out of one declaration means typing "Rothrock Decl."
 * twenty times, so it is set ONCE per document and the menu emits
 * "(Rothrock Decl. 5:10-15)" from then on. Different documents keep different
 * prefixes, and reopening the same file next week finds the prefix still there.
 *
 * TWO DELIBERATE CHOICES about storage:
 *
 * 1. It is keyed by a HASH of the file path, never the path itself.
 *    `src/lib/persisted-settings.ts` is explicit that nothing in localStorage
 *    may be a file path or a matter name — those leak the client's business to
 *    anything running in the renderer. A hash gives per-document isolation with
 *    nothing readable stored.
 * 2. A document that has never been saved has no stable identity to key on, so
 *    its prefix lives in memory for the session and is not written at all.
 */

import { persistedSetting, storedFields, field } from '../../lib/persisted-settings';
import type { PersistedSetting } from '../../lib/persisted-settings';

/** Bump when the stored shape changes. */
const VERSION = 1;

interface StoredPrefix {
  prefix: string;
}

function parsePrefix(raw: unknown): StoredPrefix {
  return { prefix: field.text(storedFields(raw), 'prefix', '') };
}

/**
 * FNV-1a over the path, base 36. Not a security hash — a short, stable,
 * collision-unlikely name for "this file" that reveals nothing about it.
 */
export function documentKey(filePath: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < filePath.length; index += 1) {
    hash ^= filePath.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Identity of the document a prefix belongs to. A null path is unsaved. */
export interface PrefixTarget {
  docId: string;
  filePath: string | null;
}

const settings = new Map<string, PersistedSetting<StoredPrefix>>();
const sessionOnly = new Map<string, string>();

function settingFor(filePath: string): PersistedSetting<StoredPrefix> {
  const name = `cite-prefix:${documentKey(filePath)}`;
  const existing = settings.get(name);
  if (existing !== undefined) return existing;
  const setting = persistedSetting(name, VERSION, parsePrefix);
  settings.set(name, setting);
  return setting;
}

/** The prefix for this document, or '' when none has been set. */
export function readCitePrefix(target: PrefixTarget): string {
  if (target.filePath === null) return sessionOnly.get(target.docId) ?? '';
  return settingFor(target.filePath).read().prefix;
}

/** Store the prefix. Whitespace is trimmed; an empty prefix is a removal. */
export function writeCitePrefix(target: PrefixTarget, prefix: string): void {
  const trimmed = prefix.trim();
  if (target.filePath === null) {
    if (trimmed === '') sessionOnly.delete(target.docId);
    else sessionOnly.set(target.docId, trimmed);
    return;
  }
  const setting = settingFor(target.filePath);
  if (trimmed === '') setting.forget();
  else setting.write({ prefix: trimmed });
}

/**
 * `(Rothrock Decl. 5:10-15)` from `(5:10-15)`. One space, no invented
 * punctuation — whatever the attorney typed is what goes in the brief.
 */
export function withCitePrefix(formatted: string, prefix: string): string {
  const trimmed = prefix.trim();
  if (trimmed === '' || !formatted.startsWith('(')) return formatted;
  return `(${trimmed} ${formatted.slice(1)}`;
}

/** Test seam: drop every cached setting and session prefix. */
export function resetCitePrefixes(): void {
  settings.clear();
  sessionOnly.clear();
}
