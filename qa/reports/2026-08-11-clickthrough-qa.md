# Legion PDF — Click-Through QA of the packaged v0.2 build

**Run date:** 2026-08-11 · **Build:** `Legion PDF 0.1.0` (commit `2fc1361`), installed .exe
**Method:** driven as a user — real `Input.dispatchMouseEvent` clicks and drags, real
`Input.dispatchKeyEvent` typing, over CDP on port **9450** only. Port 9222 (the attorney's
own Chrome) was never touched.
**Ground truth:** poppler (`pdftotext`, `pdfinfo`, `pdffonts`, `pdftoppm`) plus a
stream-inflating byte scanner, run WSL-side against `qa/fixtures/manifest.json`.
**Evidence:** `C:\Users\rothr\AppData\Local\librarius-build\qa-output-v02\` —
104 screenshots, 18 output PDFs, 59 JSON records, 89 driver scripts.

> **Verdict: ready for the owner's spin.** 34 PASS · 4 PARTIAL · 5 DEFERRED · **0 data-loss
> defects · 0 blockers.** Every v0.1 bug on the list is genuinely fixed, and every one of the
> seven fixtures is byte-identical to its repo original after ~60 destructive operations.
> Two things to know before you sit down: **Alt still pops a native menu bar**, and
> **"Save a copy" quietly re-points the tab to the copy.** Neither loses work; both will
> surprise you. Details in §3.

---

## 1. Identity and chrome

| Check | Result | Evidence |
|---|---|---|
| Window title says "Legion PDF" | **PASS** | Native title bar reads `Legion PDF`; `document.title` = `Legion PDF`; UA string is `LegionPDF/0.1.0`. `04-window-with-menubar.png` |
| Add/Remove Programs entry | **PASS** | `DisplayName: Legion PDF 0.1.0`, `Publisher: Legion`, `DisplayIcon: …\Legion PDF.exe,0`. No "Librarius" anywhere in the entry. |
| Exe / taskbar icon is the Legion mark, not the Electron atom | **PASS (with a legibility note)** | Icon extracted straight off the exe: maroon Legion bracket-and-wordmark, no atom. `02-exe-icon.png` (256px), `02-icon-16/32/48.png`. **But** at 16–32 px — taskbar and title-bar size — the "LEGION" wordmark is unreadable and the mark reads as an empty maroon square (visible in the title bar of `04b-alt-menubar-crop.png`). Finding **F-09**. |
| Exactly ONE toolbar row + tab strip + footer | **PASS** | Measured: tab strip at y≈10, single toolbar row at y 40–68 (Open · Save · Save a copy · Print │ Undo · Redo │ Prev/Next │ Zoom−/%/Zoom+ · Fit width · Fit page │ Find │ theme), footer at y≈850. Nothing else. `06-two-tabs.png` |
| No menu bar | **PASS at rest** | Nothing on screen at launch; client area is the full 864 px. |
| **Alt does not reveal one** | **FAIL** | Alt drops the client area 864 → 838 px and a native **File \| Edit \| View \| Help** bar appears above the tab strip. Captured: `16-alt-menubar-proof.png`. Cause is `electron/main.ts:62 autoHideMenuBar: true`. A second Alt hides it again. Finding **F-01**. |
| Tool dock LEFT / thumbnail–bookmark rail RIGHT | **PASS** | `nav` at x 0–48 (Organize, Bates, Stamps, Text Recognition, Redaction, Centurion); `aside` at x 1226–1386 (PAGES / BOOKMARKS). Acrobat layout, exactly. |
| **First run is LIGHT** | **PASS** | Verified on a **fresh userData** (`%APPDATA%\Legion PDF` created 14:54, `localStorage` empty) **before touching the toggle**: `data-theme="light"`, body `rgb(255,255,255)`, toggle tooltip "Switch to the dark theme". `01-first-run.png` |
| Toggle → dark looks intentional | **PASS** | `data-theme="dark"`, body `rgb(9,9,11)`, purple accents. All six panels screenshotted in dark (`61`–`67`). **Automated contrast audit over every text node: zero elements below 3:1.** No light-theme leftovers found. |
| Theme persists across relaunch, no dark flash | **PASS** | After a hard relaunch, 30 samples from 2.08 s onward all read `dark` / `rgb(9,9,11)` — no light frame at any sample, and the first screenshot after target attach is already dark. `88-boot-00.png` |
| Footer credit text | **PASS** | Reads exactly *"Built by Legion — actually reliable litigation drafting at AI speed · legion.law"* (rendered uppercase by the `readout` style). |
| Clicking the credit opens legion.law | **PASS** | Real click on the `LEGION.LAW` button (tooltip: "Open https://www.legion.law in your browser") → a browser window titled **"Legion: Actually Reliable Litigation Drafting - at AI Speed. - Google Chrome"** appeared. *I deliberately did not close it* — it opened as a tab in the attorney's already-running Chrome, and a `WM_CLOSE` would have taken his other tabs with it. One tab to close by hand. |

## 2. OS integration

| Check | Result | Evidence |
|---|---|---|
| `.pdf` association registered | **PASS** | `HKCU\SOFTWARE\Classes\PDF Document\shell\open\command` = `"…\Legion PDF.exe" "%1"`, `DefaultIcon` = the exe; `.pdf\OpenWithProgids` lists it. Legion PDF is **not** the default handler (Edge/`MSEdgePDF` holds `UserChoice`) — the installer registers without stealing the default, which is the polite behaviour. Two housekeeping notes in **F-14**. |
| Shell-open adds a tab | **PASS** | `& '…\Legion PDF.exe' '…\exhibit-part-a.pdf'` → tab appeared, footer `EXHIBIT-PART-A.PDF - 1 / 2 - 182% - SAVED`. |
| Second launch focuses the same window, no second instance | **PASS** | Repeated 6× across the run with different files. Process count stayed at **4** every time (Electron's own 4 processes); a single window titled `Legion PDF`; each file arrived as a new tab. `requestSingleInstanceLock` + `OpenFilesRelay` working. |

## 3. v0.2 features

| Feature | Result | Evidence |
|---|---|---|
| **Undo / redo** | **PASS** | Prefix placeholder reads **`PLAINTIFF`** as specified. Applied Bates on the 500-page pleading; live preview updated to `PLAINTIFF000001 through PLAINTIFF000500, on 500 pages.`; receipt matched. **Ground truth on three saved states: applied = 500 stamps, 500 unique, `PLAINTIFF000001`→`PLAINTIFF000500`, zero gaps, zero duplicates, exact sequence; after Undo = 0 stamps and the file is `sha256`-identical to the untouched fixture; after Redo = `sha256`-identical to the applied file.** Button states correct at every step (both disabled before any edit → undo enabled/redo disabled after apply → inverted after undo). `13`–`15`, `files/20/21/22-bates-*.pdf` |
| Undo via **Ctrl+Z** | **DEFERRED** | Not a defect finding — **not testable from this harness.** Ctrl+Z is registered *only* on the main-process menu template (`electron/menu-template.ts:49`), and CDP-injected keys never reach main-process accelerators. Windows also refused to give the app foreground (`SetForegroundWindow` + `AttachThreadInput` both denied), so a real keystroke could not be delivered. Registration is covered by `menu-template.test.ts`. **Please press Ctrl+Z once during your spin** — same for Ctrl+S/O/P. |
| **Signature — drag from library onto the page** | **PASS** | Real 20-step mouse drag from the library tile to a point on the page. Drop at (652, 668) → placement box centred at (652, 668). Exactly where dropped. `40-signature-dropped.png` |
| Signature — drag-move | **PASS** | Drag +130/+95 → box moved dx 130, dy 95, size unchanged. |
| Signature — corner resize | **PASS** | Dragged the `nesw-resize` handle +80/−50 → 149×50 → 299×100 (aspect preserved) **and the "Height on page" field tracked live 42 → 84 pt.** |
| Signature — Delete key removes | **PASS** | Selected the placement, pressed Delete → overlay gone, panel's placement row gone. |
| Footer reports an unplaced signature | **PASS** | Status line: `EXHIBIT-PART-A.PDF - 1 / 2 - 119% - UNSAVED CHANGES - 1 UNPLACED SIGNATURE`, plus a panel warning: *"This signature is not in the file yet. Saving places it permanently — you will be asked first. Closing without saving leaves the document unsigned."* |
| Save → flatten confirm mentions permanence | **PASS** | In-app modal: **"Place this signature into the document? / Permanently place 1 signature into the document? They can't be moved or removed after this. / Cancel keeps them where they are, so you can keep moving them. Nothing is saved either way until you choose."** Buttons: Cancel · Place and save. `45-flatten-confirm.png` |
| Cancel keeps it live | **PASS** | Placement still present and draggable after Cancel; nothing written. |
| Confirm flattens + saves | **PASS** | Receipt "1 signature is now part of the document"; status → SAVED. **Output: `/Subtype /Image` XObject present, `/Annots` empty, no `/Type /Annot`, `Form: none`; 1 607 → 8 209 bytes; signature visible in the poppler raster at the drop position.** `48-signed-render-1.png` |
| Import dialog shows a cleanup preview | **PASS** | Side-by-side **AS PHOTOGRAPHED** (white paper) vs **CLEANED UP** (transparent chequerboard), a "Clean up scan (keep the pen strokes, drop the paper)" checkbox on by default, and a sensitivity slider labelled *Only the darkest ink ← → Every faint line*. `38-signature-import-dialog.png` |
| **Text — arm, drag a box, type into it** | **PASS** | Armed "Add text" (panel: *"Draw a box on the page and type. The text is set in the box you draw."*), dragged 506,310 → 921,367 → an inline textarea appeared at exactly 506,310 415×57 with a floating font toolbar and the hint *"Ctrl+Enter to place it. Esc to throw it away."* Typed directly into it. |
| Text — Times + bold | **PASS** | Clicking Times then B changed the live editor to `"Times New Roman"` / weight 700. **`pdffonts` on the output lists `Times-Bold`.** |
| Text — commit by clicking away | **PASS** | Clicked empty page area → committed; receipt "Added text to page 1". **`pdftotext` puts `OBJECTION SUSTAINED - REPORTER NOTE` at the top of page 1, at the spot the box was drawn.** |
| "Match document text" reports Times | **PASS** | On the 500-page pleading (whose only font is `Times-Roman`): clicking it switched the editor to Times New Roman **and matched the size** (14.28 px → 10.71 px), and the panel said in plain English: **"This document uses Times-Roman — the same font Legion PDF types in."** Esc discarded the box cleanly. |
| Whiteout → type-over | **PASS** | "Cover an area" → dragged a band → offered *"Cover this area on page 1"* / *"Cover it and type over it"*. Took the type-over path, typed `REVISED PER STIPULATION`, clicked away. Raster shows the band genuinely painted white with the new text on it; the covered text remains extractable — **exactly as the panel discloses**: *"Covering hides content, it does not destroy it. Use Redaction for anything that must be gone from the file."* `59-whiteout-render-001.png` |
| **Exhibit stamp — the v0.1 bug** | **PASS** | Default label `EXHIBIT A`, live preview on the page, Bottom center selected. Applied → **`pdftotext` page 1 = `FILE EXHIBIT-PART-A.PDF PAGE 1 OF 2` + `EXHIBIT A`**, page 2 clean. The page shows the label it was given. Panel advanced to **EXHIBIT B**. Bottom-center confirmed by `-layout` centring and the raster. `23-exhibit-stamped.png`, `48-signed-render-1.png` |
| **Watermark — no ghost/double** | **PASS** | Preview: one DRAFT at 45° inside a dashed maroon preview box. Applied: **one DRAFT, same position and angle, dashed box gone.** Crop comparison `25-wm-PREVIEW.png` vs `26-wm-APPLIED.png`. Preview cleared on apply. |
| **Slip sheet before page 2** | **PASS** | On page 2 of a 4-page exhibit, "Before this page" → live hint *"A divider page carrying the label above, added to this document as page 2."* Applied → receipt `ADDED A "EXHIBIT A" SHEET AS PAGE 2.` **Extraction proves the order: p1 = C page 1, p2 = `EXHIBIT A`, p3 = C page 2, p4 = C page 3, p5 = C page 4.** |
| **Organize opens on the current page, scrolled into view** | **PASS** | Weak case (5-page doc, page 3): card 3 selected and fully visible. **Strong case (500-page doc, page 250): header "500 pages - 1 selected", grid `scrollTop` 16 714 of 34 066 — page 250 centred in view with a purple selection border.** `74-organize-p250.png` |
| **Bookmarks — add on page 4 keeps the view on page 4 (the v0.1 bug)** | **PASS** | Page 4 before, during the inline prompt, and after Add. Prompt pre-filled "Page 4"; receipt `ADDED THE BOOKMARK "DEPOSITION EXHIBIT 4" AT PAGE 4.` |
| Bookmarks — rename / click-jump / delete | **PASS** | Rename field pre-filled with the current title → `RENAMED THE BOOKMARK TO "EXHIBIT 4 - SMITH DEPO".` Click-jump moved the viewer 1 → 4. Delete asks first (*Remove "Cover Page"? · Remove · Keep it*) → `REMOVED THE BOOKMARK "COVER PAGE".` **Persistence verified in the saved bytes: the outline carries `/Title` = `Exhibit 4 - Smith Depo` (UTF-16BE) and "Cover Page" is gone.** |
| **Bulk OCR — engine and outputs** | **PASS** | Two image-only files, 6 pages each. Result `succeeded: 2, failed: 0`, 120 words each, outputs named `<name> (searchable).pdf` as the panel promises. **All 6 manifest `mustFindAfterOcr` lines found character-exact in BOTH outputs — 100 % recall, 0 substitutions.** Originals `sha256`-identical to the repo fixtures. 4.2 s for 12 pages. |
| Bulk OCR — through the UI's own picker | **PARTIAL** | The **"Choose PDFs" button was clicked for real** and demonstrably opens the native `Open PDF` dialog (enumerated twice, class `#32770`; cancelled with `WM_CLOSE`). File paths cannot be delivered into an OS dialog from this harness, so the run itself went through `ocr.bulk` — see the substitution list. **Not exercised:** the on-screen per-file progress, the "Replace files that are already there" toggle, the folder chooser, and the done-receipt. |
| **Recent files** | **PASS** | Built from this session on a fresh userData. After a hard relaunch: **12 entries, newest first, with full paths and timestamps, plus "Clear list"**; clicking one opened the document in **319 ms**. `88-boot-00.png` |
| Centurion — no-key state | **PASS** | *"Centurion reads the document you have open and answers questions about it. It needs your own Anthropic API key to do that."* + *"The key is encrypted by Windows and stored on this computer only. It is never written into a file you can read, never sent anywhere except Anthropic, and never shown again once saved."* Masked input, Save disabled while empty. Renders correctly in both themes. `66-dark-Centurion.png` |
| Centurion — tools toggle + quick-action hints | **DEFERRED** | Not visible, and not a bug: both live inside the panel that renders only once a key exists (`centurion-panel.tsx:77–79`). **No key was entered, per instruction.** Note **F-13**. |
| **Scroll-position retention** | **PASS** | On page 250 of the 500-page pleading, applied Bates to all 500 pages → footer still `250 / 500`, page 250 still on screen. |

