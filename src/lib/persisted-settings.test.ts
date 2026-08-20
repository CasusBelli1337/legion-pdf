import { describe, expect, it } from 'vitest';
import {
  field,
  persistedSetting,
  settingKey,
  storedFields,
  type StorageLike,
} from './persisted-settings';

/** A storage that behaves; the failing ones are built per test. */
function fakeStorage(
  seed: Record<string, string> = {}
): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

interface Prefs {
  prefix: string;
  size: number;
  boxed: boolean;
}

const DEFAULTS: Prefs = { prefix: '', size: 14, boxed: false };

function parsePrefs(raw: unknown): Prefs {
  const fields = storedFields(raw);
  return {
    prefix: field.text(fields, 'prefix', DEFAULTS.prefix),
    size: field.number(fields, 'size', DEFAULTS.size, { min: 4, max: 72 }),
    boxed: field.flag(fields, 'boxed', DEFAULTS.boxed),
  };
}

describe('settingKey', () => {
  it('namespaces and versions every key', () => {
    expect(settingKey('exhibit-stamp', 1)).toBe('legion-pdf:exhibit-stamp:v1');
  });

  it('gives a new shape a new key rather than migrating the old one', () => {
    expect(settingKey('exhibit-stamp', 2)).not.toBe(settingKey('exhibit-stamp', 1));
  });
});

describe('persistedSetting', () => {
  it('gives back the code defaults on a first run', () => {
    const setting = persistedSetting('prefs', 1, parsePrefs, fakeStorage());
    expect(setting.read()).toEqual(DEFAULTS);
  });

  it('carries a value across a restart', () => {
    const storage = fakeStorage();
    persistedSetting('prefs', 1, parsePrefs, storage).write({
      prefix: 'ASHFORD',
      size: 65,
      boxed: true,
    });
    // A fresh setting over the same storage is what the next launch sees.
    expect(persistedSetting('prefs', 1, parsePrefs, storage).read()).toEqual({
      prefix: 'ASHFORD',
      size: 65,
      boxed: true,
    });
  });

  it('ignores what an older version of the app left behind', () => {
    const storage = fakeStorage();
    persistedSetting('prefs', 1, parsePrefs, storage).write({
      prefix: 'OLD',
      size: 20,
      boxed: true,
    });
    expect(persistedSetting('prefs', 2, parsePrefs, storage).read()).toEqual(DEFAULTS);
  });

  it('falls back to the defaults on storage that is not even JSON', () => {
    const storage = fakeStorage({ 'legion-pdf:prefs:v1': '{"prefix": "SORD' });
    expect(persistedSetting('prefs', 1, parsePrefs, storage).read()).toEqual(DEFAULTS);
  });

  it('keeps the good fields of a half-corrupt entry and defaults the rest', () => {
    const storage = fakeStorage({
      'legion-pdf:prefs:v1': JSON.stringify({ prefix: 'ASHFORD', size: 'huge', boxed: 'yes' }),
    });
    expect(persistedSetting('prefs', 1, parsePrefs, storage).read()).toEqual({
      prefix: 'ASHFORD',
      size: 14,
      boxed: false,
    });
  });

  it('survives a storage that throws on every call', () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const setting = persistedSetting('prefs', 1, parsePrefs, hostile);
    expect(() => setting.write(DEFAULTS)).not.toThrow();
    expect(() => setting.forget()).not.toThrow();
    expect(setting.read()).toEqual(DEFAULTS);
  });

  it('reads the defaults when there is no storage at all', () => {
    const setting = persistedSetting('prefs', 1, parsePrefs, null);
    expect(() => setting.write(DEFAULTS)).not.toThrow();
    expect(setting.read()).toEqual(DEFAULTS);
  });

  it('forgets a value on request', () => {
    const storage = fakeStorage();
    const setting = persistedSetting('prefs', 1, parsePrefs, storage);
    setting.write({ prefix: 'ASHFORD', size: 65, boxed: true });
    setting.forget();
    expect(setting.read()).toEqual(DEFAULTS);
  });
});

describe('storedFields', () => {
  it('treats anything that is not a plain object as nothing stored', () => {
    expect(storedFields(undefined)).toEqual({});
    expect(storedFields(null)).toEqual({});
    expect(storedFields('ASHFORD')).toEqual({});
    expect(storedFields([1, 2])).toEqual({});
    expect(storedFields({ a: 1 })).toEqual({ a: 1 });
  });
});

describe('field readers', () => {
  const fields = { text: 'A', size: 30, flag: true, junk: {} };

  it('takes a stored value of the right type', () => {
    expect(field.text(fields, 'text', 'Z')).toBe('A');
    expect(field.number(fields, 'size', 14)).toBe(30);
    expect(field.flag(fields, 'flag', false)).toBe(true);
  });

  it('defaults anything of the wrong type, missing, or unreadable', () => {
    expect(field.text(fields, 'size', 'Z')).toBe('Z');
    expect(field.number(fields, 'text', 14)).toBe(14);
    expect(field.flag(fields, 'junk', false)).toBe(false);
    expect(field.text(fields, 'absent', 'Z')).toBe('Z');
  });

  it('defaults a number outside the range it is allowed', () => {
    expect(field.number(fields, 'size', 14, { min: 4, max: 72 })).toBe(30);
    expect(field.number(fields, 'size', 14, { min: 40, max: 72 })).toBe(14);
    expect(field.number({ size: Number.NaN }, 'size', 14)).toBe(14);
    expect(field.number({ size: Number.POSITIVE_INFINITY }, 'size', 14)).toBe(14);
  });

  it('only takes a choice that is actually on the list', () => {
    const corners = ['top-left', 'bottom-right'] as const;
    expect(field.choice({ at: 'bottom-right' }, 'at', corners, 'top-left')).toBe('bottom-right');
    expect(field.choice({ at: 'middle' }, 'at', corners, 'top-left')).toBe('top-left');
    expect(field.choice({}, 'at', corners, 'top-left')).toBe('top-left');
  });
});
