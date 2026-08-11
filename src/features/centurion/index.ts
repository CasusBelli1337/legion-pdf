/** Lane F's public surface: the tool-registry entry imports CenturionPanel from here. */

export { CenturionPanel } from './centurion-panel';
export { useCenturionStore, threadOf, blankThread, isCard, isTurn } from './centurion-store';
export type {
  CenturionThread,
  CenturionTurn,
  CenturionCard,
  CenturionCardStatus,
  CenturionEntry,
  CenturionStatus,
} from './centurion-store';
export { contextLabel, selectedPages, buildAskPayload } from './ask-payload';
export type { ContextMode, ContextSelection } from './ask-payload';
export { readFailure, isMissingKey } from './error-text';
export type { CenturionFailure } from './error-text';
export { detailLines, formatPageList, TOOL_TITLES, QUICK_ACTIONS } from './tool-copy';
export type { DetailLine } from './tool-copy';
export { markSuggestedTerms, describeOutcome } from './redaction-handshake';
export type { MarkOutcome } from './redaction-handshake';
