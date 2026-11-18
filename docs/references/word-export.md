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

A pleading template (Arthur's own, Legion's `document_drafter` templates,
and every other firm's we measured) never uses Word's line-numbering
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
band's real edges. Word never lets a band overlap the body — a foot that
reaches a point above the bottom margin takes that point, and the page's last
lines, out of the body — so a section with a head or foot states that margin
**negative** ("exactly here, whatever the band holds", the pleading header's
own device): a page number set 11 pt under line 28 stays there and line 28
stays on its page. A firm's slug in the left margin beside the foot is not
part of the foot's flow at all: each of its lines is a frame anchored to the
paper (`margin-slug.ts`), which adds nothing to the footer's height. When the
opening page prints the same foot without a page number, the running foot is
read off the first page that has the number and the opening page keeps its
own as Word's "different first page" (`docx-footer.ts`). Recognised runs with
no three letters or digits in a row (scanner noise) never enter a band.

**Text set narrower than Word's face is condensed to its own width**
(`run-scale.ts`). A scan's recognised words carry the width of the scan's
word boxes, and some producers condense their type; at full width in Word
such a line runs 4–6% long, its last word wraps, and every line becomes two
(a 16-page order came out as 31). Each cell is measured against the standard
faces' widths (Times, Helvetica, Courier — what Times New Roman, Arial and
Courier New were cut to) and given Word's character scaling when it was
narrower: always for recognised text, only below 97% for visible type. Other
faces are left alone.

## What real briefs taught it (2026-11-17)

Measured on opposing counsel's Acrobat-PDFMaker briefs (tagged, pleading
paper, tables of contents, footnotes, block quotes) and re-measured in real
Word after every change:

- **A raised footnote reference belongs to its line.** Word lifts an 8 pt mark
  4.5 pt over 12 pt text — past the baseline tolerance — so it clustered alone
  and became a paragraph of its own, one line more than the page held
  (`joinRaised`, `lines.ts`).
- **A dot leader inside one run** ("Introduction ........ 1" as a single text
  item) is split into entry, leader and page number, so the dots become a
  right tab's leader instead of literal text whose width Word sets a hair
  differently (`leaders.ts`).
- **A tagged line in the footer zone is the page's own text.** Word and
  Acrobat leave real running feet outside the structure tree; a footnote that
  reaches the foot of the page was being filed as a footer and either dropped
  or printed on every page (`src/lib/layout/tagged-body.ts`). Where a page's
  footnotes cannot become Word footnotes (below), they stay paragraphs at the
  foot of the page: a one-line footnote takes a single-spaced box, and where
  Word's own numbering counts the lines, paragraphs with no printed number
  beside them are not counted (`numbered-lines.ts`).
- **Word's widths are measured, not guessed.** Times New Roman's advance
  widths are public; the ratio between them and a page's own runs says how
  much wider Word will set that page (a proof of service pasted from an old
  form came out 0.9% narrower than Word sets it). Where the page is set in
  Times the paragraph is exactly that wide plus a point; the 1.2% slack and
  the wrap ceiling remain for other faces (`font-widths.ts`).
- **A justified paragraph gets no slack**, and one whose first line is
  indented is still justified: its natural widths are unknown, so any room
  past the measure lets the next line's first word climb.
- **The body starts where the highest first line needs it.** Some templates
  set the text two or three points above the numbers' baselines; a body that
  began at line 1's box squeezed the page's first paragraph to fit (every
  line tighter, the rest of the page up to a line high). The numbers keep
  their own grid in the header (`withPleadingMargins`, `PleadingFrame.bodyTop`).
- **The upper paragraph yields.** Where a single-spaced block quote ends a
  few points too close to the double-spaced paragraph under it, the quote is
  tightened by a hair per line (never more than 7%) instead of every line of
  the paragraph below (`yields`, `page-paragraphs.ts`).
- **A caption cell's line never has a taller box than the room it had** — to
  the row's top edge, the line above, or the line below — and a table's
  drawn bottom border is taken off its last row (Word adds it; everything
  under the caption sat half a point low) (`docx-table.ts`).
- **Different first page.** A caption page with the running foot but no page
  number, followed by numbered pages, is a first-page footer plus a default
  footer with a PAGE field (`first-page-foot.ts`, `section-bands.ts`). Each
  section states the number its first page takes. Numbers that restart or
  skip (front matter in roman, the body restarting at 1) cannot be counted by
  one footer: they are left out and the receipt says so, rather than one
  page's number printed on every page.
- **The footer's rule is part of the footer's height.** Where the page's last
  line ends hard against it, the rule gives way by a point or so; drawn
  exactly, Word moved the body up and the footnote onto the next page
  (`footer-rule.ts`).
- **A short numbered page stays with its section** (a signature page with
  eight numbered lines proves no pleading column on its own) and numbered
  paper is always one column (`isNumberedPaper`).

## Footnotes and checkboxes (2026-11-18)

**Footnotes are real Word footnotes** (`footnotes.ts`, `docx-footnotes.ts`):
the mark in the body is Word's own reference, the text lives in
`word/footnotes.xml`, and a note moves with its mark as the attorney edits.

- **Finding them.** A page's footnotes are the paragraphs under the short
  rule Word draws above them (100–200 pt wide, with a small raised number
  opening the paragraph right under it). A note is lifted only when its
  number has exactly ONE raised twin in the text above the rule and the
  numbers run on from the last page's (Word numbers footnotes itself, 1, 2,
  3…). A page that fails — no mark, two marks, a number out of turn — keeps
  its notes as paragraphs, and so does every page after it, because Word's
  numbering would otherwise be one off; the receipt names the pages. Text
  carried over from the previous page's note (no mark of its own) stays a
  paragraph.
