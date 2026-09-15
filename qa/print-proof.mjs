/**
 * Page-count proof for printing — the deliverable for Arthur's "it said 15
 * pages and printed about 30".
 *
 * For every fixture it drives the BUILT app exactly as an attorney does (click
 * the toolbar Print button), waits for the hidden print sheet to hold one image
 * per page, then prints the window through Chromium's own engine and counts the
 * sheets in the resulting PDF with pdf-lib. Sheets must equal pages. Anything
 * else is the bug.
 *
 * Arms per fixture:
 *   letter paper  — paper fixed at Letter; proves nothing spills whatever the
 *                   page box is (Legal and landscape get letterboxed, not split)
 *   css page size — `preferCSSPageSize`; proves the @page rule the controller
 *                   injects puts the document's OWN paper size on the sheet
 *   legacy css    — the pre-fix print.css re-applied over the app (only when
 *                   qa/print-legacy.css is present): the regression arm, which
 *                   must DOUBLE the sheets
 *
 * Run: node qa/print-proof.mjs        (needs `npm run build` first)
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// The evaluate callbacks below run inside the app's renderer, not in node.
/* global document */
import {
  APP_DIR,
  WORK_DIR,
  clickByTitle,
  launchApp,
  measure,
  printToPdf,
  stubPrintDialog,
  waitForSheet,
} from './print-proof-lib.mjs';
import { PRINT_FIXTURES, buildPrintFixtures } from './print-fixtures.mjs';

const FIXTURE_DIR = path.join(APP_DIR, 'qa/fixtures/print');
const OUT_DIR = path.join(WORK_DIR, 'proof');
const SHOT_DIR = path.join(WORK_DIR, 'shots');

const legacyCssPath = path.join(APP_DIR, 'qa/print-legacy.css');
const legacyCss = await access(legacyCssPath)
  .then(() => readFile(legacyCssPath, 'utf8'))
  .catch(() => null);

/** Re-apply the pre-fix rules over the app so the old layout can be measured. */
async function applyLegacyCss(page, css) {
  await page.evaluate((text) => {
    document.getElementById('librarius-print-page-size')?.remove();
    const style = document.createElement('style');
    style.id = 'librarius-legacy-print-css';
    style.textContent = text;
    document.head.append(style);
  }, css);
}

async function armsFor(app, page, name, expected) {
  const out = (arm) => path.join(OUT_DIR, `${name}.${arm}.pdf`);
  const results = {};
  results.letter = await measure(await printToPdf(app, out('letter'), { pageSize: 'Letter' }));
  results.cssPageSize = await measure(
    await printToPdf(app, out('css-size'), { preferCSSPageSize: true })
  );
  if (legacyCss !== null) {
    await applyLegacyCss(page, legacyCss);
    results.legacy = await measure(await printToPdf(app, out('legacy'), { pageSize: 'Letter' }));
  }
  results.expected = expected;
  return results;
}

async function proveFixture(name, truth) {
  const { app, page } = await launchApp([path.join(FIXTURE_DIR, name)]);
  try {
    await stubPrintDialog(app);
    await page.waitForSelector('button[title^="Print"]:not([disabled])', { timeout: 60000 });
    await clickByTitle(page, 'Print');
    await waitForSheet(page, truth.pages);
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.sheet-ready.png`) });
    return await armsFor(app, page, name, truth.pages);
  } finally {
    await app.close().catch(() => undefined);
  }
}

function paperOf(truth) {
  if (truth.boxes === null) return null;
  return `${Math.round(truth.boxes[0])}x${Math.round(truth.boxes[1])}pt`;
}

function checkRow(name, truth, result) {
  const problems = [];
  const want = truth.pages;
  if (result.letter.sheets !== want) {
    problems.push(`${name}: Letter paper printed ${result.letter.sheets} sheets, expected ${want}`);
  }
  if (result.cssPageSize.sheets !== want) {
    problems.push(
      `${name}: CSS page size printed ${result.cssPageSize.sheets} sheets, expected ${want}`
    );
  }
  const paper = paperOf(truth);
  if (paper !== null && result.cssPageSize.paper !== paper) {
    problems.push(`${name}: paper came out ${result.cssPageSize.paper}, expected ${paper}`);
  }
  // The regression arm has to still reproduce the recorded pre-fix numbers, or
  // it has stopped proving anything.
  if (result.legacy !== undefined && result.legacy.sheets !== truth.legacySheets) {
    problems.push(
      `${name}: the pre-fix CSS printed ${result.legacy.sheets} sheets, but the recorded pre-fix baseline is ${truth.legacySheets} — the regression arm has drifted`
    );
  }
  return problems;
}

function table(rows) {
  const head = ['fixture', 'pages', 'letter', 'css size', 'paper', 'legacy'];
  const body = rows.map(([name, truth, r]) => [
    name,
    String(truth.pages),
    String(r.letter.sheets),
    String(r.cssPageSize.sheets),
    r.cssPageSize.paper,
    r.legacy === undefined ? '-' : String(r.legacy.sheets),
  ]);
  const widths = head.map((_, i) => Math.max(head[i].length, ...body.map((row) => row[i].length)));
  const line = (cells) => cells.map((cell, i) => cell.padEnd(widths[i])).join('  ');
  return [line(head), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n');
}

await buildPrintFixtures();
await mkdir(OUT_DIR, { recursive: true });
await mkdir(SHOT_DIR, { recursive: true });

const rows = [];
const problems = [];
for (const [name, truth] of Object.entries(PRINT_FIXTURES)) {
  process.stdout.write(`printing ${name} (${truth.pages} pages, ${truth.size})...\n`);
  const result = await proveFixture(name, truth);
  rows.push([name, truth, result]);
  problems.push(...checkRow(name, truth, result));
}

const report = table(rows);
process.stdout.write(`\n${report}\n`);
await writeFile(path.join(OUT_DIR, 'print-proof.txt'), `${report}\n`);

if (problems.length > 0) {
  process.stdout.write(`\nFAILED\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`\nOK - every fixture printed one sheet per page. PDFs in ${OUT_DIR}\n`);
process.exit(0);
