# Word export — a PDF rebuilt as a document a litigator can edit

## What it does

Export ▸ Word document turns the open PDF into a `.docx` of real paragraphs
in the document's own fonts, sizes, margins, headers and footers, with its
pictures and ruled tables in place and a page break wherever the PDF turned
the page. On pleading paper the line numbers and rules are rebuilt the way a
pleading template draws them, so every page shows all of its numbers and
line 14 stays line 14. Scanned pages are recognised first. The aim is the
one an attorney has when they reach for Word: keep working on the text and
have it look like the filing it came from.

## Data flow

```
export:plan  { format: 'docx' }                    what WILL happen, before the button   export-plan.ts
export:run   { format: 'docx' }                    (electron/ipc, export lane)
  └─ docxExporter                                  electron/services/export/docx-exporter.ts
       ├─ detectTextLayer → scanned pages → OCR    scan-pages.ts, electron/services/ocr (Tesseract)
       ├─ for each page: context.requestLayout()   electron/services/layout-bridge.ts
       │     └─ layout:request → renderer          src/lib/layout/layout-responder.ts
       │           ├─ classifyPage (select-copy)   roles: body / header / footer / page-number / line-number / stamp
       │           ├─ getStructTree + marked content   tagged PDFs: which runs are one paragraph   struct-tags.ts
       │           ├─ getTextContent + getOperatorList
       │           │     ├─ walkOperators           colour, invisible (OCR) text, pictures, rules
       │           │     └─ alignTextStyles         letters matched, item by item, to the operators
       │           ├─ stampRunIndexes               the court's e-filing stamp, kept out of the flow   efiling-stamp.ts
       │           └─ PageLayout                    shared/layout-model.ts
       ├─ buildDocx(layouts, { scanPictures })     core/export/build-docx.ts
       │     ├─ groupSections / sectionGeometry     paper, margins, columns, THE PLEADING GRID   page-setup.ts, pleading.ts
       │     ├─ pageParagraphs                      lines → tables → paragraphs → pictures  lines.ts, tables.ts, paragraphs.ts, images.ts
       │     ├─ settlePage                          own pitch per paragraph, no overlaps, exact gaps   page-paragraphs.ts
       │     ├─ docxTextParagraph / docxTable / docxImageParagraph / docxSection   the docx package
       │     │     └─ pleadingHeader                 the header table of numbers and rules   docx-pleading.ts
       │     └─ verifyDocx                          re-open the zip, prove the text is there  verify.ts
       └─ writeFileAtomic + proveWritten
```

## Pleading paper — the part that always broke, and how it is done now

A pleading template (Arthur's Sorden templates, Legion's `document_drafter`
templates, Herren Legal's, Lathrop's) never uses Word's line-numbering
feature. The 28 numbers live in a **header-anchored table**: one row of exact
height, a narrow first cell holding "1 ⏎ 2 ⏎ … 28" on an exact 24 pt pitch,
right aligned, a `double` border between the cells for the rule beside the
numbers, a `single` right border for the rule at the page's edge; and the
body sits on exact 24 pt line spacing from a **fixed (negative-twip) top
margin**, so the k-th line of the page is beside number k whatever the page
holds. Word's own line numbering (`w:lnNumType`), which v0.5 used, numbers
only lines that hold a paragraph — a page with eight lines of text showed 1–8
and nothing below.

Two facts about Word, both measured in real Word (2026-09-15) and encoded:

- **A baseline sits 80% of the way down an exact line box**, for every one of
  19 fonts tried (Times, Arial, Calibri, Courier New, Century Schoolbook,
  Book Antiqua, Garamond, …) — `BASELINE_SHARE` in `model.ts`. That is what
  lets the numbers' space-before and the body's top margin be derived from
  the same figure (where line 1 sat on the page) and land together to the
  twip.
- **Word drops "space before" from the first paragraph after a page break**
  (it honours it at the top of the document and of a section). A page that
  opens below its top margin therefore opens with an empty line exactly that
  tall — a spacer, never counted by line numbering — and so does a table,
  which cannot carry space above it at all.

