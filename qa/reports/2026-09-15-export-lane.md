# Export lane (L) live QA — 2026-09-15

PNG / JPEG / multi-page TIFF / plain text out of the built app, verified against
outside readers (poppler `pdftoppm` + `pdftotext`, Pillow) rather than against
the code that wrote the files. Fixtures: `qa/fixtures/pleading-fixture.pdf`
(8 pages, ground truth in `qa/fixtures/manifest.json`) and `pleading-500.pdf`.

Evidence pack: `qa/output/export-lane/` (gitignored).
Driver session `lpdf-export`, `DRIVER_WORK_DIR=/tmp/legion-pdf-driver-export`.
The two panel-driving passes ran their own Electron instance
(`qa/tmp/export-ui-qa*.mjs`, deleted after the run) so the shared driver was
untouched while other lanes used it; they stub ONLY the main-process
`dialog.showOpenDialog` / `showSaveDialog`, the one step no automation can click.

## 1. Formats, through `window.librarius.export.run` in the real app

| Run | Result the app returned | Outside reader says |
| --- | --- | --- |
| png, 150 dpi, folder | 8 files, `pleading-fixture-page-001.png` … `-008.png` | Pillow: 8 × 1275×1651 RGBA |
| jpeg, 150 dpi, q70 | 8 files, `…-page-001.jpg` … | Pillow: JPEG, 1275×1651 RGB |
| tiff, 150 dpi, color | 1 file, 8 pages | Pillow: 8 frames, RGB, PackBits (32773), photometric 2, 150 dpi, unit inch, NewSubfileType 2 |
| tiff, 150 dpi, bw | 1 file, 8 pages, 116 KB (vs 1.19 MB colour) | Pillow: 8 frames, mode `1`, photometric 0 (WhiteIsZero) |
| tiff, pages `3-5`, grayscale | 1 file, 3 pages | Pillow: 3 frames, mode `L`, photometric 1 |
| txt | 1 file, 8 pages, 3.4 KB | see §3 |

`pdftoppm -r 150` on the same fixture renders 1275×1650; the app renders
1275×1651. One pixel of height, from the raster helper rounding 792 pt × 150/72
up rather than down — the same rounding the viewer, OCR and redaction already
use, so every raster path in the app agrees with itself.

**TIFF frame 3 is byte-identical to PNG page 3** from the same document
(`numpy` max absolute difference 0 over 1275×1651×3). That is the encoder,
PackBits, the IFD chain and Pillow's decoder all agreeing on every pixel.
Dark-pixel counts are identical across the PNG, the colour TIFF, the bw TIFF
and the grayscale range export (15,095 of 2,105,025) — no page came out blank,
and the range export's first frame really is page 3.

## 2. Page images are the page

`qa/output/export-lane/30-tiff-bw-page3.png` — frame 3 of the black-and-white
TIFF, read back through Pillow: running head, line numbers 1–28, the Q/A text,
the printed page number and the Bates number `ASHFORD000123`, all legible at
1 bit.

## 3. Plain text vs `pdftotext`

704 words out of the app, 704 words out of poppler, same multiset. The only
ordering difference is the page footer: poppler (`-layout`, position order)
emits the printed page number before the Bates number, pdfjs (content-stream
order) emits them the other way round. No word is missing or invented.

The manifest's ground-truth sentence — "Q. On transcript page one, did you
review the trust instrument?" — is present. 8 `----- Page N -----` headers and
7 form feeds for 8 pages.

## 4. The panel, driven end to end

| Shot | What it shows |
| --- | --- |
| `00-export-panel.png` | The dock panel on open: five formats, "8 pages will be exported", DPI and colour controls |
| `10-ready.png` | Destination chosen, range `1-40`, 150 dpi |
| `11-progress.png` | Mid-run: pulsing dot, "Exporting", **PAGE 5 / 40**, filling bar, Stop button |
| `12-stopped.png` | After Stop: "Export was stopped after page 6. 6 files were kept." — and 6 files were in the folder |
| `13-receipt.png` | "Wrote 6 PNG files to /tmp/…/ui-run", the renamed-batch note, "Show in folder" |
| `20-word-not-ready.png` | Word selected: "Word document export is not ready yet. It arrives in a coming update — the other formats all work now." |
| `21-tiff-receipt.png` | Save-dialog branch: "Wrote pleading-fixture.tif (8 pages)" — Pillow: 8 frames, 1700×2200, 200 dpi |

**Overwrite protection held across three runs into one folder.** Run 1 wrote
`pleading-500-page-001..006.png`; run 2 was stopped after page 6 and landed as
`pleading-500 (2)-page-001..006.png`; run 3 landed as `pleading-500 (3)-…`.
The first batch's bytes were never touched.

## 5. Two defects found and fixed during this pass

1. **The error class name leaked into the panel.** A stopped run read
   "ExportCancelledError: Export was stopped after page 5…" — the shared
   `describeError` in `use-stamp-runner.ts` strips `Error:` but not a subclass
   name. Fixed lane-locally with `plainExportError` (`export-messages.ts`,
   tested). The shared helper has the same gap for every other panel; flagged
   to the orchestrator rather than edited here.
2. **The format picker pushed the Export button off-screen.** Every format's
   description was always visible, so the run controls sat below the fold in a
   900 px window. The description now belongs to the SELECTED row; the whole
   form fits (see `20-word-not-ready.png`).

## Not covered here

- Word (.docx) is lane M's exporter; this pass only proves the seam rejects it
  by name and the panel says so in plain English.
- Windows packaging (`build:win`) and Explorer behaviour — the orchestrator's
  v0.5.0 pass.
