/**
 * make-icon.mjs — rasterise the Legion "L" into the app icon.
 *
 *   npm run build:icon
 *
 * Input  resources/brand/fav.svg   (the Legion mark, drawn on a 16-unit grid)
 * Output build/icon.png            (512x512, transparent)
 *
 * electron-builder turns that PNG into the multi-size .ico it stamps on the
 * .exe, the NSIS installer, and the Start-menu shortcut (see the `win.icon`
 * field in electron-builder.yml), which is why the output is a single large
 * square with an alpha channel rather than a favicon-sized bitmap.
 *
 * Why Electron and not a converter: this repo already ships Chromium, and
 * nothing else on the box renders SVG. The mark is drawn on a 16-unit grid and
 * 512 is 32 x 16, so every frame edge lands exactly on a pixel boundary — the
 * render is crisp without needing a nearest-neighbour upscale, and the LEGION
 * lettering (real glyph outlines, not pixel art) stays legible instead of
 * turning to blocks. The SVG's own width/height are rewritten to 512 first so
 * Chromium rasterises the vector AT that size rather than scaling a 16px bitmap.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'resources/brand/fav.svg');
const TARGET = join(ROOT, 'build/icon.png');
const SIZE = 512;

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

/** Same drawing, sized so Chromium rasterises the vector at the output size. */
function atSize(svgText, size) {
  return svgText
    .replace(/\swidth="\d+"/, ` width="${size}"`)
    .replace(/\sheight="\d+"/, ` height="${size}"`);
}

async function main() {
  const svg = atSize(readFileSync(SOURCE, 'utf8'), SIZE);
  const window = new BrowserWindow({ show: false, width: SIZE, height: SIZE });
  await window.loadURL('data:text/html,<!doctype html><title>icon</title>');
  const dataUrl = await window.webContents.executeJavaScript(
    `(${rasterise.toString()})(${JSON.stringify(svg)}, ${SIZE})`
  );

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const bytes = Buffer.from(base64, 'base64');
  // Loud, never a silent zero-byte icon: an empty write here would ship an
  // installer with no icon at all and nothing would say so.
  if (base64 === dataUrl || bytes.length < 1024) {
    throw new Error(`the icon came back empty (${bytes.length} bytes)`);
  }

  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, bytes);
  console.warn(`icon: ${TARGET} (${SIZE}x${SIZE}, ${bytes.length} bytes)`);
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
