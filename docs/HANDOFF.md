# Handoff — Legion PDF (updated 2026-09-15, v0.5.1)

## NEXT MISSION (Arthur, 2026-09-15): nail Word export for litigators

Arthur's words: "I want to be able to take a PDF that opposing counsel sent to
me and be able to turn it into a perfect Word doc that I can edit. I want it
to even ideally work on scanned documents. One thing that is always borked is
how the lines and line numbering is handled on Word exports of PDF pleading
paper. So I would do some E2E tests on that and see if you can really create
something awesome for litigators."

Start here, with fresh context:

1. **Read** `docs/references/word-export.md` (what v0.5 keeps and drops),
   `core/export/` (13 modules: lines → paragraphs → styles → page setup →
   pleading → tables → images → build), `src/lib/layout/` (pdfjs → PageLayout,
   with the select-copy roles), and the fidelity notes in
   `qa/reports/2026-09-15-feedback-wave-3.md` § 7. Compare PNGs from v0.5 are
   under `qa/output/2026-09-15-wave-3/word/` (gitignored; also in OneDrive
   `#Legion/Product/Armory - Librarius/2026-09-15 Wave 3 QA/word/`).
2. **Build a real E2E corpus first** — not synthetic fixtures. Fictional
   parties, but REAL producers: (a) a Word-made pleading (California 28-line
   pleading paper from Arthur's own templates — the Sorden-matter pleading
   templates the `ca-motion-builder` skill uses, and the Legion builders'
   output), printed to PDF by Word; (b) the same after a print-and-scan
   round trip (raster PDF, then Legion PDF's OCR); (c) a Legion-OCR'd scan
   with the invisible text layer; (d) an opposing-counsel-style filing:
   Acrobat-produced, mixed fonts, footnotes, a caption table, a signature
   block, a proof of service; (e) a deposition transcript (numbered lines,
   Q/A) and a condensed 4-up. Keep them under `qa/fixtures/word-export/`.
3. **Define "perfect" as a diff, not an impression**: for each fixture,
   export → render in real Word (`docx-render` skill) → compare with
   `pdftoppm` of the source: (i) `pdftotext -bbox` baselines within 0.5pt,
   (ii) same word count per page, (iii) pleading line numbers land on the same
   y as the source's printed numbers, (iv) page count equal, (v) a visual
   side-by-side an attorney would accept. Automate (i)–(iv) as a vitest suite
   that skips cleanly when Word is not reachable; keep (v) as saved PNGs.
4. **Pleading paper is the hard part and the one that always breaks.** v0.5
   maps it to Word's own line numbering (`lnNumType` restart per page + exact
   24pt pitch). Verify against Arthur's real templates: caption block above
   the numbered body, the vertical rule(s) at the left margin (drawn line
   objects in Word — `docs/HANDOFF.md` from 2026-08 and the `docx-render`
   skill note "header-anchored number frames" describe how Legion's builders
   do it: numbers live in a HEADER-anchored text frame, not body numbering),
   footer with the document title line, double-spaced body that must stay
   exactly on the 28 lines, single-spaced block quotes and footnotes that
   still align to the grid. Decide: reproduce Legion's own pleading template
   (header-anchored number frame + rules) rather than `lnNumType` when the
   source is detected as pleading paper, so the export is editable the way
   Arthur's templates are. Line-number detection already exists in
   `src/features/select-copy/line-columns.ts` (`findLineNumberColumns`).
5. **Scanned documents**: run OCR (existing lane, `core/ocr`) when a page has
   no text, then export the recognised text as body paragraphs — with a
   confidence note and the original page image available as an appendix or
   behind the text (a "scan" section option in the Export panel). Test with
   fixture (b)/(c).
6. **Tables**: ruled tables (captions, proofs of service) as real Word tables
   from the rule grid (`LayoutRule`s are already extracted) — v0.5 emits tab
   stops only.
7. **Fonts**: map to the installed Windows font names Arthur has (Times New
   Roman, Arial, Calibri, Century Schoolbook, Book Antiqua, Garamond…); keep
   a table in `core/export/styles.ts`; unknown → family fallback with a note.
