/**
 * Drift guards for the scanned-court-filing bug (2026-08-19): pdf.js decodes
 * JBIG2/JPX through wasm it must be POINTED AT. If these parameters or the
 * asset sync ever disappear, every Acrobat-scanned filing goes back to
 * rendering pure white — so their absence fails the suite, not a QA pass.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const seam = readFileSync(join(ROOT, 'src/lib/pdfjs.ts'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('pdfjs decoder assets', () => {
  it('hands pdf.js the wasm, cmap, and standard-font locations', () => {
    for (const param of ['wasmUrl', 'cMapUrl', 'cMapPacked', 'standardFontDataUrl']) {
      expect(seam, `src/lib/pdfjs.ts must pass ${param}`).toContain(param);
    }
    expect(seam).toContain('...PDFJS_ASSETS');
  });

  it('syncs the assets before every dev run and build', () => {
    for (const hook of ['predev', 'prebuild', 'prebuild:win']) {
      expect(pkg.scripts[hook], `package.json script ${hook}`).toContain('sync:pdfjs');
    }
    expect(pkg.scripts['sync:pdfjs']).toContain('sync-pdfjs-assets');
  });

  it('the sync script itself verifies the decoders landed', () => {
    const sync = readFileSync(join(ROOT, 'scripts/sync-pdfjs-assets.mjs'), 'utf8');
    expect(sync).toContain('jbig2.wasm');
    expect(sync).toContain('openjpeg.wasm');
  });
});
