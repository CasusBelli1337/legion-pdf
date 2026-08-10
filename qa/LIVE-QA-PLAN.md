# Librarius — Windows Live-QA Plan

Run against the PACKAGED app on the Windows host (never the WSL dev build —
the deliverable is the .exe). Fixtures: `node qa/make-fixtures.mjs`, ground
truth in `qa/fixtures/manifest.json`. Independent verification tools:
poppler (`pdftotext`, `pdftoppm`) run WSL-side on output files saved to a
shared `/mnt/c/...` QA folder — we verify with tools we didn't write.

Driving: launch the installed app with `--remote-debugging-port=<private
port ≥ 9400>` and drive via CDP from WSL (reuse the browser-cdp machinery
from the Legion live-QA skill). NEVER port 9222 — that is Arthur's own
Chrome. Screenshot every step; verify by ground truth, not screenshots alone.

## Checks (each = pass/fail + evidence)

| # | Feature | Fixture | Verification |
|---|---------|---------|--------------|
| 1 | Launch + perf | pleading-500 | First page visible < 2s from open; scroll 1→500 smooth; type-to-jump 250 lands on marker P0250 |
| 2 | Zoom | pleading-500 | 50/100/200%, fit-width, fit-page, Ctrl+wheel; screenshot each |
| 3 | Combine | exhibit-part-a/b/c | Output = 9 pages; pdftotext page order = A1,A2,B1..B3,C1..C4 |
| 4 | Split/extract | combined output | Split 1-2 / 3-9 → 2+7 pages; extract selection → exact pages |
| 5 | Organize | exhibit combined | Drag-reorder C-before-B → pdftotext order proves it; rotate p1 90° (pdftoppm raster visibly rotated); delete p9 → 8 pages |
| 6 | Blank + text box | any | Insert blank at 2, add text "INTENTIONALLY LEFT BLANK" → extractable on page 2 |
| 7 | Bates | pleading-500 | Prefix QA, start 101, width 6 → every page has QA000101..QA000600 (pdftotext, count = 500, no gaps/dupes) |
| 8 | Exhibit stamp + slip sheet | exhibit-part-a | "EXHIBIT 7" stamp extractable; slip sheet before p1 → 3 pages |
| 9 | Watermark | exhibit-part-b | DRAFT diagonal; pdftotext finds DRAFT on all pages; raster shows it |
| 10 | Page numbers | exhibit-part-c | "Page N of 4" footer verified for all 4 |
| 11 | Signature | sig PNG (make via pdftoppm from a cursive-text PDF) | Place, resize, apply → flattened: no annots in output (pdftotext + qpdf-less check via strings/pdf-lib script); visible in raster |
| 12 | OCR | scanned-deposition | Before: pdftotext empty. After: all 6 mustFindAfterOcr lines found (allow minor OCR noise, ≥95% char match); in-app search finds "WITNESS ANSWERED"; all cores busy during run (Task Manager or perf counter screenshot optional) |
| 13 | Search-redact + apply | redact-target | Search "545-45-6789" finds 2; apply all marks; output raw bytes contain NO mustDestroy string (grep bytes + pdftotext); mustSurvive line still extractable; in-app verify receipt shown |
| 14 | Metadata scrub | metadata-laden | Raw bytes: no "Arthur Rothrock"/"Settlement strategy"/"Legion Draft System"/"privileged" |
| 15 | Whiteout | exhibit-part-a | Whiteout over "PAGE 1", retype "REVISED"; raster shows coverage; extraction shows REVISED |
| 16 | Bookmarks | combined output | Add 2 bookmarks, rename 1, click-jump works, survive save/reopen |
| 17 | Save/Save As/dirty | any | Dirty marker on edit; destructive ops force Save As; original untouched (hash compare) |
| 18 | Print | exhibit-part-a | System print dialog opens with correct page count (screenshot) |
| 19 | Recent + drag-drop + tabs | all | Recent list persists across app restart; drag-drop opens; multi-tab switching |
| 20 | Centurion — no-key state | — | Plain-English key prompt; key save→hasKey; restart→still set (if a test key is available in session env, one live ask: answer streams, references document content; else mark DEFERRED to Arthur's spin) |
| 21 | Offline check | scanned-deposition | Disable network (or rely on no-key), OCR still works |

## Rules

- A check without evidence (file, extraction output, or screenshot) is NOT a pass.
- Any "suspiciously fast" op (instant OCR of 6 pages, 0-byte outputs) = STOP, investigate silent failure.
- Findings report: feature-by-feature table, defects with repro steps, all evidence in qa/output/<date>/.
