/**
 * A stored signature's path as a URL the <img> tag can try.
 *
 * The renderer never reads the file itself — the main process owns it — so the
 * only way to SHOW a thumbnail is to point the browser at it. Windows paths
 * need their separators turned around and a drive letter needs the third
 * slash, both of which are easy to get wrong by hand.
 */

export function fileUrl(path: string): string {
  const forward = path.replace(/\\/g, '/');
  const rooted = forward.startsWith('/') ? forward : `/${forward}`;
  return `file://${encodeURI(rooted).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}
