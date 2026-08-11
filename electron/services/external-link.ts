/**
 * The one gate between `app:openPath` and the outside world.
 *
 * `app:openPath` exists to reveal a file the app just wrote. The status
 * footer's Legion credit needs the same channel to open a web page, and the
 * two are NOT interchangeable: `shell.openPath` cannot open a URL, and
 * `shell.openExternal` will happily hand `javascript:`, `mailto:`, or a custom
 * protocol to whatever is registered for it. So exactly one scheme crosses —
 * https — and everything else stays a file path.
 */

/** True only for a well-formed https:// URL. Everything else is a path. */
export function isExternalWebLink(target: string): boolean {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    // Not a URL at all — a Windows path, a relative name, anything.
    return false;
  }
  return url.protocol === 'https:';
}
