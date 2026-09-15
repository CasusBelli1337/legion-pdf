/**
 * Export (export lane) — placeholder until the lane lands. The lane replaces
 * this component with the format picker built from `EXPORT_FORMATS`.
 */

import { ComingOnlinePanel } from '@renderer/app/shell/coming-online-panel';

export function ExportPanel() {
  return (
    <ComingOnlinePanel
      title="Export"
      summary="Save this document as a Word file, page images, a multi-page TIFF, or plain text."
      capabilities={[
        'Word (.docx) with fonts, sizes, and layout kept as closely as possible',
        'PNG or JPEG, one image per page',
        'Multi-page TIFF for productions',
        'Plain text',
      ]}
    />
  );
}
