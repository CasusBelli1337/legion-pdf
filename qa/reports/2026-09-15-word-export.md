# Word export for litigators — build and fidelity report (2026-09-15)

Arthur's ask: take a PDF opposing counsel sent, turn it into a Word document
he can edit, make it work on scans, and stop the line numbers on pleading
paper from coming out wrong. This report says what was built, how "right" was
measured, what the numbers are, and what still breaks.

## 1. How "right" is measured

Every fixture is exported by the app's own pipeline, the `.docx` is rendered
by REAL Word on the Windows host, and pdf.js reads every word's true baseline
from both PDFs. Per page the suite asserts: the same page count; the same
words (as a multiset); the median baseline drift and its 95th percentile
within the fixture's tolerance (0.5 pt / 1 pt for Word-made sources); and
every pleading line number within 0.5 pt of the source's (1.5 pt for scans).
Side-by-side PNGs and a JSON report per fixture: `qa/output/word-export/`.

Two facts about Word were measured and are now load-bearing: a baseline sits
80% of the way down an exact line box for every font tried (19 of them), and
Word drops "space before" from the first paragraph after a page break (it
honours it at the top of a document and of a section).

## 2. The corpus — real producers, fictional parties

| Fixture | Producer | What it tests |
| --- | --- | --- |
| pleading-word | Word printing a filled Legion CA pleading template | caption box, numbered headings, single-spaced block quote across numbered lines, signature block, footer title |
| pleading-scan | 200 dpi grayscale print-and-scan of the above | OCR before export |
| pleading-scan-ocr | that scan with the app's own OCR layer | a scan already made searchable |
| filing-mixed | Word, another firm's template: Word line numbering, Century Schoolbook + Arial, footnotes | ruled caption, footnotes, running head, proof of service table |
| deposition-word | Word, court-reporter style: Courier, 25 numbered lines, one paragraph per line | transcript Q/A, certificate page without numbers |

## 3. Results — corpus

MEASURED_CORPUS_TABLE

## 4. Results — real served filings (private corpus, outside the repo)

Twelve filings copied from OneDrive: opposing counsel's Acrobat PDFMaker
briefs, a court's Aspose-stamped order and notice, Arthur's own Distiller
filing, a scanned cross-complaint and its Acrobat-OCR'd twin, an ABBYY scan,
a 107-page declaration with scanned exhibits.

MEASURED_PRIVATE_TABLE

## 5. What the real filings still break

The corpus fixtures made by Word come through on the numbers; the real
filings show where the next session's work is. Measured on the final run
(§ 4), in the order an attorney would meet them:

1. **Acrobat PDFMaker briefs with a table of authorities, footnotes and block
   quotes** (01, the 16-page reply): pages 1–3 land within a point, then a
   table-of-authorities entry or a footnote block wraps one line differently
   and every page after it is a line out; the cascade costs three extra
   pages. The next lever is real Word footnotes (`FootnoteReferenceRun`) for
   the small text under line 28, and TOC/TOA entries as Word's own TOC
   paragraphs with a right-indent read off the entry's own lines.
2. **Court-issued orders (Aspose, untagged)** (03): the clerk's FILED stamp
   is now left out and the caption is placed, but Aspose sets each word as
   its own run with narrow spaces and no structure tags, and the 21.85-pt
   grid carries single-spaced findings; the geometry heuristics still merge
   or split enough lines to double the page count. These need the
   per-word-run producers handled as recognised text is (one paragraph per
   line, full width) whenever no structure tree is present.
3. **Scanned exhibits inside a declaration** (05, 107 pages): the four text
   pages are exact; the scanned exhibits (Nebo/MyScript handwriting, pen
   strokes as hundreds of tiny pictures) still explode the page count. The
   many-pictures guard drops the strokes, but each exhibit page should be
   exported as one page picture (the scan's own raster through the
   exporter's `requestRaster`), not as recognised fragments.
4. **A firm's letter-spaced slug in the margin of the foot** (06, Distiller):
   fixed at the end of the session (negative indents, bands placed exactly,
   margins widened to the bands' reach) — the final run is the first
   measurement of it.
5. **Scans**: the app's own OCR layer now sits on Tesseract's line baselines
   and the pleading grid is fitted from the recognised numbers robustly;
   the corpus scan fixtures are the measurement, § 3.
6. **The signature-page numbering in `filing-mixed`** (Word's own numbering
   skips a page's short signature lines the way the source does not): eight
   numbers on one page; cosmetic, noted.


## 6. In the real app

`qa/word-export-proof.mjs` drives the BUILT app: opens `pleading-word.pdf`,
reads the panel's plan line ("Pleading paper detected: line numbers and rules
will be rebuilt so line 14 stays line 14."), exports through the real IPC path
with the save dialog answered in the main process, and screenshots the receipt
("Wrote app-pleading-word.docx (4 pages)" with the Kept / Left out lists).
Lane S proved the scanned-deposition flow the same way, with the live
"Recognizing text on scanned pages — PAGE 0 / 6" bar caught mid-run.

## 7. Files

See `docs/references/word-export.md` § Files.
