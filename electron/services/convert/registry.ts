/**
 * Which engine opens which kind of file, and in what order.
 *
 * Config over code: ENGINE_ORDER is the whole routing table. An engine claims
 * extensions; the first one in this list that claims the extension AND is
 * available on this computer gets the job. Adding a converter is adding a row,
 * never a branch — and the order encodes one rule the attorney cares about:
 * when Microsoft Office is installed, Office wins, because its output is what
 * they expect to see.
 *
 * Availability is asked once per engine and cached. A probe can spawn
 * PowerShell, and opening ten files should not spawn it ten times.
 */

import type { ConvertEngineStatus, ConvertSupport } from '@shared/types';
import { extensionOf, isConvertiblePath } from '@shared/convert-inputs';
import { PRODUCT_NAME } from '@shared/product';
import { BUILTIN_WORD_ENGINE } from './builtin-word';
import { IMAGE_ENGINE } from './image-engine';
import { OFFICE_ENGINES } from './office-com';
import { TEXT_ENGINE } from './text-engine';
import type { ConvertEngine } from './types';

/** Order IS the preference. Office first; the built-in converters catch the rest. */
export const ENGINE_ORDER: readonly ConvertEngine[] = [
  ...OFFICE_ENGINES,
  BUILTIN_WORD_ENGINE,
  IMAGE_ENGINE,
  TEXT_ENGINE,
];

/**
 * What to tell the attorney when nothing on this computer can open a file type.
 * Keyed by engine id, because the missing engine IS the reason.
 */
const MISSING_ADVICE: Record<string, string> = {
  word:
    'Older Word files (.doc and .rtf) are converted by Microsoft Word, which is not installed on ' +
    `this computer. Open the file in a word processor and save it as .docx — ${PRODUCT_NAME} ` +
    'converts .docx on its own — or save it as a PDF and open that.',
  excel:
    'Spreadsheets are converted by Microsoft Excel, which is not installed on this computer. ' +
    'Save the sheet as a PDF from whatever program you have, then open that.',
  powerpoint:
    'Slide decks are converted by Microsoft PowerPoint, which is not installed on this computer. ' +
    'Save the deck as a PDF from whatever program you have, then open that.',
};

const availability = new Map<string, Promise<boolean>>();

function isAvailable(engine: ConvertEngine): Promise<boolean> {
  const cached = availability.get(engine.id);
  if (cached !== undefined) return cached;
  // A probe that throws is an answer too: no.
  const probe = engine.available().catch(() => false);
  availability.set(engine.id, probe);
  return probe;
}

/** TEST SUPPORT: forget every cached probe so a suite can re-resolve. */
export function resetAvailabilityCache(): void {
  availability.clear();
}

function enginesFor(extension: string): ConvertEngine[] {
  return ENGINE_ORDER.filter((engine) => engine.extensions.includes(extension));
}

/** Thrown for a file type no engine claims at all — a wrong turn, not a fault. */
export class UnsupportedFileTypeError extends Error {
  readonly code = 'UNSUPPORTED_FILE_TYPE';
  constructor(extension: string) {
    super(
      extension === ''
        ? `${PRODUCT_NAME} cannot tell what kind of file that is — it has no file extension.`
        : `${PRODUCT_NAME} cannot open ${extension} files.`
    );
    this.name = 'UnsupportedFileTypeError';
  }
}

/** Thrown when the engine a file type needs is not installed here. */
export class EngineUnavailableError extends Error {
  readonly code = 'ENGINE_UNAVAILABLE';
  constructor(engineId: string, extension: string) {
    super(
      MISSING_ADVICE[engineId] ??
        `Nothing on this computer can turn ${extension} files into PDFs right now.`
    );
    this.name = 'EngineUnavailableError';
  }
}

/**
 * The engine that will open this path. Throws in plain English rather than
 * returning null, so no caller can mistake "cannot" for "empty".
 */
export async function engineForPath(filePath: string): Promise<ConvertEngine> {
  const extension = extensionOf(filePath);
  if (!isConvertiblePath(filePath)) throw new UnsupportedFileTypeError(extension);
  const candidates = enginesFor(extension);
  for (const engine of candidates) {
    if (await isAvailable(engine)) return engine;
  }
  throw new EngineUnavailableError(candidates[0]?.id ?? '', extension);
}

async function statusOf(engine: ConvertEngine): Promise<ConvertEngineStatus> {
  const available = await isAvailable(engine);
  return { id: engine.id, label: engine.label, available, note: engine.note(available) };
}

/** What `convert:support` answers: the extensions that work here, and why. */
export async function convertSupport(): Promise<ConvertSupport> {
  const engines = await Promise.all(ENGINE_ORDER.map(statusOf));
  const extensions = new Set<string>();
  for (const [index, engine] of ENGINE_ORDER.entries()) {
    if (engines[index]?.available === true)
      for (const item of engine.extensions) extensions.add(item);
  }
  return { extensions: [...extensions].sort(), engines };
}
