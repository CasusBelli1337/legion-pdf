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
 * WHY THE LETTERING IS DROPPED. fav.svg carries two frame paths (the bracket
 * that forms the L) followed by six letterforms spelling LEGION. Those glyphs
 * are ~1.5 units tall on a 16-unit grid: at 32px they are mush and at 16px they
 * are a smear (QA finding F-09). Only the frame survives being small, so only
 * the frame is used — and with the lettering gone the mark can be drawn at
 * 80% of the tile, which makes its strokes properly bold.
 *
 * Why Electron and not a converter: this repo already ships Chromium, and
 * nothing else on the box renders SVG.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'resources/brand/fav.svg');
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
const FRAME_PATHS = 2;
const LETTER_PATHS = 6;
/**
 * The frame's bars are one grid unit thick, which lands on 0.8 of a pixel at
 * 16px and antialiases to a pale mauve. Stroking the same outline in the same
 * colour fattens every bar by this much without redrawing the geometry, so the
 * mark stays the mark and still reads as maroon in a title bar.
 */
const BOLD = 0.3;

/** Every `d` attribute in the source, in document order. */
function pathData(svgText) {
  return [...svgText.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]);
}

/** The white tile plus the frame paths, scaled and centred. */
function composeIcon(svgText, size) {
  const paths = pathData(svgText);
  if (paths.length !== FRAME_PATHS + LETTER_PATHS) {
    throw new Error(
      `resources/brand/fav.svg has ${paths.length} paths; this script expects ` +
        `${FRAME_PATHS} frame paths followed by ${LETTER_PATHS} LEGION letterforms. ` +
        'Re-check which paths are the mark before regenerating the icon.'
    );
  }
  const frame = paths.slice(0, FRAME_PATHS);
  const inset = GRID * MARGIN;
  const scale = 1 - MARGIN * 2;
  const marks = frame
    .map(
      (d) =>
        `<path d="${d}" fill="${MARK}" stroke="${MARK}" stroke-width="${BOLD}"` +
        ' stroke-linejoin="miter"/>'
    )
    .join('');

  return [
    `<svg width="${size}" height="${size}" viewBox="0 0 ${GRID} ${GRID}"`,
    ' xmlns="http://www.w3.org/2000/svg">',
    `<rect width="${GRID}" height="${GRID}" rx="${GRID * RADIUS}" fill="${TILE}"/>`,
    `<g transform="translate(${inset} ${inset}) scale(${scale})">${marks}</g>`,
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
  const source = readFileSync(SOURCE, 'utf8');
  const window = new BrowserWindow({ show: false, width: SIZE, height: SIZE });
  await window.loadURL('data:text/html,<!doctype html><title>icon</title>');

  mkdirSync(dirname(TARGET), { recursive: true });
  const bytes = await render(window, composeIcon(source, SIZE), SIZE, 1024);
  writeFileSync(TARGET, bytes);
  console.warn(`icon: ${TARGET} (${SIZE}x${SIZE}, ${bytes.length} bytes)`);

  for (const size of CHECK_SIZES) {
    const check = join(dirname(TARGET), `icon-check-${size}.png`);
    writeFileSync(check, await render(window, composeIcon(source, size), size, 80));
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