`pleading.ts` reads the grid off the printed numbers: the pitch and line 1
from medians first (an OCR's "11" read as "1" cannot drag line 1 ten lines
down) and then a least-squares fit through the numbers that agree (a producer
that rounds baselines to a twip leaves every gap a hair off), the count from
the largest number,
the numbers' own face and size, the rules from the page's thin vertical
rectangles (double when two sit within 4 pt). A section's pages share one
grid (`pleadingOfSection`), so a scanned page whose OCR dropped number 28
still gets 28 lines.

Numbers that **follow the text** instead of sitting on a grid — Word's own
line numbering, which numbers a single-spaced address block 12 pt apart and
a double-spaced body 24 pt apart — are detected (`grid: false`) and handed
back to Word's numbering, with an empty paragraph of the right height
wherever a printed number had no text beside it, so Word counts the same
lines. Word does not number lines inside tables, and neither did the source.

## Paragraphs — what a tagged PDF says, and what the geometry says

Word and Acrobat PDFMaker write a **structure tree**; every text item sits
inside a `P`, `H1`, `LI`, `TD`, `Caption`, `TOCI`… (`struct-tags.ts`).
Where it exists it decides where paragraphs start and end. Two lines inside
one tagged paragraph that were broken on purpose — an address block typed
with Shift+Enter, a court name over its county — meet at a Word line break,
not a space (`breaksHard`). A line whose baseline is shared by two table
cells is left to geometry, and each line of a cell is its own block, because
the flow can only place side-by-side text one baseline at a time.

Where there is no tree (scans, OCR layers, Distiller, court e-filing
systems), `paragraphs.ts` reads the signals a typesetter leaves: a blank
line, a size change, a wholesale change of face (a bold heading over its
text), a gap that differs from the regular pitch below it, a first-line
indent, a line that stopped short followed by one at the same edge or well
to the right, a deep shift of the left edge, a change between centred and
flush. A monospaced page with line numbers is a **transcript**: every line
stays its own paragraph, as court reporters' software writes them and as
page:line cites need them. **Recognised text** (an OCR layer under a scan)
is treated the same way and runs to the margin: its words are set in a face
the scan never used, so their natural widths say nothing about where the
scan's lines broke, and flowing them would let Word re-wrap a page onto two.

Every paragraph keeps its **own** pitch (a single-spaced block quote inside
a double-spaced brief stays single-spaced); a lone line takes the pitch it
followed; where two line boxes would overlap, the lone line above gives way
(`resolveOverlaps`). A paragraph is set as wide as its widest line plus
about one per cent (some producers' Times is a hair narrower than Word's),
never wide enough for a word that began a line in the PDF to fit on the line
above it in Word (`wrapCeiling`), and always at least a point wider than its
widest line — the conditions that keep Word's line breaks where the PDF's
were. Left indents may go negative (a firm's slug in the margin of the
foot); so may right ones (a caption cell past the margin).

Running heads and feet are placed exactly, each line on its own pitch from
the band's top edge, and Word's header and footer distances are set from the
band's real edges; the body's margins are widened to the bands' reach,
because Word never lets a footer overlap the body — it pushes the body up
instead, and the page spills. Recognised runs with no three letters or
digits in a row (scanner noise) never enter a band.

## What is preserved

| In the PDF | In the Word file |
| --- | --- |
| Font face | The Word font of the same name (`styles.ts`); an unknown name is passed through spaced out; a nameless face falls back by family |
| Size, bold, italic, colour, underline, superscript | Per run; a raised small run is a real superscript |
| Lines of a paragraph | One flowing paragraph (tags decide where the PDF is tagged); a word broken at a line end is healed unless the hyphen is the word's own ("meet-and-confer", "self-employed"); deliberate breaks stay breaks |
| Line pitch, gaps, indents, alignment, margins, columns, page breaks | As before — exact line boxes, space-before, indents from the section's margins |
| Running head and foot | Real Word header and footer; the printed page number becomes a PAGE field only when the printed numbers count up page by page |
| Pleading paper | The header table of numbers and rules on the page's grid; the footer's rule as a paragraph border |
| Ruled tables (caption boxes, proofs of service, schedules) | Real Word tables from the rule grid, fixed widths, exact row heights, borders only where drawn (`tables.ts`, `table-grid.ts`, `docx-table.ts`) |
| Columns of text without rules | Tab stops |
| Pictures | Inline PNGs at their size; a page of many small pictures (pen strokes) keeps its text and drops the strokes |
| Scanned pages | Recognised with the bundled Tesseract first; the picture is left out, laid behind the text, or added as an appendix, as the Export panel's "Scanned pages" choice says; the receipt gives each page's average confidence |
| The court's e-filing stamp | Left out, and the receipt says so |

