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
  // LANE M (Word export) replaces this one line with its own exporter.
  docx: notYetExporter,
};
```

**Lane M plugs in by replacing exactly that one line** with
`docx: docxExporter` (from `electron/services/export/docx-exporter.ts`) and
nothing else in this folder. The Word exporter needs page LAYOUT rather than
page rasters, which its own `layout:*` round-trip supplies; if it wants that
reachable through the shared context, add one member to `ExporterContext` —
every other exporter ignores it, and the fakes in
`export-runner.test.ts` are the only other place that has to grow a field.

A new format also needs a row in `shared/export-formats.ts` (orchestrator-owned)
so the picker and the output-kind rules know about it. No panel change: the
picker is built from that list.

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
| `electron/ipc/export.ts` | The three handlers; supplies raster, `nativeImage`, pdfjs, disk. |
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
- Live QA: `qa/reports/2026-09-15-export-lane.md`.
