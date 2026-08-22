/**
 * Where Centurion's approved `addSignatureFields` call actually runs: the
 * renderer, against the viewer's own text search and the E-Sign panel's
 * request store. Nothing here touches a byte of the document — fields are
 * request metadata the attorney reviews and sends himself, and nothing is
 * emailed from this path.
 *
 * Each field is anchored to exact text the model quoted from the page
 * ("By:", "Date:", a run of underscores) and placed relative to it in PDF
 * points. The receipt reports what really landed — an anchor the viewer
 * could not find is named, never quietly dropped.
 */

import type {
  EsignFieldKind,
  PageSize,
  PdfRect,
  SignatureFieldsToolInput,
  SignatureToolField,
  SignatureToolPlacement,
  SignatureToolSigner,
  TextMatch,
} from '@shared/types';
import type { ViewerApi } from '@renderer/components/viewer';
import { FIELD_SIZES, clampRect } from './field-geometry';
import { useEsignStore } from './request-store';

/** Breathing room between an anchor and a box beside it, in PDF points. */
const SIDE_GAP = 6;
/** Gap between an anchor and a box stacked above or below it, in PDF points. */
const STACK_GAP = 4;

/** The one rectangle covering every quad of a text match. */
export function unionQuads(quads: PdfRect[]): PdfRect {
  const [first, ...rest] = quads;
  if (first === undefined) throw new Error('A text match with no quads has no position.');
  let left = first.x;
  let bottom = first.y;
  let right = first.x + first.width;
  let top = first.y + first.height;
  for (const quad of rest) {
    left = Math.min(left, quad.x);
    bottom = Math.min(bottom, quad.y);
    right = Math.max(right, quad.x + quad.width);
    top = Math.max(top, quad.y + quad.height);
  }
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

function bottomLeftFor(
  anchor: PdfRect,
  size: { width: number; height: number },
  placement: SignatureToolPlacement
): { x: number; y: number } {
  switch (placement) {
    case 'right-of':
      return {
        x: anchor.x + anchor.width + SIDE_GAP,
        y: anchor.y + (anchor.height - size.height) / 2,
      };
    case 'on':
      return {
        x: anchor.x + (anchor.width - size.width) / 2,
        y: anchor.y + (anchor.height - size.height) / 2,
      };
    case 'below':
      return { x: anchor.x, y: anchor.y - STACK_GAP - size.height };
    case 'above':
      return { x: anchor.x, y: anchor.y + anchor.height + STACK_GAP };
  }
}

/** Shifted — never shrunk — until the whole box sits on the page. */
function shiftInside(rect: PdfRect, pageSize: PageSize): PdfRect {
  return {
    ...rect,
    x: Math.min(Math.max(rect.x, 0), Math.max(0, pageSize.width - rect.width)),
    y: Math.min(Math.max(rect.y, 0), Math.max(0, pageSize.height - rect.height)),
  };
}

/** The house-size box for `kind`, placed relative to the anchor and kept on the page. */
export function placeRelative(
  anchor: PdfRect,
  kind: EsignFieldKind,
  placement: SignatureToolPlacement,
  pageSize: PageSize
): PdfRect {
  const size = FIELD_SIZES[kind];
  const box = clampRect({ ...bottomLeftFor(anchor, size, placement), ...size });
  return shiftInside(box, pageSize);
}

export interface AnchorHit {
  field: SignatureToolField;
  rect: PdfRect;
}

export interface AnchorMiss {
  field: SignatureToolField;
  /** A plain sentence, e.g. `No match for "By:" on page 4`. */
  why: string;
}

export interface AnchorResolution {
  hits: AnchorHit[];
  misses: AnchorMiss[];
}

function resolveOne(
  api: ViewerApi,
  field: SignatureToolField,
  matches: TextMatch[]
): AnchorHit | AnchorMiss {
  const onPage = matches.filter((match) => match.page === field.page);
  if (onPage.length === 0) {
    return { field, why: `No match for "${field.anchorText}" on page ${field.page}` };
  }
  const wanted = field.occurrence ?? 1;
  const match = onPage[wanted - 1];
  if (match === undefined) {
    const count = `${onPage.length} match${onPage.length === 1 ? '' : 'es'}`;
    return {
      field,
      why: `Only ${count} for "${field.anchorText}" on page ${field.page}, not ${wanted}`,
    };
  }
  if (match.quads.length === 0) {
    return {
      field,
      why: `The match for "${field.anchorText}" on page ${field.page} has no position`,
    };
  }
  const pageSize = api.pageSize(field.page);
  if (pageSize === null) {
    return { field, why: `Page ${field.page} has not been measured yet` };
  }
  return {
    field,
    rect: placeRelative(unionQuads(match.quads), field.kind, field.placement, pageSize),
  };
}

/** Searches once per distinct anchor text, then resolves every field against the hits. */
export async function resolveAnchors(
  api: ViewerApi,
  fields: readonly SignatureToolField[]
): Promise<AnchorResolution> {
  const matchesFor = new Map<string, TextMatch[]>();
  for (const query of new Set(fields.map((field) => field.anchorText))) {
    matchesFor.set(query, await api.findText(query));
  }
  const hits: AnchorHit[] = [];
  const misses: AnchorMiss[] = [];
  for (const field of fields) {
    const resolved = resolveOne(api, field, matchesFor.get(field.anchorText) ?? []);
    if ('why' in resolved) misses.push(resolved);
    else hits.push(resolved);
  }
  return { hits, misses };
}

function normalized(email: string): string {
  return email.trim().toLowerCase();
}

/** Panel signers matched by email first (case-insensitive); missing ones are created. */
function ensureSigners(docId: string, roster: readonly SignatureToolSigner[]): Map<string, string> {
  const store = useEsignStore.getState();
  const ids = new Map<string, string>();
  for (const signer of store.signers) {
    if (signer.docId === docId) ids.set(normalized(signer.email), signer.id);
  }
  for (const signer of roster) {
    const key = normalized(signer.email);
    if (!ids.has(key))
      ids.set(key, store.addSigner(docId, signer.name.trim(), signer.email.trim()));
  }
  return ids;
}

function receiptOf(added: number, signerCount: number, misses: readonly AnchorMiss[]): string {
  const missing =
    misses.length === 0 ? '' : ` Could not find: ${misses.map((miss) => miss.why).join('; ')}.`;
  if (added === 0) return `No fields were added - no anchor was found.${missing}`;
  const fieldsWord = `field${added === 1 ? '' : 's'}`;
  const signersWord = `signer${signerCount === 1 ? '' : 's'}`;
  return `Added ${added} ${fieldsWord} for ${signerCount} ${signersWord} to the E-Sign panel.${missing}`;
}

/**
 * Runs the approved call: signers are matched or created in the E-Sign store,
 * every resolvable anchor becomes a placed field, and the returned receipt is
 * quoted back to Centurion — honest counts, never more than really landed.
 */
export async function applySignatureFields(
  api: ViewerApi,
  docId: string,
  input: SignatureFieldsToolInput
): Promise<string> {
  const signerIds = ensureSigners(docId, input.signers);
  const { hits, misses } = await resolveAnchors(api, input.fields);
  const owners = new Set<string>();
  for (const { field, rect } of hits) {
    const signerId = signerIds.get(normalized(field.signerEmail));
    if (signerId === undefined) {
      // The validator guarantees every field's email is on the roster.
      throw new Error(`No signer with the email "${field.signerEmail}".`);
    }
    useEsignStore.getState().addField(docId, {
      kind: field.kind,
      signerId,
      page: field.page,
      rect,
      required: true,
      ...(field.label === undefined ? {} : { label: field.label }),
    });
    owners.add(signerId);
  }
  return receiptOf(hits.length, owners.size, misses);
}
