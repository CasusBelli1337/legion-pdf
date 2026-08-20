/**
 * The selection-intelligence contract: what the app knows about the TEXT on a
 * page beyond "here are some glyphs". Types only — no logic lives here, by
 * design, because two lanes meet on this file and neither should have to read
 * the other's code to build against it.
 *
 * Consumer 1 — the VIEWER. It wires `TextRole` into the text layer: line
 * numbers down the margin of a deposition, the page number in the footer, and
 * the Bates stamp are all real text that an attorney never means to copy. The
 * viewer marks those spans off the roles reported here so a drag over a
 * paragraph yields the paragraph.
 *
 * Consumer 2 — the ENGINE lane. It implements `SelectCopyEngine`: classify a
 * page, hand back the clean text for a selection, and turn that selection into
 * the record cite an attorney would type by hand ("(5:10-15)"). Page and line
 * numbers PRINTED on the page are the ones that go in a brief — never the PDF's
 * own index, which is off by every cover sheet and exhibit tab in the file.
 */

/** What a run of text on the page is FOR, which decides whether it is copied. */
export type TextRole = 'body' | 'line-number' | 'page-number' | 'header' | 'footer' | 'stamp';

export interface ClassifiedItem {
  /** pdfjs textContent item index within its page. */
  itemIndex: number;
  role: TextRole;
}

export interface PageClassification {
  page: number;
  items: ClassifiedItem[];
  /** The number PRINTED on the page, not the PDF index. Null when there is none. */
  printedPageNumber: number | null;
  printedNumberConfidence: 'high' | 'low';
  /**
   * The x-bands holding pleading line numbers. `quadrant` is the numbered
   * column when a page carries several (a 4-up condensed transcript), null on
   * an ordinary single-column page.
   */
  lineNumberColumns: Array<{ xMin: number; xMax: number; quadrant: 0 | 1 | 2 | 3 | null }>;
}

/** A record cite for a selection, already rendered the way it is typed in a brief. */
export interface CiteRange {
  startPage: number;
  startLine: number | null;
  endPage: number;
  endLine: number | null;
  /** e.g. "(5:10-15)" or "(5:10-6:2)" or "(5)". */
  formatted: string;
}

export interface SelectCopyEngine {
  classifyPage(page: number): Promise<PageClassification>;
  /** The selection's text with the non-body roles dropped and hyphenation healed. */
  smartText(selection: unknown): Promise<string>;
  /** Null when the selection cannot be pinned to a page — never a guessed cite. */
  citeFor(selection: unknown): Promise<CiteRange | null>;
}
