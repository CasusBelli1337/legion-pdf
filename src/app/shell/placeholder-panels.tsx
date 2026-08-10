/**
 * One placeholder component per registry entry. A feature lane deletes its own
 * export here and points its tool-registry entry at the real panel.
 */

import { ComingOnlinePanel } from './coming-online-panel';

export function OrganizePanelPlaceholder() {
  return (
    <ComingOnlinePanel
      title="Organize Pages"
      summary="Rearrange, rotate, delete, extract, split, and combine documents."
      capabilities={[
        'Drag pages into a new order',
        'Rotate, delete, or pull pages into a new PDF',
        'Split by page ranges, or combine several files into one',
      ]}
    />
  );
}

export function BatesPanelPlaceholder() {
  return (
    <ComingOnlinePanel
      title="Bates Numbering"
      summary="Stamp a continuous production number on every page in a range."
      capabilities={[
        'Prefix, start number, and zero-padding',
        'Any of the four page corners, with an optional white backing box',
        'Preview on the current page before applying',
      ]}
    />
  );
}

export function StampsPanelPlaceholder() {
  return (
    <ComingOnlinePanel
      title="Stamps & Marks"
      summary="Exhibit stamps, slip sheets, watermarks, page numbers, signatures, and text."
      capabilities={[
        'Exhibit stamps that auto-increment across files',
        'DRAFT and CONFIDENTIAL watermarks',
        'Signatures flattened into the page, not deletable annotations',
      ]}
    />
  );
}

export function OcrPanelPlaceholder() {
  return (
    <ComingOnlinePanel
      title="Text Recognition"
      summary="Make a scanned document searchable, on this machine and fully offline."
      capabilities={[
        'Finds the pages that have no text layer',
        'Uses every CPU core, with page-by-page progress',
        'Writes an invisible text layer under the scan',
      ]}
    />
  );
}

export function RedactPanelPlaceholder() {
  return (
    <ComingOnlinePanel
      title="Redaction"
      summary="Destroy content instead of covering it, then prove it is gone."
      capabilities={[
        'Draw boxes, or mark every instance of a term at once',
        'Applying rebuilds the page from a raster - the text is destroyed',
        'A verification receipt confirms the text is absent from the saved file',
      ]}
    />
  );
}

export function CenturionPanelPlaceholder() {
  return (
    <ComingOnlinePanel
      title="Centurion"
      summary="Ask Claude about the document you have open."
      capabilities={[
        'Answers stream in as they are written',
        'Your API key is encrypted by Windows and never written to a file',
        'Clipped answers are retried, never shown as finished',
      ]}
    />
  );
}
