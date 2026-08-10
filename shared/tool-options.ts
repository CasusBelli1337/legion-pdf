/**
 * Barrel for every per-feature option shape, split by build lane so no file
 * runs long. @shared/types re-exports this, so consumers import one path.
 */

export type * from './options-assembly';
export type * from './options-marks';
export type * from './options-pipeline';
