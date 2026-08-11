/**
 * What the recent-documents list says, and how it says a timestamp. Pure so the
 * two sentences an attorney reads when a file has moved are tested, not
 * eyeballed.
 */

import { PRODUCT_NAME } from '@shared/product';

/** How many entries the empty state shows, however many are kept on disk. */
export const MAX_RECENT_SHOWN = 10;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local time, sortable, mono-friendly: "2026-08-10 14:32". */
export function formatOpenedAt(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return 'unknown';
  const date = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  return `${date} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

/** Said out loud, never silently: the file is gone AND it left the list. */
export function missingFileNotice(fileName: string): string {
  return (
    `${PRODUCT_NAME} could not open ${fileName}. It may have been moved, renamed, or deleted, ` +
    'so it has been taken off this list.'
  );
}
