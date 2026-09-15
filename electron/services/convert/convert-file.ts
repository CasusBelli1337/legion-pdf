/**
 * The one door a non-PDF file passes through on its way into Legion PDF.
 *
 * Pick the engine, run it, and PROVE the result before anyone sees it. Every
 * engine here hands off to something we do not control — Word over COM,
 * Chromium, a TIFF decoder — and the failure that matters is not a crash, it is
 * a 0-byte or 0-page "PDF" arriving as if it were the attorney's document. So
 * the bytes are re-opened and counted here, and a result that will not open is
 * reported as the failure it is.
 */

import { EmptyDocumentError, countPages } from '@core/pdf-meta';
import { extensionOf } from '@shared/convert-inputs';
import { PRODUCT_NAME } from '@shared/product';
import { finishConvertProgress, reportConvertProgress } from './progress';
import { engineForPath } from './registry';
import { ConvertFailedError, type ConvertEngine } from './types';

export interface ConvertedFile {
  bytes: Uint8Array;
  /** What the converted document should be called: the original stem, plus .pdf. */
  fileName: string;
  pageCount: number;
  /** Which engine did it — for the log, and for the message when it goes wrong. */
  engineId: string;
}

/**
 * Split on BOTH separators rather than node's `basename`: the tests run under
 * WSL, where a Windows path is just a string with backslashes in it, and a
 * conversion that silently kept the whole path as the file name would only show
 * up on the attorney's machine.
 */
function fileNameOf(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

/** letter.docx becomes letter.pdf; the original is never written over. */
export function convertedName(filePath: string): string {
  const name = fileNameOf(filePath);
  const dot = name.lastIndexOf('.');
  return `${dot <= 0 ? name : name.slice(0, dot)}.pdf`;
}

async function verify(bytes: Uint8Array, engine: ConvertEngine, fileName: string): Promise<number> {
  if (bytes.byteLength === 0) {
    throw new ConvertFailedError(`${engine.label} produced an empty PDF for ${fileName}.`);
  }
  try {
    return await countPages(bytes);
  } catch (error) {
    // countPages already refuses a zero-page document; the two failures read
    // very differently to the attorney, so they are told apart here.
    throw new ConvertFailedError(
      error instanceof EmptyDocumentError
        ? `${engine.label} produced an empty PDF for ${fileName} — no pages came out of it.`
        : `${engine.label} produced a file for ${fileName} that ${PRODUCT_NAME} cannot read as a PDF.`
    );
  }
}

/** Converts a file to PDF bytes, streaming progress on `convert:progress`. */
export async function convertToPdf(filePath: string): Promise<ConvertedFile> {
  const fileName = fileNameOf(filePath);
  const phase = `Converting ${fileName}`;
  reportConvertProgress(phase, 0, 1);
  const engine = await engineForPath(filePath);
  const bytes = await engine.run({ filePath, fileName, extension: extensionOf(filePath) });
  const pageCount = await verify(bytes, engine, fileName);
  finishConvertProgress(phase);
  return { bytes, fileName: convertedName(filePath), pageCount, engineId: engine.id };
}
