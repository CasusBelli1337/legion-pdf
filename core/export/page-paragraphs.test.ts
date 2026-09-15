import { describe, expect, it } from 'vitest';
import { pageParagraphs, settlePage, isTranscript } from './page-paragraphs';
import { sectionGeometry } from './page-setup';
import { image, page, paragraphLines, run } from './layout-testkit';

describe('pageParagraphs and settlePage', () => {
  it('reports the page box from the first line box top to the last line box bottom', () => {
    const layout = page([...paragraphLines(2, 700), ...paragraphLines(2, 630)]);
    const build = pageParagraphs(layout, sectionGeometry([layout]));
    expect(build.box.top).toBeCloseTo(700 + 0.8 * 14);
    expect(build.box.bottom).toBeCloseTo(616 - 0.2 * 14);
  });

  it('turns the gap above a paragraph into space-before, starting from the top of the body', () => {
    const layout = page([...paragraphLines(2, 700), ...paragraphLines(2, 630)]);
    const build = pageParagraphs(layout, sectionGeometry([layout]));
    const paragraphs = settlePage(build, build.box.top);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]!.spaceBeforePt).toBeCloseTo(0);
    // Baselines 686 → 630 is 56pt; on a 14pt pitch that leaves 42pt of space.
    expect(paragraphs[1]!.spaceBeforePt).toBeCloseTo(42);
  });

  it('lays a two-column page as two flows, the second opening with a column break', () => {
    const left = Array.from({ length: 4 }, (_unused, index) =>
      run('L'.padEnd(33, 'a'), 72, 700 - index * 14)
    );
    const right = Array.from({ length: 4 }, (_unused, index) =>
      run('R'.padEnd(33, 'b'), 342, 700 - index * 14)
    );
    const layout = page([...left, ...right]);
    const geometry = sectionGeometry([layout]);
    expect(geometry.columns.count).toBe(2);
    expect(geometry.columns.secondLeft).toBe(342);
    const build = pageParagraphs(layout, geometry);
    expect(build.columns).toHaveLength(2);
    const paragraphs = settlePage(build, build.box.top);
    const breaks = paragraphs.map((p) => p.columnBreakBefore === true);
    expect(breaks.filter(Boolean)).toHaveLength(1);
    expect(breaks[0]).toBe(false);
    // Column two's paragraph is measured from its own left edge, so no indent.
    const second = paragraphs.find((p) => p.columnBreakBefore === true);
    expect(second?.kind === 'text' && second.indentLeftPt).toBe(0);
  });

  it('slots a picture between paragraphs by position', () => {
    const layout = page([...paragraphLines(2, 700), ...paragraphLines(2, 400)], {
      images: [image(72, 450, 200, 150)],
    });
    const build = pageParagraphs(layout, sectionGeometry([layout]));
    expect(settlePage(build, build.box.top).map((p) => p.kind)).toEqual(['text', 'image', 'text']);
  });

  it('expresses pleading-paper gaps as numbered blank lines on the pitch', () => {
    const numbers = Array.from({ length: 28 }, (_unused, index) =>
      run(String(index + 1), 54, 720 - index * 24, { sizePt: 10, role: 'line-number', width: 5 })
    );
    const body = [
      run('Q. First question here.', 90, 696, { sizePt: 11 }),
      run('A. First answer here.', 90, 672, { sizePt: 11 }),
      run('Q. Second question, two lines down.', 90, 624, { sizePt: 11 }),
    ];
    const layout = page([...numbers, ...body]);
    const build = pageParagraphs(layout, sectionGeometry([layout]));
    expect(build.pleading?.pitchPt).toBe(24);
    // The numbered column, not the text, sets the page box: line 1 to line 28.
    expect(build.box.top).toBeCloseTo(720 + 0.8 * 24);
    expect(build.box.bottom).toBeCloseTo(72 - 0.2 * 24);
    const paragraphs = settlePage(build, build.box.top);
    const shapes = paragraphs.map((p) => (p.kind === 'text' ? p.lines.length : 'image'));
    // Text starts on line 2 (one blank above), then line 3, blank line 4, line 5.
    expect(shapes).toEqual([0, 1, 1, 0, 1]);
    expect(paragraphs.every((p) => p.kind === 'text' && p.leadingPt === 24)).toBe(true);
    expect(build.notes.join(' ')).toMatch(/line numbers and rules/);
  });
});

