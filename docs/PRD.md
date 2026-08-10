# Librarius — Product Requirements

**One-liner:** The anti-Acrobat. A fast, lightweight Windows desktop PDF
editor with exactly the toolset a litigation attorney uses daily, plus an
embedded Claude panel. No popups, no subscriptions, no cloud dependency
(except Centurion).

**User:** Arthur — litigation attorney, power user, not a developer. All UI
copy in plain English. Armory design system (dark, purple, dense, tactical).

**Out of scope (deferred stretch goal, separate session):** editing existing
PDF text with reflow. "Whiteout and retype" ships instead (F-10).

---

## Features

### F-1 Viewer (the foundation everything mounts on)

- Open PDF via file dialog, drag-and-drop, double-click association, recent list
- Multiple documents in tabs; tab shows filename + dirty marker
- Continuous vertical scroll, virtualized — a 2,000-page document scrolls
  smoothly; pages render lazily at current zoom, nearby pages pre-render
- Thumbnail sidebar (virtualized), click-to-jump, current page highlighted
- Zoom: buttons, Ctrl+wheel, fit-width / fit-page presets, 10%–800%
- Page indicator ("14 / 312") with type-to-jump
- Text selection + copy on OCR'd/text pages
- Find in document (Ctrl+F): hit list, highlight, next/prev
- Print via system dialog
- Save / Save As; never overwrite the original silently on destructive ops
- **Acceptance:** open a 500-page PDF < 2s to first page; scroll at 60fps
  feel; all features above demonstrably work.

### F-2 Page organization

- Thumbnail grid mode: drag-reorder, multi-select
- Rotate 90° CW/CCW, delete, extract selection to new PDF, insert blank page,
  insert pages from another PDF at position
- Split: by ranges ("1-30, 31-60"), or extract-selection
- Combine: multi-file picker + drag-drop onto app, orderable list, merge
- **Acceptance:** page counts verified in==expected out on every op; combine
  of 3 files with 2/3/4 pages yields exactly 9 pages in chosen order;
  bookmarks and page rotations survive a merge.

### F-3 Bates numbering

- Prefix + start number + zero-pad width (e.g. ASHFORD000123), page range,
  corner position (4 choices), font size, optional white backing box
- Preview on current page before applying; applied stamps are flattened
- **Acceptance:** every page in range carries the exact expected string
  (verified by text extraction); numbering continuous across a combined doc.

### F-4 Exhibit stamps & slip sheets

- "EXHIBIT A"-style stamp with configurable label, auto-increment across
  files (A, B, ... AA), position/size; classic bordered stamp look
- Insert slip-sheet page ("Exhibit A" centered) before a chosen page
- **Acceptance:** stamp text extractable on stamped page; slip sheet adds
  exactly one page at the right index.

### F-5 Watermarks & page numbers

- Diagonal or horizontal text watermark (e.g. DRAFT, CONFIDENTIAL) with
  opacity, size, color (gray default), all/range
- Header/footer page numbering ("Page N of M", position, font size) —
  independent of Bates
- **Acceptance:** watermark visible in rendered page raster; page-number
  strings verified by extraction.

### F-6 Signatures

- Signature library: import PNG (transparent), store in userData; multiple
  signatures (full sig, initials)
- Place on page: click position, drag to move, handle-resize, then Apply →
  flattened into page content (not an annotation that can be deleted)
- Date-stamp option next to signature
- **Acceptance:** flattened signature survives reopening in another viewer;
  no live annotation object remains.

### F-7 OCR (local, fast)

- Bundled Tesseract; detect pages lacking a text layer, offer "OCR this
  document"; per-page worker pool sized to CPU cores
- Invisible text layer written under the page image → selectable/searchable
- Progress: "Page 37 / 214" streaming, cancellable
- **Acceptance:** scanned page becomes text-searchable; extracted text of a
  known test page ≥ 95% correct; runs fully offline; all cores utilized.

### F-8 True redaction

- Draw redaction boxes (marked state, adjustable, listed in a panel)
- Search-based: find all instances of a term/pattern across the doc → mark all
- Apply = DESTRUCTION: affected pages rasterized at 300 DPI, boxes burned in
  black, page content replaced by the raster (original text/images gone),
  optional re-OCR of non-redacted content to restore searchability
- Verification pass: re-extract text of output, assert marked strings absent;
  show "Redaction verified — N instances destroyed" receipt
- Output always Save-As (never overwrite source)
- **Acceptance:** target string extractable before, absent after, from the
  saved file's raw bytes; copy-paste over a redaction box yields nothing.

### F-9 Production hygiene

- Metadata scrub: strip Info dict (author/title/producer), XMP, and warn
  about attachments; one-click "Scrub for production"
- Flatten all annotations into page content on export
- **Acceptance:** scrubbed file shows empty author/producer in raw bytes;
  annotations no longer exist as objects after flatten.

### F-10 Add text / whiteout ("whiteout and retype")

- Text box tool: click anywhere, type, font size/color, flatten on apply
- Whiteout tool: white rectangle (or sampled background), then optionally
  retype over it — the pragmatic 90% of "edit text"
- Blank page + text = trivially supported via F-2 + this
- **Acceptance:** added text extractable at expected position; whiteout
  covers target region in raster.

### F-11 Centurion (Claude panel)

- Right sidebar chat; context = extracted text of open document (or current
  page range for huge docs), streaming responses, model `claude-opus-5`
- API key: entered in Settings, stored via Electron safeStorage (DPAPI);
  never in files/logs; renderer only ever sees `hasKey: boolean`
- Every response checks `stop_reason`; `max_tokens` → automatic retry at a
  higher ceiling, never display/persist a clipped answer
- Plain-English error states ("No API key yet — add one in Settings")
- **Acceptance:** ask "what is this document about" on a test PDF → sensible
  streamed answer; key survives app restart; key absent from all files.

### F-12 Packaging

- `npm run build:win` → NSIS installer .exe in `release/`, installable on
  any Windows PC without admin-ordeal; bundles Tesseract + eng traineddata;
  app icon + "Legion Armory — Librarius" branding; file association for .pdf
  optional (off by default)
- **Acceptance:** installer runs on the Windows host, app launches, OCR
  works offline on a machine with no dev tools.

---

## Engineering rules (bind every feature)

1. **No silent data loss** — every op returns counts (`OpResult`), callers
   verify; ranges validated against real page count before slicing; empty
   output = loud error. (Global gatekeeper rule.)
2. **Destructive ops default to Save-As**; the source file on disk is
   untouched until the user explicitly saves over it.
3. **Progress everywhere** — batch ops stream page-level progress over IPC.
4. **300-line files, 50-line functions, complexity ≤ 10, strict TS, no `any`.**
5. **Tests:** every `core/` function has Vitest coverage incl. count
   verification and collapsed-window error cases.

## Phases

- **Phase 1 (Acrobat killer):** F-1, F-2, F-3, F-4, F-5, F-6, F-10
- **Phase 2 (litigation edge):** F-7, F-8, F-9
- **Phase 3 (polish):** F-11, F-12
- **Stretch (separate session):** true text editing with reflow
