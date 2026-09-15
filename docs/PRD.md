# Legion PDF — Product Requirements

**One-liner:** The anti-Acrobat. A fast, lightweight Windows desktop PDF
editor with exactly the toolset a litigation attorney uses daily, plus an
embedded Claude panel. No popups, no subscriptions, no cloud dependency
(except Centurion).

**User:** Arthur — litigation attorney, power user, not a developer. All UI
copy in plain English. Legion light theme by default (the app is
client-distributable), Armory dark theme behind the toolbar toggle.

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

- Prefix + start number + zero-pad width (e.g. PLAINTIFF000123), page range,
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
  Legion "L" app icon + "Legion PDF" branding; .pdf file association
  registered per-user (Open With + default-app capable)
- **Acceptance:** installer runs on the Windows host, app launches, OCR
  works offline on a machine with no dev tools.

### F-13 E-signature requests (Legion Sign)

- E-Sign dock panel: add signers (name + email, colour-coded), place
  signature / initials / name / date / text fields by click, drag/resize/
  delete live boxes; fields are REQUEST metadata, never burned locally
- Send for signature: uploads the PDF + fields to the Legion Sign service
  (`sign.legionarmory.net`, an isolated Cloudflare Worker on Arthur's zone);
  each signer gets a private capability link (256-bit token, stored hashed
  server-side, uniform 404 on anything invalid — no existence leaks)
- Signing page (service-hosted, Legion light design): guided fields, ESIGN
  consent line, signature by draw / type / upload (upload runs the
  demand-letter background-removal algorithm client-side); date auto-fills
- Completion: when the LAST signer finishes, the service burns all values
  with pdf-lib, appends a Signing Certificate page (timestamps UTC, IP, UA,
  consent, SHA-256 of the original), and emails the final PDF to every
  signer + the requester from sign@legion.law (Resend)
- Delivery choices: service-sent email (default) / the attorney's own Gmail
  (app password over SMTP, stored via safeStorage) / copy links manually
- Acrobat fallback: "Export fillable PDF" writes a COPY with real AcroForm
  text fields + marked signature boxes so non-Legion recipients complete it
  in Acrobat/any viewer (Fill & Sign)
- Centurion tool `addSignatureFields`: places fields by quoting anchor text
  from the page ("By:", "Date:", underscore runs) with
  right-of/on/above/below placement; lands in the panel for review, sends
  nothing
- **Acceptance:** live E2E — request sent to two real inboxes, both sign via
  links (draw + type + upload paths), final copy with certificate page
  arrives to all parties and opens clean in Legion PDF and Acrobat-class
  viewers; fillable export completes in a non-Legion viewer.

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
- **Phase 4 (e-signature):** F-13 (app + Legion Sign service, 2026-08-22)
- **Stretch (separate session):** true text editing with reflow

### F-14 Page rail: select, right-click, drag (2026-09-15)

- Click / Ctrl-click / Shift-click select pages in the right rail; a count and
  Clear sit above the list
- Right-click: delete, extract to a new PDF (with or without removing), rotate,
  select all — every action reports counts in the footer; Undo covers it
- Drag a selection to reorder (drop line between pages, end drop zone)
- **Acceptance:** rail stays virtualized on 500 pages; saved order verified by
  text extraction.

### F-15 Open Word, images, spreadsheets, and text as PDFs (2026-09-15)

- `File > Open` / `Create PDF from File...` accept .docx/.doc/.rtf, .xlsx,
  .pptx, .txt/.html, and PNG/JPEG/TIFF/BMP/GIF/WebP
- Word/Excel/PowerPoint convert through the installed Microsoft Office (COM);
  images and text through the built-in engine; a converted file opens as an
  UNSAVED tab so the original is never overwritten
- **Acceptance:** every conversion proves page count ≥ 1 before it is shown.

### F-16 Combine from Windows Explorer (2026-09-15)

- Select PDFs, Word documents, and images in Explorer → right-click →
  "Combine in Legion PDF": the app gathers the launches into ONE list, opens
  the Combine Files panel, lets the attorney drag-reorder, and merges into a
  new tab; "Convert to PDF with Legion PDF" on a single non-PDF
- **Acceptance:** three separate launches 250 ms apart become one batch in
  natural name order; combined page count equals the sum.

### F-17 Export: PNG, JPEG, multi-page TIFF, plain text (2026-09-15)

- Export dock panel + `File > Export As...` (Ctrl+Shift+E): format, page
  range, DPI, colour (colour / grayscale / black-and-white), JPEG quality;
  per-page images into a folder or one TIFF/TXT file; live "Page 12/65",
  Stop, receipt with "Show in folder"
- **Acceptance:** files written == pages requested, each non-empty; the TIFF
  page count read back equals the request.

### F-18 Export to Word (.docx) (2026-09-15)

- A flowing, editable Word document: fonts by name, sizes, bold/italic,
  colour, alignment, indents, exact line spacing, page breaks, headers and
  footers, images in place; pleading line numbers become Word's own line
  numbering
- **Acceptance:** rendered in real Word and compared page by page with the
  source PDF.

### F-19 Edit existing text (2026-09-15) — the deferred stretch goal, shipped

- Stamps & Marks › Text › **Edit text**: click a paragraph, retype it in
  place, Ctrl+Enter. The paragraph re-wraps on its own measure, indent,
  leading, and alignment, in the document's OWN embedded font when that font
  can spell the new text; otherwise the closest built-in face, and the note
  says which characters forced the change BEFORE the edit is applied
- Refuses, in plain English, invisible OCR text over scans and text drawn
  through reusable graphics (Cover and retype handles those)
- **Acceptance:** proven on the saved bytes — the paragraph reads back exactly
  as typed and the shown-character count moves by exactly the glyphs removed
  and added; verified on a PDF Microsoft Word itself wrote.

### F-20 Side by side (2026-09-15)

- Toolbar "Side by side" / View › Side by Side (Ctrl+\): the working document
  on the left with all tools, a reference document on the right with its own
  page and zoom, a draggable divider, Swap, and optional "Scroll together";
  drag a tab onto the right pane to show it there
- **Acceptance:** scrolling or zooming the right pane never moves the left.
