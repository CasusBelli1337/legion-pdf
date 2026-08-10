/**
 * The Anthropic API key's only home. It lives in ONE file under
 * app.getPath('userData'), encrypted by the OS keychain (DPAPI on Windows)
 * through Electron safeStorage, and it is read only here in the main process.
 *
 * Engineering rule 4: the key never touches a log, an error message, the
 * renderer, or any file in this repo. `getKey()` is main-process internal and
 * is deliberately NOT wired to any IPC channel - the renderer's whole view of
 * the key is the boolean from `hasKey()`.
 *
 * Electron is injected (`SafeStorageLike`) rather than imported so this file
 * is unit-testable in plain Node.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The slice of Electron's `safeStorage` this store needs. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** Set to opt into the degraded, unencrypted dev mode. Never set in production. */
export const DEV_FLAG_ENV = 'LIBRARIUS_DEV';

/** Dev-only convenience: this key wins over the stored one while LIBRARIUS_DEV is set. */
export const DEV_KEY_ENV = 'LIBRARIUS_DEV_ANTHROPIC_API_KEY';

/** Marks a file written in degraded dev mode so it is never fed to decryptString. */
const PLAINTEXT_MARKER = 'LIBRARIUS-DEV-PLAINTEXT-V1\n';

/** Shortest thing we will accept as a key. Guards against a stray keystroke. */
const MIN_KEY_LENGTH = 8;

export type KeystoreErrorCode = 'INVALID_KEY' | 'ENCRYPTION_UNAVAILABLE' | 'UNREADABLE_KEY';

/** Plain English for the attorney. None of these ever quote the key itself. */
const MESSAGES: Record<KeystoreErrorCode, string> = {
  INVALID_KEY: 'That does not look like an API key. Paste the whole key, with no spaces.',
  ENCRYPTION_UNAVAILABLE:
    'This computer has no secure place to keep the key, so Centurion will not store it. ' +
    'Sign in to Windows normally and try again.',
  UNREADABLE_KEY:
    'The saved key could not be unlocked on this computer. Clear the key in Centurion and enter it again.',
};

export class KeystoreError extends Error {
  constructor(readonly code: KeystoreErrorCode) {
    super(MESSAGES[code]);
    this.name = 'KeystoreError';
  }
}

export interface KeystoreOptions {
  /** Absolute path of the key file (inside app.getPath('userData') in production). */
  keyFilePath: string;
  safeStorage: SafeStorageLike;
  /** Injected for tests; defaults to the real process environment. */
  env?: NodeJS.ProcessEnv;
}

/** Trim and sanity-check user input before it ever reaches disk or the API. */
function normalizeKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length < MIN_KEY_LENGTH || /\s/.test(trimmed)) {
    throw new KeystoreError('INVALID_KEY');
  }
  return trimmed;
}

export class Keystore {
  private readonly keyFilePath: string;
  private readonly safeStorage: SafeStorageLike;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: KeystoreOptions) {
    this.keyFilePath = options.keyFilePath;
    this.safeStorage = options.safeStorage;
    this.env = options.env ?? process.env;
  }

  /** The only thing the renderer is ever told about the key. */
  hasKey(): boolean {
    return this.devKey() !== null || existsSync(this.keyFilePath);
  }

  /**
   * Encrypt and store. Refuses outright when the OS cannot encrypt, unless the
   * developer has explicitly opted into the degraded mode with LIBRARIUS_DEV.
   */
  setKey(key: string): void {
    const normalized = normalizeKey(key);
    mkdirSync(dirname(this.keyFilePath), { recursive: true });
    writeFileSync(this.keyFilePath, this.encode(normalized), { mode: 0o600 });
    chmodSync(this.keyFilePath, 0o600);
  }

  clearKey(): void {
    rmSync(this.keyFilePath, { force: true });
  }

  /**
   * MAIN PROCESS ONLY. Never expose this over IPC, never log the return value.
   * Returns null when no key has been stored yet.
   */
  getKey(): string | null {
    const devKey = this.devKey();
    if (devKey !== null) return devKey;
    if (!existsSync(this.keyFilePath)) return null;
    return this.decode(readFileSync(this.keyFilePath));
  }

  /** Ciphertext when the OS can encrypt; a clearly-marked plaintext blob in dev mode. */
  private encode(key: string): Buffer {
    if (this.safeStorage.isEncryptionAvailable()) {
      return this.safeStorage.encryptString(key);
    }
    if (!this.devModeAllowed()) throw new KeystoreError('ENCRYPTION_UNAVAILABLE');
    return Buffer.concat([Buffer.from(PLAINTEXT_MARKER, 'utf8'), Buffer.from(key, 'utf8')]);
  }

  /**
   * A dev-mode plaintext file is refused outside dev mode rather than silently
   * honoured, so a leftover dev key can never authenticate a packaged build.
   */
  private decode(stored: Buffer): string {
    const marker = Buffer.from(PLAINTEXT_MARKER, 'utf8');
    if (stored.subarray(0, marker.byteLength).equals(marker)) {
      if (!this.devModeAllowed()) throw new KeystoreError('ENCRYPTION_UNAVAILABLE');
      return stored.subarray(marker.byteLength).toString('utf8');
    }
    try {
      return this.safeStorage.decryptString(stored);
    } catch {
      // Swallow the cause deliberately: it can carry key material.
      throw new KeystoreError('UNREADABLE_KEY');
    }
  }

  private devModeAllowed(): boolean {
    const flag = this.env[DEV_FLAG_ENV];
    return flag !== undefined && flag !== '' && flag !== '0' && flag !== 'false';
  }

  /** The dev env-var key, honoured only while LIBRARIUS_DEV is set. */
  private devKey(): string | null {
    if (!this.devModeAllowed()) return null;
    const candidate = this.env[DEV_KEY_ENV]?.trim();
    return candidate !== undefined && candidate.length >= MIN_KEY_LENGTH ? candidate : null;
  }
}