8. **UI**: the Export panel's Word row should show what will happen ("Pleading
   paper detected: line numbers will be rebuilt", "3 scanned pages will be
   recognised first") BEFORE the export, and the receipt should list what was
   kept / dropped in plain English.

Also from Arthur (done in v0.5.1, see below): Edit text is on the toolbar and
in the Edit menu (Ctrl+E), not only inside Stamps & Marks › Text.

## v0.5 update (2026-09-15) — feedback wave 3; read this first

**v0.5.1 (same day):** Edit text is one click away — a toolbar button beside
Undo/Redo and Edit › Edit Text on Page (Ctrl+E) open Stamps & Marks on its
Text tab with the Edit tool armed (`src/features/stamps/panel-request.ts`).
Tab switching restores the exact reading spot. Pushed to `origin/main`
(github.com/CasusBelli1337/legion-pdf). The `private` remote
(legion-law/legion-librarius) has its own diverged history (its last commit is
the e-sign handoff) — NOT force-pushed; reconcile deliberately if that mirror
is still wanted.

Arthur's third feedback batch (10 items) shipped in one session as seven
parallel lanes plus the orchestrator's own lane — see
`docs/missions/2026-09-15-feedback-wave-3.md` (lane table, contracts, merge
order) and the report `qa/reports/2026-09-15-feedback-wave-3.md` (what each
request became, how it was proven, screenshots under
`qa/output/2026-09-15-wave-3/`). Highlights:

- **Print doubling fixed** (each page spilled onto a blank second sheet):
  pdf.js's one-sheet-per-page layout + `@page size` from the document;
  `qa/print-proof.mjs` proves sheet counts with Chromium's own engine.
- **Page rail**: multi-select, right-click delete/extract/rotate, drag reorder.
- **Convert to PDF** on open: Word/Excel/PowerPoint through Office COM,
  images (multi-page TIFF), text/HTML through built-ins; converted files are
  unsaved tabs. `docs/references/convert-to-pdf.md`.
- **Explorer verbs** "Combine in Legion PDF" / "Convert to PDF with Legion
  PDF" (`build/installer.nsh`, per-user registry) + Combine Files panel;
  launches funnel into one batch. TROUBLESHOOTING § Explorer verbs.
- **Export panel**: PNG/JPEG/multi-page TIFF (own encoder)/TXT/DOCX.
  `docs/references/export.md`, `docs/references/word-export.md`.
- **Edit existing text** — the stretch goal — `docs/references/text-editing.md`.
  Proven on a Word-written PDF (`qa/fixtures/word-letter.pdf`, made by
  `qa/make-word-letter.mjs` + the docx-render skill) and in the real app
  (`qa/text-edit-proof.mjs`).
- **Tab switch keeps the exact spot** (page + offset within it, restored after
  the zoom refit; `qa/tab-switch-proof.mjs`).
- **Side by side** view (Ctrl+\); tab-name findings: duplicate-open and
  tail-truncation fixed, derived names (`X extracted.pdf`, `Combined.pdf`,
  `X (redacted).pdf`) are by design; Ctrl+S on a never-saved doc → Save As.

State: 2,167 tests green. **Installed: v0.5.0** (`LegionPDF-0.5.0-Setup.exe`,
built from `c4a81b8`, silent-installed 2026-09-15; installer copied to
OneDrive `#Legion/Product/Armory - Librarius/`). Installed-build proof: the
Explorer-verb registry entries and a two-launch `--combine` of a PDF + a Word
document through the packaged app (report § Packaging). Worktrees for the
lanes live at `../legion-librarius-wt/<lane>` on branches `lane/<lane>`, all
merged; safe to `git worktree remove` them.

Open / next: Explorer's 15-file verb limit (documented); `doc:changed` push
so a main-side rename reaches the renderer (quit-guard edge case); recent
list path line still tail-truncates; the fold-in of lane I's extended QA
driver commands (`modclick`, `rightclick`, `dragdrop`) into
`.claude/skills/run-legion-pdf/driver.mjs`; `describeError`/`plainError`
consolidation across panels; Word export fidelity items listed in
`docs/references/word-export.md`.

