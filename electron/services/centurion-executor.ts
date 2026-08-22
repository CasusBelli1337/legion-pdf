/**
 * Everything that happens AFTER Centurion proposes a tool call: the plain
 * English the confirm card shows, the gate that waits for the attorney's
 * answer, and the execution itself.
 *
 * The execution deliberately reuses the same core functions, the same progress
 * channel, and the same byte-swap the `stamp:*` and `ops:*` handlers use — a
 * Bates run Centurion starts must be the same operation, verified the same way,
 * as one the Bates panel starts. Nothing here is reached until an approval has
 * come back on `ai:toolDecision`.
 */

import { IPC } from '@shared/ipc';
import type {
  BatesOptions,
  BookmarkNode,
  BookmarkToolNode,
  CenturionToolCall,
  CenturionToolDecision,
  DocumentSession,
  ExhibitOptions,
  PageNumberOptions,
  PageNumberSpot,
  ProgressEvent,
  SignatureFieldsToolInput,
  WatermarkOptions,
} from '@shared/types';
import type { ProgressChannel } from '@shared/ipc';
import type { ProgressReporter } from '@core/ops';
import { setBookmarks } from '@core/ops';
import {
  applyBates,
  applyExhibitStamp,
  applyPageNumbers,
  applyWatermark,
  WATERMARK_GREY,
} from '@core/stamps';

/** House style for the settings the model is not asked to choose. */
const STAMP_FONT_SIZE = 10;
const STAMP_MARGIN = 24;
const WATERMARK_FONT_SIZE = 72;
const PAGE_NUMBER_TEMPLATE = 'Page {n} of {total}';

/** Silence is a refusal: a card nobody answered must never run later. */
export const DECISION_TIMEOUT_MS = 5 * 60_000;

export const TIMED_OUT: CenturionToolDecision = {
  verdict: 'rejected',
  detail: 'No answer after five minutes - skipped.',
};

/* ── the confirm card's sentence ──────────────────────────────────────── */

const POSITION_WORDS: Record<string, string> = {
  'top-left': 'top left',
  'top-center': 'top centre',
  'top-right': 'top right',
  'bottom-left': 'bottom left',
  'bottom-center': 'bottom centre',
  'bottom-right': 'bottom right',
};

/** "all 450 pages" / "page 12" / "pages 3-9" / "12 pages". */
export function pagesPhrase(pages: number[] | undefined, pageCount: number): string {
  if (pages === undefined) return `all ${pageCount} pages`;
  const first = pages[0];
  const last = pages.at(-1);
  if (first === undefined || last === undefined) return 'no pages';
  if (pages.length === 1) return `page ${first}`;
  const contiguous = last - first + 1 === pages.length;
  return contiguous ? `pages ${first}-${last}` : `${pages.length} pages`;
}

function batesLabel(prefix: string, number: number, padWidth: number): string {
  return `${prefix}${String(number).padStart(padWidth, '0')}`;
}

