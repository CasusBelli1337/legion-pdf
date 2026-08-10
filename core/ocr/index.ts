/**
 * The OCR engine's public surface. `electron/services/ocr` and the IPC lane
 * import from here, never from the individual modules, so the engine's shape
 * stays one greppable list.
 */

export { countShownCharacters } from './content-text';
export {
  applyMatrix,
  displaySize,
  displayToUserMatrix,
  normalizeRotation,
  pointsPerPixel,
  rasterScale,
  wordRect,
  POINTS_PER_INCH,
} from './geometry';
export type { Matrix6 } from './geometry';
export { characterCount, decodeEntities, parseHocr, wordTextOf } from './hocr-parser';
export { BLANK_INK_RATIO, inkRatio, isBlankRaster } from './png-blank';
export { ContentStreamError, MIN_TEXT_LAYER_CHARS, detectTextLayer } from './text-detect';
export { sanitizeToFont, writeTextLayer } from './text-layer';
export { EmptyOcrPageError, HocrParseError, UnsupportedRasterError } from './types';
export type { HocrPage, OcrPageWords, OcrWord, PixelBox } from './types';
