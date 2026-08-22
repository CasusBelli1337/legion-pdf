/**
 * What Centurion is allowed to DO, rather than say. Every tool call the model
 * proposes is shown to the attorney on a confirm card and waits: nothing here
 * touches a document until `ai:toolDecision` carries an 'approved' back.
 *
 * The shapes of those calls, and the hand-rolled validators that narrow them,
 * live here because both zones need them: main validates before it touches a
 * byte, and the panel narrows the same input again to describe it in English.
 * The model's input is never trusted — this is the only gate it passes.
 *
 * The JSON schemas the model is offered are main-side, in
 * electron/services/centurion-tool-protocol.ts, next to the protocol that
 * enforces them.
 */

import type { Corner, ExhibitPosition, WatermarkOrientation } from './types';
import type { EsignFieldKind } from './options-esign';
import {
  CenturionToolInputError,
  choice,
  fields,
  optionalText,
  spread,
  text,
  whole,
} from './centurion-tool-guards';

export { CenturionToolInputError } from './centurion-tool-guards';

/** The document operations Centurion may propose. One name per confirm card. */
export type CenturionToolName =
  | 'applyBates'
  | 'applyWatermark'
  | 'applyExhibitStamp'
  | 'applyPageNumbers'
  | 'setBookmarks'
  | 'suggestRedactions'
  | 'addSignatureFields';

/**
 * One pending tool call, streamed to the panel on an `ai:chunk`. `input` is
 * unknown by design: the shape belongs to the tool, and main validates it
 * against that tool's schema before running anything.
 */
export interface CenturionToolProposal {
  /** Anthropic's tool_use id — what the decision refers back to. */
  toolUseId: string;
  name: CenturionToolName;
  input: unknown;
  /** Plain-English one-liner shown on the confirm card, e.g. "Stamp ASHFORD000001-000312 on all 312 pages." */
  summary: string;
  /**
   * Absent while the card is waiting for an answer. Present on the FOLLOW-UP
   * chunk main sends once the call has run (or been declined): the same card,
   * settled. The panel matches it back by `toolUseId`.
   */
  result?: CenturionToolResult;
}

/** How a card turned out — what it shows once it has settled. */
export interface CenturionToolResult {
  /** 'skipped' is a normal outcome, and must never read as a failure. */
  outcome: 'done' | 'skipped' | 'failed';
  /** "Done - 450 pages stamped." / "Skipped." / a plain-English failure. */
  message: string;
}

/**
 * The attorney's answer to a confirm card. A bare verdict is the usual case;
 * the object form carries a receipt for the one tool the RENDERER runs
 * (suggestRedactions), whose outcome main cannot see but the model must hear.
 */
export type CenturionToolDecision = 'approved' | 'rejected' | CenturionToolAnswer;

export interface CenturionToolAnswer {
  verdict: 'approved' | 'rejected';
  /** Plain English quoted back to Centurion, e.g. "Marked 12 instances on 4 pages." */
  detail: string;
}

export function verdictOf(decision: CenturionToolDecision): 'approved' | 'rejected' {
  return typeof decision === 'string' ? decision : decision.verdict;
}

/** The renderer's own receipt, when it ran the tool itself. */
export function detailOf(decision: CenturionToolDecision): string | undefined {
  return typeof decision === 'string' ? undefined : decision.detail;
}

/* ── tool inputs, as the model may send them ──────────────────────────── */

export interface BatesToolInput {
  prefix: string;
  startNumber: number;
  padWidth: number;
  position: Corner;
  /** Omit for every page in the document. */
  pages?: number[];
}

export interface WatermarkToolInput {
  text: string;
  orientation: WatermarkOrientation;
  /** 1-100; 25 is the readable default. */
  opacityPct: number;
  pages?: number[];
}

export interface ExhibitToolInput {
  label: string;
  position: ExhibitPosition;
  pages: number[];
}

/** Header or footer, left/centre/right — six spots, one word to the model. */
export type PageNumberSpot =
  'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface PageNumbersToolInput {
  position: PageNumberSpot;
  pages?: number[];
}

export interface BookmarkToolNode {
  title: string;
  page: number;
  children?: BookmarkToolNode[];
}

export interface BookmarksToolInput {
  bookmarks: BookmarkToolNode[];
}

export interface RedactionTerm {
  text: string;
  /** Why it should go, in the attorney's words — shown on the confirm card. */
  reason: string;
}

export interface RedactionsToolInput {
  terms: RedactionTerm[];
}

/** Where an e-sign box sits relative to the text it is anchored to. */
export type SignatureToolPlacement = 'right-of' | 'above' | 'below' | 'on';

