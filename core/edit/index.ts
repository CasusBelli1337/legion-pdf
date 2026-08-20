/**
 * core/edit — changing what a page's own content stream SAYS, rather than
 * drawing something new on top of it.
 *
 * Today that is one job: taking the text out from under a whiteout box so the
 * covered words stop existing for extraction, OCR, copy, and Centurion. The
 * operator walker and the glyph placement underneath it are the seed of real
 * text editing; core/stamps/stamp-testkit.ts is the test-only ancestor they
 * were productionised from.
 */

export { tokenize } from './content-lexer';
export type { StreamToken, TokenKind } from './content-lexer';
export { FALLBACK_WIDTH, fontMetricsOf } from './font-widths';
export type { GlyphMetrics } from './font-widths';
export { apply, boundsOf, multiply, overlapArea, translation, IDENTITY } from './matrix';
export type { Matrix } from './matrix';
export { UneditablePageError, contentStreamsOf, resourcesOf } from './page-resources';
export type { PageStream } from './page-resources';
export {
  RemovalNotProvedError,
  UnreachableTextError,
  removeTextInRect,
} from './remove-text-in-rect';
export type { RemovalDetail, RemovalRequest } from './remove-text-in-rect';
export { COVERAGE_THRESHOLD, applyEdits, editFor, isCovered } from './rewrite-shows';
export type { ShowEdit } from './rewrite-shows';
export { scanText } from './text-runs';
export type { ScanResources, ScanResult, ShowItem, ShowOperation, ShownGlyph } from './text-runs';
