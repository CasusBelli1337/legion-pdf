import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_FLAG_ENV } from './keystore';
import type { SafeStorageLike } from './keystore';
import { DEFAULT_SERVICE_URL, EsignSettings, EsignSettingsError } from './esign-settings';

const API_KEY = 'lsk-test-0123456789abcdef';
const APP_PASSWORD = 'abcd efgh ijkl mnop';
const ADDRESS = 'attorney@example.com';
const BASE_URL = 'https://sign.example.net';

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

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'librarius-esign-settings-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function make(env: NodeJS.ProcessEnv = {}, available = true): EsignSettings {
  return new EsignSettings({ directory, safeStorage: fakeSafeStorage(available), env });
}

describe('EsignSettings — signing service', () => {
  it('reports unconfigured with the default URL before any setup', () => {
    expect(make().serviceStatus()).toEqual({ configured: false, baseUrl: DEFAULT_SERVICE_URL });
    expect(make().serviceCredentials()).toBeNull();
  });

  it('stores, reports, and round-trips the connection', () => {
    const settings = make();
    settings.setService(`  ${BASE_URL}/  `, `  ${API_KEY}  `);

    expect(settings.serviceStatus()).toEqual({ configured: true, baseUrl: BASE_URL });
    expect(settings.serviceCredentials()).toEqual({ baseUrl: BASE_URL, apiKey: API_KEY });
  });

  it('never leaves the API key in cleartext in the store file', () => {
    const settings = make();
    settings.setService(BASE_URL, API_KEY);

    const raw = readFileSync(join(directory, 'esign-service.dat'));
    expect(raw.toString('utf8')).not.toContain(API_KEY);
  });

  it('never puts the API key in the status object', () => {
    const settings = make();
    settings.setService(BASE_URL, API_KEY);
    expect(JSON.stringify(settings.serviceStatus())).not.toContain(API_KEY);
  });

  it('refuses a non-https or unparsable URL by name', () => {
    for (const bad of ['http://sign.example.net', 'sign.example.net', 'ftp://x.net', '']) {
      expect(() => make().setService(bad, API_KEY)).toThrow(/https:\/\//);
    }
  });

  it('refuses an implausible API key without quoting it back', () => {
    for (const bad of ['', 'short', 'has a space in it']) {
      let thrown: unknown;
      try {
        make().setService(BASE_URL, bad);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(EsignSettingsError);
      expect((thrown as EsignSettingsError).code).toBe('INVALID_KEY');
    }
  });

  it('forgets the connection on clear', () => {
    const settings = make();
    settings.setService(BASE_URL, API_KEY);
    settings.clearService();
    expect(settings.serviceStatus().configured).toBe(false);
    expect(settings.serviceCredentials()).toBeNull();
  });

  it('reads unreadable settings loudly at use time, quietly as unconfigured status', () => {
    const settings = make();
    settings.setService(BASE_URL, API_KEY);
    writeFileSync(join(directory, 'esign-service.dat'), 'ciphertext from another machine');

    expect(settings.serviceStatus()).toEqual({ configured: false, baseUrl: DEFAULT_SERVICE_URL });
    let thrown: unknown;
    try {
      settings.serviceCredentials();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EsignSettingsError);
    expect((thrown as EsignSettingsError).code).toBe('UNREADABLE');
    expect((thrown as Error).message).toContain('Enter them again');
  });
});

describe('EsignSettings — Gmail sender', () => {
  it('reports unconfigured with an empty address before any setup', () => {
    expect(make().mailStatus()).toEqual({ configured: false, address: '' });
    expect(make().mailCredentials()).toBeNull();
  });

  it('stores, reports, and round-trips the sender', () => {
    const settings = make();
    settings.setMail(`  ${ADDRESS}  `, APP_PASSWORD);

    expect(settings.mailStatus()).toEqual({ configured: true, address: ADDRESS });
    expect(settings.mailCredentials()).toEqual({ address: ADDRESS, appPassword: APP_PASSWORD });
  });

  it('never leaves the app password in cleartext, in the file or the status', () => {
    const settings = make();
    settings.setMail(ADDRESS, APP_PASSWORD);

    expect(readFileSync(join(directory, 'esign-mail.dat'), 'utf8')).not.toContain(APP_PASSWORD);
    expect(JSON.stringify(settings.mailStatus())).not.toContain(APP_PASSWORD);
  });

  it('refuses something that is not an email address', () => {
    for (const bad of ['', 'not-an-address', 'x@y', 'two words@example.com']) {
      let thrown: unknown;
      try {
        make().setMail(bad, APP_PASSWORD);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(EsignSettingsError);
      expect((thrown as EsignSettingsError).code).toBe('INVALID_EMAIL');
    }
  });

  it('refuses an implausible app password without quoting it back', () => {
    let thrown: unknown;
    try {
      make().setMail(ADDRESS, 'short');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EsignSettingsError);
    expect((thrown as EsignSettingsError).code).toBe('INVALID_PASSWORD');
    expect((thrown as Error).message).not.toContain('short');
  });

  it('forgets the sender on clear', () => {
    const settings = make();
    settings.setMail(ADDRESS, APP_PASSWORD);
    settings.clearMail();
    expect(settings.mailStatus()).toEqual({ configured: false, address: '' });
    expect(settings.mailCredentials()).toBeNull();
  });

  it('keeps the two credential files independent', () => {
    const settings = make();
    settings.setService(BASE_URL, API_KEY);
    settings.setMail(ADDRESS, APP_PASSWORD);
    settings.clearService();
    expect(settings.serviceStatus().configured).toBe(false);
    expect(settings.mailStatus().configured).toBe(true);
  });
});

describe('EsignSettings in degraded mode (safeStorage unavailable)', () => {
  it('refuses to store anything without the explicit dev flag', () => {
    const settings = make({}, false);
    let thrown: unknown;
    try {
      settings.setService(BASE_URL, API_KEY);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EsignSettingsError);
    expect((thrown as EsignSettingsError).code).toBe('ENCRYPTION_UNAVAILABLE');
    expect(settings.serviceStatus().configured).toBe(false);
  });

  it('writes a clearly-marked plaintext file when the dev flag is set', () => {
    const settings = make({ [DEV_FLAG_ENV]: '1' }, false);
    settings.setMail(ADDRESS, APP_PASSWORD);

    expect(readFileSync(join(directory, 'esign-mail.dat'), 'utf8')).toContain(
      'LIBRARIUS-DEV-PLAINTEXT-V1'
    );
    expect(settings.mailCredentials()).toEqual({ address: ADDRESS, appPassword: APP_PASSWORD });
  });

  it('refuses to honour a leftover dev plaintext file outside dev mode', () => {
    make({ [DEV_FLAG_ENV]: '1' }, false).setService(BASE_URL, API_KEY);

    const production = make({}, true);
    expect(() => production.serviceCredentials()).toThrow(EsignSettingsError);
    expect(production.serviceStatus().configured).toBe(false);
  });
});
