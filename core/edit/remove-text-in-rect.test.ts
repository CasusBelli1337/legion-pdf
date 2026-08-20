import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { PdfRect } from '@shared/types';
import { extractTextItems } from '@core/ocr/pdfjs-extract.testkit';
import { makeFormTextPdf, makeTextPdf } from './edit-testkit';
import {
  removeTextInRect,
  RemovalNotProvedError,
  UnreachableTextError,
} from './remove-text-in-rect';

const COVERED: PdfRect = { x: 40, y: 190, width: 200, height: 30 };

async function removeFrom(
  bytes: Uint8Array,
  rect: PdfRect,
  page = 1
): Promise<{ bytes: Uint8Array; detail: Awaited<ReturnType<typeof removeTextInRect>> }> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const detail = await removeTextInRect(document, { page, rect });
  return { bytes: await document.save(), detail };
}

/** What a real PDF reader gets out of the file — pdfjs, not our own walker. */
async function textOf(bytes: Uint8Array, page = 1): Promise<string> {
  return (await extractTextItems(bytes, page)).map((item) => item.str).join(' ');
}

describe('removeTextInRect', () => {
  it('deletes the characters the box covers and nothing else', async () => {
    const bytes = await makeTextPdf({
      lines: [
        { text: 'SETTLEMENT AMOUNT 250000', x: 50, y: 200 },
        { text: 'UNRELATED PARAGRAPH BELOW', x: 50, y: 100 },
      ],
    });
    expect(await textOf(bytes)).toContain('SETTLEMENT AMOUNT 250000');

    const { bytes: edited, detail } = await removeFrom(bytes, COVERED);
    const after = await textOf(edited);
    expect(after).not.toContain('SETTLEMENT');
    expect(after).not.toContain('250000');
    expect(after).toContain('UNRELATED PARAGRAPH BELOW');
    expect(detail.glyphsRemoved).toBe('SETTLEMENT AMOUNT 250000'.length);
    expect(detail.shownBefore - detail.shownAfter).toBe(detail.glyphsRemoved);
  });

  it('leaves the surviving text at exactly the coordinates it had', async () => {
    const bytes = await makeTextPdf({
      lines: [
        { text: 'COVER ME', x: 50, y: 200 },
        { text: 'LEAVE ME ALONE', x: 50, y: 100 },
      ],
    });
    const before = (await extractTextItems(bytes, 1)).find((item) => item.str.includes('LEAVE'));
    const { bytes: edited } = await removeFrom(bytes, COVERED);
    const after = (await extractTextItems(edited, 1)).find((item) => item.str.includes('LEAVE'));
    expect(after?.x).toBeCloseTo(before?.x ?? Number.NaN, 6);
    expect(after?.y).toBeCloseTo(before?.y ?? Number.NaN, 6);
    expect(after?.width).toBeCloseTo(before?.width ?? Number.NaN, 6);
  });

  it('splits a run that straddles the edge and keeps the outside half in place', async () => {
    const bytes = await makeTextPdf({ lines: [{ text: 'HIDDEN VISIBLE', x: 50, y: 200 }] });
    const wide = (await extractTextItems(bytes, 1))[0];
    // The box stops before "VISIBLE" starts.
    const half: PdfRect = { x: 40, y: 190, width: 48, height: 30 };
    const { bytes: edited, detail } = await removeFrom(bytes, half);
    const after = await extractTextItems(edited, 1);
    const kept = after.map((item) => item.str).join('');
    expect(kept).not.toContain('HIDDEN');
    expect(kept).toContain('VISIBLE');
    expect(detail.glyphsRemoved).toBeGreaterThan(0);
    // The survivors did not slide left into the gap the deletion left behind.
    const visible = after.find((item) => item.str.includes('VISIBLE'));
    const originalRight = (wide?.x ?? 0) + (wide?.width ?? 0);
    expect((visible?.x ?? 0) + (visible?.width ?? 0)).toBeCloseTo(originalRight, 1);
  });

  it('covers text on a rotated page, where the box is still user space', async () => {
    const bytes = await makeTextPdf({
      rotation: 90,
      lines: [
        { text: 'ROTATED SECRET', x: 50, y: 200 },
        { text: 'ROTATED KEEPER', x: 50, y: 100 },
      ],
    });
    const { bytes: edited } = await removeFrom(bytes, COVERED);
    const after = await textOf(edited);
    expect(after).not.toContain('SECRET');
    expect(after).toContain('ROTATED KEEPER');
  });

  it('edits a page whose drawing is split across two content streams', async () => {
    const bytes = await makeTextPdf({
      splitStreams: true,
      lines: [
        { text: 'STREAM ONE SECRET', x: 50, y: 200 },
        { text: 'STREAM TWO KEEPER', x: 50, y: 100 },
      ],
    });
    const { bytes: edited, detail } = await removeFrom(bytes, COVERED);
    const after = await textOf(edited);
    expect(after).not.toContain('SECRET');
    expect(after).toContain('STREAM TWO KEEPER');
    expect(detail.operatorsRewritten).toBe(1);
  });

  it('refuses loudly when the covered text is drawn inside a form XObject', async () => {
    const bytes = await makeFormTextPdf({ text: 'FORM SECRET', x: 0, y: 0 }, { x: 50, y: 195 });
    expect(await textOf(bytes)).toContain('FORM SECRET');
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    await expect(removeTextInRect(document, { page: 1, rect: COVERED })).rejects.toThrow(
      UnreachableTextError
    );
    // Nothing was changed, so the file is still exactly what it was.
    expect(await textOf(await document.save())).toContain('FORM SECRET');
  });

  it('leaves a form XObject alone when the box does not reach it', async () => {
    const bytes = await makeFormTextPdf({ text: 'FORM SAFE', x: 0, y: 0 }, { x: 50, y: 40 });
    const { bytes: edited, detail } = await removeFrom(bytes, COVERED);
    expect(await textOf(edited)).toContain('FORM SAFE');
    expect(detail.glyphsRemoved).toBe(0);
  });

  it('is a no-op when the box covers no text at all', async () => {
    const bytes = await makeTextPdf({ lines: [{ text: 'NOWHERE NEAR', x: 50, y: 100 }] });
    const { bytes: edited, detail } = await removeFrom(bytes, COVERED);
    expect(detail.glyphsRemoved).toBe(0);
    expect(detail.operatorsRewritten).toBe(0);
    expect(await textOf(edited)).toContain('NOWHERE NEAR');
  });

  it('reports the removal errors by name so a caller can tell them apart', () => {
    expect(new UnreachableTextError('x').name).toBe('UnreachableTextError');
    expect(new RemovalNotProvedError('x').name).toBe('RemovalNotProvedError');
  });
});
