/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { CHECKBOX_CHECKED, CHECKBOX_EMPTY } from '@shared/layout-model';
import type { LayoutTextRun } from '@shared/types';
import { buildDocx } from '@core/export';
import { CHECKBOX_FONT_KEY, checkboxRuns } from './checkbox-runs';
import { layoutsOf } from './node-pipeline.testkit';

function text(value: string, x: number, y: number): LayoutTextRun {
  return {
    text: value,
    x,
    y,
    width: value.length * 6,
    sizePt: 12,
    fontKey: 'times',
    role: 'body',
    eol: false,
    block: { id: 'b7', role: 'paragraph' },
  };
}

describe('checkboxRuns', () => {
  it('sets each box on the baseline, size and paragraph of the text beside it', () => {
    const runs = [
      text('a.', 140, 394),
      text('By personal service.', 213, 394),
      text('above', 213, 420),
    ];
    const [box] = checkboxRuns(
      [{ rect: { x: 177.5, y: 391.9, width: 11.6, height: 11.6 }, checked: true }],
      runs
    );
    expect(box).toMatchObject({
      text: CHECKBOX_CHECKED,
      x: 177.5,
      y: 394,
      width: 11.6,
      sizePt: 12,
      fontKey: CHECKBOX_FONT_KEY,
      role: 'body',
      block: { id: 'b7' },
    });
  });

  it('stands a box alone when no text shares its line', () => {
    const [box] = checkboxRuns(
      [{ rect: { x: 100, y: 300, width: 10, height: 10 }, checked: false }],
      [text('far away', 100, 500)]
    );
    expect(box).toMatchObject({ text: CHECKBOX_EMPTY, y: 301.2, sizePt: 10 });
    expect(box?.block).toBeUndefined();
  });
});

/**
 * A proof of service the way Word prints its form checkboxes: stroked squares,
 * the ticked one crossed corner to corner. Read through pdfjs itself, because
 * "checked" rests on pdfjs' path data — if a pdfjs upgrade changes that shape,
 * a ticked box would silently read as empty, and this fails instead.
 */
async function serviceForm(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const sheet = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.TimesRoman);
  const black = rgb(0, 0, 0);
  const row = (label: string, y: number, checked: boolean): void => {
    sheet.drawText('a.', { x: 140, y, size: 12, font });
    sheet.drawRectangle({
      x: 177,
      y: y - 2,
      width: 11.6,
      height: 11.6,
      borderWidth: 0.7,
      borderColor: black,
    });
    if (checked) {
      sheet.drawLine({
        start: { x: 177, y: y - 2 },
        end: { x: 188.6, y: y + 9.6 },
        thickness: 0.5,
      });
      sheet.drawLine({
        start: { x: 177, y: y + 9.6 },
        end: { x: 188.6, y: y - 2 },
        thickness: 0.5,
      });
    }
    sheet.drawText(label, { x: 213, y, size: 12, font });
  };
  row('By personal service on the persons listed below.', 600, false);
  row('By electronic service at the addresses listed below.', 570, true);
  return document.save();
}

describe('checkboxes through pdfjs and into Word', () => {
  it('reads the drawn boxes, ticked or not, and writes them as box characters on their lines', async () => {
    const layouts = await layoutsOf(await serviceForm());
    expect(layouts[0]?.checkboxes?.map((box) => box.checked)).toEqual([false, true]);

    const build = await buildDocx(layouts);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(build.bytes);
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    const empty = xml.indexOf(CHECKBOX_EMPTY);
    const checked = xml.indexOf(CHECKBOX_CHECKED);
    expect(empty).toBeGreaterThan(-1);
    expect(checked).toBeGreaterThan(empty);
    expect(xml.indexOf('By personal service')).toBeGreaterThan(empty);
    expect(xml.indexOf('By personal service')).toBeLessThan(checked);
    expect(xml).toMatch(/w:rFonts w:ascii="MS Gothic"[^>]*\/>(?:(?!<\/w:r>).)*☒/s);
  });
});