- **Where Word puts them.** Word sets a page's footnotes hard against the
  bottom margin and takes their height out of the body. The notes keep the
  exact line boxes the page gave them, and the page's last note carries, as
  space after, the distance between it and Word's bottom margin — so each
  note sits where it sat (within 0.2 pt on the real briefs).
- **The separator is the trap.** The docx package writes the separator as a
  single-spaced line and does NOT name it in `settings.xml`; unnamed, Word
  ignores the file's separator and draws its own, one line of the default
  face tall. On a brief set in Century Schoolbook that line is 14.4 pt where
  the page left 11.8, and Word moved the body's last lines — and the footnote
  with them — to the next page (15 pages became 17). `withFootnoteSeparator`
  rewrites the packed file: the separators get an exact height (the one that
  draws the rule where the pages drew theirs — the rule sits 3.1 pt above a
  baseline that is a fifth of the height above the notes — and never more
  than the tightest page's gap less 1.5 pt), and `<w:footnotePr>` names them.
- **What it will not do.** Where Word's own line numbering follows the text
  (no header grid), the printed numbers beside the notes are blank body
  lines, and body lines cannot share the page's foot with a footnote area:
  those pages keep their notes as paragraphs. So do two-column pages.
- The file's self-check counts the footnotes in `footnotes.xml` against the
  ones built (`verify.ts`).

**Checkboxes** on a proof of service are drawings, not type: Word prints its
form checkboxes as an 11.6 pt stroked square, crossed corner to corner when
ticked. `op-walk.ts` reads a small stroked square as a box and an open stroke
of one or two lines inside it as its mark (outlining a box twice does not
tick it); `checkbox-runs.ts` stands each in the page's runs as ☐ or ☒ in MS
Gothic — the characters and face Word's own checkbox uses — on the baseline
of the text beside it. `lines.ts` keeps a box in a cell of its own, so the
text after it starts at its tab stop: flowed from the box, it would wrap its
paragraph differently. "Ticked" rests on pdfjs' path data, so
`checkbox-runs.test.ts` reads a drawn form through pdfjs itself — a pdfjs
upgrade that changes the data fails the test instead of silently unticking
boxes. A scanned checkbox is part of the scan and is not read.

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
| Scanned exhibits behind typed pages | One picture of the whole page each, on a sheet of its own, never recognised (`picture-pages.ts`); the receipt lists the pages |
| The court's e-filing stamp | Left out, and the receipt says so |

## Exhibits — a scan behind typed pages is a picture, not text

A declaration's exhibits (a signed trust, a photograph, a page of pen
strokes) are not what the attorney edits, and recognised they come out as
fragments Word re-wraps onto two or three sheets: a 107-page declaration with
100 scanned exhibit pages exported as 180 pages. `picturePagesOf`
(`core/export/picture-pages.ts`) reads only what is VISIBLE, so it answers
the same before and after recognition: once the document has shown a typed
page (twelve visible body words), every later page with no visible body words
— or with a few over a full-page picture, a label on a scan — is a picture
page. It gets a section of its own: the page's paper, no margins, one JPEG of
the whole page (150 dpi, drawn by the renderer through `requestRaster`;
`electron/services/export/page-pictures.ts`), its own empty header and footer.
Typed slip sheets ("EXHIBIT A") stay text. A scan in FRONT of the typed pages
(a conformed first page) and a document that is scans throughout stay
recognised, editable text — so exporting just the exhibit pages gives their
words. The exporter reads a mixed document's layouts once before recognition
so exhibits are never sent to Tesseract (an unreadable photograph used to stop
the whole export); the plan says how many pages will be pictures before the
button, and the receipt lists them under Kept. The fidelity suite takes the
same path (`qa/word-export/page-pictures.ts`, poppler for the picture).

## What is not preserved (yet)

- **Bates stamps** are left out (they differ on every page); a note says so.
- **Footnotes that cannot be paired** with one reference mark each, that sit
  beside numbers Word's own line numbering prints, or that are carried over
  from the page before stay paragraphs at the foot of the page (the receipt
  says which pages); the short rule above those is not drawn.
- **Page numbers that restart** (roman front matter, a body that begins
  again at 1) are left out with a note; sections are not yet split where the
  numbering changes.
- **Scanned checkboxes** are left to the OCR (a ticked box reads as stray
  letters); only drawn ones become ☐ / ☒.
- **Condensed (4-up) transcripts** export as two Word columns per sheet.
- **Rotated pages** keep their text coordinates in the unrotated frame.
- **Small caps, letter spacing, shading** are not read.

## How fidelity is measured — "perfect" as a diff, not an impression

`npm run test:word` (`qa/word-export/fidelity.test.ts`) exports every fixture
in the corpus, renders the `.docx` in REAL Word (`docx-render` skill: this machine's Word, else the Word VM), reads every word's true baseline from both
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
| `core/export/docx-section.ts`, `docx-footer.ts`, `margin-slug.ts` | Page setup, running head and foot, the slug in the margin |
| `core/export/footnotes.ts`, `docx-footnotes.ts` | Footnotes found under their rule; Word footnotes, the mark's style, the separator |
| `src/lib/layout/checkbox-runs.ts` (+ `op-walk.ts`) | Drawn checkboxes as ☐ / ☒ on their lines |
| `core/export/run-scale.ts` | Character scaling for text set narrower than Word's face |
| `core/export/tables.ts`, `table-grid.ts`, `docx-table.ts` | Ruled tables |
| `core/export/images.ts`, `docx-image.ts`, `scan-appendix.ts` | Pictures and scans |
| `core/export/docx-section.ts`, `docx-paragraph.ts`, `build-docx.ts` | Sections, headers, footers, runs; the front door |
| `qa/word-export/*` | The corpus generators, the Word render wrapper, the comparer, the suites |
