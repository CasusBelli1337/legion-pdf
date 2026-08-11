/**
 * What the Text and Cover tools draw over one page: the capture sheet, the box
 * being dragged, the box that was dragged, and the text about to be added.
 *
 * Kept out of the panel so the panel stays a form rather than a renderer.
 */

import type { PageOverlayContext, ViewerApi } from '@renderer/components/viewer';
import { AnchoredMark, RectMark } from './mark-preview';
import { PlacementSurface } from './placement-surface';
import { rectBetween, type Placement, type PlacementMode } from './use-placement';

export interface TextPreview {
  text: string;
  fontSize: number;
  color: string;
}

const DRAG_STYLE = 'bg-purple-400/20 outline outline-1 outline-dashed outline-purple-300';
const COVER_STYLE = 'bg-white/80 outline outline-1 outline-dashed outline-purple-400';
const INK_FONT = "Helvetica, Arial, 'Liberation Sans', sans-serif";

function TypedInk({ context, preview }: { context: PageOverlayContext; preview: TextPreview }) {
  return (
    <span
      className="whitespace-pre outline outline-1 outline-dashed outline-purple-400/70"
      style={{
        fontFamily: INK_FONT,
        fontSize: `${preview.fontSize * context.scale}px`,
        lineHeight: 1.15,
        color: preview.color,
      }}
    >
      {preview.text}
    </span>
  );
}

interface TextOverlayProps {
  api: ViewerApi | null;
  context: PageOverlayContext;
  mode: PlacementMode;
  placement: Placement;
  preview: TextPreview;
}

/** Only the marks that belong to THIS page, so the overlay itself stays simple. */
function marksFor(placement: Placement, page: number) {
  const drag = placement.drag;
  return {
    live: drag !== null && drag.page === page ? rectBetween(drag.from, drag.to) : null,
    cover: placement.rect !== null && placement.rect.page === page ? placement.rect.rect : null,
    point: placement.point !== null && placement.point.page === page ? placement.point.at : null,
  };
}

export function TextOverlay({ api, context, mode, placement, preview }: TextOverlayProps) {
  const { live, cover, point } = marksFor(placement, context.page);

  return (
    <>
      <PlacementSurface api={api} context={context} mode={mode} placement={placement} />
      {live !== null && <RectMark context={context} rect={live} className={DRAG_STYLE} />}
      {cover !== null && <RectMark context={context} rect={cover} className={COVER_STYLE} />}
      {point !== null && preview.text.length > 0 && (
        <AnchoredMark context={context} at={point} height={preview.fontSize}>
          <TypedInk context={context} preview={preview} />
        </AnchoredMark>
      )}
    </>
  );
}