/** "Add 5 e-sign fields for 2 signers to the E-Sign panel (Jane Smith: 3, John Doe: 2)." */
function signatureSummary({ signers, fields }: SignatureFieldsToolInput): string {
  const names = new Map(signers.map((signer) => [signer.email.trim().toLowerCase(), signer.name]));
  const counts = new Map<string, number>();
  for (const field of fields) {
    const name = names.get(field.signerEmail.trim().toLowerCase()) ?? field.signerEmail;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const perSigner = [...counts].map(([name, count]) => `${name}: ${count}`).join(', ');
  return `Add ${fields.length} e-sign field${fields.length === 1 ? '' : 's'} for ${counts.size} signer${counts.size === 1 ? '' : 's'} to the E-Sign panel (${perSigner}).`;
}

/** Config over code: one sentence-writer per tool, so none of them grows a switch. */
const SUMMARIES: {
  [K in CenturionToolCall['name']]: (
    input: Extract<CenturionToolCall, { name: K }>['input'],
    pageCount: number
  ) => string;
} = {
  applyBates: ({ prefix, startNumber, padWidth, pages, position }, pageCount) => {
    const count = pages?.length ?? pageCount;
    const first = batesLabel(prefix, startNumber, padWidth);
    const last = batesLabel(prefix, startNumber + count - 1, padWidth);
    return `Stamp ${first} to ${last} on ${pagesPhrase(pages, pageCount)}, ${POSITION_WORDS[position]}.`;
  },

  applyWatermark: ({ text, orientation, opacityPct, pages }, pageCount) =>
    `Watermark ${pagesPhrase(pages, pageCount)} with "${text}", ${orientation}, ${opacityPct}% strength.`,

  applyExhibitStamp: ({ label, pages, position }, pageCount) =>
    `Stamp "${label}" on ${pagesPhrase(pages, pageCount)}, ${POSITION_WORDS[position]}.`,

  applyPageNumbers: ({ pages, position }, pageCount) =>
    `Number ${pagesPhrase(pages, pageCount)} "Page 1 of ${pages?.length ?? pageCount}", ${POSITION_WORDS[position]}.`,

  setBookmarks: ({ bookmarks }) =>
    `Replace the bookmarks with ${bookmarks.length} entries, starting "${bookmarks[0]?.title}" at page ${bookmarks[0]?.page}.`,

  suggestRedactions: ({ terms }) => {
    const sample = terms.map((term) => `"${term.text}"`).join(', ');
    return `Mark ${terms.length} term${terms.length === 1 ? '' : 's'} for redaction (${sample}). Marks only - nothing is destroyed until you apply redaction yourself.`;
  },

  addSignatureFields: signatureSummary,
};

/** One plain-English sentence per tool. This is what the attorney approves. */
export function summarizeToolCall(call: CenturionToolCall, pageCount: number): string {
  // The table and the call agree on the name by construction; the cast is the
  // one place TypeScript cannot see that for itself.
  const write = SUMMARIES[call.name] as (input: unknown, pageCount: number) => string;
  return write(call.input, pageCount);
}

/* ── waiting for the attorney ─────────────────────────────────────────── */

function keyOf(requestId: string, toolUseId: string): string {
  return `${requestId}::${toolUseId}`;
}

/**
 * The pending confirm cards. One entry per card on screen; `settle` is what the
 * `ai:toolDecision` handler calls, and an unanswered card times out as a
 * refusal rather than hanging the conversation forever.
 */
export class ToolDecisionGate {
  private readonly waiting = new Map<string, (decision: CenturionToolDecision) => void>();

  constructor(private readonly timeoutMs: number = DECISION_TIMEOUT_MS) {}

  /** Resolves when the attorney answers, or with a refusal when he does not. */
  waitFor(requestId: string, toolUseId: string): Promise<CenturionToolDecision> {
    const key = keyOf(requestId, toolUseId);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting.delete(key);
        resolve(TIMED_OUT);
      }, this.timeoutMs);
      this.waiting.set(key, (decision) => {
        clearTimeout(timer);
        this.waiting.delete(key);
        resolve(decision);
      });
    });
  }

  /** False when no card was waiting for this answer — a stale or duplicate click. */
  settle(requestId: string, toolUseId: string, decision: CenturionToolDecision): boolean {
    const resolve = this.waiting.get(keyOf(requestId, toolUseId));
    if (resolve === undefined) return false;
    resolve(decision);
    return true;
  }

  /** Refuse every card still open — the ask died, so nothing may run behind it. */
  abandonAll(): void {
    for (const resolve of [...this.waiting.values()]) resolve(TIMED_OUT);
    this.waiting.clear();
  }

  get pending(): number {
    return this.waiting.size;
  }
}

/* ── execution ────────────────────────────────────────────────────────── */

/** The slice of the IPC context the executor needs. `IpcContext` satisfies it. */
export interface ExecutorHost {
  store: {
    bytes(docId: string): Uint8Array;
    session(docId: string): DocumentSession;
    setBytes(docId: string, bytes: Uint8Array): Promise<DocumentSession>;
  };
  emitProgress(channel: ProgressChannel, event: ProgressEvent): void;
}

/** Omitted pages mean the whole document; a page past the end is a loud error. */
export function resolvePages(pages: number[] | undefined, pageCount: number): number[] {
  if (pages === undefined) return Array.from({ length: pageCount }, (_unused, index) => index + 1);
  const beyond = pages.find((page) => page > pageCount);
  if (beyond !== undefined) {
    throw new RangeError(
      `This document ends at page ${pageCount}, so page ${beyond} does not exist.`
    );
  }
  return pages;
}

function bookmarkTree(nodes: BookmarkToolNode[]): BookmarkNode[] {
  return nodes.map((node) => ({
    title: node.title,
    page: node.page,
    children: bookmarkTree(node.children ?? []),
  }));
}

function numberLayout(spot: PageNumberSpot): Pick<PageNumberOptions, 'placement' | 'alignment'> {
  const [band, side] = spot.split('-');
  return {
    placement: band === 'top' ? 'header' : 'footer',
    alignment: side === 'left' ? 'left' : side === 'right' ? 'right' : 'center',
  };
}

export class CenturionToolExecutor {
  constructor(private readonly host: ExecutorHost) {}

