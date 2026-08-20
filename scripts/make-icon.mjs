/**
 * make-icon.mjs — compose the Legion "L" into the app icon.
 *
 *   npm run build:icon
 *
 * Input  resources/brand/fav.svg   (the Legion mark, drawn on a 16-unit grid)
 * Output build/icon.png            (512x512, RGBA)
 *        build/icon-check-{16,24,32}.png  (legibility proofs, throwaway)
 *
 * electron-builder turns icon.png into the multi-size .ico it stamps on the
 * .exe, the NSIS installer, and the Start-menu shortcut (see the `win.icon`
 * field in electron-builder.yml), which is why the output is a single large
 * square rather than a favicon-sized bitmap.
 *
 * WHY A WHITE TILE. The mark is maroon (#5D103B) on transparency, which
 * disappears against the app's own near-black toolbar and against a dark
 * Windows taskbar. So the icon is drawn as a white rounded-square tile with the
 * mark on it: the tile is the thing that reads at 16px, and the maroon has
 * something to be maroon against.
 *
 * WHY A DRAWN "L" AND NOT fav.svg. The brand file's frame paths read as
 * empty boxes once the LEGION lettering is dropped (owner, 2026-08-19: "I
 * just see the purple boxes and not the Legion name"), and the lettering
 * itself is a smear below 32px. So the icon draws its own mark: one solid,
 * unmistakable "L" in Legion maroon, thick enough to survive 16px.
 *
 * Why Electron and not a converter: this repo already ships Chromium, and
 * nothing else on the box renders SVG.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TARGET = join(ROOT, 'build/icon.png');
const SIZE = 512;
/** Legibility proofs written beside the icon; not committed. */
const CHECK_SIZES = [16, 24, 32];

const TILE = '#FAFAFA';
const MARK = '#5D103B';
/** fav.svg is a 16-unit grid; the mark keeps a 10% margin inside the tile. */
const GRID = 16;
const MARGIN = 0.1;
/** Rounded-square corner, as a share of the tile. */
const RADIUS = 0.14;
/**
 * fav.svg draws the two frame paths FIRST and then the six LEGION letterforms.
 * Both counts are asserted below, so a redrawn brand file fails loudly here
 * instead of silently shipping an icon with half a wordmark on it.
 */
/**
 * The "L", drawn on the 16-unit grid: a 3.6-unit stem and a matching foot.
 * Nudged 0.5 right of centre because an L is left-heavy — optically centred
 * beats mathematically centred at taskbar sizes.
 */
const STEM_W = 3.6;
const FOOT_H = 3.6;
const L_PATH = (() => {
  const left = 4.7;
  const top = 2.6;
  const bottom = 13.4;
  const right = 11.9;
  return (
    `M ${left} ${top} H ${left + STEM_W} V ${bottom - FOOT_H} H ${right} ` +
    `V ${bottom} H ${left} Z`
  );
})();

/** The white tile plus the solid L. No brand-file dependency. */
function composeIcon(size) {
  return [
    `<svg width="${size}" height="${size}" viewBox="0 0 ${GRID} ${GRID}"`,
    ' xmlns="http://www.w3.org/2000/svg">',
    `<rect width="${GRID}" height="${GRID}" rx="${GRID * RADIUS}" fill="${TILE}"/>`,
    `<path d="${L_PATH}" fill="${MARK}"/>`,
    '</svg>',
  ].join('');
}

/**
 * Runs inside the page: SVG → canvas → PNG data URL, alpha intact. It is
 * stringified and evaluated in the renderer, so its globals are the browser's.
 */
/* global Image, document */
async function rasterise(svgText, size) {
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('the SVG did not decode'));
    image.src = source;
  });
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

async function render(window, svg, size, minimumBytes) {
  const dataUrl = await window.webContents.executeJavaScript(
    `(${rasterise.toString()})(${JSON.stringify(svg)}, ${size})`
  );
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const bytes = Buffer.from(base64, 'base64');
  // Loud, never a silent zero-byte icon: an empty write here would ship an
  // installer with no icon at all and nothing would say so.
  if (base64 === dataUrl || bytes.length < minimumBytes) {
    throw new Error(`the ${size}px icon came back empty (${bytes.length} bytes)`);
  }
  return bytes;
}

async function main() {
  const window = new BrowserWindow({ show: false, width: SIZE, height: SIZE });
  await window.loadURL('data:text/html,<!doctype html><title>icon</title>');

  mkdirSync(dirname(TARGET), { recursive: true });
  const bytes = await render(window, composeIcon(SIZE), SIZE, 1024);
  writeFileSync(TARGET, bytes);
  console.warn(`icon: ${TARGET} (${SIZE}x${SIZE}, ${bytes.length} bytes)`);

  for (const size of CHECK_SIZES) {
    const check = join(dirname(TARGET), `icon-check-${size}.png`);
    writeFileSync(check, await render(window, composeIcon(size), size, 80));
    console.warn(`check: ${check} (${size}x${size})`);
  }
}

app.disableHardwareAcceleration();
app
  .whenReady()
  .then(main)
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
