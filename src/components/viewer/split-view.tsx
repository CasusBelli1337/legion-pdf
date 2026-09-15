/**
 * Side by side: the working document on the left, a reference document on the
 * right, with the same draggable divider the tool dock and the thumbnail rail
 * use (app/shell/panels).
 *
 * The LEFT pane is the whole ordinary viewer — its toolbar, its find bar, its
 * overlays — because it is still the active tab. Nothing about the tool dock,
 * the rail or the keyboard shortcuts changes; the split only adds a second
 * place to look.
 */

import type { DocumentSession } from '@shared/types';
import { ResizeHandle, usePanelWidth, type PanelSize } from '../../app/shell/panels';
import { PdfViewer } from './pdf-viewer';
import { ReferencePane } from './reference-pane';

/**
 * The reference pane's width, remembered between sessions like the other two
 * panels. It grows as the divider is dragged LEFT, because the handle sits on
 * the pane's inner edge.
 */
const REFERENCE_SIZE: PanelSize = {
  storageKey: 'legion-pdf.split-width',
  min: 260,
  max: 1400,
  preferred: 520,
};

export function SplitView({ session }: { session: DocumentSession }) {
  const width = usePanelWidth(REFERENCE_SIZE, 'left');

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <PdfViewer key={session.id} session={session} />
      <ResizeHandle control={width} label="Side-by-side divider" />
      <div className="flex min-h-0 shrink-0 flex-col" style={{ width: `${width.width}px` }}>
        <ReferencePane />
      </div>
    </div>
  );
}
