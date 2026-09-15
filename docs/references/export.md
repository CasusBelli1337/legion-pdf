# Export — PDF out to images, TIFF, text (and Word)

## What it does

Writes an open document out in another format: one PNG or JPEG per page into a
folder, one multi-page TIFF, one plain-text file — or a Word document, which the
Word lane serves through the same seam. Everything runs on this machine; nothing
is uploaded.

The attorney reaches it from the Export tool in the left dock, or File > Export
As (`Ctrl+Shift+E`), which selects the same panel.

## Data flow

```
ExportPanel (src/features/export)
  └─ window.librarius.export.chooseOutput(format, suggestedName)
       └─ chooseExportOutput()            folder picker OR save dialog by format
  └─ window.librarius.export.run(docId, ExportOptions)
       └─ electron/ipc/export.ts          supplies raster / JPEG / pdfjs / disk
            └─ ExportRunner.run()
                 ├─ resolvePages()        "all" or "1-30, 45" vs the real page count
                 │                        (RangeCollapseError when it selects nothing)
                 ├─ AbortController       export:cancel aborts THIS document's run
                 ├─ EXPORTERS[format]     one function per format (the seam)
                 │    ├─ requestRaster    → renderer → pdfjs → PNG bytes at DPI
                 │    ├─ core/image       colour conversion, PackBits, TIFF
                 │    └─ writeFile        atomic, refuses empty bytes
                 └─ assertComplete()      files === pages, pagesExported === asked,
                                          every file non-zero on disk
  └─ export:progress                      { docId, phase: 'Exporting', current, total }
```

## The seam — how a format is added (`#seam:export-registry`)

`electron/services/export/exporter.ts` is the whole contract:

```ts
export interface ExportJob {
  docId: string;
  bytes: Uint8Array;
  fileName: string;                 // the document's own name — output names start here
  options: ExportOptions;           // shared/options-export.ts
  pages: number[];                  // 1-based, sorted, already validated. Never empty.
  signal: AbortSignal;              // check between pages
  report(current: number, total: number, phase: string): void;
}

export interface ExporterContext {
  requestRaster(request: { docId: string; page: number; dpi: number }): Promise<PageRaster>;
  requestLayout(request: Omit<LayoutRequest, 'requestId'>): Promise<LayoutResponse>;
  // Word only: the scan path. Recognize, adopt the recognized copy, drop it again.
  recognizeText(docId, bytes, pages, onProgress): Promise<OpResult<OcrRunDetail>>;
  adopt(bytes: Uint8Array, fileName: string): Promise<string>;
  closeDoc(docId: string): void;
  toJpeg(png: Uint8Array, quality: number): Uint8Array;
  openText(bytes: Uint8Array): Promise<TextSource>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export type Exporter = (job: ExportJob, context: ExporterContext) => Promise<ExportResult>;
```

and the table that binds a format to its writer:

```ts
export const EXPORTERS: Record<ExportFormat, Exporter> = {
  png: pngExporter,
  jpeg: jpegExporter,
  tiff: tiffExporter,
  txt: textExporter,
  docx: docxExporter,
};
```

Adding a format means writing a function of that shape and putting it in the
table. Anything a new exporter cannot reach on its own becomes one more member
of `ExporterContext`; every other exporter ignores it, and the fakes in
`export-runner.test.ts` and `docx-exporter.test.ts` are the only other places
that have to grow a field.

A new format also needs a row in `shared/export-formats.ts` (orchestrator-owned)
so the picker and the output-kind rules know about it. No panel change: the
picker is built from that list.

## Scanned pages (Word only)

A page with no text layer is a picture of words, and Word cannot edit a
picture. Before it reads a single layout, `docxExporter` asks
`detectTextLayer` (`@core/ocr`) which of the requested pages are scans, and if
there are any:

```
docxExporter
  ├─ detectTextLayer(job.bytes)     which requested pages have no text layer
  ├─ context.recognizeText(...)     local Tesseract, 300 dpi, "eng",
  │                                 phase "Recognizing text on scanned pages N/M"
  ├─ assertEveryScanRecognized()    every scan came back, every one with WORDS
  ├─ context.adopt(bytes, name)     the recognized copy, in the store, NO tab
  ├─ requestLayout(adoptedId, ...)  every layout read from the recognized copy
  ├─ buildDocx(..., scanPictures)   omit / behind / appendix
  └─ finally context.closeDoc()     the adopted copy never outlives the export
```

