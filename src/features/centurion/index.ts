/** Lane F's public surface: the tool-registry entry imports CenturionPanel from here. */

export { CenturionPanel } from './centurion-panel';
export { useCenturionStore, threadOf, blankThread } from './centurion-store';
export type { CenturionThread, CenturionTurn, CenturionStatus } from './centurion-store';
export { contextLabel, selectedPages, buildAskPayload } from './ask-payload';
export type { ContextMode, ContextSelection, CenturionAskPayload } from './ask-payload';
export { readFailure, isMissingKey } from './error-text';
export type { CenturionFailure } from './error-text';
