/**
 * One engine per open pdfjs document, shared by everything that asks.
 *
 * Two callers want a classifier for the same file at the same time: the viewer,
 * which needs every visible page's roles to mark its text-layer spans, and the
 * selection menu, which needs the same pages classified to build a cite. Two
 * engines would classify every page twice and read the document-wide header
 * sample twice, for byte-identical answers — so the engine is cached against
 * the pdfjs document object itself.
 *
 * Keyed WEAKLY and on the DOCUMENT, not the docId: an op that stamps or redacts
 * the file produces a new pdfjs document for the same docId, and that new
 * document must get a new engine — a classification cached against the old text
 * would cite the wrong line.
 */

import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { createSelectCopyEngine } from './engine';
import type { SelectCopyEngineHandle } from './engine';
import { createPdfjsSource } from './pdfjs-source';

const engines = new WeakMap<PDFDocumentProxy, SelectCopyEngineHandle>();

export function engineForDocument(
  document: PDFDocumentProxy,
  docId: string
): SelectCopyEngineHandle {
  const existing = engines.get(document);
  if (existing !== undefined && existing.docId === docId) return existing;
  const engine = createSelectCopyEngine(createPdfjsSource(document, docId));
  engines.set(document, engine);
  return engine;
}