## 4. Regression spot-checks

| Check | Result | Evidence |
|---|---|---|
| 500-page open speed | **PASS** | Click a recents entry → first page painted **with real text** (`PAGE MARKER P0001`) in **362 ms**. Acceptance is < 2 s. |
| Zoom presets + clamps | **PASS** | 50 % → 306×396, 100 % → 612×792, 200 % → 1224×1584 (exactly linear). Fit width 171 %, fit page 89 %. Ctrl+wheel 89 → 98 %. Clamps hold: typing 5 → 10 %, typing 2000 → 800 %. |
| Find | **PASS** | Ctrl+F button → `Find in document` bar **pushes the page down, never covers it** (bar bottom 108, viewer top 121). Searching `PLAINTIFF000250` on the 500-page doc → **"1 OF 1 · PAGE 250"** in under a second and the viewer jumped to 250 — which also proves the Bates stamps are searchable in-app. Esc closes it. |
| Print dialog opens | **PASS** | Real Windows 11 print dialog, titled **"Legion PDF - Print"**, with Printer / Orientation / Copies / Color mode / Pages ("All pages — The whole document"). `91-print-dialog.png`. **The v0.1 wedge is fixed:** cancelling with `WM_CLOSE` returned the app to a fully responsive state with the tab intact. See the correction note below and finding **F-08** (no preview). |
| Combine | **PARTIAL** | Panel verified: seeds with the active document, "Add PDF files…", "Combine N files", copy *"Files are combined top to bottom into a new document. Nothing here is changed on disk."* Adding the other two files needs the OS picker, so the 3-file merge itself was not re-run (it passed end-to-end in v0.1: 9 pages, exact A/B/C order). Finding **F-06**. |
| Split | **PASS** | Typed `1-2, 3` → live preview *"Document 1: Pages 1-2 (2 pages) / Document 2: Page 3 (1 page)"* → receipt `SPLIT INTO 2 DOCUMENTS, EACH IN ITS OWN TAB.`, two new tabs, source untouched. |
| Rotate | **PASS** | Selected page 2 → Turn right → `TURNED 1 PAGE CLOCKWISE.` **`pdfinfo`: page 2 `rot: 90`, every other page `rot: 0`.** |
| Delete page | **PASS** | Selected page 4 → `REMOVED 1 PAGE. 3 LEFT.` **Output = 3 pages, correct content, and the page-2 rotation survived.** |
| **Redaction — search, mark, apply, verify** | **PASS** | `545-45-6789` → **"2 instances on 2 pages"** (matches the manifest). All three secrets marked (4 marks) and applied. Receipt: *"Redaction verified — 4 instances destroyed on 4 pages. Legion PDF re-opened the saved document, searched every stream in the file, and read the text back off 4 rebuilt pages. The marked text is not there."* **Independent verification of the saved output: `SSN 545-45-6789`, `545-45-6789`, `ACCT-99887766`, `PRIVILEGED-DRAFT-NOTE-X7` absent from raw bytes, absent from every inflated stream, absent from extracted text. `SURVIVE redaction` present on all 4 pages (4 occurrences).** Output opened in a new tab `redact-target (redacted).pdf`; **source `sha256`-identical to the repo fixture.** "Keep the redacted pages searchable" is **on by default** (v0.1 F-7 fixed). One nit: **F-10**. |
| Metadata scrub | **PASS** | `REMOVED 8 HIDDEN ITEMS OF DOCUMENT INFORMATION.` **All six planted strings gone** — checked raw bytes, inflated streams, and hex-decoded PDF strings. `pdfinfo` reports no Title/Author/Producer/Metadata Stream. Body text intact. |
| Page numbers | **PASS** | `NUMBERED 3 PAGES: "PAGE 1 OF 3" TO "PAGE 3 OF 3".` **Extraction confirms `Page 1 of 3` … `Page 3 of 3`, one per page.** |
| **Dirty-close guard (3-way)** | **PASS** | Closing a tab with unsaved work raises a native dialog titled **"Unsaved changes"**: *"Save your changes to 38-deleted 1-2.pdf?"* with **Save and close · Close without saving · Cancel**. Cancel left the tab present and still dirty, app responsive. **v0.1's HIGH finding F-4 is fixed.** `85-unsaved-dialog.png` |
| **Fixture integrity** | **PASS** | After ~60 destructive operations across the run, **all 7 fixture PDFs are `sha256`-identical to the repo originals.** No source file was ever written. |

