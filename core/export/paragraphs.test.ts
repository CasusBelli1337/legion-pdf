import { describe, expect, it } from 'vitest';
import { linesOf } from './lines';
import { alignmentOf, medianLeading, paragraphsOf } from './paragraphs';
import { paragraphLines, run } from './layout-testkit';

const FRAME = { left: 72, right: 540, textRight: 540 };

/** A line of `chars` characters at 12pt spans chars × 6 points. */
function line(chars: number, x: number, y: number) {
  return run('x'.repeat(chars), x, y);
}

describe('medianLeading', () => {
  it('is the typical baseline gap', () => {
    const lines = linesOf(paragraphLines(5, 700, { pitch: 14 }));
    expect(medianLeading(lines)).toBe(14);
  });

  it('falls back to 1.2 × size for a lone line', () => {
    expect(medianLeading(linesOf([run('alone', 72, 700)]))).toBeCloseTo(14.4);
  });
});

describe('paragraphsOf — where a paragraph ends', () => {
  it('keeps evenly spaced full lines together', () => {
    const lines = linesOf([line(78, 72, 700), line(78, 72, 686), line(40, 72, 672)]);
    expect(paragraphsOf(lines, { frame: FRAME })).toHaveLength(1);
  });

  it('breaks at a blank line', () => {
    const lines = linesOf([
      line(78, 72, 700),
      line(78, 72, 686),
      line(78, 72, 658),
      line(40, 72, 644),
    ]);
    const paragraphs = paragraphsOf(lines, { frame: FRAME });
    expect(paragraphs.map((paragraph) => paragraph.lines.length)).toEqual([2, 2]);
    expect(paragraphs[1]!.spaceBeforePt).toBe(0);
  });

  it('breaks where the next line is indented and the one after returns to the margin', () => {
    const lines = linesOf([
      line(78, 72, 700),
      line(78, 72, 686),
      line(72, 108, 672),
      line(78, 72, 658),
    ]);
    const paragraphs = paragraphsOf(lines, { frame: FRAME });
    expect(paragraphs.map((paragraph) => paragraph.lines.length)).toEqual([2, 2]);
    expect(paragraphs[1]!.firstLinePt).toBe(36);
  });

  it('does NOT break for a hanging indent whose continuation lines stay indented', () => {
    const lines = linesOf([line(70, 72, 700), line(70, 108, 686), line(30, 108, 672)]);
    const paragraphs = paragraphsOf(lines, { frame: FRAME });
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.firstLinePt).toBe(-36);
    expect(paragraphs[0]!.indentLeftPt).toBe(36);
  });

  it('breaks after a line that stops well short of the right edge', () => {
    const lines = linesOf([line(78, 72, 700), line(30, 72, 686), line(78, 72, 672)]);
    expect(paragraphsOf(lines, { frame: FRAME }).map((p) => p.lines.length)).toEqual([2, 1]);
  });

  it('starts a paragraph at a transcript question or answer, and at a list item', () => {
    const lines = linesOf([
      run('Q. On transcript page one, did you review the trust instrument?', 90, 720),
      run('A. I did not read the whole document, only the signa-', 90, 696),
      run('ture page that Mr. Pemberton put in front of me.', 90, 672),
      run('1. First item of the list, which runs on for a while.', 90, 640),
      run('2. Second item.', 90, 626),
    ]);
    const paragraphs = paragraphsOf(lines, { frame: { left: 90, right: 522, textRight: 400 } });
    expect(paragraphs.map((paragraph) => paragraph.lines.length)).toEqual([1, 2, 1, 1]);
  });

  it('breaks at a change of size', () => {
    const lines = linesOf([run('HEADING', 72, 700, { sizePt: 16 }), line(78, 72, 682)]);
    expect(paragraphsOf(lines, { frame: FRAME })).toHaveLength(2);
  });

  it('gives every tabular line its own paragraph with the shared tab stops', () => {
    const lines = linesOf([
      run('Fee', 72, 700),
      run('$100', 300, 700),
      run('Costs', 72, 686),
      run('$250', 302, 686),
    ]);
    const paragraphs = paragraphsOf(lines, { frame: FRAME });
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]!.tabStopsPt).toEqual([228]);
    expect(paragraphs[1]!.tabStopsPt).toEqual([230]);
  });
});

