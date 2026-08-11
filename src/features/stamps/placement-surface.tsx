/**
 * The transparent sheet that catches clicks and drags over a page while a
 * placement tool is armed. It is only mounted while a tool IS armed, so text
 * selection and the find highlights keep working the rest of the time.
 */

import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PdfPoint } from '@shared/types';
import type { PageOverlayContext, ViewerApi } from '@renderer/components/viewer';
import { pdfPointOf, type Placement, type PlacementMode } from './use-placement';

interface ClickSurfaceProps {
  api: ViewerApi | null;
  context: PageOverlayContext;
  onPoint(page: number, at: PdfPoint): void;
}

/**
 * The simplest form: one click, one point, straight to a callback. Used where
 * the click CREATES something the attorney then adjusts (a signature), rather
 * than parking a point the panel reads later.
 */
export function ClickSurface({ api, context, onPoint }: ClickSurfaceProps) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 cursor-crosshair"
      onPointerDown={(event) => {
        const at = pdfPointOf(api, context.page, event);
        if (at !== null) onPoint(context.page, at);
      }}
    />
  );
}

interface PlacementSurfaceProps {
  api: ViewerApi | null;
  context: PageOverlayContext;
  mode: PlacementMode;
  placement: Placement;
}

export function PlacementSurface({ api, context, mode, placement }: PlacementSurfaceProps) {
  if (mode === 'off') return null;

  const read = (event: ReactPointerEvent<HTMLDivElement>): PdfPoint | null =>
    pdfPointOf(api, context.page, event);

  const down = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const at = read(event);
    if (at === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    placement.begin(context.page, at);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (placement.drag === null) return;
    const at = read(event);
    if (at === null) return;
    placement.move(context.page, at);
  };

  const up = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    placement.end();
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 cursor-crosshair"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  );
}