### Correction made during the run

I first reported print as a hang: the renderer stopped answering CDP and no dialog was
findable. That conclusion was **wrong**, and I chased it down rather than shipping it.
Windows 11 hosts this print dialog as a **UWP `ApplicationFrameWindow` owned by
`ApplicationFrameHost`**, not the legacy `#32770` class inside the app's own process — which
is all my enumeration was looking at. A full system-wide visible-window diff across the click
found it immediately: `13152|ApplicationFrameWindow|Legion PDF - Print`. The renderer being
unresponsive is the normal consequence of a modal, and it recovers on cancel. Print passes.

## 5. Findings

**F-01 · Medium · Alt reveals a native File/Edit/View/Help menu bar.**
The window is built with `autoHideMenuBar: true` (`electron/main.ts:62`) and then hidden with
`setMenuBarVisibility(false)` (`:73`) — but auto-hide is exactly the Electron mode that
*shows the bar on Alt*. Repro: press Alt. The client area shrinks 864 → 838 px and the bar
appears above the tab strip (`16-alt-menubar-proof.png`); Alt again hides it. This is the one
place the "one toolbar row, no menu bar" rule breaks, and Alt is a key attorneys hit by
accident constantly. Fix is to keep the menu installed for its accelerators but stop the bar
from ever showing — `autoHideMenuBar: false` plus `setMenuBarVisibility(false)`, or build the
window with `frame` chrome that has no menu bar at all.
*Honest caveat:* the reveal reproduced through CDP-injected Alt every time; a `WM_SYSKEYDOWN`
posted to an unfocused window did not reproduce it, and Windows would not let this session
take foreground to try a real keystroke. **Worth one manual Alt press on your spin.**

