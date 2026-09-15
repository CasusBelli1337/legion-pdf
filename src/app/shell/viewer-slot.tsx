/**
 * Center stage: the drop target and the empty state around the viewer itself,
 * and the choice between one viewer and the side-by-side pair.
 */

import { useCallback, useState } from 'react';
import type { DragEvent } from 'react';
import { hasTabDrag, PdfViewer, SplitView } from '../../components/viewer';
import { useActiveSession, useAppStore } from '../store';
import { EmptyState } from './empty-state';
import { IdleToolbar } from './toolbar';

interface ViewerSlotProps {
  onOpenPaths(paths: string[]): void;
}

function pdfPathsFrom(event: DragEvent<HTMLElement>): string[] {
  return [...event.dataTransfer.files]
    .map((file) => window.librarius.file.pathForDrop(file))
    .filter((path) => path.toLowerCase().endsWith('.pdf'));
}

export function ViewerSlot({ onOpenPaths }: ViewerSlotProps) {
  const session = useActiveSession();
  const isSplitOpen = useAppStore((state) => state.isSplitOpen);
  const [isDragging, setIsDragging] = useState(false);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const paths = pdfPathsFrom(event);
      if (paths.length > 0) onOpenPaths(paths);
    },
    [onOpenPaths]
  );

  return (
    <section
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col bg-armory-canvas transition-colors duration-150 ${
        isDragging ? 'ring-2 ring-brand-700 ring-inset' : ''
      }`}
      onDragOver={(event) => {
        // A tab being dragged to the reference pane is not a file to open, so
        // it must not light the whole workspace up as a drop target.
        if (hasTabDrag(event.dataTransfer)) return;
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      {session === null ? (
        <>
          <IdleToolbar />
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EmptyState />
          </div>
        </>
      ) : isSplitOpen ? (
        <SplitView session={session} />
      ) : (
        <PdfViewer key={session.id} session={session} />
      )}
    </section>
  );
}
