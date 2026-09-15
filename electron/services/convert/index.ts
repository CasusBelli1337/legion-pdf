/**
 * The convert service's public surface. pdf-intake and electron/ipc/convert.ts
 * import from here and nowhere else, so what the rest of the app depends on is
 * one greppable list.
 */

export { convertToPdf, convertedName } from './convert-file';
export type { ConvertedFile } from './convert-file';
export { finishConvertProgress, reportConvertProgress, setConvertProgressSink } from './progress';
export type { ConvertProgressSink } from './progress';
export {
  EngineUnavailableError,
  ENGINE_ORDER,
  UnsupportedFileTypeError,
  convertSupport,
  engineForPath,
  resetAvailabilityCache,
} from './registry';
export { ConvertFailedError } from './types';
export type { ConvertEngine, ConvertJob } from './types';
