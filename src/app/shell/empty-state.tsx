/**
 * What the centre of the app says with no document open: how to open one, and
 * the documents this attorney had open last.
 */

import { FileText } from 'lucide-react';
import { useScopedError } from '../store';
import { RecentFiles } from './recent-files';

export function EmptyState() {
  const error = useScopedError();

  return (
    <div className="flex max-h-full w-full flex-col items-center justify-center gap-3 self-center overflow-y-auto p-6 text-center">
      <FileText size={40} className="text-text-muted" aria-hidden />
      <p className="text-sm text-text-secondary">Drop a PDF here or press Ctrl+O</p>
      <p className="readout text-text-muted">Awaiting document</p>
      {error !== null && <p className="max-w-md text-xs text-danger">{error}</p>}
      <RecentFiles />
    </div>
  );
}
