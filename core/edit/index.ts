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
export { fontCodecOf, fontCodecsOf } from './font-codec';
export type { Encoded, FontCodec } from './font-codec';
export { parseToUnicode } from './cmap-parse';
export { parseTrueType } from './truetype-glyphs';
export type { TrueTypeGlyphs } from './truetype-glyphs';
export { NoEditableTextError, findBlock, inspectTextAt, readPageText } from './inspect-text';
export type { FoundBlock, PageText } from './inspect-text';
export { EditNotProvedError, replaceText } from './replace-text';
export {
  alignmentOf,
  groupLines,
  leadingOf,
  lineAt,
  paragraphAround,
  placedGlyphs,
} from './text-lines';
export type { PlacedGlyph, TextLine } from './text-lines';
export { layoutParagraph } from './text-layout';
export type { LaidLine, LayoutSpec } from './text-layout';
