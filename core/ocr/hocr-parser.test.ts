/**
 * Fixtures are REAL Tesseract 5 hOCR, captured from a 300 DPI raster of a
 * generated exhibit page — not hand-written approximations of the format.
 */

import { describe, expect, it } from 'vitest';
import { characterCount, decodeEntities, parseHocr, wordTextOf } from './hocr-parser';
import { HocrParseError } from './types';

const REAL_HOCR = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
    "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
 <head>
  <title></title>
  <meta name='ocr-system' content='tesseract 5.3.4' />
 </head>
 <body>
  <div class='ocr_page' id='page_1' title='image "page-1.png"; bbox 0 0 2550 3300; ppageno 0; scan_res 300 300'>
   <div class='ocr_carea' id='block_1_1' title="bbox 302 328 1658 551">
    <p class='ocr_par' id='par_1_1' lang='eng' title="bbox 302 328 1658 551">
     <span class='ocr_line' id='line_1_1' title="bbox 306 328 1658 384; baseline -0.001 0; x_size 64.7">
      <span class='ocrx_word' id='word_1_1' title='bbox 306 328 702 384; x_wconf 96'>SUPERIOR</span>
      <span class='ocrx_word' id='word_1_2' title='bbox 726 328 1005 384; x_wconf 96'>COURT</span>
      <span class='ocrx_word' id='word_1_3' title='bbox 1029 328 1130 384; x_wconf 96'>OF</span>
      <span class='ocrx_word' id='word_1_4' title='bbox 1157 328 1658 384; x_wconf 95'>CALIFORNIA</span>
     </span>
    </p>
   </div>
   <div class='ocr_carea' id='block_1_2' title="bbox 304 677 706 717">
    <p class='ocr_par' id='par_1_2' lang='eng' title="bbox 304 677 706 717">
     <span class='ocr_line' id='line_1_3' title="bbox 304 677 706 717; baseline -0.002 0">
      <span class='ocrx_word' id='word_1_13' title='bbox 304 677 706 717; x_wconf 32'>ASHFORD000123</span>
     </span>
    </p>
   </div>
  </div>
 </body>
</html>`;

const EMPTY_PAGE_HOCR = `<html><body>
 <div class='ocr_page' id='page_1' title='image "blank.png"; bbox 0 0 1275 1650; ppageno 0'>
 </div>
</body></html>`;

describe('parseHocr', () => {
  it('reads the raster size from the ocr_page bbox', () => {
    const page = parseHocr(REAL_HOCR);
    expect(page.widthPx).toBe(2550);
    expect(page.heightPx).toBe(3300);
  });

  it('returns every word in reading order with box and confidence', () => {
    const page = parseHocr(REAL_HOCR);
    expect(page.words.map((word) => word.text)).toEqual([
      'SUPERIOR',
      'COURT',
      'OF',
      'CALIFORNIA',
      'ASHFORD000123',
    ]);
    expect(page.words[0]).toEqual({
      text: 'SUPERIOR',
      box: { x0: 306, y0: 328, x1: 702, y1: 384 },
      confidence: 96,
    });
    expect(page.words[4]?.confidence).toBe(32);
  });

  it('accepts a page Tesseract found no words on (blankness is decided elsewhere)', () => {
    const page = parseHocr(EMPTY_PAGE_HOCR);
    expect(page.words).toEqual([]);
    expect(page.widthPx).toBe(1275);
  });

  it('handles double-quoted titles, nested markup, and entities', () => {
    const page = parseHocr(
      `<div class="ocr_page" title="bbox 0 0 100 200">
        <span class="ocrx_word" title="bbox 1 2 30 20; x_wconf 88"><strong>Smith</strong> &amp; <em>Co.</em></span>
       </div>`
    );
    expect(page.words).toHaveLength(1);
    expect(page.words[0]?.text).toBe('Smith & Co.');
    expect(page.words[0]?.confidence).toBe(88);
  });

  it('drops word spans that contain no text at all', () => {
    const page = parseHocr(
      `<div class='ocr_page' title='bbox 0 0 100 200'>
        <span class='ocrx_word' title='bbox 1 2 3 4; x_wconf 0'>  </span>
       </div>`
    );
    expect(page.words).toEqual([]);
  });

  it('throws when there is no ocr_page element', () => {
    expect(() => parseHocr('<html><body>nothing here</body></html>')).toThrow(HocrParseError);
  });

  it('throws on empty output rather than reporting a blank page', () => {
    expect(() => parseHocr('   ')).toThrow(/no hOCR output/);
  });

  it('throws when a word carries text but no bbox', () => {
    expect(() =>
      parseHocr(
        `<div class='ocr_page' title='bbox 0 0 100 200'>
          <span class='ocrx_word' title='x_wconf 90'>Orphan</span>
         </div>`
      )
    ).toThrow(/no bbox/);
  });

  it('throws when a word bbox has collapsed to no area', () => {
    expect(() =>
      parseHocr(
        `<div class='ocr_page' title='bbox 0 0 100 200'>
          <span class='ocrx_word' title='bbox 10 20 10 20; x_wconf 90'>Flat</span>
         </div>`
      )
    ).toThrow(/collapsed bbox/);
  });

  it('throws when a word span is never closed', () => {
    expect(() =>
      parseHocr(
        `<div class='ocr_page' title='bbox 0 0 100 200'>
          <span class='ocrx_word' title='bbox 1 2 3 4'>Truncated`
      )
    ).toThrow(/never closed/);
  });
});

describe('decodeEntities', () => {
  it('decodes named, decimal, and hex references', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x2014; f')).toBe(
      'a & b <c> "d" \'e\' — f'
    );
  });

  it('leaves an unknown entity untouched rather than eating it', () => {
    expect(decodeEntities('&notanentity;')).toBe('&notanentity;');
  });
});

describe('wordTextOf', () => {
  it('collapses whitespace introduced by pretty-printed hOCR', () => {
    expect(wordTextOf('\n   Hello\n   ')).toBe('Hello');
  });
});

describe('characterCount', () => {
  it('sums the characters of every recognized word', () => {
    expect(characterCount(parseHocr(REAL_HOCR).words)).toBe(
      'SUPERIOR'.length + 'COURT'.length + 'OF'.length + 'CALIFORNIA'.length + 'ASHFORD000123'.length
    );
  });
});
