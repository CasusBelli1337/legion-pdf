/**
 * The rules a scan carries only as ink: the double rule beside a pleading's
 * line numbers, the rule down its right edge, a caption's box, the line under
 * a heading. A scanned page has no drawing operators to read them from, so
 * they are found in its pixels — long, thin, straight runs of dark — and
 * reported like any drawn rule. Nothing is invented: a rule is only what the
 * picture shows.
 *
 * A scan is never quite square on the glass, so a rule is not one column of
 * pixels: over a page's height it wanders a dozen. The picture is read in
 * bands a few points deep; inside one band a rule IS a column (or row) of
 * dark, and from band to band it may step sideways a little. Type never
 * qualifies: no stroke of a letter fills a band from edge to edge and then
 * carries on for inches.
 */

import type { DarkPixels } from './scan-ink';

/** A rule in the picture's own pixels, origin top-left. */
export interface PixelRule {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A picture smaller than this either way is not a scanned page. */
const MIN_PAGE_PX = 600;
/**
 * Bands across the picture's shorter side: each twelve points deep on a letter
 * page — deeper than the stem of any letter a filing is typed in, so type
 * never fills one.
 */
const BANDS = 50;
/** This share of a band's pixels must be ink for it to be part of a rule. */
const FILLED = 0.85;
/** A rule is at most this thick, as a share of the picture's width (3.5 pt on a letter page). */
const MAX_THICK_SHARE = 3.5 / 612;
/** The shortest upright rule and the shortest level one, as shares of the picture's width. */
const MIN_UPRIGHT_SHARE = 60 / 612;
const MIN_LEVEL_SHARE = 30 / 612;
/** How far a rule may step sideways from one band to the next, as a share of the band. */
const STEP_SHARE = 0.08;
/** Bands a rule may vanish for (a stamp over it, a fold) and still be one rule. */
const MAX_GAP = 3;
/** A rule is seen in at least this share of the bands it spans; letters stacked line over line are not. */
const SEEN_SHARE = 0.7;
/** Ink this close to the picture's edge, as a share of its width, is the scanner's shadow. */
const EDGE_SHARE = 0.012;

/** One band's sighting of a rule: where across the picture, and how thick. */
interface Sighting {
  band: number;
  from: number;
  to: number;
}

interface Chain {
  sightings: Sighting[];
}

/**
 * The picture seen along one axis. `along` is the direction a rule runs
 * (down for an upright rule), `across` the direction it is thin in.
 */
interface Axis {
  along: number;
  across: number;
  /** Index into `dark` of the pixel at (position along, position across). */
  at(along: number, across: number): number;
}

interface BandInk {
  /** Ink pixels in each column of the band. */
  counts: Uint16Array;
  /** Positions where column n OR column n + 1 is ink. */
  either: Uint16Array;
}

/**
 * A hairline a pixel wide leans from one column into the next inside a band,
 * so the band is also counted two columns at a time. (Type fails that as it
 * fails the plain count: two rows through a line of text are inked in the
 * same places.)
 */
function inkOf(pixels: DarkPixels, axis: Axis, band: number, size: number): BandInk {
  const counts = new Uint16Array(axis.across);
  const either = new Uint16Array(axis.across);
  const start = band * size;
  for (let along = start; along < start + size; along += 1) {
    let previous = 0;
    for (let across = 0; across < axis.across; across += 1) {
      const ink = pixels.dark[axis.at(along, across)] ?? 0;
      counts[across] = (counts[across] ?? 0) + ink;
      if (across > 0) either[across - 1] = (either[across - 1] ?? 0) + (ink | previous);
      previous = ink;
    }
  }
  return { counts, either };
}

function sightingsIn(pixels: DarkPixels, axis: Axis, band: number, size: number): Sighting[] {
  const { counts, either } = inkOf(pixels, axis, band, size);
  const need = FILLED * size;
  const most = (across: number): number =>
    Math.max(counts[across] ?? 0, either[across] ?? 0, either[across - 1] ?? 0);
  const filled = (across: number): boolean => (counts[across] ?? 0) > 0 && most(across) >= need;
  const sightings: Sighting[] = [];
  let from = -1;
  for (let across = 0; across <= axis.across; across += 1) {
    if (filled(across) && from < 0) from = across;
    if (!filled(across) && from >= 0) {
      sightings.push({ band, from, to: across });
      from = -1;
    }
  }
  return sightings;
}

const centre = (sighting: Sighting): number => (sighting.from + sighting.to) / 2;

/** Sightings joined band to band into the rules they are pieces of. */
function chainsOf(sightings: readonly Sighting[], step: number): Chain[] {
  const chains: Chain[] = [];
  for (const sighting of sightings) {
    const home = chains.find((chain) => {
      const last = chain.sightings.at(-1);
      if (last === undefined || last.band === sighting.band) return false;
      const gap = sighting.band - last.band;
      return gap <= MAX_GAP + 1 && Math.abs(centre(sighting) - centre(last)) <= step * gap;
    });
    if (home === undefined) chains.push({ sightings: [sighting] });
    else home.sightings.push(sighting);
  }
  return chains;
}

function middle(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** True where the rule the sighting saw has ink at this position along it. */
function inkedAt(pixels: DarkPixels, axis: Axis, sighting: Sighting, along: number): boolean {
  for (let across = sighting.from - 1; across <= sighting.to; across += 1) {
    if (across >= 0 && across < axis.across && pixels.dark[axis.at(along, across)] === 1) {
      return true;
    }
  }
  return false;
}

/**
 * Where the rule's ink ends, looking from the edge of the band that saw it in
 * the direction of `step`: back into the band when the rule stopped short of
 * the edge, on past it for as long as the ink carries.
 */
function reach(pixels: DarkPixels, axis: Axis, sighting: Sighting, edge: number, step: number) {
  let along = edge;
  const within = (position: number): boolean => position >= 0 && position < axis.along;
  while (within(along - step) && !inkedAt(pixels, axis, sighting, along)) along -= step;
  while (within(along + step) && inkedAt(pixels, axis, sighting, along + step)) along += step;
  return along;
}

interface Stroke {
  /** Where the rule starts and ends along its run, pixels. */
  from: number;
  to: number;
  /** Where it sits across, and how thick, pixels. */
  at: number;
  thick: number;
}

function strokeOf(pixels: DarkPixels, axis: Axis, chain: Chain, size: number): Stroke | null {
  const first = chain.sightings[0];
  const last = chain.sightings.at(-1);
  if (first === undefined || last === undefined) return null;
  if (chain.sightings.length < SEEN_SHARE * (last.band - first.band + 1)) return null;
  const from = reach(pixels, axis, first, first.band * size, -1);
  const to = reach(pixels, axis, last, (last.band + 1) * size - 1, 1) + 1;
  const thick = middle(chain.sightings.map((sighting) => sighting.to - sighting.from));
  return { from, to, at: middle(chain.sightings.map(centre)) - thick / 2, thick };
}

/** Every rule running along `axis`, at least `minLength` pixels long. */
function strokesAlong(pixels: DarkPixels, axis: Axis, minLength: number): Stroke[] {
  const size = Math.max(8, Math.round(Math.min(pixels.width, pixels.height) / BANDS));
  const maxThick = Math.max(3, Math.round(MAX_THICK_SHARE * pixels.width));
  const edge = EDGE_SHARE * pixels.width;
  const sightings: Sighting[] = [];
  for (let band = 0; (band + 1) * size <= axis.along; band += 1) {
    for (const sighting of sightingsIn(pixels, axis, band, size)) {
      const thin = sighting.to - sighting.from <= maxThick;
      const inside = sighting.from >= edge && sighting.to <= axis.across - edge;
      if (thin && inside) sightings.push(sighting);
    }
  }
  return chainsOf(sightings, Math.max(2, STEP_SHARE * size))
    .map((chain) => strokeOf(pixels, axis, chain, size))
    .filter((stroke): stroke is Stroke => stroke !== null && stroke.to - stroke.from >= minLength);
}

/** True for a picture large enough to be a scanned page — the only kind read for rules. */
export function isPageSized(width: number, height: number): boolean {
  return width >= MIN_PAGE_PX && height >= MIN_PAGE_PX;
}

/** The rules drawn in a scanned page's ink; none for a picture too small to be a page. */
export function scanRulesOf(pixels: DarkPixels): PixelRule[] {
  const { width, height } = pixels;
  if (!isPageSized(width, height)) return [];
  const upright: Axis = { along: height, across: width, at: (y, x) => y * width + x };
  const level: Axis = { along: width, across: height, at: (x, y) => y * width + x };
  return [
    ...strokesAlong(pixels, upright, MIN_UPRIGHT_SHARE * width).map((stroke) => ({
      x: stroke.at,
      y: stroke.from,
      width: stroke.thick,
      height: stroke.to - stroke.from,
    })),
    ...strokesAlong(pixels, level, MIN_LEVEL_SHARE * width).map((stroke) => ({
      x: stroke.from,
      y: stroke.at,
      width: stroke.to - stroke.from,
      height: stroke.thick,
    })),
  ];
}
