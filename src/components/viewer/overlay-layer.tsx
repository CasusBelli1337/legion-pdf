/**
 * The seam wave-3 tools mount into. Every registered overlay is rendered once
 * per visible page, absolutely positioned over that page's canvas, and handed
 * the geometry it needs to place marks in PDF coordinates.
 *
 * The layer itself ignores the mouse; an overlay that needs clicks turns them
 * back on for its own elements (`pointer-events-auto`).
 */

import { useSyncExternalStore } from 'react';
import { pdfRectToLocalBox } from './page-geometry';
import type { ViewerController } from './viewer-controller';
import type { PageOverlayContext } from './viewer-types';

interface OverlayLayerProps {
  page: number;
  controller: ViewerController;
}

export function OverlayLayer({ page, controller }: OverlayLayerProps) {
  const overlays = useSyncExternalStore(controller.subscribeOverlays, controller.overlaySnapshot);
  const geometry = controller.getGeometry(page);
  const rect = controller.pageRect(page);

  if (overlays.length === 0 || geometry === null || rect === null) return null;

  const context: PageOverlayContext = {
    page,
    rect,
    scale: geometry.scale,
    size: geometry.size,
    toLocalBox: (pdfRect) => pdfRectToLocalBox(geometry.transform, pdfRect),
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      {overlays.map((overlay) => (
        <div key={overlay.id} className="absolute inset-0">
          {overlay.render(context)}
        </div>
      ))}
    </div>
  );
}
