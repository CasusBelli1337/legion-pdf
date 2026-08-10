/**
 * The hidden sheet the system print dialog actually prints. It is empty (and
 * costs nothing) until a print is prepared, and invisible on screen at all
 * times — `print.css` swaps it in for `@media print` only.
 */

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { getPrintSheet, subscribePrintSheet } from './print-controller';
import './print.css';

export function PrintSheet() {
  const sheet = useSyncExternalStore(subscribePrintSheet, getPrintSheet);
  if (sheet.pages.length === 0) return null;

  return createPortal(
    <div id="librarius-print-sheet" aria-hidden>
      {sheet.pages.map((url, index) => (
        <img key={url} src={url} alt={`Page ${index + 1} of ${sheet.total}`} />
      ))}
    </div>,
    document.body
  );
}
