import { describe, expect, it } from 'vitest';
import { buildDocx } from './build-docx';
import { ANCHOR_LINE_TWIPS } from './docx-image';
import { image, page, run } from './layout-testkit';
import { documentXmlOf } from './verify';

/** One scanned page: a full-page picture under the invisible text OCR wrote. */
function scanned(pageNumber: number) {
  return page(
    [
      run('THE WITNESS: I never saw that page before today.', 72, 700, { hidden: true }),
      run('MR. HALVERSON: Objection, form.', 72, 676, { hidden: true }),
    ],
    { page: pageNumber, images: [image(0, 0, 612, 792)] }
  );
}

async function xmlFor(scanPictures: 'omit' | 'behind' | 'appendix'): Promise<string> {
  const build = await buildDocx([scanned(1)], { scanPictures });
  return documentXmlOf(build.bytes);
}

describe('a scan kept behind the recognized text', () => {
  it('anchors the picture to the page, behind the document, with no wrapping', async () => {
    const xml = await xmlFor('behind');
    expect(xml).toContain('<wp:anchor');
    expect(xml).toContain('behindDoc="1"');
    expect(xml).toContain('<wp:positionH relativeFrom="page">');
    expect(xml).toContain('<wp:positionV relativeFrom="page">');
    expect(xml).toContain('<wp:wrapNone');
  });

  it('sizes it to the whole sheet — 612 x 792 pt in EMU', async () => {
    const xml = await xmlFor('behind');
    const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml);
    expect(extent).not.toBeNull();
    // 96 CSS px per inch through the docx package, 9525 EMU per px.
    expect(Number(extent![1])).toBe(Math.round((612 * 96) / 72) * 9525);
    expect(Number(extent![2])).toBe(Math.round((792 * 96) / 72) * 9525);
  });

  it('carries the anchor on an exact 1-twip line, so no text is pushed down', async () => {
    const xml = await xmlFor('behind');
    expect(xml).toContain(`w:line="${ANCHOR_LINE_TWIPS}"`);
    expect(xml).toMatch(/w:lineRule="exact"[^>]*w:line="1"|w:line="1"[^>]*w:lineRule="exact"/);
    expect(xml).toContain('THE WITNESS: I never saw that page before today.');
  });

  it("'omit' puts no picture in the file at all", async () => {
    const xml = await xmlFor('omit');
    expect(xml).not.toContain('<wp:anchor');
    expect(xml).not.toContain('<wp:inline');
  });

  it("'appendix' anchors nothing in the body — its picture is a section of its own", async () => {
    const body = (await xmlFor('appendix')).split('<w:sectPr>')[0] ?? '';
    expect(body).not.toContain('<wp:anchor');
    expect(body).not.toContain('<wp:inline');
  });

  it('leaves an ordinary picture inline, never anchored', async () => {
    const letter = page([run('The photograph below was taken that morning.', 72, 700)], {
      images: [image(72, 500, 240, 120)],
    });
    const build = await buildDocx([letter], { scanPictures: 'behind' });
    const xml = await documentXmlOf(build.bytes);
    expect(xml).toContain('<wp:inline');
    expect(xml).not.toContain('<wp:anchor');
  });
});