describe('alignmentOf', () => {
  it('reads a heading with equal room either side as centered', () => {
    const lines = linesOf([run('NOTICE OF MOTION', 300, 700)]);
    // 16 chars × 6 = 96 wide; left gap 228, right gap 144 — not equal.
    expect(alignmentOf(lines, FRAME)).toBe('left');
    const centered = linesOf([run('NOTICE OF MOTION', 258, 700)]);
    expect(alignmentOf(centered, FRAME)).toBe('center');
  });

  it('reads lines that end flush right with ragged left edges as right-aligned', () => {
    const lines = linesOf([line(20, 420, 700), line(30, 360, 686)]);
    expect(alignmentOf(lines, FRAME)).toBe('right');
  });

  it('reads full lines that all end at the same right edge as justified', () => {
    const lines = linesOf([
      line(78, 72, 700),
      line(78, 72, 686),
      line(78, 72, 672),
      line(20, 72, 658),
    ]);
    expect(alignmentOf(lines, FRAME)).toBe('justify');
  });

  it('reads ragged right edges as left-aligned', () => {
    const lines = linesOf([
      line(78, 72, 700),
      line(70, 72, 686),
      line(74, 72, 672),
      line(20, 72, 658),
    ]);
    expect(alignmentOf(lines, FRAME)).toBe('left');
  });
});

describe('paragraphsOf — indents and spacing', () => {
  it('measures a left indent from the frame', () => {
    const lines = linesOf([line(60, 108, 700), line(60, 108, 686), line(20, 108, 672)]);
    const [paragraph] = paragraphsOf(lines, { frame: FRAME });
    expect(paragraph!.indentLeftPt).toBe(36);
    expect(paragraph!.firstLinePt).toBe(0);
  });

  it('forces every paragraph onto a given pitch', () => {
    const lines = linesOf(paragraphLines(3, 700, { pitch: 24 }));
    const [paragraph] = paragraphsOf(lines, { frame: FRAME, leadingPt: 24 });
    expect(paragraph!.leadingPt).toBe(24);
  });
});

describe('paragraphsOf — what a tagged PDF and a typesetter say', () => {
  const frame = { left: 72, right: 540, textRight: 540 };
  const tagged = (text: string, y: number, id: string, x = 72) => ({
    ...run(text, x, y),
    block: { id, role: 'paragraph' as const },
  });

  it('follows the structure tags for paragraph boundaries when both lines carry one', () => {
    const lines = linesOf([
      tagged('A short line that ended early.', 700, 'b1'),
      tagged('Continues the same tagged paragraph.', 686, 'b1'),
      tagged('A new tagged paragraph at the same edge with no other signal', 672, 'b2'),
    ]);
    expect(paragraphsOf(lines, { frame }).map((p) => p.lines.length)).toEqual([2, 1]);
  });

  it('breaks where the face changes wholesale, as under a bold heading', () => {
    const lines = linesOf([
      run('A. The Interrogatories Seek Information Directly Relevant to Notice', 108, 700, {
        fontKey: 'timesBold',
      }),
      run('Discovery may be had of any matter, not privileged, that is relevant', 108, 678),
      run('to the subject matter of the action, if the matter is itself admissible.', 72, 654),
    ]);
    expect(paragraphsOf(lines, { frame }).map((p) => p.lines.length)).toEqual([1, 2]);
  });

  it('keeps a tagged signature block one line per line: lines in a table cell never flow', () => {
    const cell = (text: string, y: number, block: string) => ({
      ...run(text, 367, y),
      block: { id: `c9/${block}`, role: 'paragraph' as const },
    });
    const lines = linesOf([
      cell('Priya N. Vanterpool', 592, 'b1'),
      cell('Attorneys for Plaintiff', 580, 'b1'),
      cell('MARGARET OKONKWO-REYES', 568, 'b1'),
    ]);
    expect(paragraphsOf(lines, { frame: { left: 100, right: 580, textRight: 576 } })).toHaveLength(
      3
    );
  });

  it('breaks after a line positioned far to the right (a centred name in a transcript)', () => {
    const lines = linesOf([
      run('KENJI M. STRAND-OYELARAN,', 230, 700),
      run('having been first duly sworn, was examined and testified', 90, 676),
      run('as follows:', 90, 652),
    ]);
    // The name stands alone; "…testified" + "as follows:" is one flowing sentence.
    expect(
      paragraphsOf(lines, { frame: { left: 90, right: 540, textRight: 480 } }).map(
        (p) => p.lines.length
      )
    ).toEqual([1, 2]);
  });

  it('sets a paragraph no wider than would let the next line’s first word move up', () => {
    const lines = linesOf([
      run('Units manufactured between March 2023 and January 2024 may', 144, 700, { width: 336 }),
      run('contain a wiring harness whose insulation degrades under sustained', 144, 688, {
        width: 372,
      }),
      run('operation above 85% relative humidity.', 144, 676, { width: 220 }),
    ]);
    const [quote] = paragraphsOf(lines, { frame });
    // Widest line ends at 516; "contain" (~40 pt) after line one (480 + 3) would fit
    // anywhere past 523, so the paragraph may reach 516 + slack but no further.
    expect(quote?.indentRightPt).toBeGreaterThanOrEqual(540 - 523);
    expect(quote?.indentRightPt).toBeLessThanOrEqual(540 - 516);
  });
});