**F-02 · Medium · "Save a copy" is really "Save As" — it re-points the tab to the copy.**
`docStore.saveTo` writes the file and then sets `document.filePath`, `document.fileName`, and
clears `dirty` (`electron/services/doc-store.ts:152–160`), and the dialog-driven Save As path
calls the same function. Observed live: after saving a copy of `pleading-500.pdf`, the tab
re-labelled itself `21-bates-undone.pdf` and every later Ctrl+S targeted the copy. For an
attorney the words matter: "save a copy" means *give me a duplicate and leave me where I am*.
As shipped, you Bates a production set, "save a copy", keep working, hit Save — and you have
overwritten the copy while believing the original was still under you. Nothing is lost, but
the file you end up editing is not the one you think.
Related: the toolbar tooltip says **"Save a copy (Ctrl+Shift+S)"** while the hidden menu calls
the same action **"Save As…"**. One action, two names.

**F-03 · Low · The footer notice is sticky across documents (v0.1 F-9, still open).**
`STAMPED "EXHIBIT A" ON 1 PAGE` was still sitting in the footer while a different document was
active, six operations and several minutes later; likewise `REMOVED 8 HIDDEN ITEMS…` while a
third document was on screen. `setNotice` is never cleared on tab switch.

**F-04 · Low · Watermark text is still not searchable (v0.1 F-6, still open).**
The rotated glyphs extract as `FT D R A`, so Ctrl+F for DRAFT finds nothing. Visual output is
correct on every page.

