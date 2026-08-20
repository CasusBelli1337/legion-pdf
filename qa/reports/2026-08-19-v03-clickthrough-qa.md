# Legion PDF v0.3 — Click-Through QA of the installed build

**Run date:** 2026-08-19 · **Build:** installed `.exe`, commit `b193efb`
("selection intelligence, cites, viewer UX, stamps polish, whiteout text-removal,
redaction consent")
**Method:** driven as a user — real `Input.dispatchMouseEvent` clicks, drags and
right-clicks, real `Input.dispatchKeyEvent` typing, over CDP on port **9450**
only. Port 9222 (the attorney's own Chrome) was never contacted.
**Ground truth:** poppler (`pdftotext`, `pdftoppm`, `pdfinfo`, `pdffonts`) plus a
flate-stream inflating byte scanner, run WSL-side against
`qa/fixtures/manifest.json`.
**Evidence:** `C:\Users\rothr\AppData\Local\librarius-build\qa-output-v03\` —
216 screenshots, 25 output PDFs, 58 JSON records, 112 driver scripts.

> **Verdict: ready for your spin, with two things to know first.**
> 32 PASS · 3 PARTIAL · 2 FAIL · **0 data-loss defects.** Every fixture is
> `sha256`-identical to its repo original after the whole run, undo restores a
> document byte-for-byte, and the one redaction that failed failed *loudly* and
> wrote nothing.
>
> **The star feature works.** Drag across a page break in a pleading and you get
> the paragraph — no line numbers, no running head, no Bates — copied as flowing
> prose with the hyphen repaired, and the cite reads `(1:8-2:2)` off the
> *printed* page number, cover-sheet offset and all. Every one of the ten cites
> in the manifest came back character-exact, on the pleading and on the 4-up
> condensed transcript.
>
> **Two defects to know about before you sit down** (details in §5):
> 1. **Redacting one instance of a string that appears elsewhere in the document
>    always fails** with "still readable in the rebuilt document." Nothing is
>    destroyed and nothing is saved — it just refuses. Mark *every* instance
>    (the Find box does this) and it works perfectly.
> 2. **Highlight from the right-click menu looks like it does nothing.** It
>    actually writes the highlight into the document — correctly — but the
>    screen never updates, the tab never goes to "unsaved changes," and closing
>    the tab throws the highlight away without asking.

---

## 1. The checklist

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | **Selection intelligence — pleading, across a page break** | **PASS** | Real 40-step drag from p3 line 8 to p4 line 2. Visual selection covers body text only: page 3's Bates `ASHFORD000123`, its footer page number, line number 28 and page 4's running head are all unhighlighted — `06a-boundary.png`. Roles on p3: 1 header, 28 line-number, 14 body, 1 stamp, 1 page-number (45/45 spans classified). |
| 1 | Selection intelligence — smart copy | **PASS** | Menu **Copy** on p3 lines 1-3 returns *exactly* the manifest string, hyphen repaired: `Q. On transcript page one, did you review the trust instrument? A. I did not read the whole document, only the signature page that Mr. Pemberton put in front of me.` No digits, no head, no Bates. |
| 1 | **Ctrl+C** | **FAIL** | A real Ctrl+C keystroke reaches the app and copies — but it copies the **raw text layer**: `…trust instrument?\r\n A. I did not read the whole document, only the signa-\r\n ture page that…`. Per-line breaks kept, hyphen not repaired. Line numbers *are* excluded (no digits), because they are `user-select: none`. Finding **F-3**. |
| 1 | Selection intelligence — condensed 4-up | **PASS** | Sheet 1 classified 304/304 spans (4 page-number, 100 line-number, 200 body). Mini-page 42 lines 1-2 copy as the manifest string exactly. Quadrant reading order confirmed: 41 top-left, 42 bottom-left, 43 top-right, 44 bottom-right, and a 42:25 → 43:1 selection comes out in that order. |
| 2 | **Right-click menu on a selection** | **PASS** | Four rows — Copy · Copy with cite *(cite preview + pencil)* · Highlight · Redact. Anchored at the **end of the selection** (menu left/top vs selection-end rect: dx −2 px, dy 0 px), not the pointer. `04-menu-on-mouseup.png`, `05-menu-rightclick.png` |
| 2 | Dismissal | **PASS** | Escape ✓, click elsewhere ✓, scroll ✓ (scroll gesture substituted — see §6). Selection survives Escape, so you can right-click it again. |
| 3 | **Copy with cite — printed page numbers** | **PASS** | Cover offset handled: PDF p3 = printed 1, PDF p8 = printed 6. Manifest cites all exact — `(1:1-3)`, `(1:5)`, `(6:1-5)`, cross-page `(1:8-2:2)`; condensed `(42:1)`, `(42:1-2)`, `(46:3-9)`, cross-mini `(42:25-43:1)`. On `redact-target.pdf` (no printed numbers) the row honestly reads **NO CITE** and is disabled rather than guessing. |
| 3 | Prefix via the pencil | **PASS** | Pencil → *"Source label for this document / Enter to save, Esc to cancel"* → typed `Rothrock Decl.` → row reads `(ROTHROCK DECL. 6:1-5)`; clipboard: `…A. No one did (Rothrock Decl. 6:1-5)`. |
| 3 | Prefix remembered per file, across a restart | **PASS** | Full quit + relaunch. `pleading-fixture.pdf` → `(Rothrock Decl. 1:1-3)`; `condensed-transcript.pdf` → bare `(42:1)`. Stored hash-keyed: `legion-pdf:cite-prefix:khlf1c:v1`. |
| 4 | **Highlight from the menu — the file** | **PASS** | Saved output rasterised: translucent yellow bands over exactly the three selected body lines, glyphs legible through them; `pdftotext` still returns the text. `19-highlight-raster.png` |
| 4 | **Highlight from the menu — the app** | **FAIL** | Nothing happens on screen. No re-render, no footer notice, no dirty flag, Undo stays disabled, no console error. Reproduced 3×. Finding **F-2**. |
| 5 | **Redact from the menu** | **PASS** | Panel shows `1 MARK READY TO DESTROY. / Page 3 — "Q. And no one read the rest of it to you"`, purple mark drawn on the page, document not dirty, nothing destroyed. Works with the redaction panel closed too. `21a-redact-mark.png` |
| 6 | Destroy consent (panel) | **PASS** | *"Permanently destroy the marked content? … This cannot be undone — not even with Undo. … Cancel keeps every mark exactly where it is, and destroys nothing."* Cancel → mark still listed. Confirm → *"Redaction verified — 2 instances destroyed on 2 pages. Legion PDF re-opened the saved document, searched every stream in the file, and read the text back off 2 rebuilt pages."* + new tab. `29-destroy-consent.png` |
| 6 | Save with pending marks — 3-way dialog | **PASS** | Wording matches the spec verbatim, including *"The redacted copy will be saved; your original stays open unredacted."* `24-save-gate-dialog.png` |
| 6 | Branch — **Cancel** | **PASS** | File `sha256` unchanged, mark still in the panel, nothing written. |
| 6 | Branch — **Save without redacting** | **PASS** | Tested on a dirty document (page rotated first): source written (2112 → 2122 bytes, mtime moved), rotation landed (`pdfinfo` page 2 `rot: 90`), `545-45-6789` still present ×2 (nothing destroyed), mark still in the panel. |
| 6 | Branch — **Apply redactions now** | **PARTIAL** | The branch runs and fails safe, but could not be completed: the redaction hit the verification defect (**F-1**) and refused. Correct behaviour on refusal — *"The redaction was NOT applied … The original document was not changed"*, source left **open, dirty and unredacted**, nothing written, a "Back to the marks" way out. The Save-As leg was therefore never reached. |
| 6 | Ground truth on the redacted output | **PASS** | `SSN 545-45-6789` and `545-45-6789` **absent** from raw bytes, from every inflated stream, and from extracted text; `SURVIVE redaction` present on all 4 pages; unmarked secrets untouched; source file unchanged. Same result on a second run against `ACCT-99887766`. |
| 7 | **Rendering-hang regression (your repro)** | **PASS** | `scanned-deposition.pdf`, organize → select → **Copy to new file** ×3 and **Move to new file** ×3. New tab painted in **596–611 ms** every round; 26 samples per round never caught the string "Rendering"; `scrollTop` had **one** distinct value after 1.5 s (no oscillation); switching back to the original took **297–312 ms**. |
| 8 | **Flickerless commits** | **PASS** | `Page.startScreencast` across a whiteout draw → type → commit: **53 frames**, page-area mean luminance 202–215 the whole way, no dark and no blank frame. Rotate: 8 frames, flat at 214.9. Text commit: 26-frame rapid burst, 202 → 215, no blank. |
| 9 | **Whiteout / type-over** | **PASS** | Cover box drawn over p3 line 4 → *"Legion PDF blanks the area, deletes the text under it, and opens a cursor there so you can type the replacement"* → editor opened **in place automatically** at the drawn rect, Times 12 → typed → committed. Output: `Q. And no one read the rest of it to you?` **gone** from extracted text and from the inflated streams; `REVISED PER STIPULATION ON THE RECORD` present in its place; lines 1, 2, 3, 5, 7, 8 intact. `56-whiteout-raster.png` |
| 9 | Undo restores the original text | **PASS** | Undo ×1 removes the typed box; Undo ×2 brings `Q. And no one read the rest of it to you?` back verbatim (`pdftotext` proof); Undo ×3 returns the file **`sha256`-identical** to `qa/fixtures/pleading-fixture.pdf`. |
| 10 | **Text tool — Times default** | **PASS** | `Times` chip `aria-pressed="true"` on open; editor computed font `"Times New Roman", Times, "Liberation Serif", serif`; the chip is labelled **Times**. |
| 10 | Underline chip | **PASS** | `U` → `text-decoration: underline` live, and the 150 dpi raster of the saved file shows a rule under **each** wrapped line, ending at the text. `51-underline-raster.png` |
| 10 | **Wrap in a small box (your repro)** | **PASS** | 146 × 36 px box, 82-character sentence. Preview wrapped to 3 lines inside the box; committed output extracts as the same 3 lines — `The witness testified at length` / `about the second amendment` / `and its signature page.` |
| 11 | Bordered stamp **off by default** | **PASS** | Fresh panel: checkbox `checked: false`. |
| 11 | 65 pt / 24 margin / border on | **PASS** | Border visually even around the ink band. Measured at 200 dpi: top **10.8 pt**, bottom **8.6 pt**, left **13.0 pt**, right **10.8 pt** — a 2.2 pt spread, not detectable by eye. `64-exhibit-border-crop.png` |
| 11 | Stamp A → page shows A, next label B | **PASS** | `pdftotext` page 1 → `EXHIBIT A`; panel advances to `EXHIBIT B`. |
| 11 | **Undo → next label back to A** | **PASS** | Undo: `EXHIBIT B` → `EXHIBIT A`. Redo: back to `EXHIBIT B`. |
| 11 | Slip sheet honours its own settings | **PASS** | Inserted as page 1 carrying `EXHIBIT B`, **top-left** as chosen, **bordered** as chosen, at its **own 36 pt** (measured cap height 24.8 pt, against 44 pt for the 65 pt stamp on the next page); label advanced to `EXHIBIT C`. `68-slipsheet-crop.png` |
| 11 | Undo refunds the slip sheet's letter | **PASS** | Undo: 3 pages → 2 pages **and** `EXHIBIT C` → `EXHIBIT B`. |
| 12 | **Persistence across a full quit** | **PASS** | App closed and relaunched. Bates form: `ASHFORDQA` / start 1 / pad 6 / **Top left** / 13 pt / 30 margin. Exhibit form: **`EXHIBIT B`** (next label), Bottom right, 65, 24, **bordered on**, slip `Top left` / 36. Rail width 264 px and dock width 560 px restored. Theme restored. |
| 12 | New signature placements arrive at the remembered size | **PASS** | Placement resized to 182 pt before the quit; after relaunch a fresh drag-drop from the library arrived at **182 pt** (default is 68 pt). |
| 13 | Right rail wider → thumbnails grow **sharp** | **PASS** | Drag 176 → 364 px; thumbnail canvases re-rendered at **328 device px** (from 140) — a genuine re-render, not an upscale. |
| 13 | Double-click resets | **PASS** | Back to 176 px / 140 px canvases. |
| 13 | Left panel wider with Organize open | **PASS** | 372 → 612 px; grid cells 143 × 203 → **263 × 358**, previews readable down to the line numbers. `80-panel-wider.png` |
| 13 | Widths survive restart | **PASS** | `legion-pdf.rail-width: 264`, `legion-pdf.dock-width: 560` restored after the relaunch. |
| 14 | **Find arrows** | **PASS** | `signature page` → 6 hits. Down: 1→2→3→4→5→6 with the viewer jumping 3, 4, 5, 6, 7, 7; **wraps** 6 → 1. Up: wraps 1 → 6. Enter still advances. Prev/Next buttons agree. |
| 15 | **Bookmarks tab spacing** | **PASS** | PAGES and BOOKMARKS: identical 12 px left/right padding, 14 px font, 35.2 px height, 4 px gap; widths differ only by word length. Even in both themes. `70-rail-tabs-dark-crop.png`, `71-rail-tabs-light-crop.png` |
| 16 | **Organize right-click** | **PASS** | Right-click a grid cell → *"Go to page 4"* in Armory colours at the pointer → viewer jumps 1 → 4, **panel stays open**. `72-organize-context-menu.png` |
| 17 | **Icon** | **PASS** | Extracted straight off the exe: at **16 px and 32 px** it is a maroon Legion bracket mark on a **white rounded tile**, which reads as a distinct badge against a `#1c1c1e` taskbar. v0.2's 16 px read as an empty maroon corner and its 32 px "LEGION" lettering was mush. Side-by-side: `93-icon-compare.png`; source: `94-icon-512.png`. *(The glyph is the bracket mark, not a literal letter L.)* |

## 2. Regression sweep

| Check | Result | Evidence |
|---|---|---|
| 500-page open | **PASS** | `pleading-500.pdf` copy opened by shell-launch; real page text (`PAGE MARKER P0001`) already on screen 2 ms after CDP attach; footer `1 / 500 - 72%`. |
| **Bates 500, exact strings** | **PASS** | Preview `ASHFORDQA000001 through ASHFORDQA000500, on 500 pages.` → applied in **1.38 s** → receipt matched. Independent extraction: **500 stamps, 500 unique, exact sequence `ASHFORDQA000001`→`ASHFORDQA000500`, exactly one per page, zero gaps, zero duplicates.** |
| OCR one scan | **PASS** | In-document Text Recognition on a 6-page image-only scan: *"Added searchable text to 6 pages — 120 words, 569 characters recognized."* **All 6 manifest lines found character-exact** in the saved file. Progress showed `PAGE n OF 6` with *"Every processor core is working on this."* |
| Print dialog opens + cancels | **PASS** | Real Windows dialog `Legion PDF - Print`, hosted as a UWP `ApplicationFrameWindow` (as in v0.2). `WM_CLOSE` cancelled it; the app came back fully responsive with all tabs intact. One nit: **F-5**. |
| Dirty-close guard | **PASS** | Native `Unsaved changes` dialog with **Save and close · Close without saving · Cancel**; Cancel left the tab present and still dirty. |
| Both themes on the new surfaces | **PASS with one defect** | Light theme correct on the selection menu (contrast 17.7:1 label / 4.8:1 cite hint), the grid context menu, the redaction panel (maroon fill, white label), splitters and the rail tabs. Automated contrast audit of every text node in the destroy-consent dialog: **zero below 3:1**. But the destructive button's label goes near-black on red in light theme — **F-4**. |
| **Fixture integrity** | **PASS** | After the whole run, **all 9 fixture PDFs are `sha256`-identical to `qa/fixtures/`.** Every destructive test ran on a copy under `qa-output-v03\files\`. |

## 3. What the selection engine actually did

Worth recording, because it is the thing you asked for and it is genuinely good:

- **Classification is complete, not best-effort.** Pleading page 3: 45/45 spans
  labelled (1 header, 28 line-number, 14 body, 1 Bates stamp, 1 page number).
  Condensed sheet 1: 304/304 (4 mini-page numbers, 100 line numbers, 200 body).
- **The exclusion is visual, not just on copy.** Non-body spans are
  `user-select: none`, so the yellow-purple selection band never touches a line
  number, a running head or a Bates stamp — you can see it on screen before you
  ever press a key.
- **De-hyphenation is real.** `signa-` + `ture` came back as `signature` in the
  clipboard, from the menu's Copy.
- **The cite is shown before you paste it.** The cite sits on the menu row, so
  nothing lands in a brief unseen — and where the printed number cannot be
  trusted the row says so instead of pretending.

## 4. Findings, by severity

### HIGH

**F-1 · Redaction refuses whenever the marked text also appears somewhere else
in the document.**
Repro: open `redact-target.pdf` (the string `SSN 545-45-6789` is on pages 1 and
4). Select the one on page 1, right-click → **Redact**, then **Redact and destroy
1 mark** → **Destroy and redact**. Result:

> *The redaction was NOT applied: 1 marked item is still readable in the rebuilt
> document. The original document was not changed.*

Isolated it: the same gesture on `ACCT-99887766` (which occurs **once**) succeeds
— "REDACTION VERIFIED", new tab, and the string is gone from raw bytes, inflated
streams and extracted text. Marking **all** instances via the panel's Find box
also succeeds. So the verification pass appears to search the whole rebuilt
document for the mark's source text rather than checking the marked instance(s),
and any partial redaction of a repeated string fails.

This bites the most ordinary thing an attorney does: redact *this* SSN, *this*
name, on *this* page of a transcript. It is a **fail-safe** defect — nothing is
destroyed, nothing is written, the source stays open unredacted, and there is a
"Back to the marks" button — but the feature cannot complete, and the message
blames the redaction rather than the second, unmarked copy.

**F-2 · Highlight from the selection menu is invisible and untracked.**
Select text → **Highlight**. The menu closes and *nothing else happens*: the page
does not re-render, the footer says nothing, the tab stays "SAVED", Undo stays
disabled, no console error. Reproduced three times.

It is not a no-op. Saving the document afterwards produces a correct highlight —
translucent yellow over exactly the selected words, text still extractable
(`19-highlight-raster.png`). The write reaches the file; the renderer never
hears about it. `src/features/select-copy/menu-actions.ts` calls
`window.librarius.stamp.highlight` directly, while every other stamp path goes
through the `StampRunner` that sets the notice, marks the tab dirty and refreshes
undo state (compare `src/features/stamps/text-actions.ts`).

The consequence that matters: because the tab never goes dirty, **closing it
discards the highlight without the unsaved-changes prompt** — and if you save for
some other reason, a highlight you thought had failed goes into the file.

### MEDIUM

**F-3 · Ctrl+C copies the raw text layer, not the smart copy.**
The whole point of the feature is reachable only from the right-click menu.
A real Ctrl+C (which *does* reach the app) returns
`…trust instrument?\r\n A. I did not read the whole document, only the signa-\r\n ture page…`
— per-line breaks intact, hyphen unrepaired. Line numbers are still excluded, so
you at least never get digits. The cause is that Ctrl+C is registered as
`{ role: 'copy' }` on the main-process menu (`electron/menu-template.ts:53`),
i.e. Chromium's native copy of the DOM selection; nothing intercepts it. Most
attorneys will press Ctrl+C, get transcript-shaped text, and never learn that
the menu gives them a paragraph.

**F-4 · Light theme: the destructive button's label is near-black on red.**
`Destroy and redact` in the destroy-consent dialog renders `rgb(220,38,38)` fill
with near-black text in light theme (it is white on red in dark theme). It
clears the numeric contrast bar (~4.6:1) but reads as a rendering fault, and it
breaks the project's own rule that text on a brand/status fill is
`text-text-on-brand`. `A5a-destroy-button.png`. Worth checking the save gate's
`Apply redactions now` at the same time — it is the same red button.

### LOW

**F-5 · Cancelling the print dialog is reported as an error.** After a clean
cancel the footer shows, in red: `COULD NOT PRINT: PRINT JOB CANCELED`.
Cancelling is not a failure.

**F-6 · The footer notice is still sticky across documents** (v0.2 F-03, still
open). `STAMPED ASHFORDQA000001 THROUGH ASHFORDQA000500 ON 500 PAGES` was sitting
in the footer while a completely different document was on screen, several
operations later. Same with `TURNED 1 PAGE CLOCKWISE.` and `CHANGE UNDONE.`

**F-7 · The selection and highlight bands bleed a few points into the line-number
gutter.** The single space character between a line number and the body text is
classified `body`, so it is selected and highlighted — a small purple (or
yellow) block sitting immediately right of the digit. Visible in
`04b-linenumbers-crop.png` and in the highlighted output raster. Cosmetic, but
it is the one place the otherwise-immaculate margin exclusion looks imperfect.

**F-8 · The toolbar clips when both side panels are widened.** With the tool
panel at 612 px and the rail at 264 px, `Fit width` / `Fit page` truncate behind
the theme button (`80-panel-wider.png`). Nothing is lost, but the row should
collapse rather than clip.

**F-9 · Clicking into an *empty* cite-prefix field drops the cite preview.**
Pencil → click into the field (which is auto-focused anyway) → the row falls to
`NO CITE` and Copy-with-cite disables until you re-select the text. Typing
straight into the auto-focused field works, and once the field has a value
clicking into it is harmless.

**F-10 · Find does not search until Enter.** Typing a term leaves the counter
blank and the arrow keys inert; Enter runs the search and then everything works.
A live count as you type is what the bar looks like it promises.

**Info · The text tool's last look carries into the next box.** After committing
underlined text, the next text box — including a whiteout type-over — starts
underlined. This is the documented "seed" behaviour, and it is how the type-over
replacement in this run came out underlined. Worth knowing, not wrong.

## 5. Corrections and things I checked twice

- **CDP wheel events do not scroll this window.** Two places needed a scroll
  gesture and neither `Input.dispatchMouseEvent{type:'mouseWheel'}` nor
  `Input.synthesizeScrollGesture` moved the container. This is a harness
  limitation, **not** an app defect: the same wheel event with Ctrl held zoomed
  the document 60 % → 66 %, so the event reaches the app; Chromium simply does
  not perform the default scroll for a synthesised wheel here. Both affected
  checks were completed by setting `scrollTop` on the real container, which
  fires the same `scroll` event the app listens for.
- **I could not instrument the bridge.** `window.librarius` is deep-frozen by
  `contextBridge`, so an attempt to wrap `stamp.highlight` silently failed and
  briefly made F-2 look like "the IPC is never called." It is called; the file
  proves it. The finding was re-derived from the saved bytes instead.
- **The first light-theme sweep looked like a theme bug** (menu rendering dark in
  a light app). It was my own script toggling twice; re-run cleanly, the light
  theme is correct everywhere except F-4.

## 6. Bridge substitutions (complete)

Everything else in this run — every button, tab, panel, drag, resize, right-click
and keystroke, including Ctrl+A, Ctrl+C and the arrow keys — was a real
`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`. These are the only
exceptions, all of them where a native OS dialog or a harness limit blocks
automation:

1. **`file.saveTo(docId, path)`** — 8 uses, to get output bytes onto disk for
   poppler. The user-facing routes (Save As, and the redacted-copy save) are
   OS-dialog-gated. Ordinary **Save** was clicked for real wherever the document
   already had a path — which is how the whiteout, Bates-500, exhibit, slip-sheet
   and OCR outputs were produced.
2. **Programmatic `element.scrollTop`** on the real scroll containers, twice:
   to prove the selection menu closes on scroll, and to bring the slip-sheet
   controls (which sit below the fold at 864 px window height) into view before
   clicking them for real. See §5 for why.
3. **Native dialogs driven by Win32 messages.** Windows enumerated with
   `EnumWindows`; the print dialog cancelled with `WM_CLOSE`; the
   `Unsaved changes` dialog's own **"Close without saving"** button pressed with
   `BM_CLICK` on the button's HWND (a real button press, not a bypass) during tab
   cleanup. Recipes saved as `qa-output-v03\scripts\win.ps1` and `dlg.ps1`.
4. **A read-only React fiber walk** to read the open documents' ids — needed only
   to address `file.saveTo`.
5. **`navigator.clipboard.readText()`** to read back what the app put on the
   clipboard.

**Not exercised, and why:**
- **The Save-As leg of "Apply redactions now"** — blocked by F-1 (the redaction
  refused before it got there) and by the native location dialog.
- **Bulk OCR through its own picker, Combine of 3 files** — native pickers; the
  in-document OCR path was exercised end to end instead.
- **Centurion** — an encrypted key from an earlier session exists on this
  machine; nothing was asked of it.
- **Main-process accelerators other than Ctrl+C** (Ctrl+S/O/P/Z). Ctrl+C *did*
  reach the app this run, which is how F-3 was established; the others were not
  needed because every corresponding button was clicked for real.

## 7. Environment record

| Item | Value |
|---|---|
| App version | `0.1.0` (`app:version`), commit `b193efb` |
| Electron / Chrome / Node | 43.3.0 / 150.0.7871.212 / 24.18.1 |
| Install path | `C:\Users\rothr\AppData\Local\Programs\Legion PDF\` |
| Executable `sha256` | `615df53004b4b090ecfdfdf8a1f3504bc78b74ac7a5f9987e42eace741d0a655` |
| userData | `%APPDATA%\Legion PDF` — **carried over** from the v0.2 run (recents, signature library, theme) |
| CDP port | **9450** only. Port 9222 never contacted. |
| Fixtures | `C:\Users\rothr\AppData\Local\librarius-build\qa-fixtures\` |
| `manifest.json` `sha256` | `2f489cdbb6801cab25821197e118da1ab2fb944fff49da8a86388614ba5df782` |
| Fixture integrity after the run | **all 9 PDFs byte-identical to `qa/fixtures/`** |
| Evidence | `qa-output-v03\` — `screenshots/` (216), `files/` (25), `results/` (58), `scripts/` (112) |
| App restarts during the run | 1 (full quit + relaunch, for the persistence checks) |
| Final state | App **left running**, **all test tabs closed**, dark theme, empty state showing Recents. CDP disconnected, all driver scripts exited. |

## 8. What to know before you sit down

1. **Redaction: mark every instance.** Use the panel's Find box (`Mark all N
   instances`) rather than selecting one and redacting it. Redacting a single
   occurrence of a string that appears elsewhere will refuse with a scary
   message. Nothing is ever destroyed or saved when it refuses — F-1.
2. **Don't trust the screen after Highlight.** It looks like nothing happened.
   The highlight is really in the document, but the tab won't say "unsaved
   changes" and closing it will throw the highlight away silently — F-2.
3. **Use the right-click menu to copy, not Ctrl+C.** Ctrl+C gives you the
   transcript with its line breaks; the menu's **Copy** gives you the paragraph
   — F-3.
4. **The star feature is worth ten minutes of your time.** Drag across a page
   break in `pleading-fixture.pdf`, right-click, and look at the cite on the row
   before you copy. Then click the pencil, type `Ashford Depo.`, and copy again.
   Every cite in the fixture manifest came back exact, on both the pleading and
   the 4-up condensed transcript.
5. **Nothing here can lose your work.** Undo restores a document byte-for-byte
   (proved by `sha256` against the untouched fixture), whiteout deletes the
   covered words from the content stream and undo brings them back, redaction
   destroys exactly what it says and proves it, the three-way save gate says
   which file ends up where, and after roughly a hundred destructive operations
   not one source fixture changed by a single byte.

---

## Addendum — same-day fixes (all six findings)

- **F-1 (HIGH) FIXED**: verification is instance-scoped (marked copies proven
  destroyed; unmarked twins reported honestly, never a false failure). Live
  three-scenario proof on redact-target: 1-of-2 destroyed w/ receipt
  disclosure, page-silence path, mark-all total destruction — independent
  byte scans throughout.
- **F-2 (HIGH) FIXED**: menu Highlight rides the standard op pipeline —
  repaint, receipt, dirty flag, working Undo (byte-verified round trip).
- **F-3 FIXED**: Ctrl+C in the viewer yields smart flowing text (native copy
  preserved as automatic fallback; non-viewer selections untouched).
- **F-4 FIXED**: text-on-danger token; all red-fill buttons ≥4.6:1 in light.
- **F-5 FIXED**: print-cancel classified as a non-event (Electron 43 sends
  "Print job canceled"); errors reserved for real failures.
- **F-6 FIXED**: footer notices scoped to their document; version readout
  stays app-wide.

Post-fix gates: typecheck clean, lint clean, 1590 tests, build green.
