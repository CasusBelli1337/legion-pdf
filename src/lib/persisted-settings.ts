/**
 * Small settings that survive a restart.
 *
 * The rule the owner set: whatever the attorney last chose is what he probably
 * wants next time — a Bates prefix, an exhibit position, a signature height. So
 * a panel reads its opening state from here rather than from a constant, and
 * writes back whenever the attorney changes something.
 *
 * Three rules make that safe:
 *
 * 1. **A stored value is never trusted.** It came off disk, it may be from an
 *    older build or a half-written write, so every read is parsed through a
 *    guard that falls back to the code default field by field. There is no path
 *    where corrupt storage produces a broken form.
 * 2. **Keys are versioned.** Changing the shape of a setting means bumping its
 *    version, which abandons the old key rather than trying to migrate it.
 * 3. **Storage failures are not app failures.** A browser with storage disabled
 *    (or full) still gets a working app; it just starts from the defaults.
 *
 * Nothing confidential goes in here. It is per-machine convenience, readable by
 * anything running in the renderer, so it holds preferences and never document
 * content, file paths, or matter names.
 */

/** The slice of the Web Storage API this needs — injectable for tests. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Shared by every key so the app's settings are greppable in one namespace. */
export const SETTINGS_PREFIX = 'legion-pdf';

/** `legion-pdf:exhibit-stamp:v1` — the name, and the shape's version. */
export function settingKey(name: string, version: number): string {
  return `${SETTINGS_PREFIX}:${name}:v${version}`;
}

export interface PersistedSetting<T> {
  readonly key: string;
  /** The stored value, or the code default when there is nothing usable. */
  read(): T;
  write(value: T): void;
  forget(): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Storage can throw on access alone under some privacy settings.
    return null;
  }
}

function readRaw(storage: StorageLike | null, key: string): unknown {
  if (storage === null) return undefined;
  try {
    const stored = storage.getItem(key);
    return stored === null ? undefined : JSON.parse(stored);
  } catch {
    // Unparseable is the same as absent: this is a first run now.
    return undefined;
  }
}

/**
 * One remembered setting. `parse` turns whatever was stored — including
 * `undefined` and outright garbage — into a valid value, so `read` cannot fail.
 */
export function persistedSetting<T>(
  name: string,
  version: number,
  parse: (raw: unknown) => T,
  storage: StorageLike | null = defaultStorage()
): PersistedSetting<T> {
  const key = settingKey(name, version);
  return {
    key,
    read: () => parse(readRaw(storage, key)),
    write: (value) => {
      try {
        storage?.setItem(key, JSON.stringify(value));
      } catch {
        // A storage that will not take the value still leaves the app usable.
      }
    },
    forget: () => {
      try {
        storage?.removeItem(key);
      } catch {
        // Nothing to do about it, and nothing worth telling the attorney.
      }
    },
  };
}

/** A stored object as loose fields. Anything else read back is "no value". */
export function storedFields(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export interface NumberRange {
  min: number;
  max: number;
}

/**
 * Field readers. Each takes the code default and returns it whenever the stored
 * value is missing, the wrong type, or out of range — which is what keeps a
 * hand-edited or stale settings entry from reaching a form.
 */
export const field = {
  text(fields: Record<string, unknown>, key: string, fallback: string): string {
    const value = fields[key];
    return typeof value === 'string' ? value : fallback;
  },

  number(
    fields: Record<string, unknown>,
    key: string,
    fallback: number,
    range?: NumberRange
  ): number {
    const value = fields[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    if (range === undefined) return value;
    return value < range.min || value > range.max ? fallback : value;
  },

  flag(fields: Record<string, unknown>, key: string, fallback: boolean): boolean {
    const value = fields[key];
    return typeof value === 'boolean' ? value : fallback;
  },

  choice<T extends string>(
    fields: Record<string, unknown>,
    key: string,
    allowed: readonly T[],
    fallback: T
  ): T {
    const value = fields[key];
    return allowed.includes(value as T) ? (value as T) : fallback;
  },
};
