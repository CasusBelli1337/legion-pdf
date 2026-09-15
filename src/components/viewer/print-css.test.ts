/**
 * A drift guard on print.css. The sheet markup and its stylesheet only work as
 * a pair, and the pair is only provable in a real print engine
 * (qa/print-proof.mjs), which no unit test can run. So this pins the handful of
 * declarations that, when any one of them was missing, printed a 15-page brief
 * on 30 sheets — or, in the case of `overflow`, printed all 15 pages on one.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.join(import.meta.dirname, 'print.css'), 'utf8');
const printMedia = css.slice(css.indexOf('@media print'));

/** The declarations of one selector inside the print block. */
function block(selector: string): string {
  const start = printMedia.indexOf(`${selector} {`);
  expect(start, `print.css has no rule for ${selector}`).toBeGreaterThan(-1);
  return printMedia.slice(start, printMedia.indexOf('}', start));
}

const SHEET = '#librarius-print-sheet';
const PAGE = `${SHEET} .librarius-print-page`;

describe('print.css', () => {
  // Every ancestor has to be one sheet tall or `height: 100%` on the page box
  // resolves against nothing and the box goes back to being content-sized.
  it('makes the document, the body and the sheet exactly one sheet tall', () => {
    expect(block('html,\n  body')).toContain('height: 100% !important');
    expect(block(SHEET)).toContain('height: 100%');
  });

  it('gives every page a box that is exactly one sheet and cannot spill', () => {
    const page = block(PAGE);
    expect(page).toContain('width: 100%');
    expect(page).toContain('height: 100%');
    expect(page).toContain('overflow: hidden');
    expect(page).toContain('break-after: page');
    expect(page).toContain('break-inside: avoid');
  });

  it('shrinks an oversized page image to fit rather than letting it overflow', () => {
    const image = block(`${SHEET} img`);
    expect(image).toContain('max-width: 100%');
    expect(image).toContain('max-height: 100%');
    expect(image).toContain('object-fit: contain');
    // `width: 100%` is what made the image taller than the sheet in the first
    // place: it forces a height instead of capping one.
    expect(image).not.toMatch(/^\s*width: 100%/m);
  });

  it('breaks after every page but the last, so there is no trailing blank sheet', () => {
    expect(block(`${PAGE}:last-child`)).toContain('break-after: auto');
  });

  // The app hides its own scrollbars with `overflow: hidden` on the body. Left
  // on in print media it clips the sheet to a single page box and Chromium
  // stops paginating — all 15 pages land on sheet one.
  it('lets the sheet overflow the body so Chromium still paginates', () => {
    expect(block('html,\n  body')).toContain('overflow: visible !important');
  });
});