Gotchas learned: `npm run lint` breaks if an older pdfjs asset layout is left
in `src/public/` (eslint now ignores `src/public/**`); `pkill -f` patterns
must be bracketed (`legion-pdf-driver-rai[l]`) or they kill the caller's
shell; pdf-lib's `PDFContentStream`s cannot be re-read in place — save and
reload before verifying an edit; Node's `TextDecoder('windows-1252')` returns
C1 controls for 0x80–0x9F, so WinAnsi is spelled out in `core/edit/encodings.ts`.

---

# (previous) Handoff — Legion PDF text-editing stretch goal (updated 2026-08-11)

## v0.4 update (2026-08-22) — e-signature shipped; read this first

**F-13 E-signature (Legion Sign)** built, deployed, and LIVE-E2E-verified in
one session (see `qa/reports/2026-08-22-esign-e2e.md` + evidence on OneDrive
`#Legion/Product/Armory - Librarius/E-Sign-E2E-2026-08-22/`):

- **App side** (this repo): E-Sign dock panel (signers, click-place
  signature/initials/name/date/text fields, drag/resize, send w/ 3 delivery
  modes, live status, fillable-AcroForm export for Acrobat users, settings),
  esign IPC lane, `core/esign/` fillable-form op, Gmail SMTP mailer +
  safeStorage settings, and Centurion tool `addSignatureFields`
  (anchor-text placement — worked first try on live Opus, incl. occurrence
  disambiguation). 1,731 tests green.
- **Service side** (legion-atlas repo, `sign/` dir): "Legion Sign" Cloudflare
  Worker at **sign.legionarmory.net** (own D1 `legion-sign` + R2
  `legion-sign`; NOT the portal worker) — hashed capability tokens, uniform
  404s, scoped signer views, pdf-lib burn + Signing Certificate page, Resend
  email from sign@legion.law (request + fully-signed w/ attachment). 47 tests.
  Deploy recipe in `sign/README.md`; deployed version live.
- **Proven live**: Centurion placed the fields → service emailed links (both
  inboxes) → signer 1 drew, signer 2 uploaded a "scanned" signature
  (background removal port) → finalize burned everything + cert page →
  final copies emailed to all parties → panel shows Everyone signed.
- **Keys**: ESIGN_API_KEY in `~/projects/Armory creds.txt` (rotated
  2026-08-22); paste into E-Sign ▸ Settings on first use. `LIBRARIUS_DEV=1`
  + `LIBRARIUS_DEV_ANTHROPIC_KEY` enable dev-mode settings + Centurion QA on
  WSL (TROUBLESHOOTING § E-Sign).
- **Installed**: v0.4.1 (`LegionPDF-0.4.1-Setup.exe`) silent-installed on
  the Windows host 2026-08-25, incl. the Outreach sender swap. Arthur turned
  Smart App Control OFF to unblock packaging (TROUBLESHOOTING § Smart App
  Control); the EC2 Caddy step was handed to the EC2 Claude via the prompt at
  OneDrive `#Legion/Product/Armory - Librarius/2026-08-25 EC2 Claude
  Prompt - Open Outreach Service Path.txt`.
- **Outreach delivery LIVE (2026-08-25)**: the EC2 Caddy exemption was
  applied (EC2-side Claude; caddy RESTART needed — reload misses bind-mount
  edits) and the full path verified: app → tailnet → Outreach → email in
  the signer's inbox FROM arthur@legion.law. Arthur still needs to paste
  the ARMORY_SERVICE_TOKEN into the INSTALLED app's E-Sign settings on
  first use (dev userData had it for QA; the installed app's safeStorage
  does not). EC2's Caddyfile.ec2 edit left uncommitted there (dirty tree).
