import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { LayoutTextRun, PageLayout } from '@shared/types';
import { buildDocx } from './build-docx';
import {
  isPicturePagesNote,
  pageRanges,
  partsOf,
  picturePagesNote,
  picturePagesOf,
  picturesToKeep,
} from './picture-pages';
import type { PagePicture } from './picture-pages';

const TYPED =
  'Marlow Ashford declares that each exhibit attached to this declaration is a true and correct copy.';

function run(text: string, extra: Partial<LayoutTextRun> = {}): LayoutTextRun {
  return {
    text,
    x: 96,
    y: 700,
    width: 400,
    sizePt: 12,
    fontKey: 'f1',
    role: 'body',
    eol: false,
    ...extra,
  };
}

function page(number: number, runs: LayoutTextRun[], extra: Partial<PageLayout> = {}): PageLayout {
  return {
    page: number,
    size: { width: 612, height: 792 },
    rotation: 0,
    fonts: { f1: { name: 'Times-Roman', family: 'serif', bold: false, italic: false } },
    runs,
    images: [],
    rules: [],
    printedPageNumber: null,
    ...extra,
  };
}

const typed = (number: number): PageLayout => page(number, [run(TYPED)]);
const bareScan = (number: number): PageLayout => page(number, []);
/** A scan whose words were recognized: invisible text under the picture. */
const recognizedScan = (number: number): PageLayout =>
  page(number, [
    run('Recognized words of a signed trust instrument, page after page.', { hidden: true }),
  ]);
const fullPagePicture = {
  rect: { x: 0, y: 0, width: 612, height: 792 },
  png: new Uint8Array([1]),
  widthPx: 10,
  heightPx: 10,
};
const picture: PagePicture = { data: new Uint8Array([9, 9, 9]), type: 'jpg' };

describe('picturePagesOf', () => {
  it('picks the scans behind typed pages, recognized or not', () => {
    const layouts = [typed(1), typed(2), bareScan(3), recognizedScan(4)];
    expect(picturePagesOf(layouts)).toEqual([3, 4]);
  });

  it('gives the same answer before and after recognition', () => {
    expect(picturePagesOf([typed(1), bareScan(2)])).toEqual(
      picturePagesOf([typed(1), recognizedScan(2)])
    );
  });

  it('leaves a document that is scans throughout as editable text', () => {
    expect(picturePagesOf([recognizedScan(1), recognizedScan(2), bareScan(3)])).toEqual([]);
  });

  it('leaves a scanned first page in front of the typed pages as text', () => {
    expect(picturePagesOf([recognizedScan(1), typed(2), typed(3)])).toEqual([]);
  });

  it('keeps a typed slip sheet as text', () => {
    const slip = page(2, [run('EXHIBIT A')]);
    expect(picturePagesOf([typed(1), slip, bareScan(3)])).toEqual([3]);
  });

  it('treats a few typed words over a full-page picture as a label on a scan', () => {
    const labelled = page(2, [run('Exhibit 4')], { images: [fullPagePicture] });
    const footed = page(3, [run('Ashford Trust, page 5', { role: 'footer' })]);
    expect(picturePagesOf([typed(1), labelled, footed])).toEqual([2, 3]);
  });
});

describe('picturesToKeep and partsOf', () => {
  it('keeps a picture page on the text path when nobody drew it', () => {
    const layouts = [typed(1), bareScan(2), bareScan(3)];
    const kept = picturesToKeep(layouts, new Map([[3, picture]]));
    expect([...kept.keys()]).toEqual([3]);
    expect(picturesToKeep(layouts, undefined).size).toBe(0);
    expect(
      picturesToKeep(layouts, new Map([[2, { data: new Uint8Array(), type: 'jpg' }]])).size
    ).toBe(0);
  });

  it('never keeps a picture for a page the rule did not pick', () => {
    expect(picturesToKeep([typed(1), typed(2)], new Map([[2, picture]])).size).toBe(0);
  });

  it('splits the document in page order', () => {
    const layouts = [typed(1), typed(2), bareScan(3), typed(4), bareScan(5)];
    const parts = partsOf(
      layouts,
      new Map([
        [3, picture],
        [5, picture],
      ])
    );
    expect(
      parts.map((part) =>
        part.kind === 'text' ? part.layouts.map((l) => l.page) : part.layout.page
      )
    ).toEqual([[1, 2], 3, [4], 5]);
  });
});

describe('the receipt', () => {
  it('folds runs of pages', () => {
    expect(pageRanges([6, 8, 10, 11, 12, 93])).toBe('6, 8, 10–12, 93');
  });

  it('is recognised as something kept', () => {
    expect(isPicturePagesNote(picturePagesNote([2]))).toBe(true);
    expect(isPicturePagesNote(picturePagesNote([2, 3]))).toBe(true);
    expect(isPicturePagesNote('Bates numbers were left out.')).toBe(false);
  });
});

describe('buildDocx with picture pages', () => {
  it('gives each exhibit a sheet of its own with its own header, and says so', async () => {
    const layouts = [typed(1), recognizedScan(2), bareScan(3), typed(4)];
    const build = await buildDocx(layouts, {
      pagePictures: new Map([
        [2, picture],
        [3, picture],
      ]),
    });
    const zip = await JSZip.loadAsync(build.bytes);
    const xml = await zip.file('word/document.xml')!.async('string');
    const sections = xml.match(/<w:sectPr.*?<\/w:sectPr>/gs) ?? [];
    expect(sections).toHaveLength(4);
    expect(sections.every((section) => section.includes('headerReference'))).toBe(true);
    expect(xml.match(/<w:drawing>/g)).toHaveLength(2);
    expect(xml).not.toContain('Recognized words');
    expect(
      Object.keys(zip.files).filter((name) => /media\/.*\.jpg$/.test(name)).length
    ).toBeGreaterThan(0);
    expect(build.pageCount).toBe(4);
    expect(build.receipt.kept).toContain(picturePagesNote([2, 3]));
    expect(build.receipt.dropped).toEqual([]);
  });

  it('without pictures, exports the recognized text as before', async () => {
    const build = await buildDocx([typed(1), recognizedScan(2)]);
    const xml = await (
      await JSZip.loadAsync(build.bytes)
    )
      .file('word/document.xml')!
      .async('string');
    expect(xml).toContain('Recognized words');
    expect(xml).not.toContain('<w:drawing>');
  });
});
