/**
 * Every word the Export panel says, as pure functions so the copy is tested
 * rather than eyeballed. Plain English for an attorney: what was written, how
 * many, and where — never a path fragment or a format name on its own.
 */

import { EXPORT_FORMATS, exportFormatInfo } from '@shared/export-formats';
import type { ExportFormat, ExportResult } from '@shared/types';

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

/** Windows and POSIX both, because the renderer has no path module. */
export function containingFolder(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut <= 0 ? path : path.slice(0, cut);
}

export function fileNameOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut < 0 ? path : path.slice(cut + 1);
}

/** What the save dialog opens with: the document's name, the format's ending. */
export function suggestedName(fileName: string, format: ExportFormat): string {
  const stem = fileName.replace(/\.[^./\\]+$/, '');
  return `${stem || 'Export'}.${exportFormatInfo(format).extension}`;
}

/** The line under the "Choose where to save" button, before anything has run. */
export function destinationSummary(format: ExportFormat, outputPath: string | null): string {
  if (outputPath === null) return 'No location chosen yet.';
  return exportFormatInfo(format).output === 'folder'
    ? `The pages go into ${outputPath}`
    : `Saves as ${outputPath}`;
}

/** "Wrote 65 PNG files to ..." / "Wrote Depo.tif (65 pages)". */
export function receiptText(result: ExportResult): string {
  const info = exportFormatInfo(result.format);
  const first = result.files[0] ?? '';
  if (info.output === 'folder') {
    const count = result.files.length;
    return `Wrote ${count} ${info.extension.toUpperCase()} ${plural(count, 'file')} to ${containingFolder(first)}`;
  }
  const pages = result.pagesExported;
  return `Wrote ${fileNameOf(first)} (${pages} ${plural(pages, 'page')})`;
}

/** "Show in folder" opens the folder in both cases — that is what the label promises. */
export function showInFolderTarget(result: ExportResult): string {
  return containingFolder(result.files[0] ?? '');
}

/**
 * Electron wraps a handler's rejection as "Error invoking remote method '...':
 * SomeError: <sentence>". The attorney reads the sentence and nothing else —
 * a leaked class name ("ExportCancelledError:") is plumbing, caught live on
 * 2026-09-15 when a stopped run showed it in the panel.
 */
export function plainExportError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^[A-Za-z]*Error:\s*/, '')
    .trim();
  return notYetMessage(message) ?? message;
}

/**
 * A format that is declared but whose lane has not landed says so in the app's
 * own convention — "NotImplemented: export docx". The attorney gets a sentence
 * instead, with the format named the way the picker names it.
 */
function notYetMessage(message: string): string | null {
  const match = /^NotImplemented: export (\w+)$/.exec(message);
  if (match === null) return null;
  const format = match[1] as ExportFormat;
  const label = EXPORT_FORMATS.find((info) => info.format === format)?.label ?? format;
  return `${label} export is not ready yet. It arrives in a coming update — the other formats all work now.`;
}

/** The button always says exactly what it is about to do. */
export function exportButtonLabel(format: ExportFormat, pageCount: number): string {
  const info = exportFormatInfo(format);
  const pages = `${pageCount} ${plural(pageCount, 'page')}`;
  return info.output === 'folder'
    ? `Export ${pages} as images`
    : `Export ${pages} as ${info.label}`;
}
