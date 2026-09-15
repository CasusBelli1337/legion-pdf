# Mission — Word export for litigators (2026-09-15)

Arthur's words: "I want to be able to take a PDF that opposing counsel sent to
me and be able to turn it into a perfect Word doc that I can edit. I want it to
even ideally work on scanned documents. One thing that is always borked is how
the lines and line numbering is handled on Word exports of PDF pleading paper.
So I would do some E2E tests on that and see if you can really create
something awesome for litigators."

## What "perfect" means here — a diff, not an impression

For every fixture in `qa/fixtures/word-export/`: export → render in REAL Word
(`docx-render` skill, Word COM on the Windows host) → compare with `pdftoppm`
/ `pdftotext -bbox` of the source:

1. every word's baseline within 0.5 pt of the source (pdftotext yMax, matched word by word);
2. the same word count on every page;
3. pleading line numbers on the same y as the source's printed numbers, all of them, every page;
4. the same page count;
5. a saved side-by-side PNG an attorney would accept.

(1)–(4) are a vitest suite (`qa/word-export/`, `npm run test:word`) that skips
cleanly when Word is not reachable; (5) is written to `qa/output/word-export/`.

## Why v0.5 pleading export is "borked" (measured)

v0.5 dropped the printed numbers and switched on Word's own line numbering
(`w:lnNumType`). Word only numbers lines that hold a paragraph, so a page with
eight lines of text shows 1–8 and nothing below; there are no vertical rules;
and the numbers sit wherever Word's numbering puts them. Arthur's own
templates (Arthur's own; Legion's `document_drafter/templates/*/ca.docx`)
never use `lnNumType`: the 28 numbers live in a HEADER-anchored table —
one row of exact height, a 630-twip number cell holding "1<br>2<br>…28" in a
`HeaderNumbers` style (exact 24 pt line, space-before to line 1, right
aligned), a `double` inside-vertical border as the rule beside the numbers and
a `single` right border as the right rule — with the body on exact 24 pt line
spacing from a fixed (negative-twip) top margin so line k of the body lands on
number k. Rendered by Word and measured with `pdftotext -bbox`: number 1's
baseline and the body's line-1 baseline coincide to 0.00 pt; the pitch is
24.00 pt. That is the architecture the export now reproduces whenever a page
is detected as pleading paper.

## Lanes

| Lane | Scope | Owner | Branch |
| --- | --- | --- | --- |
| P Pleading + corpus + harness | Fixture corpus from real producers; the Word-rendered E2E diff suite; pleading paper rebuilt the way Arthur's templates build it (header table + rules, exact grid); fonts table + unknown-font note; receipt kept/dropped content | Fable (orchestrator) | `main` |
| T Tables | Ruled tables (caption boxes, proofs of service, schedules) as real Word tables from the rule grid | Opus | `lane/tables` |
| S Scans + panel | Scanned pages recognised before export with a picture option (omit / appendix / behind); the Export panel says what will happen BEFORE the button (`export:plan`); the receipt lists kept / dropped | Opus | `lane/scan` |

## Contracts (pre-declared in commit "feat(contracts): word-export lanes")

- `shared/options-export.ts`: `ExportOptions.scanPictures?: ScanPictureMode`
  (`'omit' | 'appendix' | 'behind'`), `ExportPlan`, `ExportReceipt`,
  `ExportResult.receipt?`.
- `shared/ipc.ts` / `ipc-contract.ts` / `bridge.ts` / `electron/preload.ts`:
  `export:plan` → `ExportPlan` (`window.librarius.export.plan(docId, options)`);
  registered NotImplemented in `electron/ipc/export.ts` until lane S lands.
- `shared/options-pipeline.ts`: `OcrRunDetail.confidencePerPage?: number[]`.
- `core/export/model.ts`: `TableParagraph` (`kind: 'table'`, `columnEdges`,
  `rowEdges`, `cells`, `borders`, `top`, `bottom`, `spaceBeforePt`).
  `Paragraph = Text | Image | Table`.
- `core/export/tables.ts`: `ruledTablesOf(lines, rules, frame): { tables, consumed }`
  — stub returns none; called from `page-paragraphs.ts` (`columnFlow`), which
  drops consumed lines from the paragraph flow and sorts tables by position.
- `core/export/docx-table.ts`: `docxTable(paragraph, fonts, placement): Table`
  — stub throws; `build-docx.ts` calls it for `kind === 'table'`.
