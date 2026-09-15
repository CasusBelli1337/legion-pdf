/* global document, HTMLTextAreaElement */
// Real-app proof for "Edit text": launches the BUILT app on a copy of the
// Word-written fixture, arms the Edit tool, clicks the body paragraph, retypes
// it, applies with Ctrl+Enter, saves through the toolbar, and hands the saved
// copy back for pdftotext. Screenshots land beside the copy.
//
//   node qa/text-edit-proof.mjs <work-dir>
//
// Build first (`npm run build`). Uses the WSLg display like the driver skill.
import { _electron as electron } from 'playwright-core';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_DIR = resolve(import.meta.dirname, '..');
const work = resolve(process.argv[2] ?? '/tmp/legion-pdf-text-edit-proof');
mkdirSync(work, { recursive: true });
const pdf = resolve(work, 'qa-word.pdf');
copyFileSync(resolve(APP_DIR, 'qa/fixtures/word-letter.pdf'), pdf);

const NEW_TEXT =
  'The parties, Ashford Holdings LLC and Meridian Fabrication Corp., agree that the closing date is April 3, 2026, unless extended in writing by both sides. Payment shall be made by wire within ten days of closing.';

const app = await electron.launch({
  executablePath: resolve(APP_DIR, 'node_modules/electron/dist/electron'),
  args: [
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${resolve(work, 'udata')}`,
    APP_DIR,
    pdf,
  ],
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
  timeout: 30000,
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.waitForSelector('.textLayer span', { timeout: 30000 });
await page.waitForTimeout(1500);
const shot = (name) => page.screenshot({ path: resolve(work, `${name}.png`) });

await page.click('button[title="Stamps & Marks"]');
await page.getByRole('button', { name: 'Text', exact: true }).click();
await page.getByRole('button', { name: 'Edit text', exact: true }).click();
await shot('01-armed');

// The paragraph's first line, from the text layer pdfjs drew.
const target = await page.evaluate(() => {
  const span = [...document.querySelectorAll('.textLayer span')].find((el) =>
    el.textContent?.includes('closing date')
  );
  if (!span) return null;
  const rect = span.getBoundingClientRect();
  return { x: rect.left + 20, y: rect.top + rect.height / 2 };
});
if (target === null) throw new Error('The fixture paragraph is not on screen.');
await page.mouse.click(target.x, target.y);
await page.waitForSelector('textarea[aria-label^="Text for page"]', { timeout: 15000 });
await page.waitForTimeout(500);
await shot('02-paragraph-open');

await page.evaluate((text) => {
  const field = document.querySelector('textarea[aria-label^="Text for page"]');
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  set.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}, NEW_TEXT);
await page.waitForTimeout(900);
await shot('03-retyped-with-plan-note');
await page.keyboard.press('Control+Enter');
await page.waitForFunction(() => /replaced the paragraph/i.test(document.body.innerText), null, {
  timeout: 20000,
});
await page.waitForTimeout(1500);
await shot('04-applied');
const footer = await page.evaluate(
  () => document.body.innerText.match(/replaced the paragraph[^\n]*/i)?.[0]
);
await page.click('button[title="Save (Ctrl+S)"]');
await page.waitForTimeout(1500);
await shot('05-saved');
process.stdout.write(`${JSON.stringify({ pdf, footer })}\n`);
await app.close();
