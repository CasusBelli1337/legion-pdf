import { beforeEach, describe, expect, it } from 'vitest';
import {
  documentKey,
  readCitePrefix,
  resetCitePrefixes,
  withCitePrefix,
  writeCitePrefix,
} from './cite-prefix';

/** A stand-in for the browser's localStorage, so persistence is really tested. */
class MemoryStorage implements Storage {
  #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#entries.clear();
  }

  getItem(key: string): string | null {
    return this.#entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#entries.set(key, value);
  }

  /** Every stored key, for the test that asserts no file path is written. */
  keys(): string[] {
    return [...this.#entries.keys()];
  }
}

const storage = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const DECLARATION = { docId: 'doc-1', filePath: '/matters/ashford/rothrock-declaration.pdf' };
const TRANSCRIPT = { docId: 'doc-2', filePath: '/matters/ashford/ashford-depo-vol-3.pdf' };
const UNSAVED = { docId: 'doc-3', filePath: null };

beforeEach(() => {
  storage.clear();
  resetCitePrefixes();
});

describe('cite prefix storage', () => {
  it('remembers the prefix for a document across a reopen', () => {
    writeCitePrefix(DECLARATION, 'Rothrock Decl.');
    resetCitePrefixes();

    expect(readCitePrefix(DECLARATION)).toBe('Rothrock Decl.');
  });

  it('keeps two documents' + ' prefixes apart', () => {
    writeCitePrefix(DECLARATION, 'Rothrock Decl.');
    writeCitePrefix(TRANSCRIPT, 'Ashford Depo.');

    expect(readCitePrefix(DECLARATION)).toBe('Rothrock Decl.');
    expect(readCitePrefix(TRANSCRIPT)).toBe('Ashford Depo.');
  });

  it('starts empty for a document nobody has labelled', () => {
    expect(readCitePrefix(TRANSCRIPT)).toBe('');
  });

  it('trims what was typed and treats an empty prefix as a removal', () => {
    writeCitePrefix(DECLARATION, '  Rothrock Decl.  ');
    expect(readCitePrefix(DECLARATION)).toBe('Rothrock Decl.');

    writeCitePrefix(DECLARATION, '   ');
    expect(readCitePrefix(DECLARATION)).toBe('');
    expect(storage.keys()).toHaveLength(0);
  });

  it('holds an unsaved document' + "'s prefix for the session only", () => {
    writeCitePrefix(UNSAVED, 'Draft Decl.');

    expect(readCitePrefix(UNSAVED)).toBe('Draft Decl.');
    expect(storage.keys()).toHaveLength(0);
  });

  it('never writes the file path or the matter name into storage', () => {
    writeCitePrefix(DECLARATION, 'Rothrock Decl.');
    const written =
      storage.keys().join(' ') + JSON.stringify(storage.getItem(storage.key(0) ?? ''));

    expect(written).not.toContain('ashford');
    expect(written).not.toContain('rothrock-declaration');
    expect(documentKey(DECLARATION.filePath)).not.toBe(documentKey(TRANSCRIPT.filePath));
  });

  it('survives storage that is unreadable rather than failing the app', () => {
    resetCitePrefixes();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => '{ not json',
        setItem: () => {
          throw new Error('quota');
        },
        removeItem: () => undefined,
      },
      configurable: true,
    });

    expect(() => writeCitePrefix(DECLARATION, 'Rothrock Decl.')).not.toThrow();
    expect(readCitePrefix(DECLARATION)).toBe('');

    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    resetCitePrefixes();
  });
});

describe('prefix formatting', () => {
  it('inserts one space and adds no punctuation of its own', () => {
    expect(withCitePrefix('(5:10-15)', 'Rothrock Decl.')).toBe('(Rothrock Decl. 5:10-15)');
    expect(withCitePrefix('(12)', 'Ex. 4')).toBe('(Ex. 4 12)');
    expect(withCitePrefix('(5:10-6:2)', '')).toBe('(5:10-6:2)');
    expect(withCitePrefix('(5:10)', '   ')).toBe('(5:10)');
  });
});
