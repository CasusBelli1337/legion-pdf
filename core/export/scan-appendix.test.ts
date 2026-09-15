import { describe, expect, it } from 'vitest';
import { buildDocx } from './build-docx';
import { SCAN_APPENDIX_HEADING, scanAppendixSections } from './scan-appendix';
import { image, page, run } from './layout-testkit';
import { documentXmlOf } from './verify';

function scanned(pageNumber: number, size = { width: 612, height: 792 }) {
  return page([run(`Recognized text of page ${pageNumber}.`, 72, 700, { hidden: true })], {
    page: pageNumber,
    size,
    images: [image(0, 0, size.width, size.height)],
  });
}

function typed(pageNumber: number) {
  return page([run(`Typed page ${pageNumber}, no picture here.`, 72, 700)], { page: pageNumber });
}

describe('scanAppendixSections', () => {
  it('answers nothing unless the attorney asked for an appendix', () => {
    const layouts = [scanned(1), scanned(2)];
    expect(scanAppendixSections(layouts, 'omit')).toEqual([]);
    expect(scanAppendixSections(layouts, 'behind')).toEqual([]);
    expect(scanAppendixSections(layouts, 'appendix')).toHaveLength(2);
  });

  it('answers one section per SCANNED page and skips the typed ones', () => {
    const sections = scanAppendixSections([scanned(1), typed(2), scanned(3)], 'appendix');
    expect(sections).toHaveLength(2);
  });

  it('answers nothing when no page is a scan', () => {
    expect(scanAppendixSections([typed(1), typed(2)], 'appendix')).toEqual([]);
  });
});

describe('the appendix in the built file', () => {
  it('heads the first picture and gives every scan its own edge-to-edge sheet', async () => {
    const build = await buildDocx([scanned(1), typed(2), scanned(3)], {
      scanPictures: 'appendix',
    });
    const xml = await documentXmlOf(build.bytes);
    expect(xml).toContain(SCAN_APPENDIX_HEADING);
    // The body's own section, then one per scan.
    expect(xml.match(/<w:sectPr>/g)).toHaveLength(3);
    expect(xml.match(/<wp:inline/g)).toHaveLength(2);
    // Edge to edge on every appendix sheet; the heading band comes off the
    // first PICTURE, not the margin, so the heading cannot cost a whole page.
    expect(xml.match(/<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0"/g)).toHaveLength(2);
  });

  it('fits each picture inside its own sheet, never past it', async () => {
    const build = await buildDocx([scanned(1)], { scanPictures: 'appendix' });
    const xml = await documentXmlOf(build.bytes);
    const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml);
    const emuPerPoint = (96 / 72) * 9525;
    expect(Number(extent![1])).toBeLessThanOrEqual(Math.round(612 * emuPerPoint));
    // 792pt sheet less the 36pt heading band.
    expect(Number(extent![2])).toBeLessThanOrEqual(Math.round(756 * emuPerPoint) + emuPerPoint);
  });

  it('keeps a legal-size scan on legal-size paper', async () => {
    const build = await buildDocx([scanned(1, { width: 612, height: 1008 })], {
      scanPictures: 'appendix',
    });
    const xml = await documentXmlOf(build.bytes);
    expect(xml).toContain('<w:pgSz w:w="12240" w:h="20160" w:orient="portrait"/>');
  });
});
