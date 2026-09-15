// Proves the Word export in the BUILT app end to end: opens a real fixture,
// reads the panel's plan before the button, exports through the real IPC path
// with the native save dialog answered in the main process, and screenshots the
// receipt. Run after `npm run build`:
//
//   DISPLAY=:0 node qa/word-export-proof.mjs [pdf] [out.docx]
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const APP_DIR = path.resolve(import.meta.dirname, '..');
const WORK = path.join(os.tmpdir(), 'legion-pdf-word-proof');
const SHOTS = path.join(WORK, 'shots');
const [, , fixtureArg = 'qa/fixtures/word-export/pleading-word.pdf', outArg = 'qa/output/word-export/app-export.docx'] =
  process.argv;
const FIXTURE = path.resolve(fixtureArg);
const OUT = path.resolve(outArg);
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.rmSync(OUT, { force: true });

const say = (...parts) => process.stdout.write(`${parts.join(' ')}\n`);

const app = await electron.launch({
  executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
  args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${path.join(WORK, 'udata')}`, APP_DIR, FIXTURE],
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
  timeout: 30000,
});
await app.evaluate(async ({ dialog }, filePath) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath });
}, OUT);

const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(2500);

const clickText = async (label) => {
  const found = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, a, [role="button"]')];
    const labelOf = (e) => e.title || e.getAttribute('aria-label') || e.textContent?.trim() || '';
    const el = els.find((e) => labelOf(e) === t) ?? els.find((e) => labelOf(e).includes(t));
    if (!el) return null;
    el.click();
    return labelOf(el);
  }, label);
  say('click', JSON.stringify(label), '->', found ?? 'NOT_FOUND');
  if (found === null) throw new Error(`No control labelled ${label}`);
};
const bodyText = () => page.evaluate(() => document.body.innerText);

await clickText('Export');
await page.waitForTimeout(600);
await clickText('Word document');
await page.waitForFunction(() => /Pleading paper detected|scanned page|Looking at the document/.test(document.body.innerText), null, { timeout: 15000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(SHOTS, '01-plan.png') });
const plan = (await bodyText()).split('\n').filter((line) => /detected|scanned|Bates|numbers/i.test(line));
say('plan lines:', JSON.stringify(plan));
await clickText('Choose where to save...');
await page.waitForTimeout(600);
await clickText('as Word document');
await page.waitForFunction(() => /\bKEPT\b|could not|Problem/i.test(document.body.innerText), null, { timeout: 240000 });
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(SHOTS, '02-receipt.png') });
const text = await bodyText();
const receipt = text.slice(text.indexOf('Wrote'), text.indexOf('Wrote') + 1500);
say('receipt:\n' + receipt);
say('output exists:', fs.existsSync(OUT), fs.existsSync(OUT) ? `${fs.statSync(OUT).size} bytes` : '');
await app.close();
process.exit(fs.existsSync(OUT) ? 0 : 1);
