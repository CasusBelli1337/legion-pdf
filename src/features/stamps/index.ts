/** Lane C's renderer entry point: the two stamping dock panels and their parts. */

export { BatesPanel } from './bates-panel';
export { StampsPanel } from './stamps-panel';
export type { StampSectionProps } from './stamps-panel';

export { useStampRunner, describeError } from './use-stamp-runner';
export type { StampRunner } from './use-stamp-runner';
export { useMarkOverlay } from './use-mark-overlay';
export { usePlacement, pdfPointOf, rectBetween } from './use-placement';
export type { Placement, PlacementMode, PlacedPoint, PlacedRect } from './use-placement';
export { ClickSurface, PlacementSurface } from './placement-surface';
export {
  AnchoredMark,
  BandMark,
  CentredMark,
  CornerMark,
  RectMark,
  StampMark,
} from './mark-preview';
export type { MarkText } from './mark-preview';
export {
  ActionButton,
  Caution,
  ChoiceField,
  EmptyPanel,
  Field,
  Hint,
  NumberField,
  Problem,
  Receipt,
  Section,
  TextField,
  Toggle,
  Working,
} from './stamp-views';
export { ALL_PAGES, describePageCount, everyPage, parsePageRange } from './page-range';
export type { PageRangeResult } from './page-range';
export { nextExhibitLabel } from './exhibit-label';
