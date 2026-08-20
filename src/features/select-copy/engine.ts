/**
 * `SelectCopyEngine` from `contract.ts`, assembled from the pure passes and
 * given the one thing they cannot have: memory of the whole document.
 *
 * Two things need the document rather than the page. Headers and footers are
 * only recognisable as repetition, so a sample of pages is read once and cached.
 * And a printed page number is believed far more readily when the page before
 * it printed one less — which is how volume 3 of a transcript, printed 412 on
 * PDF page 7, survives a rule that otherwise trusts closeness to the PDF index.
 *
 * The cache is per document because the engine is per document: a new file gets
 * a new engine, so nothing classified for one PDF can be read against another.
 */

import type { CiteRange, PageClassification, SelectCopyEngine } from './contract';
import type { PdfRect } from '@shared/types';
import { mergeQuadsIntoLines } from '../redact/mark-geometry';
import { citeForSelection } from './cite';
import type { CiteConfidence } from './cite';
import { asSelection, isSelectedRuns, normalizeRuns, runsFromSelection } from './dom-selection';
import type { SelectedRun } from './dom-selection';
import { quadForSlice } from './item-geometry';
import { classifyPage } from './page-classifier';
import type { ClassifiedPage, DocumentContext, PageInput } from './page-classifier';
import { reconcilePrintedNumbers } from './printed-page';
import { repeatedBandText } from './repeated-bands';
import { smartTextFor } from './smart-text';
import type { PageSelection } from './smart-text';

/** Where the engine gets its pages. One implementation reads pdfjs; tests hand pages in. */
export interface PageItemSource {
  docId: string;
  pageCount: number;
  loadPage(page: number): Promise<PageInput>;
}

/** One page's share of a selection, ready for the stamp and redaction lanes. */
export interface SelectionPage {
  page: number;
  text: string;
  /** One rectangle per LINE, in PDF user space. */
  quads: PdfRect[];
}

export interface SelectionPayload {
  docId: string;
  text: string;
  cite: CiteRange | null;
  citeConfidence: CiteConfidence;
  pages: SelectionPage[];
}

/** The engine plus the one extra the selection menu needs: everything in one pass. */
export interface SelectCopyEngineHandle extends SelectCopyEngine {
  docId: string;
  selectionPayload(selection: unknown): Promise<SelectionPayload | null>;
  /** The document's source label, e.g. "Rothrock Decl.". '' when unset. */
  readonly citePrefix: string;
  setCitePrefix(prefix: string): void;
}

/** Pages read to learn the running head. More than this buys nothing. */
const CONTEXT_SAMPLE = 8;

function sampledPages(pageCount: number): number[] {
  const wanted = Math.min(CONTEXT_SAMPLE, pageCount);
  const step = Math.max(1, Math.floor(pageCount / wanted));
  const pages: number[] = [];
  for (let page = 1; page <= pageCount && pages.length < wanted; page += step) pages.push(page);
  return pages;
}

class Engine implements SelectCopyEngineHandle {
  readonly docId: string;
  readonly #source: PageItemSource;
  readonly #pages = new Map<number, Promise<ClassifiedPage>>();
  #context: Promise<DocumentContext> | null = null;
  #citePrefix = '';

  constructor(source: PageItemSource) {
    this.#source = source;
    this.docId = source.docId;
  }

  get citePrefix(): string {
    return this.#citePrefix;
  }

  setCitePrefix(prefix: string): void {
    this.#citePrefix = prefix.trim();
  }

