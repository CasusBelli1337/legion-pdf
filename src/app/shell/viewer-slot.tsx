/**
 * Center stage. Holds the empty state and the drop target today; the viewer
 * lane mounts the real continuous-scroll renderer here.
 */

import { useCallback, useState } from 'react';
import type { DragEvent } from 'react';
import { FileText } from 'lucide-react';
import { useActiveSession, useAppStore } from '../store';

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
  const error = useAppStore((state) => state.error);
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
      className={`relative flex min-w-0 flex-1 items-center justify-center overflow-auto bg-armory-base transition-colors duration-150 ${
        isDragging ? 'ring-2 ring-purple-700 ring-inset' : ''
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      {session === null ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <FileText size={40} className="text-text-muted" aria-hidden />
          <p className="text-sm text-text-secondary">Drop a PDF here or press Ctrl+O</p>
          <p className="readout text-text-muted">Awaiting document</p>
          {error !== null && <p className="max-w-md text-xs text-danger">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-text-secondary">{session.fileName} is loaded.</p>
          <p className="readout text-text-muted">
            {session.pageCount} pages - viewer arrives with the viewer lane
          </p>
          {error !== null && <p className="max-w-md text-xs text-danger">{error}</p>}
        </div>
      )}
    </section>
  );
}
