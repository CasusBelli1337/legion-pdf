# Handoff — Legion PDF text-editing stretch goal (updated 2026-08-11)

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
- **Open**: Gmail app-password delivery mode built + unit-tested but not
  live-tested (needs Arthur's app password); Windows installer rebuild needed
  before Arthur can use it for the real board consent; sent-request receipts
  don't survive app relaunch (service status API is the truth).

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
