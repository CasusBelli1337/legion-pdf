/**
 * The core/stamps surface the IPC layer calls. Every function is pure over
 * bytes, Node-safe, and returns an OpResult whose page count has already been
 * verified against the saved output.
 */

export { applyBates, batesLabel } from './bates';
export { applyExhibitStamp } from './exhibit';
export {
  advanceExhibitLabel,
  exhibitSequence,
  letterToOrdinal,
  nextExhibitLabel,
  ordinalToLetter,
} from './exhibit-label';
export { insertSlipSheet } from './slip-sheet';
export { applyHighlight, HIGHLIGHT_YELLOW } from './highlight';
export { applyWatermark } from './watermark';
export { applyPageNumbers, pageNumberLabel } from './page-numbers';
export { placeSignature } from './signature';
export type { SignatureInk } from './signature';
export { addTextBox, layoutLines } from './text-box';
export { applyWhiteout } from './whiteout';
export { isPng, readPngInfo, scaleToHeight, MAX_SIGNATURE_BYTES } from './png-asset';
export type { PngInfo } from './png-asset';
export { parseHexColor, WATERMARK_GREY } from './color';
export { formatDateStamp, DATE_FORMATS, DEFAULT_DATE_FORMAT } from './date-stamp';
export type { DateFormat } from './date-stamp';
export {
  bandAnchor,
  cornerAnchor,
  frameOf,
  normalizeRotation,
  stampAnchor,
  toUserSpace,
  toVisualSpace,
  uprightDegrees,
} from './geometry';
export type { BoxSize, PageFrame } from './geometry';
export { drawLabel, measureLabel, LABEL_PADDING, LABEL_BORDER_WIDTH } from './label-box';
export type { LabelMetrics } from './label-box';
export { measureInk } from './ink';
export type { InkBox } from './ink';