**F-05 · Low · The recent-documents list is unreachable once anything is open.**
It renders only on the empty state, and the File menu that would otherwise hold "Open Recent"
is hidden. To reopen yesterday's exhibit you must close every tab first, or go through Ctrl+O
and find it on disk. The data is there (12 entries, timestamps) — it just has one doorway.

**F-06 · Low · Combine still cannot use documents already open in tabs (v0.1 F-8, still open).**
With nine documents open in tabs, adding any of them to a combine still means going out to the
OS picker and finding them on disk.

**F-07 · Low · Plural agreement in two buttons.** "Split into **1 documents**", "Combine
**1 files**". (The split *preview* gets it right — "Document 2: Page 3 (1 page)".)

**F-08 · Low · No print preview.** The Windows dialog shows "This app doesn't support print
preview" where the page thumbnails belong. The app builds a full hidden print sheet already,
so the pages exist; Electron just isn't offering them to the dialog. An attorney printing a
300-page production wants to see page 1 before committing paper.

**F-09 · Low · The app icon does not survive being small.** At 256 px the Legion
bracket-and-wordmark is handsome; at 32 px the word is mush and at 16 px (title bar, alt-tab)
it reads as an empty maroon square. The artwork also runs to the right edge of the 512 px
source, so the frame looks clipped at every size. A single glyph — the Legion "L" the design
doc actually calls for — would survive the taskbar.