export interface SignatureToolSigner {
  name: string;
  email: string;
}

export interface SignatureToolField {
  kind: EsignFieldKind;
  /** Which roster signer owns the box; must match an email in `signers`. */
  signerEmail: string;
  /** 1-based page the anchor text is on. */
  page: number;
  /** Exact text on that page the box is anchored to. */
  anchorText: string;
  /** 1-based among that page's matches; the first when omitted. */
  occurrence?: number;
  placement: SignatureToolPlacement;
  /** Shown to the signer for 'text' fields, e.g. "Title". */
  label?: string;
}

export interface SignatureFieldsToolInput {
  signers: SignatureToolSigner[];
  fields: SignatureToolField[];
}

/** A call that has been through its validator: the name and the shape it owns. */
export type CenturionToolCall =
  | { name: 'applyBates'; input: BatesToolInput }
  | { name: 'applyWatermark'; input: WatermarkToolInput }
  | { name: 'applyExhibitStamp'; input: ExhibitToolInput }
  | { name: 'applyPageNumbers'; input: PageNumbersToolInput }
  | { name: 'setBookmarks'; input: BookmarksToolInput }
  | { name: 'suggestRedactions'; input: RedactionsToolInput }
  | { name: 'addSignatureFields'; input: SignatureFieldsToolInput };

/* ── the values a tool may name ───────────────────────────────────────── */

export const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
export const EXHIBIT_POSITIONS: ExhibitPosition[] = [...CORNERS, 'bottom-center'];
export const PAGE_NUMBER_SPOTS: PageNumberSpot[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
export const SIGNATURE_FIELD_KINDS: EsignFieldKind[] = [
  'signature',
  'initials',
  'name',
  'date',
  'text',
];
export const SIGNATURE_PLACEMENTS: SignatureToolPlacement[] = ['right-of', 'above', 'below', 'on'];

/* ── validation: the model's input is never trusted ───────────────────── */

function pageList(value: unknown, tool: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CenturionToolInputError(`${tool}: "pages" must list at least one page number.`);
  }
  for (const page of value) {
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
      throw new CenturionToolInputError(
        `${tool}: page ${JSON.stringify(page)} is not a page number - pages start at 1.`
      );
    }
  }
  return [...new Set(value as number[])].sort((left, right) => left - right);
}

/** Omitted pages mean "the whole document", which main resolves against the file. */
function optionalPages(source: Record<string, unknown>, tool: string): number[] | undefined {
  const value = source['pages'];
  return value === undefined || value === null ? undefined : pageList(value, tool);
}

const MAX_BOOKMARKS = 500;

function bookmarkNodes(value: unknown, tool: string, depth: number): BookmarkToolNode[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CenturionToolInputError(`${tool}: "bookmarks" must list at least one bookmark.`);
  }
  if (value.length > MAX_BOOKMARKS || depth > 4) {
    throw new CenturionToolInputError(`${tool}: that bookmark tree is too large to apply.`);
  }
  return value.map((entry) => {
    const node = fields(entry, tool);
    const children = node['children'];
    return {
      title: text(node, 'title', tool, 200),
      page: whole(node, 'page', tool, { min: 1, max: 100_000 }),
      ...(children === undefined || children === null
        ? {}
        : { children: bookmarkNodes(children, tool, depth + 1) }),
    };
  });
}

function redactionTerms(value: unknown, tool: string): RedactionTerm[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CenturionToolInputError(`${tool}: "terms" must list at least one term to mark.`);
  }
  return value.map((entry) => {
    const term = fields(entry, tool);
    return { text: text(term, 'text', tool, 200), reason: text(term, 'reason', tool, 200) };
  });
}

const MAX_SIGNERS = 20;
const MAX_SIGNATURE_FIELDS = 100;

function emailAddress(source: Record<string, unknown>, key: string, tool: string): string {
  const value = text(source, key, tool, 200);
  if (!value.includes('@')) {
    throw new CenturionToolInputError(
      `${tool}: "${key}" must be an email address, not "${value}".`
    );
  }
  return value;
}

function signatureSigners(value: unknown, tool: string): SignatureToolSigner[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CenturionToolInputError(`${tool}: "signers" must list at least one signer.`);
  }
  if (value.length > MAX_SIGNERS) {
    throw new CenturionToolInputError(`${tool}: at most ${MAX_SIGNERS} signers per request.`);
  }
  return value.map((entry) => {
    const signer = fields(entry, tool);
    return { name: text(signer, 'name', tool, 100), email: emailAddress(signer, 'email', tool) };
  });
}

