/**
 * The E-Sign secrets' only home: the Legion signing-service connection
 * ({baseUrl, apiKey}) and the Gmail request-email sender ({address,
 * appPassword}), each in its own safeStorage-encrypted file under the
 * directory given at construction (app.getPath('userData') in production).
 *
 * Engineering rule 4, same as ./keystore: neither secret ever reaches a log,
 * an error message, a status object, or the renderer. The renderer's whole
 * view is `configured` plus the non-secret half (base URL / sender address).
 * Electron's safeStorage is injected so this class unit-tests in plain Node.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EsignMailStatus, EsignServiceStatus } from '@shared/types';
import { DEV_FLAG_ENV } from './keystore';
import type { SafeStorageLike } from './keystore';

/** The hosted Legion signing service; what the panel shows before any setup. */
export const DEFAULT_SERVICE_URL = 'https://sign.legionarmory.net';

const SERVICE_FILE = 'esign-service.dat';
const MAIL_FILE = 'esign-mail.dat';

/** Marks a file written in degraded dev mode — same convention as ./keystore. */
const PLAINTEXT_MARKER = 'LIBRARIUS-DEV-PLAINTEXT-V1\n';

/** Guards against a stray keystroke being stored as a credential. */
const MIN_SECRET_LENGTH = 8;

export type EsignSettingsErrorCode =
  | 'INVALID_URL'
  | 'INVALID_KEY'
  | 'INVALID_EMAIL'
  | 'INVALID_PASSWORD'
  | 'ENCRYPTION_UNAVAILABLE'
  | 'UNREADABLE';

/** Plain English for the attorney. None of these ever quote a secret. */
const MESSAGES: Record<EsignSettingsErrorCode, string> = {
  INVALID_URL:
    'The service address must be a full https:// URL, for example https://sign.legionarmory.net.',
  INVALID_KEY: 'That does not look like a service API key. Paste the whole key, with no spaces.',
  INVALID_EMAIL:
    'That does not look like an email address. Enter the full Gmail address the requests should come from.',
  INVALID_PASSWORD:
    'That does not look like a Gmail app password. Paste the whole app password from your Google account.',
  ENCRYPTION_UNAVAILABLE:
    'This computer has no secure place to keep these settings, so they were not stored. ' +
    'Sign in to Windows normally and try again.',
  UNREADABLE:
    'The saved e-sign settings could not be unlocked on this computer. ' +
    'Enter them again in the E-Sign panel settings.',
};

export class EsignSettingsError extends Error {
  constructor(readonly code: EsignSettingsErrorCode) {
    super(MESSAGES[code]);
    this.name = 'EsignSettingsError';
  }
}

export interface EsignServiceCredentials {
  baseUrl: string;
  apiKey: string;
}

export interface EsignMailCredentials {
  address: string;
  appPassword: string;
}

export interface EsignSettingsOptions {
  /** Directory the two .dat files live in (userData in production). */
  directory: string;
  safeStorage: SafeStorageLike;
  /** Injected for tests; defaults to the real process environment. */
  env?: NodeJS.ProcessEnv;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new EsignSettingsError('INVALID_URL');
  }
  if (parsed.protocol !== 'https:') throw new EsignSettingsError('INVALID_URL');
  return trimmed;
}

function normalizeSecret(value: string, code: 'INVALID_KEY' | 'INVALID_PASSWORD'): string {
  const trimmed = value.trim();
  if (trimmed.length < MIN_SECRET_LENGTH) throw new EsignSettingsError(code);
  if (code === 'INVALID_KEY' && /\s/.test(trimmed)) throw new EsignSettingsError(code);
  return trimmed;
}

function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) throw new EsignSettingsError('INVALID_EMAIL');
  return trimmed;
}

