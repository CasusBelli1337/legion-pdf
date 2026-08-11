/**
 * What Centurion is allowed to DO, rather than say. Every tool call the model
 * proposes is shown to the attorney on a confirm card and waits: nothing here
 * touches a document until `ai:toolDecision` carries an 'approved' back.
 *
 * Types only — re-exported type-only from @shared/types.
 */

/** The document operations Centurion may propose. One name per confirm card. */
export type CenturionToolName =
  | 'applyBates'
  | 'applyWatermark'
  | 'applyExhibitStamp'
  | 'applyPageNumbers'
  | 'setBookmarks'
  | 'suggestRedactions';

/**
 * One pending tool call, streamed to the panel on an `ai:chunk`. `input` is
 * unknown by design: the shape belongs to the tool, and main validates it
 * against that tool's schema before running anything.
 */
export interface CenturionToolProposal {
  /** Anthropic's tool_use id — what the decision refers back to. */
  toolUseId: string;
  name: CenturionToolName;
  input: unknown;
  /** Plain-English one-liner shown on the confirm card, e.g. "Stamp ASHFORD000001-000312 on all 312 pages." */
  summary: string;
}

/** The attorney's answer to a confirm card. There is no third option. */
export type CenturionToolDecision = 'approved' | 'rejected';