The attorney's own document is never changed: the recognized bytes are adopted
as a second, tab-less document and dropped in a `finally`, whatever happened.
The renderer answers layout requests for it through `DetachedDocuments`, the
same path bulk OCR uses.

**A scanned page that recognizes to zero words is an error** (`scan-pages.ts`),
never an empty page in the Word file. Detection itself failing is not: a
document whose content streams pdf-lib cannot read exported fine before this
step existed, so it exports without recognition and the receipt says so
(`DETECTION_FAILED_NOTE`).

### What becomes of the picture — `ExportOptions.scanPictures`

| Mode | What the Word file holds | Where it is built |
| --- | --- | --- |
| `omit` (default) | The recognized text only; a note per page says the picture was left out. | `core/export/images.ts` |
| `behind` | The recognized text, with the page's picture anchored to the PAGE behind it, like a searchable PDF. | `images.ts` + `docx-image.ts` |
| `appendix` | The recognized text, then one edge-to-edge section per scan under a centred "Scanned pages" heading. | `scan-appendix.ts` |

Two things real Word taught this lane (2026-09-15, measured with
`pdftotext -bbox` on `docx-render` output):

- **The `behind` anchor belongs BELOW the last line of the page**, in a
  paragraph whose line is exactly 1 twip. Anchored above the first paragraph it
  took the gap between the top margin and the first line for itself, and the
  first line could not climb back up: every page came out 2.2 pt low. Anchored
  below, the recognized text sits at exactly the same y as it does with the
  picture left out (81.7088 pt on pages 1 and 6 of the scanned-deposition
  fixture, to the digit).
- **The appendix heading must come off the PICTURE, not the margin.** Reserving
  the band as a top margin and giving the heading its own line spent it twice,
  and the first scan landed on a sheet of its own (13 pages for 6 + 6 instead
  of 12).

### What the panel says first — `export:plan`

`window.librarius.export.plan(docId, options)` answers an `ExportPlan` before
the button is pressed: the scanned pages, the pleading pages (from
`pleadingOf` over up to the first three pages of the range that hold text), and
the sentences to show. `electron/services/export/export-plan.ts` holds the
whole decision and is unit-tested without Electron; the handler in
`electron/ipc/export.ts` only supplies the bytes, the page range, and the
renderer round-trip.

The panel (`use-export-plan.ts`) asks again whenever the document, the format,
or the page range changes, debounced 300 ms, ignoring any answer that lands
after one of those changed. It never blocks the Export button: while the answer
is outstanding the panel says "Looking at the document…", and a plan that fails
leaves no lines at all. The "Scanned pages" choice appears only when the plan
found scans, and the receipt lists `receipt.kept` under **Kept** and
`receipt.dropped` under **Left out**.

## Files

| File | What it owns |
| --- | --- |
| `core/image/types.ts` | `PageImage` — rgb / gray / bilevel samples, and the size guard. |
| `core/image/color.ts` | BT.601 luma, the 50% bilevel threshold, and widening back to RGB. |
| `core/image/packbits.ts` | PackBits (TIFF compression 32773), packed per ROW. |
| `core/image/tiff-encode.ts` | Baseline TIFF 6.0: header, chained IFDs, strips, resolution tags. |
| `core/image/tiff-inspect.ts` | `countTiffPages` — the read-back that verifies the encoder. |
| `electron/services/export/exporter.ts` | The seam: `ExportJob`, `ExporterContext`, `Exporter`, `EXPORTERS`. |
| `electron/services/export/export-runner.ts` | Pages, cancellation, progress, count verification. |
| `electron/services/export/image-exporters.ts` | png / jpeg / tiff, DPI and quality validation. |
| `electron/services/export/text-exporter.ts` | Page headers, form feeds, the "this is a scan" refusal. |
| `electron/services/export/pdf-text.ts` | pdfjs in the MAIN process (no canvas needed to read text). |
| `electron/services/export/output-naming.ts` | `<stem>-page-001.png`, and never overwriting a batch. |
| `electron/services/export/cancellation.ts` | `ExportCancelledError` and the sentence it carries. |
| `electron/services/export/docx-exporter.ts` | Word: recognize the scans, read the layouts, build, prove the bytes. |
| `electron/services/export/scan-pages.ts` | The scan notes, the count assertions, the kept/left-out receipt. |
| `electron/services/export/export-plan.ts` | `export:plan`: what the Word export will have to rebuild, in sentences. |
| `core/export/images.ts` | Which pictures go in, and the scan's picture per `scanPictures`. |
| `core/export/docx-image.ts` | Inline pictures, and the page-anchored scan behind the text. |
| `core/export/scan-appendix.ts` | One edge-to-edge section per scan, after the last page of text. |
| `electron/ipc/export.ts` | The four handlers; supplies raster, layout, Tesseract, the store, `nativeImage`, pdfjs, disk. |
| `src/features/export/*` | The dock panel: picker, range, picture settings, progress, receipt. |