describe('pageParagraphs — leadings that never overlap, transcripts, numbered blanks', () => {
  it('shrinks a lone heading’s line box so the paragraph under it keeps its own pitch', () => {
    const layout = page([
      run('B. A Heading Set Close Above Its Text', 72, 480, { fontKey: 'timesBold' }),
      ...paragraphLines(3, 458.4, { pitch: 24 }),
    ]);
    const build = pageParagraphs(layout, sectionGeometry([layout]));
    const [heading, body] = settlePage(build, build.box.top);
    expect(body?.kind === 'text' && body.leadingPt).toBe(24);
    // 21.6 pt from heading to text: 0.2 × heading + 0.8 × 24 must fit, so the heading gets 12.
    expect(heading?.kind === 'text' && heading.leadingPt).toBeCloseTo(12, 3);
    expect(body?.spaceBeforePt).toBe(0);
  });

  it('keeps every line of a Courier transcript as its own paragraph', () => {
    const numbers = Array.from({ length: 25 }, (_unused, index) =>
      run(String(index + 1), 54, 720 - index * 24, {
        role: 'line-number',
        width: 6,
        fontKey: 'courier',
      })
    );
    const body = [
      run('     Q.   Good morning.  Would you state your name', 90, 696, { fontKey: 'courier' }),
      run('for the record, please.', 90, 672, { fontKey: 'courier' }),
      run('     A.   Kenji Strand-Oyelaran.', 90, 648, { fontKey: 'courier' }),
    ];
    const layout = page([...numbers, ...body]);
    expect(isTranscript(layout)).toBe(true);
    const build = pageParagraphs(layout, sectionGeometry([layout]));
    expect(build.columns[0]?.filter((p) => p.kind === 'text' && p.lines.length > 0)).toHaveLength(
      3
    );
  });

  it('gives numbers that follow the text an empty paragraph wherever a number had no text', () => {
    const numbers = [700, 688, 676, 664, 640, 616, 592, 568, 544, 520, 496, 472].map((y, index) =>
      run(String(index + 1), 54, y, { role: 'line-number', width: 6 })
    );
    const text = [700, 688, 676, 640, 616, 592, 568, 544, 520, 496, 472].map((y) =>
      run('A line of text beside its number', 90, y)
    );
    const layout = page([...numbers, ...text]);
    const geometry = sectionGeometry([layout]);
    expect(geometry.pleading?.grid).toBe(false);
    const build = pageParagraphs(layout, geometry);
    const blanks = build.columns[0]?.filter((p) => p.kind === 'text' && p.lines.length === 0) ?? [];
    expect(blanks).toHaveLength(1);
    const blank = blanks[0];
    expect(blank?.kind === 'text' ? blank.leadingPt : null).toBeCloseTo(24, 3);
  });
});

describe('pageParagraphs — recognised text', () => {
  it('keeps every OCR line its own paragraph, running to the margin', () => {
    const scan = [
      run('Recognized first line of the scan that ends short', 90, 700, { hidden: true }),
      run('and a second line the OCR read at its own width', 90, 676, { hidden: true }),
      run('third', 90, 652, { hidden: true }),
    ];
    const layout = page(scan);
    const build = pageParagraphs(layout, sectionGeometry([layout]));
    const text = build.columns[0]?.filter((p) => p.kind === 'text') ?? [];
    expect(text).toHaveLength(3);
    expect(text.every((p) => p.kind === 'text' && p.indentRightPt <= 0)).toBe(true);
  });
});
