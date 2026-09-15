/**
 * core/image — the pixel side of exporting a PDF. Pure, Node-safe, no Electron
 * and no DOM: the rasters arrive as bytes and leave as bytes. The export lane's
 * main-process service imports from here and nowhere else inside the folder.
 */

export { BILEVEL_THRESHOLD, convertColor, grayToBilevel, rgbToGray, toRgb } from './color';
export { packBits, packBitsCeiling, packBitsInto, packBitsStrip } from './packbits';
export { encodeTiff, encodeTiffPages, prepareTiffPage } from './tiff-encode';
export type { PreparedTiffPage } from './tiff-encode';
export { countTiffPages } from './tiff-inspect';
export { assertImage, bitsPerSample, bytesPerRow, samplesPerPixel } from './types';
export type { ImageKind, PageImage } from './types';