  async classifyPage(page: number): Promise<PageClassification> {
    return (await this.#reconciled(page)).classification;
  }

  async smartText(selection: unknown): Promise<string> {
    return smartTextFor(await this.#selectionsFor(selection));
  }

  async citeFor(selection: unknown): Promise<CiteRange | null> {
    return citeForSelection(await this.#selectionsFor(selection), this.#citePrefix).cite;
  }

  async selectionPayload(selection: unknown): Promise<SelectionPayload | null> {
    const selections = await this.#selectionsFor(selection);
    if (selections.length === 0) return null;
    const { cite, confidence } = citeForSelection(selections, this.#citePrefix);
    const text = smartTextFor(selections);
    if (text.length === 0) return null;
    return {
      docId: this.docId,
      text,
      cite,
      citeConfidence: confidence,
      pages: selections.map(pageQuads).filter((entry) => entry.quads.length > 0),
    };
  }

  /** The document-wide facts, read once and shared by every page after. */
  #documentContext(): Promise<DocumentContext> {
    this.#context ??= (async () => {
      const pages = await Promise.all(
        sampledPages(this.#source.pageCount).map(async (page) => {
          const input = await this.#source.loadPage(page);
          return { items: classifyPage(input).positioned, size: input.size };
        })
      );
      return { repeatedBandText: repeatedBandText(pages) };
    })();
    return this.#context;
  }

  #classified(page: number): Promise<ClassifiedPage> {
    if (page < 1 || page > this.#source.pageCount) {
      return Promise.reject(new RangeError(`Page ${page} is outside this document.`));
    }
    const cached = this.#pages.get(page);
    if (cached !== undefined) return cached;
    const pending = (async () => {
      const context = await this.#documentContext();
      return classifyPage(await this.#source.loadPage(page), context);
    })();
    this.#pages.set(page, pending);
    return pending;
  }

  /**
   * The page, with its printed number re-judged against the pages either side.
   * A condensed sheet is exempt: its number is printed on its own mini-pages,
   * and four transcript pages per sheet never run consecutively sheet to sheet.
   */
  async #reconciled(page: number): Promise<ClassifiedPage> {
    const own = await this.#classified(page);
    if (own.regions.length > 1) return own;
    const neighbours = [page - 1, page, page + 1].filter(
      (candidate) => candidate >= 1 && candidate <= this.#source.pageCount
    );
    const classified = await Promise.all(neighbours.map((each) => this.#classified(each)));
    const observed = new Map(
      classified.map((each) => [
        each.classification.page,
        {
          value: each.classification.printedPageNumber,
          confidence: each.classification.printedNumberConfidence,
          itemIndex: null,
        },
      ])
    );
    const verdict = reconcilePrintedNumbers(observed).get(page);
    const self = classified[neighbours.indexOf(page)];
    if (self === undefined) throw new RangeError(`Page ${page} could not be classified.`);
    if (verdict === undefined) return self;
    return {
      ...self,
      classification: { ...self.classification, printedNumberConfidence: verdict.confidence },
    };
  }

  async #selectionsFor(selection: unknown): Promise<PageSelection[]> {
    const runs = runsOf(selection);
    const pages = [...new Set(runs.map((run) => run.page))].sort((a, b) => a - b);
    const classified = await Promise.all(pages.map((page) => this.#reconciled(page)));
    return classified.map((page, index) => ({
      page,
      slices: runs
        .filter((run) => run.page === pages[index])
        .map((run) => ({ itemIndex: run.itemIndex, from: run.from, to: run.to })),
    }));
  }
}

function runsOf(selection: unknown): SelectedRun[] {
  if (isSelectedRuns(selection)) return normalizeRuns(selection);
  return runsFromSelection(asSelection(selection));
}

/**
 * One page's selected body text as line rectangles. The quads are merged per
 * line the same way a search hit's are, so a highlight drawn over a selection
 * has no hairline seams between the words.
 */
function pageQuads(selection: PageSelection): SelectionPage {
  const quads: PdfRect[] = [];
  let text = '';
  for (const slice of selection.slices) {
    const item = selection.page.positioned[slice.itemIndex];
    if (item === undefined || selection.page.roles.get(slice.itemIndex) !== 'body') continue;
    quads.push(quadForSlice(item.item, slice.from, slice.to));
    text += item.item.str.slice(slice.from, slice.to);
  }
  return {
    page: selection.page.classification.page,
    text: text.trim(),
    quads: quads.length === 0 ? [] : mergeQuadsIntoLines(quads),
  };
}

export function createSelectCopyEngine(source: PageItemSource): SelectCopyEngineHandle {
  return new Engine(source);
}
