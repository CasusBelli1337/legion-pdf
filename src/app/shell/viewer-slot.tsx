/**
 * Center stage: the drop target and the empty state around the viewer itself.
 */

import { useCallback, useState } from 'react';
import type { DragEvent } from 'react';
import { PdfViewer } from '../../components/viewer';
import { useActiveSession } from '../store';
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
      ) : (
        <PdfViewer key={session.id} session={session} />
      )}
    </section>
  );
}
