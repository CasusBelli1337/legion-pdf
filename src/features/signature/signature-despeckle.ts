/**
 * Dust removal for a thresholded scan.
 *
 * Paper grain, JPEG blocking, and the pen's own bleed leave single dark pixels
 * scattered across the page. They pass a threshold as happily as real ink does,
 * so the ink mask is walked as connected regions and anything too small to be
 * part of a stroke is dropped. A signature stroke is thousands of pixels; a
 * speck is a handful.
 *
 * The walk uses an explicit stack rather than recursion: a full-page scan can
 * hold a region of a million pixels, and recursion would blow the stack on a
 * document the attorney would consider ordinary.
 */

/** Regions smaller than this are dust. Scales with the image, never below 4px. */
export function minSpeckArea(width: number, height: number): number {
  return Math.max(4, Math.round(width * height * 0.00002));
}

/** Every cell of the region containing `start`, marked seen as it goes. */
function regionFrom(
  mask: Uint8Array,
  width: number,
  height: number,
  start: number,
  seen: Uint8Array
): number[] {
  const stack = [start];
  const cells: number[] = [];
  seen[start] = 1;

  const consider = (cx: number, cy: number): void => {
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return;
    const neighbour = cy * width + cx;
    if (seen[neighbour] === 1 || mask[neighbour] !== 1) return;
    seen[neighbour] = 1;
    stack.push(neighbour);
  };

  while (stack.length > 0) {
    const index = stack.pop() ?? 0;
    cells.push(index);
    const x = index % width;
    const y = (index - x) / width;
    consider(x - 1, y);
    consider(x + 1, y);
    consider(x, y - 1);
    consider(x, y + 1);
  }
  return cells;
}

/**
 * The mask with every region under `minArea` cleared. Returns a new buffer —
 * the caller still needs the untouched mask for nothing, but a pure function
 * that cannot surprise its caller is worth one allocation.
 */
export function dropSpecks(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea: number
): Uint8Array {
  const kept = new Uint8Array(mask.length);
  const seen = new Uint8Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 1 || seen[index] === 1) continue;
    const region = regionFrom(mask, width, height, index, seen);
    if (region.length < minArea) continue;
    for (const cell of region) kept[cell] = 1;
  }
  return kept;
}