## What is not preserved (yet)

- **Bates stamps** are left out (they differ on every page); a note says so.
- **Footnotes** come through as small paragraphs at the foot of the page,
  not as Word footnotes.
- **Condensed (4-up) transcripts** export as two Word columns per sheet.
- **Rotated pages** keep their text coordinates in the unrotated frame.
- **Small caps, letter spacing, shading** are not read.

## How fidelity is measured — "perfect" as a diff, not an impression

`npm run test:word` (`qa/word-export/fidelity.test.ts`) exports every fixture
in the corpus, renders the `.docx` in REAL Word on the Windows host
(`docx-render` skill, Word COM), reads every word's true baseline from both
PDFs with pdf.js, and asserts per page: the same page count, the same words
(a multiset), every baseline within the fixture's tolerance (0.5 pt median
for Word-made sources), and every pleading line number within 0.5 pt of the
source's. Side-by-side PNGs and a JSON report per fixture land in
`qa/output/word-export/`. The suite skips itself cleanly when Word, poppler,
or Tesseract is not reachable.

The corpus (`qa/fixtures/word-export/`, rebuilt by `npm run corpus:word`)
comes from REAL producers with FICTIONAL parties:

| Fixture | Producer |
| --- | --- |
| `pleading-word.pdf` | Word printing a filled Legion California pleading template (caption, numbered headings, a single-spaced block quote across numbered lines, signature block, footer title) |
| `pleading-scan.pdf` | A print-and-scan of the above (200 dpi grayscale, no text layer) |
| `pleading-scan-ocr.pdf` | That scan given the app's own OCR text layer |
| `filing-mixed.pdf` | Word, another firm's template: Word's own line numbering, Century Schoolbook + Arial, footnotes, a ruled caption, a proof of service |
| `deposition-word.pdf` | Word, court-reporter style: Courier New, 25 numbered lines, one paragraph per line, then a certificate page |

Real served filings (opposing counsel's, the court's, scans) are graded the
same way from a folder OUTSIDE the repository:
`WORD_PRIVATE_CORPUS=<folder> npm run test:word -- private-corpus` writes
`<folder>/report/SUMMARY.md` and the evidence beside it. They name real
parties and never enter the public repository.

`WORD_DUMP=<pdf> npm run test:word -- dump-layout` writes what the pipeline
sees on each page (`qa/output/word-export/<name>.layout.json`) and, with
`WORD_DUMP_TEXT=1`, the export's paragraphs as text.

## Files

| File | What it owns |
| --- | --- |
| `shared/layout-model.ts` | `PageLayout`: runs (with their tagged block), fonts, images, rules — the contract between renderer and core |
| `src/lib/layout/op-walk.ts` | Operator-list walk: colour, render mode, images through the CTM, rules |
| `src/lib/layout/struct-tags.ts` | The tagged PDF's paragraphs, per text item |
| `src/lib/layout/efiling-stamp.ts` | The court's e-filing stamp block |
| `src/lib/layout/extract-page-layout.ts` | pdfjs page → `PageLayout` |
| `src/lib/layout/node-pipeline.testkit.ts` | The pipeline under Node, for the fixture test and the fidelity suite |
| `electron/services/export/docx-exporter.ts` | Scans recognised, pages → layouts → docx → file, with progress |
| `electron/services/export/export-plan.ts`, `scan-pages.ts` | The pre-export plan; scan notes and the kept / left-out receipt |
| `core/export/pleading.ts`, `docx-pleading.ts` | The grid read off the numbers; the header table and margins |
| `core/export/lines.ts`, `paragraphs.ts`, `page-paragraphs.ts` | Runs → lines → paragraphs → settled page |
| `core/export/tables.ts`, `table-grid.ts`, `docx-table.ts` | Ruled tables |
| `core/export/images.ts`, `docx-image.ts`, `scan-appendix.ts` | Pictures and scans |
| `core/export/docx-section.ts`, `docx-paragraph.ts`, `build-docx.ts` | Sections, headers, footers, runs; the front door |
| `qa/word-export/*` | The corpus generators, the Word render wrapper, the comparer, the suites |
