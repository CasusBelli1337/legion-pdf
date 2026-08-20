/**
 * Copy pdf.js's decoder/font assets into the renderer's public dir so they
 * ship inside the app. Without them every JBIG2/JPX scan — which is to say
 * every Acrobat-scanned court filing — renders as a white page
 * ("Ensure that the `wasmUrl` API parameter is provided").
 *
 * Runs before dev and build (see package.json pre-scripts). Idempotent;
 * fails loudly if the copy comes up short.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'node_modules/pdfjs-dist');
const TARGET = join(ROOT, 'src/public/pdfjs');

const DIRS = ['wasm', 'cmaps', 'standard_fonts'];

if (!existsSync(SOURCE)) throw new Error(`pdfjs-dist not installed at ${SOURCE}`);
mkdirSync(TARGET, { recursive: true });

for (const dir of DIRS) {
  const from = join(SOURCE, dir);
  const to = join(TARGET, dir);
  cpSync(from, to, { recursive: true });
  const copied = readdirSync(to).length;
  const expected = readdirSync(from).length;
  if (copied !== expected || copied === 0) {
    throw new Error(`pdfjs asset copy short for ${dir}: ${copied}/${expected}`);
  }
}

const wasm = readdirSync(join(TARGET, 'wasm')).filter((f) => f.endsWith('.wasm'));
if (!wasm.includes('jbig2.wasm') || !wasm.includes('openjpeg.wasm')) {
  throw new Error(`decoder wasm missing after copy: found [${wasm.join(', ')}]`);
}
process.stdout.write(`OK — pdfjs assets synced (${DIRS.join(', ')}; ${wasm.length} wasm)\n`);
