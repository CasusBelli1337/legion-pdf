/**
 * The app's one chrome row: file actions, document history, the page indicator
 * with type-to-jump, zoom controls, fit presets, find, and the theme switch.
 * The native menu bar is hidden, so this bar and the status footer are the
 * whole of the window's furniture. It sits above the pages and never covers
 * them.
 */

import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Maximize,
  Redo2,
  Search,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  BusyIndicator,
  FileActions,
  ThemeToggle,
  TOOLBAR_BUTTON,
  TOOLBAR_DIVIDER,
  TOOLBAR_PRESET,
  TOOLBAR_ROW,
  TOOLBAR_TRAILING,
} from '../../app/shell/toolbar';
import { redoActive, undoActive } from '../../app/undo-actions';
import { useUndoState } from '../../features/undo';
import { NumberField } from './toolbar-controls';
import type { FitMode } from './tab-view-state';

export interface ViewerToolbarProps {
  currentPage: number;
  pageCount: number;
  zoom: number;
  fitMode: FitMode;
  isFindOpen: boolean;
  showHarness: boolean;
  onGoToPage(page: number): void;
  onZoomBy(factor: number): void;
  onSetZoom(zoom: number): void;
  onFit(mode: FitMode): void;
  onToggleFind(): void;
  onToggleHarness(): void;
}

/**
 * Undo/Redo for the document itself — a way back from any change to the PDF.
 * The enabled state comes from the main-process history, refreshed whenever an
 * operation swaps the session in, so the buttons never claim a step that is
 * not there.
 */
function HistoryGroup() {
  const { canUndo, canRedo } = useUndoState();
  return (
    <>
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={() => void undoActive()}
        disabled={!canUndo}
        aria-label="Undo the last change"
        title="Undo the last change (Ctrl+Z)"
      >
        <Undo2 size={14} aria-hidden />
      </button>
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={() => void redoActive()}
        disabled={!canRedo}
        aria-label="Redo the change"
        title="Redo the change (Ctrl+Y)"
      >
        <Redo2 size={14} aria-hidden />
      </button>
    </>
  );
}

function PageJump({
  currentPage,
  pageCount,
  onGoToPage,
}: Pick<ViewerToolbarProps, 'currentPage' | 'pageCount' | 'onGoToPage'>) {
  return (
    <>
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={() => onGoToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
        title="Previous page"
      >
        <ChevronUp size={14} aria-hidden />
      </button>
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={() => onGoToPage(currentPage + 1)}
        disabled={currentPage >= pageCount}
        aria-label="Next page"
        title="Next page"
      >
        <ChevronDown size={14} aria-hidden />
      </button>
      <NumberField
        label="Page number"
        value={currentPage}
        onCommit={(value) => onGoToPage(Math.min(Math.max(value, 1), pageCount))}
      />
      <span className="readout shrink-0 text-text-muted">of {pageCount}</span>
    </>
  );
}

function ZoomGroup({
  zoom,
  onZoomBy,
  onSetZoom,
}: Pick<ViewerToolbarProps, 'zoom' | 'onZoomBy' | 'onSetZoom'>) {
  return (
    <>
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={() => onZoomBy(1 / 1.25)}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <ZoomOut size={14} aria-hidden />
      </button>
      <NumberField
        label="Zoom percentage"
        value={Math.round(zoom * 100)}
        suffix="%"
        onCommit={(value) => onSetZoom(value / 100)}
      />
      <button
        type="button"
        className={TOOLBAR_BUTTON}
        onClick={() => onZoomBy(1.25)}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <ZoomIn size={14} aria-hidden />
      </button>
    </>
  );
}

function FitPresets({ fitMode, onFit }: Pick<ViewerToolbarProps, 'fitMode' | 'onFit'>) {
  const presetClass = (mode: FitMode): string =>
    `${TOOLBAR_PRESET} ${fitMode === mode ? 'bg-armory-interactive text-brand-400' : 'text-text-muted'}`;

  return (
    <>
      <button
        type="button"
        className={presetClass('width')}
        aria-pressed={fitMode === 'width'}
        onClick={() => onFit('width')}
      >
        Fit width
      </button>
      <button
        type="button"
        className={presetClass('page')}
        aria-pressed={fitMode === 'page'}
        onClick={() => onFit('page')}
      >
        <Maximize size={13} aria-hidden />
        Fit page
      </button>
    </>
  );
}

function TrailingGroup({
  isFindOpen,
  showHarness,
  onToggleFind,
  onToggleHarness,
}: Pick<ViewerToolbarProps, 'isFindOpen' | 'showHarness' | 'onToggleFind' | 'onToggleHarness'>) {
  return (
    <div className={TOOLBAR_TRAILING}>
      <BusyIndicator />
      {showHarness && (
        <button
          type="button"
          className={TOOLBAR_BUTTON}
          onClick={onToggleHarness}
          aria-label="Coordinate check"
          title="Coordinate check (development build only)"
        >
          <Crosshair size={14} aria-hidden />
        </button>
      )}
      <button
        type="button"
        className={`${TOOLBAR_BUTTON} ${isFindOpen ? 'bg-armory-interactive text-brand-400' : ''}`}
        onClick={onToggleFind}
        aria-label="Find in document"
        aria-pressed={isFindOpen}
        title="Find in document (Ctrl+F)"
      >
        <Search size={14} aria-hidden />
      </button>
      <ThemeToggle />
    </div>
  );
}

export function ViewerToolbar(props: ViewerToolbarProps) {
  return (
    <div className={TOOLBAR_ROW}>
      <FileActions />
      <span className={TOOLBAR_DIVIDER} />
      <HistoryGroup />
      <span className={TOOLBAR_DIVIDER} />
      <PageJump
        currentPage={props.currentPage}
        pageCount={props.pageCount}
        onGoToPage={props.onGoToPage}
      />
      <span className={TOOLBAR_DIVIDER} />
      <ZoomGroup zoom={props.zoom} onZoomBy={props.onZoomBy} onSetZoom={props.onSetZoom} />
      <FitPresets fitMode={props.fitMode} onFit={props.onFit} />
      <TrailingGroup
        isFindOpen={props.isFindOpen}
        showHarness={props.showHarness}
        onToggleFind={props.onToggleFind}
        onToggleHarness={props.onToggleHarness}
      />
    </div>
  );
}