**F-10 · Low · Redacted pages come back with scrambled reading order.**
With "keep the redacted pages searchable" on (the correct default), the rebuilt pages are
re-OCR'd, and the recovered text layer interleaves columns: *"Financial record Non-confidential
page 2. Client identifier closing paragraph that follows. must SURVIVE redaction."* Search
still finds every word — but copying a paragraph out of a produced set gives you word salad.

**F-11 · Low · Bookmarks list in insertion order, not page order.** A bookmark added at page 4
then one at page 1 lists 4 above 1.

**F-12 · Low · Organize thumbnails on a long document show a bare "…" placeholder.**
On the 500-page doc the grid cards sat at `...` with no spinner or count. Lazy loading is
right; a static ellipsis reads as broken rather than loading (UI rule 2).

**F-13 · Info · Centurion's tools toggle and quick actions are behind the key gate.**
Both render only once `hasKey` is true, so someone deciding whether Centurion is worth getting
an API key for cannot see what it does. Consider showing the examples greyed out.

**F-14 · Info · Registry housekeeping.** Two small things: a stale
`HKCU\SOFTWARE\Classes\Applications\Legion Armory - Librarius.exe` key survives from the old
product name; and the ProgId the installer claims is the generic `PDF Document`, which is a
name any other PDF app could also claim. A vendor-specific ProgId (`Legion.PDF.1`) would be
safer.

