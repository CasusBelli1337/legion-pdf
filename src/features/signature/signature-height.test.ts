import { describe, expect, it } from 'vitest';
import { persistedSetting, type StorageLike } from '@renderer/lib/persisted-settings';
import {
  DEFAULT_SIGNATURE_HEIGHT,
  MAX_SIGNATURE_HEIGHT,
  MIN_SIGNATURE_HEIGHT,
} from './placement-geometry';
import { parseSignatureHeight } from './signature-height';

function fakeStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const setting = (storage: StorageLike) =>
  persistedSetting('signature-height', 1, parseSignatureHeight, storage);

describe('the default signature height', () => {
  // The owner's report: signatures came in "very small" and every placement
  // began with a resize. A shade under an inch is the signature block size.
  it('is around 1.6x the old 42pt', () => {
    expect(DEFAULT_SIGNATURE_HEIGHT / 42).toBeGreaterThan(1.5);
    expect(DEFAULT_SIGNATURE_HEIGHT / 42).toBeLessThan(1.75);
  });
});

describe('remembering the height', () => {
  it('starts at the default with nothing stored', () => {
    expect(setting(fakeStorage()).read()).toBe(DEFAULT_SIGNATURE_HEIGHT);
  });

  it('gives back the last height across a restart, no save asked for', () => {
    const storage = fakeStorage();
    setting(storage).write(96);
    expect(setting(storage).read()).toBe(96);
  });

  it('holds a stored height to the same limits the resize handle has', () => {
    expect(parseSignatureHeight(10_000)).toBe(MAX_SIGNATURE_HEIGHT);
    expect(parseSignatureHeight(1)).toBe(MIN_SIGNATURE_HEIGHT);
  });

  it('falls back to the default on anything that is not a number', () => {
    expect(parseSignatureHeight(undefined)).toBe(DEFAULT_SIGNATURE_HEIGHT);
    expect(parseSignatureHeight('96pt')).toBe(DEFAULT_SIGNATURE_HEIGHT);
    expect(parseSignatureHeight(Number.NaN)).toBe(DEFAULT_SIGNATURE_HEIGHT);
    expect(parseSignatureHeight({ heightPt: 96 })).toBe(DEFAULT_SIGNATURE_HEIGHT);
  });
});
