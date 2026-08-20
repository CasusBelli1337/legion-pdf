import { describe, expect, it } from 'vitest';
import {
  DOCK_SIZE,
  RAIL_SIZE,
  clampWidth,
  readWidth,
  widthFromDrag,
  writeWidth,
} from './panel-size';

function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as unknown as Storage;
}

/** Storage that refuses everything, as a full or locked-down profile does. */
function hostileStorage(): Storage {
  return {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  } as unknown as Storage;
}

describe('clampWidth', () => {
  it('holds the rail between 140 and 420', () => {
    expect(clampWidth(RAIL_SIZE, 10)).toBe(140);
    expect(clampWidth(RAIL_SIZE, 9000)).toBe(420);
    expect(clampWidth(RAIL_SIZE, 240)).toBe(240);
  });

  it('holds the tool panel between 260 and 560', () => {
    expect(clampWidth(DOCK_SIZE, 0)).toBe(260);
    expect(clampWidth(DOCK_SIZE, 700)).toBe(560);
  });

  it('rounds to whole pixels', () => {
    expect(clampWidth(RAIL_SIZE, 240.6)).toBe(241);
  });

  it('falls back to the default rather than passing NaN into a style', () => {
    expect(clampWidth(RAIL_SIZE, Number.NaN)).toBe(RAIL_SIZE.preferred);
    expect(clampWidth(DOCK_SIZE, Number.POSITIVE_INFINITY)).toBe(DOCK_SIZE.preferred);
  });
});

describe('readWidth', () => {
  it('is the default before anything has been dragged', () => {
    expect(readWidth(RAIL_SIZE, fakeStorage())).toBe(RAIL_SIZE.preferred);
  });

  it('returns the saved width, so the panel is right in the first frame', () => {
    expect(readWidth(RAIL_SIZE, fakeStorage({ [RAIL_SIZE.storageKey]: '300' }))).toBe(300);
  });

  it('clamps a saved width that is now out of range', () => {
    expect(readWidth(DOCK_SIZE, fakeStorage({ [DOCK_SIZE.storageKey]: '5000' }))).toBe(560);
  });

  it('ignores rubbish rather than laying the shell out at NaN pixels', () => {
    expect(readWidth(RAIL_SIZE, fakeStorage({ [RAIL_SIZE.storageKey]: 'wide' }))).toBe(
      RAIL_SIZE.preferred
    );
  });

  it('survives storage being unavailable', () => {
    expect(readWidth(RAIL_SIZE, null)).toBe(RAIL_SIZE.preferred);
    expect(readWidth(RAIL_SIZE, hostileStorage())).toBe(RAIL_SIZE.preferred);
  });

  it('keeps the rail and the dock in separate keys', () => {
    expect(RAIL_SIZE.storageKey).not.toBe(DOCK_SIZE.storageKey);
  });
});

describe('writeWidth', () => {
  it('round-trips through storage, clamped', () => {
    const storage = fakeStorage();
    writeWidth(RAIL_SIZE, storage, 9000);
    expect(readWidth(RAIL_SIZE, storage)).toBe(420);
  });

  it('never throws when storage refuses the write', () => {
    expect(() => writeWidth(RAIL_SIZE, hostileStorage(), 200)).not.toThrow();
    expect(() => writeWidth(RAIL_SIZE, null, 200)).not.toThrow();
  });
});

describe('widthFromDrag', () => {
  it('widens the RIGHT rail as the pointer moves left', () => {
    expect(widthFromDrag(RAIL_SIZE, 'left', 200, -40)).toBe(240);
    expect(widthFromDrag(RAIL_SIZE, 'left', 200, 40)).toBe(160);
  });

  it('widens the LEFT tool panel as the pointer moves right', () => {
    expect(widthFromDrag(DOCK_SIZE, 'right', 320, 60)).toBe(380);
    expect(widthFromDrag(DOCK_SIZE, 'right', 400, -60)).toBe(340);
  });

  it('clamps at both ends of a long drag', () => {
    expect(widthFromDrag(RAIL_SIZE, 'left', 200, -9000)).toBe(420);
    expect(widthFromDrag(DOCK_SIZE, 'right', 320, -9000)).toBe(260);
  });
});
