import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_FLAG_ENV, DEV_KEY_ENV, Keystore, KeystoreError } from './keystore';
import type { SafeStorageLike } from './keystore';

const KEY = 'sk-ant-test-0123456789abcdef';

/** A reversible stand-in for DPAPI: the ciphertext never contains the plaintext. */
function fakeSafeStorage(available: boolean): SafeStorageLike {
  return {
    isEncryptionAvailable: vi.fn(() => available),
    encryptString: vi.fn((plain: string) =>
      Buffer.from(`ENC1${Buffer.from(plain, 'utf8').toString('base64')}`, 'utf8')
    ),
    decryptString: vi.fn((encrypted: Buffer) => {
      const text = encrypted.toString('utf8');
      if (!text.startsWith('ENC1')) throw new Error('not our ciphertext');
      return Buffer.from(text.slice(4), 'base64').toString('utf8');
    }),
  };
}

let directory: string;
let keyFilePath: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'librarius-keystore-'));
  keyFilePath = join(directory, 'nested', 'centurion-key.dat');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('Keystore with encryption available', () => {
  function store(env: NodeJS.ProcessEnv = {}): {
    keystore: Keystore;
    safeStorage: SafeStorageLike;
  } {
    const safeStorage = fakeSafeStorage(true);
    return { keystore: new Keystore({ keyFilePath, safeStorage, env }), safeStorage };
  }

  it('routes the key through safeStorage and round-trips it', () => {
    const { keystore, safeStorage } = store();
    expect(keystore.hasKey()).toBe(false);

    keystore.setKey(KEY);

    expect(safeStorage.encryptString).toHaveBeenCalledWith(KEY);
    expect(keystore.hasKey()).toBe(true);
    expect(keystore.getKey()).toBe(KEY);
  });

  it('never leaves the key in cleartext in the store file', () => {
    const { keystore } = store();
    keystore.setKey(KEY);

    const raw = readFileSync(keyFilePath);
    expect(raw.includes(Buffer.from(KEY, 'utf8'))).toBe(false);
    expect(raw.toString('utf8')).not.toContain(KEY);
    expect(raw.toString('utf8')).not.toContain('sk-ant');
  });

  it('trims what the attorney pasted before storing it', () => {
    const { keystore, safeStorage } = store();
    keystore.setKey(`  ${KEY}\n`);
    expect(safeStorage.encryptString).toHaveBeenCalledWith(KEY);
  });

  it('forgets the key on clear', () => {
    const { keystore } = store();
    keystore.setKey(KEY);
    keystore.clearKey();
    expect(keystore.hasKey()).toBe(false);
    expect(keystore.getKey()).toBeNull();
  });

  it('rejects input that cannot be a key, without quoting it back', () => {
    const { keystore } = store();
    for (const bad of ['', '   ', 'short', 'sk-ant has a space in it']) {
      expect(() => keystore.setKey(bad)).toThrow(KeystoreError);
    }
    expect(keystore.hasKey()).toBe(false);
  });

  it('reports an unreadable file in plain English and never echoes the key', () => {
    const { keystore } = store();
    keystore.setKey(KEY);
    writeFileSync(keyFilePath, Buffer.from('ciphertext from another machine', 'utf8'));

    let thrown: unknown;
    try {
      keystore.getKey();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(KeystoreError);
    expect((thrown as KeystoreError).code).toBe('UNREADABLE_KEY');
    expect((thrown as Error).message).not.toContain(KEY);
    expect((thrown as Error).message).toContain('enter it again');
  });

  it('ignores the dev env key when dev mode is off', () => {
    const { keystore } = store({ [DEV_KEY_ENV]: 'sk-ant-from-the-environment' });
    expect(keystore.hasKey()).toBe(false);
    expect(keystore.getKey()).toBeNull();
  });

  it('lets the dev env key win while LIBRARIUS_DEV is set', () => {
    const { keystore } = store({
      [DEV_FLAG_ENV]: '1',
      [DEV_KEY_ENV]: 'sk-ant-from-the-environment',
    });
    keystore.setKey(KEY);
    expect(keystore.getKey()).toBe('sk-ant-from-the-environment');
  });
});

describe('Keystore in degraded mode (safeStorage unavailable)', () => {
  function store(env: NodeJS.ProcessEnv): Keystore {
    return new Keystore({ keyFilePath, safeStorage: fakeSafeStorage(false), env });
  }

  it('refuses to store anything without the explicit dev flag', () => {
    const keystore = store({});
    let thrown: unknown;
    try {
      keystore.setKey(KEY);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(KeystoreError);
    expect((thrown as KeystoreError).code).toBe('ENCRYPTION_UNAVAILABLE');
    expect((thrown as Error).message).not.toContain(KEY);
    expect(keystore.hasKey()).toBe(false);
  });

  it('treats an empty or falsy dev flag as off', () => {
    for (const flag of ['', '0', 'false']) {
      expect(() => store({ [DEV_FLAG_ENV]: flag }).setKey(KEY)).toThrow(KeystoreError);
    }
  });

  it('writes a clearly-marked plaintext file when the dev flag is set', () => {
    const keystore = store({ [DEV_FLAG_ENV]: '1' });
    keystore.setKey(KEY);

    expect(readFileSync(keyFilePath, 'utf8')).toContain('LIBRARIUS-DEV-PLAINTEXT-V1');
    expect(keystore.getKey()).toBe(KEY);
  });

  it('refuses to honour a leftover dev plaintext file outside dev mode', () => {
    store({ [DEV_FLAG_ENV]: '1' }).setKey(KEY);

    const production = new Keystore({ keyFilePath, safeStorage: fakeSafeStorage(true), env: {} });
    expect(() => production.getKey()).toThrow(KeystoreError);
  });
});
