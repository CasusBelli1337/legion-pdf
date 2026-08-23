/**
 * The E-Sign secrets' only home: the Legion signing-service connection
 * ({baseUrl, apiKey}) and the Armory Outreach sender ({baseUrl, token,
 * from}), each in its own safeStorage-encrypted file under the directory
 * given at construction (app.getPath('userData') in production).
 *
 * Engineering rule 4, same as ./keystore: neither secret ever reaches a log,
 * an error message, a status object, or the renderer. The renderer's whole
 * view is `configured` plus the non-secret halves (base URLs / from address).
 * Electron's safeStorage is injected so this class unit-tests in plain Node.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EsignMailStatus, EsignServiceStatus } from '@shared/types';
import { DEV_FLAG_ENV } from './keystore';
import type { SafeStorageLike } from './keystore';

/** The hosted Legion signing service; what the panel shows before any setup. */
export const DEFAULT_SERVICE_URL = 'https://sign.legionarmory.net';

/**
 * The Outreach module on the Armory EC2, reached over the private Tailscale
 * network (WireGuard-encrypted end to end — which is why plain http is
 * acceptable here and ONLY here). MagicDNS name; the settings accept the
 * tailnet IP form too when DNS is being difficult.
 */
export const DEFAULT_OUTREACH_URL = 'http://armory-ec2.tail1a3aad.ts.net/tools/outreach';

/** The mailbox Outreach sends from unless the attorney picks another. */
export const DEFAULT_OUTREACH_FROM = 'arthur@legion.law';

const SERVICE_FILE = 'esign-service.dat';
const MAIL_FILE = 'esign-mail.dat';

/** Marks a file written in degraded dev mode — same convention as ./keystore. */
const PLAINTEXT_MARKER = 'LIBRARIUS-DEV-PLAINTEXT-V1\n';

/** Guards against a stray keystroke being stored as a credential. */
const MIN_SECRET_LENGTH = 8;

export type EsignSettingsErrorCode =
  | 'INVALID_URL'
  | 'INVALID_OUTREACH_URL'
  | 'INVALID_KEY'
  | 'INVALID_EMAIL'
  | 'INVALID_TOKEN'
  | 'ENCRYPTION_UNAVAILABLE'
  | 'UNREADABLE';

/** Plain English for the attorney. None of these ever quote a secret. */
const MESSAGES: Record<EsignSettingsErrorCode, string> = {
  INVALID_URL:
    'The service address must be a full https:// URL, for example https://sign.legionarmory.net.',
  INVALID_OUTREACH_URL:
    'The Armory address must be a full URL, for example ' +
    'http://armory-ec2.tail1a3aad.ts.net/tools/outreach.',
  INVALID_KEY: 'That does not look like a service API key. Paste the whole key, with no spaces.',
  INVALID_EMAIL:
    'That does not look like an email address. Enter the full address the requests should come from.',
  INVALID_TOKEN:
    'That does not look like an Armory service token. Paste the whole token, with no spaces.',
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
  /** Outreach module base URL, e.g. http://armory-ec2.tail1a3aad.ts.net/tools/outreach. */
  baseUrl: string;
  /** The Armory service token Outreach's /service endpoints require. */
  token: string;
  /** The connected mailbox to send as, e.g. arthur@legion.law. */
  from: string;
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

function normalizeSecret(value: string, code: 'INVALID_KEY' | 'INVALID_TOKEN'): string {
  const trimmed = value.trim();
  if (trimmed.length < MIN_SECRET_LENGTH) throw new EsignSettingsError(code);
  if (/\s/.test(trimmed)) throw new EsignSettingsError(code);
  return trimmed;
}

/**
 * Outreach lives on the private tailnet, where WireGuard already encrypts the
 * wire — so http is allowed here, unlike the public signing service.
 */
function normalizeOutreachUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new EsignSettingsError('INVALID_OUTREACH_URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new EsignSettingsError('INVALID_OUTREACH_URL');
  }
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

  /* ── the Armory Outreach request-email sender ───────────────────────── */

  mailStatus(): EsignMailStatus {
    const stored = this.readQuietly<EsignMailCredentials>(this.mailPath);
    if (stored === null) {
      return { configured: false, baseUrl: DEFAULT_OUTREACH_URL, from: DEFAULT_OUTREACH_FROM };
    }
    return { configured: true, baseUrl: stored.baseUrl, from: stored.from };
  }

  setMail(baseUrl: string, token: string, from: string): void {
    this.write(this.mailPath, {
      baseUrl: normalizeOutreachUrl(baseUrl),
      token: normalizeSecret(token, 'INVALID_TOKEN'),
      from: normalizeAddress(from),
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
