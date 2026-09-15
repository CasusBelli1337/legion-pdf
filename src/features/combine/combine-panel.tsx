/**
 * Combine Files (Explorer-combine lane) — placeholder until the lane lands.
 * The lane replaces this component with the real list-and-merge panel.
 */

import { ComingOnlinePanel } from '@renderer/app/shell/coming-online-panel';

export function CombinePanel() {
  return (
    <ComingOnlinePanel
      title="Combine Files"
      summary="Pick PDFs, Word documents, and images, put them in order, and merge them into one PDF."
      capabilities={[
        'Right-click files in Windows Explorer and choose Combine in Legion PDF',
        'Drag to reorder before combining',
        'Word documents and images are converted on the way in',
      ]}
    />
  );
}
