/**
 * The reference pane's own controls. It sits at the same height as the app's
 * toolbar and uses the same row styling, so the two read as one chrome row
 * across the window rather than as a second bar stacked under the first.
 *
 * Everything here acts on the RIGHT pane only. The document chooser, the page
 * box and the zoom box never touch the working document — that is the whole
 * point of the pane.
 */

import { ArrowLeftRight, ChevronDown, ChevronUp, Link2, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { DocumentSession } from '@shared/types';
import {
  TOOLBAR_BUTTON,
  TOOLBAR_DIVIDER,
  TOOLBAR_ROW,
  TOOLBAR_TRAILING,
} from '../../app/shell/toolbar';
import { NumberField } from './toolbar-controls';

export interface ReferenceHeaderProps {
  /** Every other open document — what the chooser offers. */
  choices: readonly DocumentSession[];
  docId: string | null;
  currentPage: number;
  pageCount: number;
  zoom: number;
  isSynced: boolean;
  onChoose(docId: string): void;
  onGoToPage(page: number): void;
  onZoomBy(factor: number): void;
  onSetZoom(zoom: number): void;
  onToggleSync(): void;
  onSwap(): void;
  onClose(): void;
}

/** Wide enough to read a file name; the rest of the row scrolls under the
 *  sticky pane actions rather than squeezing the chooser to nothing. */
const SELECT_CLASS =
  'h-6 min-w-32 flex-1 rounded border border-armory-border bg-armory-base px-1.5 text-xs ' +
  'text-text-primary focus:border-armory-focus focus:outline-none';

function DocumentChooser({
  choices,
  docId,
  onChoose,
}: Pick<ReferenceHeaderProps, 'choices' | 'docId' | 'onChoose'>) {
  return (
    <select
      className={SELECT_CLASS}
      aria-label="Document to show beside this one"
      title="Document to show beside this one"
      value={docId ?? ''}
      onChange={(event) => onChoose(event.target.value)}
    >
      {docId === null && <option value="">Choose a document</option>}
      {choices.map((choice) => (
        <option key={choice.id} value={choice.id}>
          {choice.fileName}
        </option>
      ))}
    </select>
  );
}

function ReferencePaging({
  currentPage,
  pageCount,
  onGoToPage,
}: Pick<ReferenceHeaderProps, 'currentPage' | 'pageCount' | 'onGoToPage'>) {
  return (
    <>
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={() => onGoToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page in the reference pane"
        title="Previous page"
      >
        <ChevronUp size={14} aria-hidden />
      </button>
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={() => onGoToPage(currentPage + 1)}
        disabled={currentPage >= pageCount}
        aria-label="Next page in the reference pane"
        title="Next page"
      >
        <ChevronDown size={14} aria-hidden />
      </button>
      <NumberField
        label="Reference page number"
        value={currentPage}
        onCommit={(value) => onGoToPage(Math.min(Math.max(value, 1), pageCount))}
      />
      <span className="readout shrink-0 text-text-muted">of {pageCount}</span>
    </>
  );
}

function ReferenceZoom({
  zoom,
  onZoomBy,
  onSetZoom,
}: Pick<ReferenceHeaderProps, 'zoom' | 'onZoomBy' | 'onSetZoom'>) {
  return (
    <>
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={() => onZoomBy(1 / 1.25)}
        aria-label="Zoom out the reference pane"
        title="Zoom out"
      >
        <ZoomOut size={14} aria-hidden />
      </button>
      <NumberField
        label="Reference zoom percentage"
        value={Math.round(zoom * 100)}
        suffix="%"
        onCommit={(value) => onSetZoom(value / 100)}
      />
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={() => onZoomBy(1.25)}
        aria-label="Zoom in the reference pane"
        title="Zoom in"
      >
        <ZoomIn size={14} aria-hidden />
      </button>
    </>
  );
}

/**
 * Sticky, like the app toolbar's trailing group: at a narrow pane width the row
 * scrolls, and a Close button scrolled off the edge is one the attorney cannot
 * reach.
 */
function PaneActions({
  isSynced,
  onToggleSync,
  onSwap,
  onClose,
}: Pick<ReferenceHeaderProps, 'isSynced' | 'onToggleSync' | 'onSwap' | 'onClose'>) {
  return (
    <div className={TOOLBAR_TRAILING}>
      <button
        type="button"
        className={`${TOOLBAR_BUTTON} ${isSynced ? 'bg-armory-interactive text-brand-400' : ''}`}
        onClick={onToggleSync}
        aria-label="Scroll together"
        aria-pressed={isSynced}
        title="Scroll together — keep this pane on the same page number"
      >
        <Link2 size={14} aria-hidden />
      </button>
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={onSwap}
        aria-label="Swap the two documents"
        title="Swap the two documents"
      >
        <ArrowLeftRight size={14} aria-hidden />
      </button>
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={onClose}
        aria-label="Close side by side"
        title="Close side by side"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

export function ReferenceHeader(props: ReferenceHeaderProps) {
  const hasDocument = props.docId !== null;
  return (
    <div className={TOOLBAR_ROW}>
      <DocumentChooser choices={props.choices} docId={props.docId} onChoose={props.onChoose} />
      {hasDocument && (
        <>
          <span className={TOOLBAR_DIVIDER} />
          <ReferencePaging
            currentPage={props.currentPage}
            pageCount={props.pageCount}
            onGoToPage={props.onGoToPage}
          />
          <span className={TOOLBAR_DIVIDER} />
          <ReferenceZoom zoom={props.zoom} onZoomBy={props.onZoomBy} onSetZoom={props.onSetZoom} />
        </>
      )}
      <PaneActions
        isSynced={props.isSynced}
        onToggleSync={props.onToggleSync}
        onSwap={props.onSwap}
        onClose={props.onClose}
      />
    </div>
  );
}