function signatureField(
  entry: unknown,
  tool: string,
  rosterEmails: Set<string>
): SignatureToolField {
  const field = fields(entry, tool);
  const signerEmail = emailAddress(field, 'signerEmail', tool);
  if (!rosterEmails.has(signerEmail.trim().toLowerCase())) {
    throw new CenturionToolInputError(
      `${tool}: signerEmail "${signerEmail}" matches nobody in "signers" - every field must belong to a listed signer.`
    );
  }
  const occurrence = field['occurrence'];
  const label = field['label'];
  return {
    kind: choice(field, 'kind', tool, SIGNATURE_FIELD_KINDS),
    signerEmail,
    page: whole(field, 'page', tool, { min: 1, max: 100_000 }),
    anchorText: text(field, 'anchorText', tool, 200),
    placement: choice(field, 'placement', tool, SIGNATURE_PLACEMENTS),
    ...(occurrence === undefined || occurrence === null
      ? {}
      : { occurrence: whole(field, 'occurrence', tool, { min: 1, max: 50 }) }),
    ...(label === undefined || label === null ? {} : { label: text(field, 'label', tool, 100) }),
  };
}

function signatureFields(
  value: unknown,
  tool: string,
  signers: SignatureToolSigner[]
): SignatureToolField[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CenturionToolInputError(`${tool}: "fields" must list at least one field to place.`);
  }
  if (value.length > MAX_SIGNATURE_FIELDS) {
    throw new CenturionToolInputError(
      `${tool}: at most ${MAX_SIGNATURE_FIELDS} fields per request.`
    );
  }
  const rosterEmails = new Set(signers.map((signer) => signer.email.trim().toLowerCase()));
  return value.map((entry) => signatureField(entry, tool, rosterEmails));
}

type Validator = (input: Record<string, unknown>, tool: CenturionToolName) => CenturionToolCall;

/** Config over code: one narrowing function per tool, looked up by name. */
const VALIDATORS: Record<CenturionToolName, Validator> = {
  applyBates: (source, tool) => ({
    name: 'applyBates',
    input: {
      prefix: optionalText(source, 'prefix', tool),
      startNumber: whole(source, 'startNumber', tool, { min: 0, max: 9_999_999 }),
      padWidth: whole(source, 'padWidth', tool, { min: 0, max: 12 }),
      position: choice(source, 'position', tool, CORNERS),
      ...spread('pages', optionalPages(source, tool)),
    },
  }),

  applyWatermark: (source, tool) => ({
    name: 'applyWatermark',
    input: {
      text: text(source, 'text', tool, 64),
      orientation: choice<WatermarkOrientation>(source, 'orientation', tool, [
        'diagonal',
        'horizontal',
      ]),
      opacityPct: whole(source, 'opacityPct', tool, { min: 1, max: 100 }),
      ...spread('pages', optionalPages(source, tool)),
    },
  }),

  applyExhibitStamp: (source, tool) => ({
    name: 'applyExhibitStamp',
    input: {
      label: text(source, 'label', tool, 64),
      position: choice(source, 'position', tool, EXHIBIT_POSITIONS),
      pages: pageList(source['pages'], tool),
    },
  }),

  applyPageNumbers: (source, tool) => ({
    name: 'applyPageNumbers',
    input: {
      position: choice(source, 'position', tool, PAGE_NUMBER_SPOTS),
      ...spread('pages', optionalPages(source, tool)),
    },
  }),

  setBookmarks: (source, tool) => ({
    name: 'setBookmarks',
    input: { bookmarks: bookmarkNodes(source['bookmarks'], tool, 1) },
  }),

  suggestRedactions: (source, tool) => ({
    name: 'suggestRedactions',
    input: { terms: redactionTerms(source['terms'], tool) },
  }),

  addSignatureFields: (source, tool) => {
    const signers = signatureSigners(source['signers'], tool);
    return {
      name: 'addSignatureFields',
      input: { signers, fields: signatureFields(source['fields'], tool, signers) },
    };
  },
};

export function isToolName(name: string): name is CenturionToolName {
  return Object.prototype.hasOwnProperty.call(VALIDATORS, name);
}

/**
 * Narrows one tool call from the model, or throws a sentence the model can act
 * on. Nothing downstream re-checks these fields, so this is the only gate.
 */
export function validateToolCall(name: string, input: unknown): CenturionToolCall {
  if (!isToolName(name)) {
    throw new CenturionToolInputError(`Centurion has no tool called "${name}".`);
  }
  return VALIDATORS[name](fields(input, name), name);
}