  /** Runs an approved call and returns the receipt quoted back to Centurion. */
  async run(docId: string, call: CenturionToolCall): Promise<string> {
    const pageCount = this.host.store.session(docId).pageCount;
    switch (call.name) {
      case 'applyBates':
        return this.bates(docId, call.input, pageCount);
      case 'applyWatermark':
        return this.watermark(docId, call.input, pageCount);
      case 'applyExhibitStamp':
        return this.exhibit(docId, call.input, pageCount);
      case 'applyPageNumbers':
        return this.pageNumbers(docId, call.input, pageCount);
      case 'setBookmarks':
        return this.bookmarks(docId, call.input.bookmarks);
      case 'suggestRedactions':
        // Marks are made in the renderer, over the viewer's own text search.
        throw new Error('Redaction marks are made in the panel, never in the main process.');
      case 'addSignatureFields':
        // Fields land in the renderer's E-Sign panel, over the viewer's own text search.
        throw new Error('Signature fields are placed in the panel, never in the main process.');
    }
  }

  private reporter(docId: string, phase: string): ProgressReporter {
    return (current, total) =>
      this.host.emitProgress(IPC.stamp.progress, { docId, phase, current, total });
  }

  /** The same swap the stamp handlers make: the store marks the document dirty. */
  private async keep(docId: string, bytes: Uint8Array): Promise<void> {
    await this.host.store.setBytes(docId, bytes);
  }

  private async bates(
    docId: string,
    input: Extract<CenturionToolCall, { name: 'applyBates' }>['input'],
    pageCount: number
  ): Promise<string> {
    const options: BatesOptions = {
      prefix: input.prefix,
      startNumber: input.startNumber,
      padWidth: input.padWidth,
      pages: resolvePages(input.pages, pageCount),
      position: input.position,
      fontSize: STAMP_FONT_SIZE,
      margin: STAMP_MARGIN,
      whiteBackingBox: true,
    };
    const result = await applyBates(
      this.host.store.bytes(docId),
      options,
      this.reporter(docId, 'Stamping Bates numbers')
    );
    await this.keep(docId, result.bytes);
    const applied = result.detail.batesApplied;
    return `Done - ${applied.length} pages stamped, ${applied[0]} to ${applied.at(-1)}.`;
  }

  private async watermark(
    docId: string,
    input: Extract<CenturionToolCall, { name: 'applyWatermark' }>['input'],
    pageCount: number
  ): Promise<string> {
    const pages = resolvePages(input.pages, pageCount);
    const options: WatermarkOptions = {
      text: input.text,
      pages,
      orientation: input.orientation,
      opacity: input.opacityPct / 100,
      fontSize: WATERMARK_FONT_SIZE,
      color: WATERMARK_GREY,
    };
    const result = await applyWatermark(
      this.host.store.bytes(docId),
      options,
      this.reporter(docId, 'Applying watermark')
    );
    await this.keep(docId, result.bytes);
    return `Done - "${input.text}" watermarked on ${pages.length} pages.`;
  }

  private async exhibit(
    docId: string,
    input: Extract<CenturionToolCall, { name: 'applyExhibitStamp' }>['input'],
    pageCount: number
  ): Promise<string> {
    const options: ExhibitOptions = {
      label: input.label,
      pages: resolvePages(input.pages, pageCount),
      position: input.position,
      fontSize: STAMP_FONT_SIZE + 2,
      margin: STAMP_MARGIN,
      bordered: true,
    };
    const result = await applyExhibitStamp(
      this.host.store.bytes(docId),
      options,
      this.reporter(docId, 'Stamping exhibits')
    );
    await this.keep(docId, result.bytes);
    const applied = result.detail.labelsApplied;
    return `Done - "${applied[0]}" stamped on ${applied.length} page${applied.length === 1 ? '' : 's'}.`;
  }

  private async pageNumbers(
    docId: string,
    input: Extract<CenturionToolCall, { name: 'applyPageNumbers' }>['input'],
    pageCount: number
  ): Promise<string> {
    const options: PageNumberOptions = {
      template: PAGE_NUMBER_TEMPLATE,
      pages: resolvePages(input.pages, pageCount),
      ...numberLayout(input.position),
      fontSize: STAMP_FONT_SIZE,
      margin: STAMP_MARGIN,
      startNumber: 1,
    };
    const result = await applyPageNumbers(
      this.host.store.bytes(docId),
      options,
      this.reporter(docId, 'Adding page numbers')
    );
    await this.keep(docId, result.bytes);
    const applied = result.detail.numbersApplied;
    return `Done - ${applied.length} pages numbered, "${applied[0]}" to "${applied.at(-1)}".`;
  }

  private async bookmarks(docId: string, nodes: BookmarkToolNode[]): Promise<string> {
    const tree = bookmarkTree(nodes);
    const result = await setBookmarks(this.host.store.bytes(docId), tree);
    await this.keep(docId, result.bytes);
    return `Done - ${tree.length} top-level bookmarks written, starting "${tree[0]?.title}".`;
  }
}