- **Open**: sent-request receipts don't survive app relaunch (service
  status API is the truth). The service is merged to legion-atlas main
  (PR #3, 2026-08-26); the EC2 armory's applied Caddyfile.ec2 edit remains
  uncommitted on that host (mirrored on legion-armory branch
  `arthur/outreach-service-exemption`).
- **Real-world proof (2026-08-25)**: the Legion LegalTech board consent
  (3 directors, Outreach delivery from Arthur's own mailbox) and both
  stock option grant notices (grantee + CEO countersign each) executed
  through Legion Sign end to end — date blanks filled in-app with the
  font-matched text tool, consent filed in the minute book with a new
  index, per the execution memo's Steps 1-5.

## v0.2 update (2026-08-11) — read this first, then the v0.1 record below

Arthur user-tested v0.1 and filed ~15 items; ALL are shipped and verified:
undo/redo (byte-exact, 10-deep), Windows "Open with" + single-instance +
argv opens, bulk OCR, drag-drop live signatures (flatten on save w/ consent,
scan cleanup), draw-and-type text w/ font matching, Centurion tool-use with
confirm cards (redaction = suggest-only), 7 UX fixes, product renamed
**Legion PDF** (L icon, one toolbar, tools LEFT / rail RIGHT, Legion light
theme default + Armory dark toggle, legion.law footer credit).

State: 1,187 tests green; click-through QA (human-style, real mouse) —
34 PASS / 0 blockers / 0 data loss, report `qa/reports/2026-08-11-clickthrough-qa.md`
+ its two Medium findings fixed after (commit 1a2360e: Alt menu-bar reveal,
"Save As" relabel). 12 low findings remain open in that report — punch list.
Installed build = commit `1a2360e`. Linear ticket: **LGN-1826**.
NOT verified by a human yet: keyboard accelerators in the packaged build
(automation couldn't reach the native menu; Arthur pressing Ctrl+Z once
settles it) and Centurion live asks (needs his key).

**v0.3 update (2026-08-19):** Arthur's second feedback batch (~20 items) all
shipped — selection intelligence (line-number/page-number classification,
smart flowing copy incl. Ctrl+C, right-click Copy/Copy-with-cite/Highlight/
Redact, printed-page-number cites with per-document prefixes), render-hang +
flicker fixes, resizable panels, find arrow keys, stamps polish (box metrics,
tagged label undo, settings persistence, slip-sheet independence), whiteout
type-over with content-stream text removal (core/edit/ — the stretch
session's seed, see docs/references/content-stream-editing.md), redaction
consent dialogs + save gates with instance-scoped verification, white-tile
icon. Two click-through QA rounds (2026-08-19 report + addendum); 1,590
tests; installed build = commit `4511fbd`. Known-open: highlight bleeding
into line-number gutter (F-7, cosmetic), quit-guard blind to marks/live
signatures (pre-existing), duplicate danger-button classes in
redact-confirm.tsx worth collapsing into ActionButton.

The text-editing stretch plan below is unchanged and still the next mission —
note core/edit/ now exists and does half of Phase 1's work already.

## Mission & current state

Legion Armory — Librarius (lightweight litigation PDF editor, Acrobat
replacement) is BUILT, packaged, installed, and live-QA'd on the Windows host.
Everything in the PRD except one deliberately deferred feature shipped. This
handoff exists for the next session's stretch goal: **true editing of existing
PDF text (with reflow)** — plus a short punch list of small deferred items.

## Done (VERIFIED)

- All PRD features F-1 through F-12 except true text editing. Verification:
  794 Vitest tests green; 21-check live QA against the PACKAGED installed app
  on Windows, outputs verified with poppler against recorded ground truth —
  see `qa/reports/2026-08-10-live-qa.md` (19 pass / bookmarks partial → since
  fixed / Centurion live-ask deferred, no key in QA env).
- Post-QA fix wave (commit `5c0df59`): dirty-close/quit native guards, recent
  files UI, bookmark authoring UI, redaction searchable-by-default. Verified
  by 45 new tests + live dev-app demo, then re-verified on the packaged
  installed build (QA report addendum).
- Installer: `LegionArmory-Librarius-0.1.0-Setup.exe` (~165 MB, bundled
  Tesseract), silent per-user install, no admin. Build recipe:
  `docs/TROUBLESHOOTING.md` § "Windows packaging".
- Redaction destruction, source-file immutability, 100% OCR recall, exact
  500-page Bates — all proven with independent tools (poppler) on saved bytes.

## Open issues (with repro)

Low-priority QA findings, all documented in `qa/reports/2026-08-10-live-qa.md`:

- No path-taking Save As in the bridge (dialog only) — blocks scripting.
- Watermark glyphs not text-searchable (rotated text extracts as fragments).
  Repro: watermark DRAFT, pdftotext, search "DRAFT".
- Combine dialog can't source from already-open tabs (file picker only).
- Footer notice sticks across document switches.
- Print dialog is app-modal; force-closing it can wedge the app.
- One-off unreproduced: text-placement click ignored right after a page jump.
- Cosmetic: leaked blob URL in `print-controller.ts` when image.decode fails.
- Deferred refactors: `core/image/` PNG-primitive consolidation (duplicated in
  core/ocr/png-blank.ts + core/redact/png-decode.ts); shared UI atoms
  (StatusLine/ActionButton duplicated in features/ocr + features/redact);
  custom app icon (default Electron icon ships today);
  `RedactSearchRequest` type declared but unwired (regex search).

## Next steps (prioritized)

1. **Stretch goal — true text editing.** Recommended attack order:
   a. Read `core/stamps/stamp-testkit.ts` — it already PARSES content streams
      and walks Tj/TJ/Tm/cm operators (built for tests, reusable as the seed
      of an editor). `core/ops/pdf-io.ts` handles load/save correctly.
   b. Phase 1 (span edit, no reflow): map a ViewerApi text quad → the exact
      Tj/TJ span in the content stream; replace the shown text; re-encode
      with the SAME font if every new glyph exists in the (possibly subset)
      embedded font, else fall back to whiteout+retype with a matched
      standard font. This covers "fix a date/typo" — most litigation edits.
   c. Phase 2 (paragraph reflow): extract the paragraph's runs into a text
      box model, delete the originals (true removal — rebuild lesson below),
      re-lay-out with measured line breaks. Substantially harder; scope it
      only after Phase 1 lands.
   d. Font reality check FIRST: subset fonts (e.g. `ABCDEF+TimesNewRoman`)
      often lack glyphs for replacement characters — detect and degrade with
      a plain-English explanation, never silently swap fonts.
2. Punch-list items above as appetite allows (path-taking Save As first — it
   also unblocks QA automation).

## Key files, branches & commands

- Repo: `~/projects/legion-librarius`, branch `main`, 8 commits, NO REMOTE
  yet — Arthur will provide the GitHub repo; push only when he does.
- Architecture contracts: `docs/ARCHITECTURE.md` (zones, IPC, ViewerApi).
  Feature specs: `docs/PRD.md`. Gotchas: `docs/TROUBLESHOOTING.md`.
- Gates: `npm run typecheck && npm run lint && npm test` (794 green),
  `npm run build`. Dev boot on WSL:
  `npm run dev -- -- --disable-gpu --remote-debugging-port=94xx --no-sandbox --user-data-dir=<tmp>`.
- Windows build env (already set up): portable Node at
  `C:\Users\rothr\AppData\Local\librarius-build\node-v24.19.0-win-x64`, repo
  copy at `...\librarius-build\repo`, QA fixtures at `...\librarius-build\qa-fixtures`.
  Full recipe in TROUBLESHOOTING.
- QA plan + ground-truth fixtures: `qa/LIVE-QA-PLAN.md`, `node qa/make-fixtures.mjs`.

## Verification state

- Installed app on Windows host = commit `5c0df59` build (fix wave included).
- All suites green at `5c0df59`; live QA ran against the pre-fix build; the
  fix wave was verified in dev + unit tests AND re-verified on the packaged
  installed build (all four fixes — see the QA report addendum).
- Working tree clean except generated/ignored dirs. Nothing pushed anywhere.
- Centurion live-ask still needs Arthur's key (first run on his spin).

## Gotchas discovered this session

All recorded in `docs/TROUBLESHOOTING.md` — read it before touching dev or
packaging. Highlights: WSLg needs `--disable-gpu`; npm here needs
`--include=dev` and a manual `node node_modules/electron/install.js`; NEVER
CDP port 9222 (Arthur's own Chrome); pdf-lib `removePage` leaves content
readable (rebuild, don't detach) — the same trap awaits the text editor.
