/**
 * What a tab can actually show of a file name.
 *
 * Litigation file names are long and their DISCRIMINATING part is at the end —
 * "Smith v Jones - Deposition of Jane Roe Vol 1.pdf" against the same name plus
 * " (redacted)". A plain CSS `truncate` cuts the tail, so both render as
 * "Smith v Jones - D…" and the tab stops naming the document at all. Keeping
 * the tail is what makes two tabs tellable apart, so the ellipsis goes in the
 * MIDDLE and the last characters always survive.
 */

/** Characters that always survive, chosen to cover " (redacted).pdf". */
const TAIL = 16;

export function tabLabel(fileName: string, limit: number): string {
  if (limit <= 1 || fileName.length <= limit) return fileName;
  const tail = Math.min(TAIL, limit - 2);
  const head = limit - tail - 1;
  return `${fileName.slice(0, head)}…${fileName.slice(fileName.length - tail)}`;
}
