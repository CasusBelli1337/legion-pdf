/* global document */
// Real-app proof for tab-switch position memory: scroll tab A into the middle
// of a page, visit tab B, come back — the viewer must land on the same pixel.
//   node qa/tab-switch-proof.mjs <work-dir>    (build first: npm run build)
import { _electron as electron } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const APP_DIR = resolve(fileURLToPath(import.meta.url), '../..');
const work = process.argv[2] ?? '/tmp/legion-pdf-tab-switch';
mkdirSync(work, { recursive: true });
const a = resolve(APP_DIR, 'qa/fixtures/pleading-fixture.pdf');
const b = resolve(APP_DIR, 'qa/fixtures/pleading-500.pdf');
const app = await electron.launch({
  executablePath: resolve(APP_DIR, 'node_modules/electron/dist/electron'),
  args: [
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${resolve(work, 'udata')}`,
    APP_DIR,
    a,
    b,
  ],
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
  timeout: 30000,
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.waitForSelector('.textLayer span', { timeout: 30000 });
await page.waitForTimeout(2000);
const state = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-page]')?.closest('.overflow-auto');
    const footer = document.body.innerText.match(/\.PDF - (\d+) \/ \d+/i)?.[1];
    return { scrollTop: el?.scrollTop ?? -1, footerPage: footer ?? null };
  });
const tab = (name) => page.getByRole('button', { name, exact: true });
// Tab A is pleading-fixture; go to page 5 then nudge half a page down.
await tab('pleading-fixture.pdf').click();
await page.waitForTimeout(800);
await page.evaluate(() => {
  const el = document.querySelector('[data-page]')?.closest('.overflow-auto');
  el.scrollTop = 4 * 1100 + 550;
});
await page.waitForTimeout(1200);
const before = await state();
await page.screenshot({ path: resolve(work, '01-tab-a-before.png') });
await tab('pleading-500.pdf').click();
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const el = document.querySelector('[data-page]')?.closest('.overflow-auto');
  el.scrollTop = 2 * 1100 + 300;
});
await page.waitForTimeout(1200);
const other = await state();
await tab('pleading-fixture.pdf').click();
await page.waitForTimeout(2000);
const after = await state();
await page.screenshot({ path: resolve(work, '02-tab-a-after.png') });
await tab('pleading-500.pdf').click();
await page.waitForTimeout(2000);
const otherAfter = await state();
process.stdout.write(JSON.stringify({ before, other, after, otherAfter }) + '\n');
await app.close().catch(() => {});
process.exit(0);
