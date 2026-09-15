# Word export — a PDF rebuilt as a document you can edit

## What it does

Export ▸ Word document turns the open PDF into a `.docx` of real paragraphs
in the document's own fonts, sizes, margins, headers and footers, with its
pictures in place and a page break wherever the PDF turned the page. The aim
is the one an attorney has when they reach for Word: keep working on the
text and have it look like the filing it came from. Acrobat's export leaves a
soup of text boxes; this leaves paragraphs.

## Data flow

```
export:run { format: 'docx' }                      (electron/ipc, export lane)
  └─ docxExporter                                  electron/services/export/docx-exporter.ts
       ├─ for each page: context.requestLayout()   electron/services/layout-bridge.ts
       │     └─ layout:request → renderer          src/lib/layout/layout-responder.ts
       │           ├─ classifyPage (select-copy)   roles: body / header / footer / page-number / line-number / stamp
       │           ├─ getTextContent + getOperatorList
       │           │     ├─ walkOperators           colour, invisible (OCR) text, pictures, rules
       │           │     └─ alignTextStyles         letters matched, item by item, to the operators
       │           └─ PageLayout                    shared/layout-model.ts
       ├─ buildDocx(layouts)                        core/export/build-docx.ts
       │     ├─ groupSections / sectionGeometry     paper, margins, Word columns   page-setup.ts
       │     ├─ pageParagraphs                      lines → paragraphs → pictures  lines.ts, paragraphs.ts, images.ts
       │     ├─ settlePage                          exact line boxes, space-before  page-paragraphs.ts
       │     ├─ docxTextParagraph / docxSection     the docx package               docx-paragraph.ts, docx-section.ts
       │     └─ verifyDocx                          re-open the zip, prove the text is there  verify.ts
       └─ writeFileAtomic + proveWritten
```

## What is preserved

| In the PDF | In the Word file |
| --- | --- |
| Font face | The Word font of the same name (`styles.ts` maps PostScript names: TimesNewRomanPSMT → Times New Roman, ArialMT → Arial, …; an unknown name is passed through spaced out, e.g. "Minion Pro"; a nameless face falls back by family) |
| Size, bold, italic, colour | Half-point size, `w:b`, `w:i`, `w:color` per run; underlines from rules drawn under text |
| Lines of a paragraph | One flowing paragraph; a word broken at a line end ("signa-" / "ture") is healed |
| Line pitch | Exact line spacing on the same pitch; Word puts the baseline 80% of the way down an exact line box (measured), which is what keeps every baseline within a quarter point of the PDF's |
| Gaps between paragraphs | Space-before |
| Left / first-line / hanging indents, centred, right, justified | Indents measured from the section's margins; alignment read off the line edges |
| Margins | Read off the body text, section by section; the right margin is never wider than the left (a page of short lines says nothing about the right margin) |
| Page breaks | Every page after the first in a section starts with a page break |
| Two columns | Two unequal Word columns laid where the PDF's were, with a column break between |
| Running head and foot | Real Word header and footer from the first page that carries them; the printed page number becomes a PAGE field |
| Pleading line numbers | Dropped from the flow; the section gets Word's own line numbering (restart every page) on the PDF's pitch, and blank numbered lines are empty paragraphs so line 14 is still line 14 |
| Pictures | Inline PNGs at their size, placed by indent; a scan under an OCR layer is left out and its text kept |
| Columns of text (no ruling) | Tab stops at the column edges |

## What is not preserved (yet)

- **Ruled tables** come through as tab-separated lines, not Word tables.
- **Bates stamps** are left out (they differ on every page); a note says so.
- **Condensed (4-up) transcripts** export as two Word columns per sheet, mini
  page after mini page, with their line numbers left out.
- **Page numbering** in the footer counts from 1 at the first page, even when
  the PDF's cover pages were unnumbered.
- **Rotated pages** keep their text coordinates in the unrotated frame.
- **Font colours by pattern / shading, small caps, letter spacing** are not read.

## How fidelity was checked (2026-09-15)

`src/lib/layout/word-export.fixture.test.ts` runs the whole pipeline under
vitest (pdfjs' Node build + the selection engine + the extractor + core/export)
on `qa/fixtures/pleading-fixture.pdf`, `condensed-transcript.pdf`,
`exhibit-part-a.pdf`, and a letter with a photograph built in the test, and
writes the `.docx` files to `qa/output/docx-export/`. Each was rendered with
REAL Word (`docx-render` skill, Word COM on the Windows host) and compared
page by page against `pdftoppm` of the source:

- page counts equal on all four (8/8, 4/4, 2/2, 1/1);
- baselines within 0.05 pt (`pdftotext -bbox` on both) once Word's 80%
  baseline rule was measured and adopted;
- fonts, sizes, bold, the running head, the PAGE footer, the pleading numbers
  1–28, the photograph's position and size all match by eye.

Rendered comparisons live under `/tmp/claude-1000/word-lane/qa/` for the
session that built this; re-run the fixture test and the skill to regenerate.

## Files

| File | What it owns |
| --- | --- |
| `shared/layout-model.ts` | `PageLayout`: runs, fonts, images, rules — the contract between renderer and core |
| `src/lib/layout/op-walk.ts` | Operator-list walk: colour, render mode, images through the CTM, rules |
| `src/lib/layout/colour-align.ts` | Text items ↔ show-text operators, by letter count |
| `src/lib/layout/extract-page-layout.ts` | pdfjs page → `PageLayout` |
| `src/lib/layout/image-raster.ts` | pdfjs image object → PNG on an OffscreenCanvas |
| `src/lib/layout/layout-responder.ts` | Answers `layout:request` |
| `electron/services/layout-bridge.ts` | Main asks, waits, times out |
| `electron/services/export/docx-exporter.ts` | Pages → layouts → docx → file, with progress |
| `core/export/*` | The pure reconstruction, one pass per file (see the flow above) |
