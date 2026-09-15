/**
 * The core/ops surface the IPC layer calls. Every function here is pure over
 * bytes, Node-safe, and returns an OpResult whose counts have already been
 * verified against the saved output.
 */

export { loadPdf, createPdf, savePdf, sealResult } from './pdf-io';
export { getBookmarks, setBookmarks } from './bookmarks';
export { readOutline, countBookmarks } from './bookmarks-read';
export { writeOutline, removeOutline } from './bookmarks-write';
export { deletePages } from './delete-pages';
export { extractPages } from './extract';
export { fillFormFields } from './fill-form';
export { flattenAnnotations } from './flatten';
export { imagesToPdf, densityOf, isJpeg, isPng } from './image-to-pdf';
export type { ImageDensity, ImagePdfDetail, PdfImageSource } from './image-to-pdf';
export { insertBlankPages, insertPagesFrom } from './insert';
export type { InsertFromSettings } from './insert';
export { mergeDocuments } from './merge';
export type { MergeSettings, MergeSourceDocument } from './merge';
export {
  assertPermutation,
  normalizePages,
  parsePageRanges,
  survivingPages,
  toZeroBased,
} from './page-selection';
export type { ProgressReporter } from './pdf-io';
export { attachmentNames, countAttachments } from './attachments';
export { reorderPages } from './reorder';
export { rotatePages } from './rotate';
export { scrubMetadata } from './scrub';
export { splitByRanges } from './split';
export { textToPdf } from './text-to-pdf';
export type { TextPdfDetail, TextPdfOptions } from './text-to-pdf';
