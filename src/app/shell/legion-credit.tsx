/**
 * Who made this, on the right of the status footer. Quiet on purpose: the
 * attorney's document is the point, and this is a maker's mark, not an advert.
 * The blurb is the first thing to go when the footer runs out of room — the
 * error and notice lines to its left always win the space.
 */

const BLURB = 'Built by Legion — actually reliable litigation drafting at AI speed';
const SITE = 'legion.law';
const SITE_URL = 'https://www.legion.law';

export function LegionCredit() {
  return (
    <span className="ml-auto flex min-w-0 items-baseline gap-1.5 pl-3">
      <span className="readout hidden truncate text-text-muted lg:inline">{BLURB}</span>
      <span className="readout hidden shrink-0 text-text-muted lg:inline" aria-hidden>
        ·
      </span>
      <button
        type="button"
        onClick={() => void window.librarius.app.openPath(SITE_URL).catch(() => undefined)}
        title={`Open ${SITE_URL} in your browser`}
        className="readout shrink-0 text-text-muted underline decoration-dotted underline-offset-2 transition-colors duration-150 hover:text-brand-400"
      >
        {SITE}
      </button>
    </span>
  );
}