## Decisions worth knowing

- **A colour PNG export writes the renderer's bytes straight through.** The
  raster already IS a PNG; re-encoding it would cost time and add a way to be
  wrong. Grayscale, black-and-white, JPEG and TIFF decode it once and convert.
- **The TIFF encoder is hand-written** (`core/image/tiff-encode.ts`). Productions
  and e-filing portals want ONE multi-page TIFF; every JS package either writes
  one page per file or needs a native build we cannot put in an installer.
  Baseline TIFF 6.0 + PackBits is about 200 lines, and the tests decode it with a
  reader written independently from the spec rather than letting it grade itself.
- **Bilevel is PhotometricInterpretation 0 (WhiteIsZero), a set bit = black ink** —
  the fax convention every bitonal production uses. Grayscale is 1 (BlackIsZero),
  RGB is 2.
- **Pages are compressed one at a time** (`prepareTiffPage`), so a long colour
  export holds the compressed document plus one raw page, not N raw pages.
- **Per-page batches never overwrite.** The save dialog never saw those names, so
  if any one of them is taken the WHOLE batch moves to `"<stem> (2)-page-001.png"`
  and the receipt says so. Single-file exports DO replace: the native save dialog
  already asked about that exact file.
- **Names pad to at least three digits** (`Depo-page-007.png`) because that is how
  productions number pages, and because it makes a folder sort correctly.
- **A text export of a scan fails loudly.** A TXT file of nothing but page headers
  looks like a success; instead the run stops and names the fix (Text Recognition).
  A partial blank becomes a note on the receipt.
- **Cancel is a rejection, never a short success.** The files already written stay
  and the message counts them: "Export was stopped after page 12. 12 files were
  kept." The panel knows it was a stop because it asked for one — it does not
  parse the sentence.

## Verification

- `core/image/*.test.ts` — the TIFF round-trip through an independently written
  reader (IFD walk, PackBits decode, pixel compare), multi-page chaining,
  multi-strip reassembly, bilevel row padding, and an outside opinion from
  ImageMagick / libtiff / Pillow when the machine has one.
- `electron/services/export/export-runner.test.ts` — the whole pipeline on a fake
  renderer and a fake disk: names, counts, ranges, collisions, cancellation, the
  Word rejection, and each branch of the verification gate.
- `electron/services/export/pdf-text.test.ts` — main-process pdfjs against a
  pdf-lib fixture with known words and known line breaks.
- `electron/services/export/docx-exporter.test.ts` — the Word exporter on a fake
  context and real PDF bytes: no scans means no recognizer call, scans mean the
  recognizer is called with exactly those pages, every layout is read from the
  adopted id, the adopted copy is closed even when the build throws, and a page
  recognized to no words is refused.
- `electron/services/export/export-plan.test.ts` — the plan's sentences and its
  sampling, with the detector and the renderer both injected.
- `electron/services/export/scan-word-export.fixture.test.ts` — the whole scan
  path on `qa/fixtures/scanned-deposition.pdf` with the REAL Tesseract and the
  REAL pdfjs extractor, writing all three picture modes into
  `qa/output/word-export-scan/` for a `docx-render` pass. Skips cleanly when
  Tesseract or poppler is not installed.
- Live QA: `qa/reports/2026-09-15-export-lane.md`.
