/**
 * F-6 signature placement. The PNG is embedded as an image XObject and drawn
 * into the page's content stream, so the signature IS the page from that moment
 * on — reopening the file in Acrobat gives no annotation to select, move, or
 * delete, which is the whole point of "flattened".
 *
 * The date text, when asked for, is already formatted by the caller: core stays
 * deterministic and never reads the clock.
 */

import type { OpResult, PdfPoint } from '@shared/types';
import { finish, loadPdf } from '../ops/pdf-io';
import { BLACK } from './color';
import { toVisualSpace } from './geometry';
import { drawImage, drawText, embedFont, measureText, pageFrame, BODY_FONT } from './ink';
import { readPngInfo } from './png-asset';

/** Gap between the signature and its date stamp, in points. */
const DATE_GAP = 12;
const MIN_SIZE = 4;
const MAX_SIZE = 2000;

/** What core needs to place a signature — the library id is resolved by then. */
export interface SignatureInk {
  /** 1-based page. */
  page: number;
  /** Transparent PNG bytes from the signature library. */
  png: Uint8Array;
  /** Bottom-left of the signature in PDF user space, as the viewer reported it. */
  at: PdfPoint;
  widthPt: number;
  heightPt: number;
  /** Already formatted by the caller, e.g. "08/10/2026". Omit for no date. */
  dateText?: string;
  /** Date text size; defaults to a tenth of the signature height. */
  dateSize?: number;
}

function assertInk(ink: SignatureInk, pageCount: number): void {
  if (!Number.isInteger(ink.page) || ink.page < 1 || ink.page > pageCount) {
    throw new RangeError(
      `This document has pages 1 through ${pageCount}; there is no page ${ink.page}.`
    );
  }
  const tooSmall = ink.widthPt < MIN_SIZE || ink.heightPt < MIN_SIZE;
  const tooLarge = ink.widthPt > MAX_SIZE || ink.heightPt > MAX_SIZE;
  if (tooSmall || tooLarge) {
    throw new RangeError(
      `A signature is between ${MIN_SIZE} and ${MAX_SIZE} points on a side; ` +
        `${Math.round(ink.widthPt)} by ${Math.round(ink.heightPt)} is not.`
    );
  }
}

function dateFontSize(ink: SignatureInk): number {
  return ink.dateSize ?? Math.max(8, Math.min(14, ink.heightPt / 2));
}

export async function placeSignature(bytes: Uint8Array, ink: SignatureInk): Promise<OpResult> {
  readPngInfo(ink.png);
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();
  assertInk(ink, pagesIn);

  const page = document.getPage(ink.page - 1);
  const frame = pageFrame(page);
  const at = toVisualSpace(frame, ink.at);
  const image = await document.embedPng(ink.png);
  drawImage(page, frame, {
    image,
    at,
    size: { width: ink.widthPt, height: ink.heightPt },
  });

  if (ink.dateText !== undefined && ink.dateText.length > 0) {
    const font = await embedFont(document, BODY_FONT);
    const size = dateFontSize(ink);
    const box = measureText(font, ink.dateText, size);
    drawText(page, frame, {
      text: ink.dateText,
      font,
      size,
      color: BLACK,
      at: { x: at.x + ink.widthPt + DATE_GAP, y: at.y + (ink.heightPt - box.height) / 2 },
    });
  }

  return finish(document, pagesIn, pagesIn, undefined, 'signed document');
}
