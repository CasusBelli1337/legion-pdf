/**
 * The redaction engine's public surface. electron/ipc/redact.ts imports from
 * here and nowhere else, so the main-process half of true redaction stays one
 * greppable list.
 */

export { PHASE_RASTERIZE, PHASE_REBUILD, PHASE_VERIFY, applyRedactions } from './apply';
export type { RedactPorts, RedactProgress, RedactionOutcome } from './apply';
export { burnRects } from './burn';
export type { BurnResult } from './burn';
export { REDACTED_TITLE, carryMetadata, redactTitles } from './carry-over';
export {
  assertRasterMatchesPage,
  displayRectToPixels,
  imagePlacement,
  pdfRectToPixels,
  userRectToDisplay,
} from './geometry';
export type { ImagePlacement } from './geometry';
export { rebuildWithImagePages } from './image-pages';
export type { BurnedRaster, RebuildResult } from './image-pages';
export { pageContentText, pageContentStreams, shownCharactersOn } from './page-content';
export { countInstances, planRedactions, verificationStrings } from './plan';
export type { RedactionPlan } from './plan';
export { decodePng, toOpaqueRgb } from './png-decode';
export type { DecodedPng } from './png-decode';
export { encodeRgbPng } from './png-encode';
export { countOccurrences, encodingsOf, residueOf, scannableText } from './residue-scan';
export {
  NoRedactionMarksError,
  RedactionGeometryError,
  RedactionNotVerifiedError,
  UnsupportedRedactionRasterError,
} from './types';
export type { BurnedPage, PageRaster, PixelRect, RgbImage } from './types';
export { assertVerified, textOnPageMarker, verifyRedaction } from './verify';
export type { VerifyRequest } from './verify';