export class EsignSettings {
  private readonly servicePath: string;
  private readonly mailPath: string;
  private readonly safeStorage: SafeStorageLike;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: EsignSettingsOptions) {
    this.servicePath = join(options.directory, SERVICE_FILE);
    this.mailPath = join(options.directory, MAIL_FILE);
    this.safeStorage = options.safeStorage;
    this.env = options.env ?? process.env;
  }

  /* ── the signing-service connection ─────────────────────────────────── */

  serviceStatus(): EsignServiceStatus {
    const stored = this.readQuietly<EsignServiceCredentials>(this.servicePath);
    if (stored === null) return { configured: false, baseUrl: DEFAULT_SERVICE_URL };
    return { configured: true, baseUrl: stored.baseUrl };
  }

  setService(baseUrl: string, apiKey: string): void {
    this.write(this.servicePath, {
      baseUrl: normalizeBaseUrl(baseUrl),
      apiKey: normalizeSecret(apiKey, 'INVALID_KEY'),
    });
  }

  clearService(): void {
    rmSync(this.servicePath, { force: true });
  }

  /** MAIN PROCESS ONLY. Null when nothing is stored; loud when unreadable. */
  serviceCredentials(): EsignServiceCredentials | null {
    return this.read<EsignServiceCredentials>(this.servicePath);
  }

  /* ── the Gmail request-email sender ─────────────────────────────────── */

  mailStatus(): EsignMailStatus {
    const stored = this.readQuietly<EsignMailCredentials>(this.mailPath);
    if (stored === null) return { configured: false, address: '' };
    return { configured: true, address: stored.address };
  }

  setMail(address: string, appPassword: string): void {
    this.write(this.mailPath, {
      address: normalizeAddress(address),
      appPassword: normalizeSecret(appPassword, 'INVALID_PASSWORD'),
    });
  }

  clearMail(): void {
    rmSync(this.mailPath, { force: true });
  }

  /** MAIN PROCESS ONLY. Null when nothing is stored; loud when unreadable. */
  mailCredentials(): EsignMailCredentials | null {
    return this.read<EsignMailCredentials>(this.mailPath);
  }

  /* ── storage plumbing (mirrors ./keystore) ──────────────────────────── */

  private write(filePath: string, value: object): void {
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, this.encode(JSON.stringify(value)), { mode: 0o600 });
    chmodSync(filePath, 0o600);
  }

  private read<T>(filePath: string): T | null {
    if (!existsSync(filePath)) return null;
    const decoded = this.decode(readFileSync(filePath));
    try {
      return JSON.parse(decoded) as T;
    } catch {
      // The message is fixed and the parse error is discarded: a corrupt file
      // could hold secret fragments, and neither may reach a log or the UI.
      throw new EsignSettingsError('UNREADABLE');
    }
  }

  /**
   * The status view: a file that cannot be unlocked reports "not configured"
   * so the panel simply asks for the settings again (re-entering overwrites
   * it). The loud UNREADABLE error still fires the moment a request actually
   * needs the credentials, so nothing fails silently at send time.
   */
  private readQuietly<T>(filePath: string): T | null {
    try {
      return this.read<T>(filePath);
    } catch {
      return null;
    }
  }

  private encode(plain: string): Buffer {
    if (this.safeStorage.isEncryptionAvailable()) {
      return this.safeStorage.encryptString(plain);
    }
    if (!this.devModeAllowed()) throw new EsignSettingsError('ENCRYPTION_UNAVAILABLE');
    return Buffer.concat([Buffer.from(PLAINTEXT_MARKER, 'utf8'), Buffer.from(plain, 'utf8')]);
  }

  /** A dev-mode plaintext file is refused outside dev mode, never honoured. */
  private decode(stored: Buffer): string {
    const marker = Buffer.from(PLAINTEXT_MARKER, 'utf8');
    if (stored.subarray(0, marker.byteLength).equals(marker)) {
      if (!this.devModeAllowed()) throw new EsignSettingsError('ENCRYPTION_UNAVAILABLE');
      return stored.subarray(marker.byteLength).toString('utf8');
    }
    try {
      return this.safeStorage.decryptString(stored);
    } catch {
      // Swallow the cause deliberately: it can carry secret material.
      throw new EsignSettingsError('UNREADABLE');
    }
  }

  private devModeAllowed(): boolean {
    const flag = this.env[DEV_FLAG_ENV];
    return flag !== undefined && flag !== '' && flag !== '0' && flag !== 'false';
  }
}