## 6. Bridge substitutions (complete)

Everything else in this run — every button, tab, panel, drag, resize, and keystroke — was a
real `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`. These are the only exceptions, all
of them where a native OS dialog blocks automation:

1. **`file.saveTo(docId, path)`** — used ~15 times to get output bytes onto disk for poppler
   verification. The user-facing routes (Save, Save a copy) are both OS-dialog-gated. This is
   the channel added in v0.2 precisely for this purpose.
2. **`DOM.setFileInputFiles`** on the signature import's own `<input type="file">` — fed the
   real `signature.png` path in place of the OS picker. Everything downstream (the cleanup
   preview, the sensitivity slider, "Add to my signatures") was driven by real clicks.
3. **`ocr.bulk(paths, { outputDir, overwrite })`** for the bulk-OCR run. The **"Choose PDFs"
   button was clicked for real** and proven to open the native `Open PDF` dialog; only the
   path delivery was substituted.
4. **Native dialogs dismissed by posted `WM_CLOSE`** (cancel): 2× `Open PDF`, 1×
   `Unsaved changes`, 1× `Legion PDF - Print`.

**Not exercised at all, and why:**
- **Every keyboard accelerator** (Ctrl+Z/Y/S/O/P/Shift+S). Registered only on the main-process
  menu (`menu-template.ts`); CDP keys cannot reach main-process accelerators, and Windows
  denied this session foreground for real keystrokes. Unit-tested in-repo.
- **Bulk OCR's UI progress, receipt, folder chooser, and overwrite toggle** (native picker).
- **Combine of 3 files end-to-end** (native picker) — passed in v0.1.
- **Centurion with a key** — no key, per instruction.

## 7. Environment record

| Item | Value |
|---|---|
| App version | **0.1.0** (`app:version`), commit `2fc1361` |
| Electron / Chrome / Node | 43.3.0 / 150.0.7871.212 / 24.18.1 |
| Install path | `C:\Users\rothr\AppData\Local\Programs\Legion PDF\` |
| Executable sha256 | `b2144edb033c25c97b550cfb6adc4ffaf0aef24b5f0f6aa30e62cab2583bb654` |
| userData | `%APPDATA%\Legion PDF` — **fresh at run start** (created 14:54, empty localStorage) |
| CDP port | **9450** only. Port 9222 never contacted. |
| Fixtures | `C:\Users\rothr\AppData\Local\librarius-build\qa-fixtures\` (regenerated this run; they now read `PLAINTIFF v. DEFENDANT`) |
| `manifest.json` sha256 | `b2e937622d3cfe422e07a1256866cb7155083726fde6c1364c4b03738581ce8b` |
| Fixture integrity after the run | **all 7 PDFs byte-identical to `qa/fixtures/`** |
| Evidence | `C:\Users\rothr\AppData\Local\librarius-build\qa-output-v02\` — `screenshots/` (104), `files/` (18), `results/` (59), `scripts/` (89) |
| App restarts during the run | 3 (2 to test theme/recents persistence, 1 while the print modal was up) |
| Final state | App **left running**, all test tabs closed, dark theme, empty state showing Recents. CDP disconnected, all driver scripts exited. |

## 8. What to know before you sit down

1. **Press Alt once.** If the File/Edit/View/Help bar appears for you the way it did for me,
   that is F-01 and it is the only chrome defect on the list.
2. **Treat "Save a copy" as "Save As"** until F-02 is fixed — after using it you are editing
   the copy, not the original.
3. **Try Ctrl+Z and Ctrl+S yourself.** Undo and Redo are provably correct through the buttons
   (byte-identical restore of a 500-page document), but no harness on this machine can press a
   main-process accelerator. Thirty seconds of your time closes the last real gap.
4. **Everything that could lose work behaves.** Undo restores the original bytes exactly,
   redaction destroys what it says it destroys and proves it, closing dirty work asks first
   with a proper three-way choice, and after roughly sixty destructive operations not one
   source file changed by a single byte.
