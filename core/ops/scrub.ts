/**
 * Production hygiene (F-9): strip the document Info dictionary, the XMP
 * metadata packet, and the per-page metadata Acrobat leaves behind — then
 * report what went. The objects are DELETED from the file, not just unlinked,
 * because an unreferenced object is still readable in the saved bytes.
 */

import { PDFDict, PDFName, PDFRef } from 'pdf-lib';
import type { PDFDocument } from 'pdf-lib';
import type { OpResult, ScrubDetail, ScrubMetadataOptions } from '@shared/types';
import { countAttachments, stripAttachments } from './attachments';
import { finish, loadPdf } from './pdf-io';

/** Acrobat and Word both hide authorship in these. */
const PAGE_METADATA_KEYS = ['Metadata', 'PieceInfo'] as const;

function clearInfoDictionary(document: PDFDocument): string[] {
  const infoRef = document.context.trailerInfo.Info;
  const info = document.context.lookupMaybe(infoRef, PDFDict);
  if (info === undefined) return [];

  const cleared = info.keys().map((key) => key.decodeText());
  for (const key of info.keys()) info.delete(key);
  if (infoRef instanceof PDFRef) document.context.delete(infoRef);
  document.context.trailerInfo.Info = undefined;
  return cleared;
}

function clearXmpMetadata(document: PDFDocument): string[] {
  const cleared: string[] = [];
  const catalogKey = PDFName.of('Metadata');
  const catalogRef = document.catalog.get(catalogKey);
  if (catalogRef !== undefined) {
    if (catalogRef instanceof PDFRef) document.context.delete(catalogRef);
    document.catalog.delete(catalogKey);
    cleared.push('XMP metadata');
  }

  document.getPages().forEach((page, index) => {
    for (const key of PAGE_METADATA_KEYS) {
      const name = PDFName.of(key);
      const value = page.node.get(name);
      if (value === undefined) continue;
      if (value instanceof PDFRef) document.context.delete(value);
      page.node.delete(name);
      cleared.push(`Page ${index + 1} ${key === 'Metadata' ? 'XMP metadata' : 'private data'}`);
    }
  });
  return cleared;
}

export async function scrubMetadata(
  bytes: Uint8Array,
  options: ScrubMetadataOptions
): Promise<OpResult<ScrubDetail>> {
  const document = await loadPdf(bytes);
  const pagesIn = document.getPageCount();

  const clearedFields: string[] = [];
  if (options.clearInfoDict) clearedFields.push(...clearInfoDictionary(document));
  if (options.clearXmp) clearedFields.push(...clearXmpMetadata(document));

  const attachmentsFound = countAttachments(document);
  if (options.removeAttachments && attachmentsFound > 0) {
    clearedFields.push(`${stripAttachments(document)} embedded file(s)`);
  }

  const detail: ScrubDetail = { clearedFields, attachmentsFound };
  return finish(document, pagesIn, pagesIn, detail, 'scrubbed document');
}
