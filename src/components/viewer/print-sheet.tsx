/**
 * The hidden sheet the system print dialog actually prints. It is empty (and
 * costs nothing) until a print is prepared, and invisible on screen at all
 * times — `print.css` swaps it in for `@media print` only.
 *
 * Each page image is wrapped in a box of its own. That wrapper is what
 * `print.css` sizes to exactly one sheet of paper, so no page can overflow onto
 * a second sheet (the "said 15 pages, printed 30" bug).
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
        <div key={url} className="librarius-print-page">
          <img src={url} alt={`Page ${index + 1} of ${sheet.total}`} />
        </div>
      ))}
    </div>,
    document.body
  );
}