- `core/export/docx-image.ts`: `docxImageParagraph` (moved out of
  docx-paragraph.ts; `ALIGNMENT` and `withColumnBreak` are exported for it).
- `core/export/images.ts`: `planImages(layout, frame, { hasText, hasHiddenText, scanPictures })`.
- `core/export/scan-appendix.ts`: `scanAppendixSections(layouts, mode): ISectionOptions[]`
  — stub returns none; `build-docx.ts` appends the result after the body sections.
- `core/export/build-docx.ts`: `DocxBuildOptions.scanPictures`, `DocxBuild.receipt`.

## Ownership (do not cross; request changes in the final report)

| Lane | Paths |
| --- | --- |
| P | everything in `core/export/` not listed below; `src/lib/layout/**`; `qa/word-export/**`; `qa/fixtures/word-export/**`; `docs/references/word-export.md`; all `shared/*` |
| T | `core/export/tables.ts`, `core/export/table-grid.ts` (new), `core/export/docx-table.ts`, their tests |
| S | `core/export/images.ts`, `core/export/docx-image.ts`, `core/export/scan-appendix.ts`, their tests; `electron/services/export/**`; `electron/ipc/export.ts`; `electron/services/ocr/ocr-service.ts` (confidence only); `src/features/export/**`; `docs/references/export.md` |

## Lane T — ruled tables, in detail

Input: the page's `Line[]` (already clustered by baseline, cells split on wide
gaps) and `LayoutRule[]` (thin filled rectangles / stroked lines, PDF
coordinates) inside the body frame. Find grids: horizontal rules that share an
x-span and vertical rules that share a y-span, crossing to make at least 2 rows
× 2 columns of closed or three-sided cells (a caption box is open on the left
in many filings — the `)` column style is NOT a ruled table and stays tab
stops). Lines whose baseline and x fall inside a cell belong to it; a line that
straddles two cells breaks the grid (not a table). Emit `TableParagraph` with
`columnEdges` from the frame's left, `rowEdges` top-down, `cells[r][c].lines`,
and `borders` saying exactly which edges were drawn.

`docxTable`: fixed layout (`tblLayout fixed`), column widths in twips from the
edges, row heights EXACT from the row edges (so a table on pleading paper keeps
the 24 pt grid), zero cell margins except a small left/right inset measured
from the first cell's text (text x − column edge), borders only where
`borders` says (single, sz 4) and `nil` elsewhere, each cell's lines as
paragraphs through `paragraphsOf` + `docxTextParagraph` with the cell as the
frame (left = column edge). A table that opens a page: put `pageBreakBefore`
on the first paragraph of its first cell and PROVE in real Word (docx-render)
that Word starts the table on a new page; if it does not, say so in the report
and fall back to an empty paragraph with exact 1-twip line before the table.

Verification: unit tests on hand-built layouts (`layout-testkit.ts` has `run`,
`page`, `image`; add a `rule(x, y, w, h)` helper to your own test file);
`src/lib/layout/word-export.fixture.test.ts` stays green; build a 2-page PDF
with a real ruled caption table and a proof-of-service table using pdf-lib in a
test, export it, render with the docx-render skill, and read the PNG. Report
the measured cell positions.

## Lane S — scans and the panel, in detail

1. `electron/services/export/docx-exporter.ts`: before reading layouts, call
   `detectTextLayer(job.bytes)` (`@core/ocr`); the pages in `job.pages` with no
   text layer are scans. If there are any: report phase "Recognizing text on
   scanned pages" (page N/M), run the OCR service on those pages (build an
   `OcrService` from `electron/services/ocr` with the context's `requestRaster`;
   `electron/ipc/ocr.ts` shows the deps; 300 dpi, "eng"), `adopt` the resulting
   bytes into the doc store WITHOUT a tab (see `BulkOcrRunner` deps for the
   pattern), read layouts by the adopted docId, and `close` it afterwards —
   whatever happens. Add what the exporter needs to `ExporterContext`
   (`recognizeText`, `adopt`, `closeDoc`); wire them in `electron/ipc/export.ts`.
   Fill `OcrRunDetail.confidencePerPage` in `ocr-service.ts` from the words'
   `confidence` (mean per page). The export's notes get one line per scanned
   page: "Page 3 was a scan; its text was recognized (94% average confidence) —
   check names and numbers." Count check: a scanned page whose recognition
   yields zero words is an error, never an empty page.
