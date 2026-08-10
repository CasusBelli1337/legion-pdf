import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TesseractNotFoundError, resolveTesseract } from './tesseract-binary';
import type { ResolveTesseractOptions } from './tesseract-binary';

const DEV_ROOT = '/home/casusbelli/projects/legion-librarius';
const INSTALL_ROOT = 'C:\\Program Files\\Librarius\\resources';

function options(
  present: string[],
  overrides: Partial<ResolveTesseractOptions> = {}
): ResolveTesseractOptions {
  return {
    platform: 'linux',
    isPackaged: false,
    resourcesPath: INSTALL_ROOT,
    appRoot: DEV_ROOT,
    exists: (candidate) => present.includes(candidate),
    ...overrides,
  };
}

describe('resolveTesseract', () => {
  it('prefers an explicit LIBRARIUS_TESSERACT_PATH override', () => {
    const location = resolveTesseract(
      options(['/opt/tesseract/bin/tesseract', `${DEV_ROOT}/resources/tesseract-linux/tesseract`], {
        envPath: '/opt/tesseract/bin/tesseract',
      })
    );
    expect(location).toEqual({
      command: '/opt/tesseract/bin/tesseract',
      source: 'env',
      tessdataPrefix: null,
    });
  });

  it('fails loudly when the override points at nothing', () => {
    expect(() => resolveTesseract(options([], { envPath: '/nope/tesseract' }))).toThrow(
      TesseractNotFoundError
    );
  });

  it('ignores a blank override rather than spawning an empty command', () => {
    const location = resolveTesseract(options([], { envPath: '   ' }));
    expect(location.source).toBe('path');
  });

  it('finds the development bundle under resources/tesseract-linux', () => {
    const binary = `${DEV_ROOT}/resources/tesseract-linux/tesseract`;
    const location = resolveTesseract(options([binary]));
    expect(location).toEqual({ command: binary, source: 'bundled', tessdataPrefix: null });
  });

  it('sets TESSDATA_PREFIX when the bundle ships its own language data', () => {
    const root = `${DEV_ROOT}/resources/tesseract-linux`;
    const location = resolveTesseract(options([`${root}/tesseract`, `${root}/tessdata`]));
    expect(location.tessdataPrefix).toBe(`${root}/tessdata`);
  });

  it('uses the packaged layout and the .exe name on Windows', () => {
    // path.join uses the HOST separator under test; production runs on Windows.
    const binary = join(INSTALL_ROOT, 'tesseract-win', 'tesseract.exe');
    const location = resolveTesseract(options([binary], { platform: 'win32', isPackaged: true }));
    expect(location).toEqual({ command: binary, source: 'bundled', tessdataPrefix: null });
  });

  it('still finds a dev-tree bundle when running packaged, and vice versa', () => {
    const devBinary = `${DEV_ROOT}/resources/tesseract-linux/tesseract`;
    const packagedFirst = resolveTesseract(options([devBinary], { isPackaged: true }));
    expect(packagedFirst.command).toBe(devBinary);

    const installed = `${INSTALL_ROOT}/tesseract-linux/tesseract`;
    const devFirst = resolveTesseract(options([installed], { isPackaged: false }));
    expect(devFirst.command).toBe(installed);
  });

  it('falls back to the PATH when nothing is bundled', () => {
    expect(resolveTesseract(options([]))).toEqual({
      command: 'tesseract',
      source: 'path',
      tessdataPrefix: null,
    });
  });
});
