# Legion PDF v0.5.0 — Feedback wave 3, build & QA report (2026-09-15)

Arthur's third round of feedback after using v0.4.1, built in one session as
seven parallel lanes (see `docs/missions/2026-09-15-feedback-wave-3.md`) and
merged into `main`. Every lane was verified in the REAL built app with
screenshots (evidence under `qa/output/2026-09-15-wave-3/<lane>/`, copied to
OneDrive `#Legion/Product/Armory - Librarius/2026-09-15 Wave 3 QA/`) and by
independent tools (poppler, Pillow, pdf-lib page counts) on saved bytes.

| # | Request (Arthur's words, shortened) | Outcome | Evidence |
| --- | --- | --- | --- |
| 1 | "It said 15 pages but I got something like 30" | FIXED. Each page image was spilling onto a second, blank sheet. Chromium's own print engine now yields 15 sheets for 15 pages (was 30), Legal 6 (was 12), mixed 8 (was 12). | `print/` — `fixed-letter-01/02.png`, `legacy-letter-02.png` (the blank sheet) |
| 2 | Right rail: select many pages, right-click delete / export | DONE. Click, Ctrl-click, Shift-click; right-click Delete / Extract (± remove) / Rotate / Select all; count + Clear; footer receipts; Undo. | `rail/` — `02-selection-3-and-5`, `03-context-menu`, `04-after-delete`, `05-extract-new-tab` |
| 3 | Drag selections to reorder | DONE. Drop line between pages, end drop zone; saved order proven by text extraction. | `rail/06-after-reorder.png`, `09-drop-indicator.png` |
| 4 | Convert Word docs, images, etc. into PDFs | DONE. `.docx/.doc/.rtf` through your installed Word, `.xlsx` Excel, `.pptx` PowerPoint; PNG/JPEG/TIFF (multi-page)/BMP/GIF/WebP; `.txt`/`.html`. Converted files open as UNSAVED tabs — originals never overwritten. | `convert/` — `converted-docx`, `converted-xlsx`, `converted-tiff` |
| 5 | Select PDFs + Word docs in Explorer → right-click → combine (Acrobat-style) | DONE. "Combine in Legion PDF" + "Convert to PDF with Legion PDF" verbs (per-user registry, installed by the setup); launches gathered into one batch; Combine Files panel with drag reorder. Integration: PDF + `.docx` → 3-page document. | `combine/` — `combine-01…03`, `combine-04-second-instance-batch`; `integration/02-combined.png` |
| 6 | Export to Word, PNG, TIFF, etc. | DONE. Export panel + File › Export As (Ctrl+Shift+E): PNG, JPEG, multi-page TIFF (own encoder; Pillow read back 8 frames), plain text, and Word (see 7). | `export/` — `00-export-panel`, `11-progress`, `13-receipt`, `21-tiff-receipt` |
| 7 | Export to .docx preserving styles / formatting | See the Word export section below. | `word/` |
| 8 | Edit the text directly in the PDF | DONE — the deferred stretch goal. Click a paragraph, retype, Ctrl+Enter; re-wraps in the document's OWN embedded font. Verified on a PDF Word itself wrote. | `text-edit/` — `02-paragraph-open`, `03-retyped-with-plan-note`, `04-applied`; `before-1` / `after-1` |
| 9 | Tabs: side-by-side view | DONE. Toolbar "Side by side" / Ctrl+\: reference pane with its own page + zoom, Swap, Scroll together, drag a tab onto it. Tearing a tab into a separate Windows window is not possible in Electron. | `split/` — `02-split-open`, `03-right-pane-scrolled-zoomed`, `04-swapped` |
| 10 | "Sometimes the name in the tab isn't the actual name" | TWO DEFECTS FIXED + one by-design behaviour explained (below). | `split/13-same-file-opened-again.png`, `10-long-names.png`, `16-extract-derived-name.png` |
| 11 | "When I switch between tabs, it is not saving where I was looking" | FIXED. The viewer remembered only the page number and snapped to its top, and a zoom refit on the way back scrolled from a stale page. It now remembers the exact spot (page + position within it) and lands it after the zoom settles: tab A 4950→4950 px, tab B 2500→2500 px (were 4374 and 1458). | `qa/tab-switch-proof.mjs` |

## Gates

`npm run typecheck && npm run lint && npm test` green on merged main:
2,059 tests passing (was 1,735 at the start of the session). Installer:
`LegionPDF-0.5.0-Setup.exe` (see Packaging below).