2. `core/export/images.ts` + `docx-image.ts` + `scan-appendix.ts`: honour
   `scanPictures`. `'omit'` = today's behaviour. `'behind'` = the page picture
   as a floating image anchored to the page (`floating: { horizontalPosition,
   verticalPosition, behindDocument: true, wrap: none }`, sized to the page) in
   the page's first paragraph, with the recognised text on top — like a
   searchable PDF. `'appendix'` = after the last section, one section per
   scanned page (same paper size, zero margins) holding the full-page picture,
   preceded by a centred "Scanned pages" heading paragraph. Prove each in
   real Word (docx-render) on a scanned fixture: `qa/fixtures/scanned-deposition.pdf`
   is image-only (OCR it in the app first, or through the exporter itself).
3. `export:plan` (`electron/ipc/export.ts`): given `(docId, options)`, answer
   `ExportPlan`: `scannedPages` from `detectTextLayer`, `pleadingPages` from
   `pleadingOf(layout)` (`@core/export`) over up to the first 3 pages of the
   requested range that hold text (layouts via `context.requestLayout`),
   `lines` such as "Pleading paper detected: line numbers and rules will be
   rebuilt so line 14 stays line 14." / "3 scanned pages will be recognized
   first (text only, or choose what happens to the pictures below)." /
   "Bates numbers will be left out; they differ on every page." Remove the
   NotImplemented registration.
4. `src/features/export/**`: when the format is Word, fetch the plan when the
   document, format, or range changes (debounce ~300 ms; ignore stale answers
   by docId, as `use-export.ts` does) and show its lines under the format
   picker as `Hint`s; show a `ChoiceField` "Scanned pages" (Recognized text
   only / Text with the scan behind it / Text, scans in an appendix) only when
   the plan has scanned pages; the receipt lists `result.receipt.kept` under
   "Kept" and `.dropped` under "Left out" (plain English, `Hint` rows), and the
   notes as today. Every word in `export-messages.ts` with a test.

Verification: unit tests for the exporter (fake context, as
`docx-exporter.test.ts` does), the plan handler's pure parts, and the panel
copy; then the REAL app (`.claude/skills/run-legion-pdf/SKILL.md`; set
`DRIVER_WORK_DIR` to your own folder so two agents' instances never share a
user-data dir) — open `qa/fixtures/scanned-deposition.pdf`, choose Word, read
the plan lines, export, and Read the screenshots; render the .docx with
docx-render and Read the PNG. `docs/references/export.md` gets a "Scanned
pages" section.

## Rules every lane follows

- `npm run typecheck && npm run lint && npm test` green before every commit.
  300-line files, 50-line functions, complexity 10, no `any`, no hex colours
  in components.
- Every op proves its counts. "Fast and empty" is a bug.
- UI shows movement; plain English for the attorney in every label and receipt.
- Tests next to the code. New behaviour = new tests.
- Verify in REAL Word (docx-render skill) and, for UI, the REAL app, with a
  screenshot Read before reporting done.
- Commit on your branch with conventional messages; do not merge. End with a
  report: what shipped, how it was proven (paths to PNGs), what you could not
  do, and any change you need in a shared file.

## Merge order

T → S → (P is on main throughout); the E2E suite runs on merged main against
the whole corpus before the version bump.

## Outcome (2026-09-15, end of session)

All three lanes merged into `main` (T, then S, then the orchestrator's own
lane P was already there), lane T's three upstream requests folded in, and the
fidelity suite run on the merged result against the corpus and against twelve
real served filings copied from Arthur's OneDrive (kept outside the repo).
Version bumped to 0.6.0. Report: `qa/reports/2026-09-15-word-export.md`.

What shipped, in one line each:

- **Pleading paper rebuilt the way the templates draw it** — header table of
  numbers on the fitted grid, rules as borders, fixed top margin; Word's own
  numbering kept only where the source used it (`lane P`).
- **Tagged PDFs decide their own paragraphs**; deliberate line breaks, centred
  blocks, superscripts, dot leaders, hyphenated compounds all survive (`P`).
- **Ruled tables are Word tables**, including the L-shaped caption box (`T`).
- **Scans are recognised before export**, with a picture choice, a confidence
  note per page, the plan shown before the button, and a kept / left-out
  receipt (`S`); the OCR layer itself now sits on Tesseract's line baselines.
- **A Word-rendered fidelity suite** (`npm run test:word`) and a corpus from
  real producers (`npm run corpus:word`), plus a grader for private filings.

Still open after this session — see the report's "What the real filings still
break" section for the measured list.