## 1. Printing — root cause in plain English

The hidden print sheet told the browser "make each page picture as wide as the
paper" but never how tall a sheet is, and left the paper size to a guess. Any
sliver of mismatch (printer hardware margins, Legal on Letter, rounding of a
150-DPI raster) pushed each picture a hair past the sheet, and the overflow
went onto a second, almost blank sheet: 15 pages in, 30 sheets out. Landscape
never doubled, which is why it only bit ordinary portrait filings. Now each
page sits in a box that IS one sheet (it physically cannot spill), the image is
capped to fit, and the printer is told the document's real page size.

Proof (`qa/print-proof.mjs`, Chromium `printToPDF` on the built app, sheets
counted with pdf-lib):

| fixture | pages | sheets now | sheets before |
| --- | --- | --- | --- |
| Letter, 15 pages | 15 | 15 | 30 |
| Legal, 6 pages | 6 | 6 | 12 |
| Landscape, 5 pages | 5 | 5 | 5 |
| Mixed sizes, 8 pages | 8 | 8 | 12 |

## 8. Editing existing text — how it works and what was proven

1. Click a line: the engine reads the page's own drawing instructions, places
   every glyph, finds the line, and gathers the paragraph the way a typesetter
   would (a line ends its paragraph only if the next line's first word would
   have fitted on it; a wide gap along a baseline is a gutter, so pleading line
   numbers stay out of the prose).
2. The paragraph opens in place, in a stand-in of its face at its own leading,
   with a note: "Editing in the document's own font, TimesNewRomanPSMT 12 pt."
3. As you type, a dry run tells you BEFORE you commit if the document's font
   cannot spell something: "The document's font cannot type "Z", so this
   paragraph will be set in Times." (A subset font only carries the letters the
   document used; the engine reads the embedded font program's glyph table to
   know.)
4. Ctrl+Enter: the old glyphs are deleted from the content stream, the new text
   is re-wrapped on the old measure, indent, leading, and alignment (justified
   stays justified), and drawn back in the same font resource. The result is
   proven on the SAVED bytes: the paragraph must read back exactly as typed and
   the shown-character count must move by exactly the glyphs removed and added.
   Undo covers it.

Verified on `qa/fixtures/word-letter.pdf`, a PDF Microsoft Word itself wrote
(subset TrueType, WinAnsi, no ToUnicode — the shape of a real filing): edited
in Word's own embedded Times with justified reflow (`text-edit/after-1.png`
against `before-1.png`), the curly-quote paragraph edited in its CID font, and
the missing-glyph fallback named "Z". 64 engine tests + the real-app proof
(`qa/text-edit-proof.mjs`).

Limits (plain English): one font per paragraph (a bold word inside a paragraph
is re-set in the paragraph's face — the note says so); scanned pages and text
drawn through reusable graphics are refused with a pointer to Cover and retype;
a paragraph that grows longer may overlap what follows (the note warns).

## 10. Tab names — findings

- FIXED: opening a file that was already open made a second tab with the same
  name and its own copy of the bytes (edits looked lost). Now the existing tab
  comes forward: "That PDF is already open."
- FIXED: long names were cut at the tail, so `…Vol 1.pdf` and
  `…Vol 1 (redacted).pdf` looked identical. Tabs and the recent list now keep
  the tail (middle ellipsis).
- BY DESIGN (most likely what Arthur hit): extract, combine, split, and
  redaction create a NEW document with a derived name — `X extracted.pdf`,
  `Combined.pdf`, `X (redacted).pdf` — and bring it to the front while the
  original stays open behind. Save As also renames the tab, like Acrobat.
- FIXED (found on the way): Ctrl+S on such a never-saved document errored
  ("has no file on disk yet"); it now opens Save As.

## Packaging

Version bumped to 0.5.0. Built on the Windows host per
`docs/TROUBLESHOOTING.md` § Windows packaging; silent-installed; Explorer verbs
checked with `reg query` (see § Explorer verbs).

## Open items

- Explorer hides right-click verbs above 15 selected files (a Windows limit;
  raising it is documented, not shipped).
- The Word export lane's fidelity notes are in `docs/references/word-export.md`.
- Cancelling the quit guard's Save-all mid-loop can leave a tab showing its
  old name (no `doc:changed` push exists yet); rare, noted for the next wave.
- Recent-files list still tail-truncates the PATH line (the name line is fixed).
