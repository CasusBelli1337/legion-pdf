# Legion PDF — Troubleshooting & Build Recipes

Symptom-first index of everything that bit us during the 2026-08-10 build.

## Dev on WSL2

| Symptom | Cause → Fix |
| --- | --- |
| `npm install` installs no dev deps | This machine's npm config sets `omit=dev`. Use `npm install --include=dev`. |
| Electron missing after install (`electron/dist` empty) | Postinstall skipped. Run `node node_modules/electron/install.js`. |
| App boots but renderer wedges; CDP `Runtime.evaluate` never returns; main thread in `futex_wait` | WSLg GPU path. Launch dev with `--disable-gpu`. |
| `electron-vite dev` rejects `--remote-debugging-port` | Electron args need a second `--`: `npm run dev -- -- --remote-debugging-port=94xx --no-sandbox --user-data-dir=<tmp>`. |
| CDP shows someone's Otter.ai / Gmail tabs | You attached to port **9222 — the owner's real Chrome. Get off it immediately.** Librarius QA uses private ports ≥ 9400. |
| `tsc` error TS5101 about `baseUrl` | TypeScript 6 removed it. `paths` work without it (see `tsconfig.base.json`). |
| pdfjs teardown throws | pdfjs 6: call `loadingTask.destroy()`, not `document.destroy()`. `RenderParameters` requires a `canvas` key (pass `canvas: null` + cast context for OffscreenCanvas). |
| Preload "should be ESM" temptation | Preload is CJS **on purpose** — ESM preload forces `sandbox: false`. Leave it. |

## The rename to "Legion PDF" (2026-08-11) — what does NOT carry over

The product name is `Legion PDF` (`electron-builder.yml` + `productName` in
package.json + `PRODUCT_NAME` in `shared/product.ts`). The repo, the npm
package, and the `window.librarius` bridge keep the old name on purpose.

**Windows stores per-app state under the product name, so nothing saved by the
old build carries over.** `app.getPath('userData')` moved from
`%APPDATA%\Legion Armory - Librarius\` to `%APPDATA%\Legion PDF\`, which means
a machine that ran the old build starts fresh on:

- the encrypted Anthropic key (safeStorage) — re-enter it in Centurion,
- the signature library (`signatures/`),
- the recent-documents list,
- window/theme state.

Accepted: the app is pre-release and was never distributed. If a migration is
ever wanted, copy the old folder's contents into the new one BEFORE first
launch — the safeStorage blob is machine-bound, not path-bound, so it decrypts
fine from the new location.

The `appId` also changed (`law.legion.armory.librarius` → `com.legion.legionpdf`),
so an old install is a SEPARATE entry in Add/Remove Programs and its `.pdf`
ProgID (`HKCU\Software\Classes\PDF Document`) still points at the old exe.
Uninstall the old build before testing associations, or Explorer will keep
opening the stale one.

## App icon

`npm run build:icon` renders `resources/brand/fav.svg` (the Legion "L", drawn
on a 16-unit grid) to `build/icon.png` at 512x512 RGBA, via a hidden Electron
window. electron-builder's `win.icon` points at that PNG and generates the
multi-size `.ico` it stamps on the exe, the installer, and the shortcut.

- **On WSL the script needs a display**: run it as `DISPLAY=:0 npm run
  build:icon`. Without `DISPLAY` Electron exits with "Missing X server or
  $DISPLAY" (WSLg provides `:0`; the socket is `/tmp/.X11-unix/X0`).
- 512 is 32 x 16, so every edge in the mark lands on a pixel boundary and the
  vector render is already crisp — no nearest-neighbour upscale needed, and the
  LEGION lettering (real glyph outlines) stays legible instead of blocking up.
- The script fails loudly if the canvas comes back under 1 KB rather than
  writing an empty icon nobody would notice until the installer shipped.

## Windows packaging (no admin, no Wine)

The installer is built ON the Windows host with a portable Node — WSL has no
Wine and no passwordless sudo, and this is the more faithful environment anyway.

1. One-time host setup (already done on this rig, re-do after a reset):
   - Portable Node: unzip `node-v24.x-win-x64.zip` under
     `C:\Users\<user>\AppData\Local\librarius-build\`. No installer, no admin.
   - PowerShell blocks `npm.ps1` (execution policy): always call **`npm.cmd`**.
2. `bash scripts/fetch-tesseract.sh` in WSL fills `resources/tesseract-win/`
   (needs a `7z`; the official static `7zz` Linux build works — download the
   `7z*-linux-x64.tar.xz` release asset from `ip7z/7zip` via `gh release
   download`, extract, symlink as `7z` on PATH). Trim the unpacked bundle to
   runtime files (tesseract.exe + DLLs + tessdata) — training tools and the
   original installer add ~200 MB of dead weight.
3. rsync the repo (minus `node_modules`, `.git`, `out`, `release`, env files)
   to `C:\Users\<user>\AppData\Local\librarius-build\repo\`.
4. On the host (via powershell.exe from WSL, `-ExecutionPolicy Bypass`):
   `npm.cmd install --include=dev`, then `node node_modules\electron\install.js`
   (postinstall skips here too), then `npm.cmd run build:win`.
5. Installer lands at `repo\release\LegionPDF-<ver>-Setup.exe`;
   `/S` silent-installs per-user (no UAC) to
   `%LOCALAPPDATA%\Programs\Legion PDF\`.

### PDF file association (only provable from the installed app)

`fileAssociations` in `electron-builder.yml` puts Legion PDF in Explorer's
"Open with" list. The NSIS macro writes to `SHELL_CONTEXT`, which follows the
install mode, so a per-user install (`nsis.perMachine: false`) registers under
`HKCU\Software\Classes\.pdf` + `...\PDF Document\shell\open\command`. The
electron-builder docs say associations need `perMachine: true`; the shipped
macro (`app-builder-lib/templates/nsis/include/FileAssociation.nsh`) is
context-aware and documents the per-user layout, so per-user is expected to
work — if a packaged QA pass finds it missing, the fallback is `perMachine:
true` (which costs a UAC prompt at install).

After installing, verify from PowerShell:
`reg query "HKCU\Software\Classes\.pdf"` and
`reg query "HKCU\Software\Classes\PDF Document\shell\open\command"`
(the command must be `"...\Legion PDF.exe" "%1"`), then right-click a PDF →
Open with → Legion PDF, and double-click one with the app already running (the
second launch must focus the open window and add a tab, never start a
second app).

### Explorer verbs — "Combine in Legion PDF" (only provable from the installed app)

`nsis.include: build/installer.nsh` adds two right-click verbs at install time,
written to the per-user class hive because the installer is per-user:

| Verb | Shown on | Command |
| --- | --- | --- |
| Combine in Legion PDF | every extension in `OPENABLE_EXTENSIONS` | `"...\Legion PDF.exe" --combine "%1"` |
| Convert to PDF with Legion PDF | the non-PDF ones | `"...\Legion PDF.exe" "%1"` |

Both carry `MultiSelectModel = Player`, which is what keeps a verb visible when
SEVERAL files are selected. The .nsh keeps its own copy of the extension list;
`electron/installer-verbs.test.ts` parses the script and fails if it ever drifts
from `shared/convert-inputs.ts` (`#seam:openable-extensions`).

After installing, verify from PowerShell:

```powershell
reg query "HKCU\Software\Classes\SystemFileAssociations\.pdf\shell\LegionPDF.Combine" /s
reg query "HKCU\Software\Classes\SystemFileAssociations\.docx\shell\LegionPDF.Combine" /s
reg query "HKCU\Software\Classes\SystemFileAssociations\.docx\shell\LegionPDF.Convert" /s
# every openable extension at once (19 keys expected):
reg query "HKCU\Software\Classes\SystemFileAssociations" /f "LegionPDF.Combine" /k /s | Select-String "LegionPDF.Combine" | Measure-Object
```

Each Combine key must carry `(Default) = Combine in Legion PDF`,
`MultiSelectModel = Player`, `Icon = "...\Legion PDF.exe",0`, and a `command`
subkey ending in `--combine "%1"`. Then, by hand: select three PDFs and a .docx
in Explorer, right-click → **Combine in Legion PDF** → the app comes forward with
the Combine Files panel listing all four, in file-name order. Uninstalling must
leave `reg query` finding nothing (the uninstall macro deletes both verbs and
then `/ifempty`-deletes the `shell` and extension keys it emptied).

**Windows only shows a verb on up to 15 selected files.** Above that Explorer
hides it silently (its own limit, nothing to do with Legion PDF). Raise it with
`HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\MultipleInvokePromptMinimum`
(DWORD, e.g. 50) and sign out and back in. There is no way to raise it from a
per-user installer without also changing how Explorer treats every other app.

**Explorer launches one process per selected file.** Ten selected exhibits are
ten `Legion PDF.exe --combine <one file>` launches; the single-instance lock
turns nine of them into `second-instance` events on the running app.
`electron/services/open-files.ts` gathers them for 1.5 s of quiet
(`COMBINE_QUIET_WINDOW_MS`) and delivers ONE `app:openFiles` event with
`intent: 'combine'`, sorted into natural file-name order — Explorer's launch
order is a race and cannot be trusted. Symptoms if that funnel ever breaks: the
panel fills one file at a time, or combines a subset.

## Packaged-app QA from WSL

- Launch with `--remote-debugging-port=9450`; WSL reaches it at
  `http://127.0.0.1:9450` (mirrored networking).
- Native file dialogs cannot be driven over CDP — call the path-taking
  `window.librarius.*` bridge methods directly with `C:\...` paths.
- `window.confirm` blocks the renderer — auto-answer via CDP
  `Page.handleJavaScriptDialog`.
- Verify outputs with poppler (`pdftotext`, `pdftoppm`) WSL-side against
  `qa/fixtures/manifest.json` ground truth — never with the app's own code.
- Raw-byte "is the text gone" checks are vacuous without inflating flate
  streams — use `containsText` from `core/ops/test-fixtures.ts` in tests.

## Known deferred items (as of 2026-08-10)

- `core/image/` consolidation (PNG decode primitives duplicated in
  `core/ocr/png-blank.ts` and `core/redact/png-decode.ts`).
- Shared UI atoms (`StatusLine`/`ActionButton`/... duplicated in ocr + redact).
- `RedactSearchRequest` type declared but unwired (regex/case-sensitive search
  needs a ViewerApi change).
- Cosmetic: one leaked blob URL in `print-controller.ts` when `image.decode()`
  rejects on an already-failing path.
- **Stretch goal (next session): true text editing with reflow** — whiteout
  and retype shipped instead; see the handoff doc.

## Scanned court filings render as white pages (fixed 2026-08-19)

Every Acrobat "Paper Capture" scan is JBIG2-encoded; pdf.js 6 decodes JBIG2/
JPX via wasm it must be POINTED AT (`wasmUrl`), else: "Ensure that the
wasmUrl API parameter is provided" → "JBig2 failed to initialize" → white
pages while the OCR text layer still works. Fix: scripts/sync-pdfjs-assets.mjs
copies pdfjs-dist/{wasm,cmaps,standard_fonts} → src/public/pdfjs (pre-dev/
build hooks) and src/lib/pdfjs.ts passes wasmUrl/cMapUrl/standardFontDataUrl
on every load. Drift-guarded by src/lib/pdfjs-assets.test.ts. QA rule: any
viewer change gets smoke-tested against a REAL scanned court filing, not
only generated fixtures — PNG-embedded scans never touch these decoders.

## E-Sign / Legion Sign (added 2026-08-22)

- The hosted signing flow talks to `sign.legionarmory.net` — an isolated
  Cloudflare Worker in the legion-atlas repo under `sign/` (own D1
  `legion-sign` + R2 `legion-sign`; NOT the Atlas Portal worker). Deploy
  recipe: `sign/README.md` there. The app's service settings (base URL +
  bearer API key) and the Outreach sender (Armory URL + service token +
  from-mailbox) both live in safeStorage via
  `electron/services/esign-settings.ts`.
- "Email from my address" rides the Armory EC2's Outreach module over
  Tailscale (Outreach holds the Gmail OAuth; Google blocks app passwords
  on Arthur's accounts, so the SMTP path was removed 2026-08-22).
  Endpoint: `POST {armory}/tools/outreach/service/send-founder-email`
  with the ARMORY_SERVICE_TOKEN bearer. PREREQUISITE not yet applied:
  the EC2 Caddy must exempt `/tools/outreach/service/*` from
  forward_auth — legion-armory branch `arthur/outreach-service-exemption`
  has the one-line change; apply on the EC2 host and reload caddy. Until
  then the app reports "The Armory answered with its sign-in page" and
  leaves the envelope + copyable links intact (live-verified). WSL DNS
  note: MagicDNS `.ts.net` names may not resolve inside WSL — use the
  tailnet IP form (http://100.69.109.124/tools/outreach) in dev.
- `LIBRARIUS_DEV_ANTHROPIC_KEY` (env) lets QA drive Centurion live without
  touching the keystore. Honoured ONLY when `app.isPackaged` is false —
  packaged builds ignore it (electron/ipc/ai.ts `devFallbackKey`).
- E-sign fields are request metadata in the renderer store — they are never
  burned into local bytes and do not survive an app restart; sent-request
  receipts ("who has signed") reset on relaunch too. The service remains
  the source of truth; re-check by envelope status if the app restarts.

## Windows packaging blocked by Smart App Control (hit 2026-08-22)

Symptom: `npm run build:win` dies with `⨯ spawn UNKNOWN` at
`computeScriptAndSignUninstaller`, leaving a ~186 KB stub as the Setup.exe.
Root cause: electron-builder RUNS the freshly compiled (unsigned) NSIS stub
to extract the uninstaller for signing, and **Windows Smart App Control**
blocks it — `Start-Process` on the stub says "An Application Control policy
has blocked this file." Check state (1 = enforcing, 2 = evaluation, 0 = off):
`Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' |
Select VerifiedAndReputablePolicyState`. SAC auto-flipped from evaluation to
enforcing between two builds on 2026-08-22 — the same recipe had just built
v0.4.0 fine.

Facts and options:
- Already-installed apps keep launching (reputation established) — verified
  for the installed v0.4.0. Only NEW unsigned executables are blocked.
- Fix A: turn Smart App Control OFF (Windows Security ▸ App & browser
  control) — a USER decision; it cannot be re-enabled without reinstalling
  Windows. This is what building unsigned installers on this machine needs.
- Fix B: a real code-signing certificate (EV for instant reputation) — SAC
  then trusts the stub and the installer; the durable, secure fix.
- A containerized Linux build dodges the BUILD failure but not the runtime
  block: SAC would still stop the resulting unsigned installer on launch.
- Red herring met along the way: app-builder-lib 26.15.3's win32 `execWine`
  branch passes `options.env` unmerged (child would lack SystemRoot/PATH) —
  patched locally in the build repo's node_modules, but SAC was the actual
  blocker here.

## Printing

| Symptom | Cause → Fix |
| --- | --- |
| Every page prints on TWO sheets — a 15-page brief comes out of the printer as 30, with every other sheet blank (Arthur, 2026-09-15) | The print sheet drew each page as `<img width: 100%>` under `@page { size: auto }`, so the image's height came from its own aspect ratio and the paper came from Chromium's guess. Any mismatch at all — printer hardware margins, a Legal page on Letter paper, a 150-DPI raster rounded into the page box — made the image a hair taller than the sheet, and the overflow paginated onto a second, near-blank one. Fixed by adopting pdf.js's print layout: `html`/`body`/the sheet are `height: 100%`, each page image sits in a `.librarius-print-page` box that is exactly one sheet (`height: 100%`, `overflow: hidden`, `break-after: page`, `break-inside: avoid`), and the image is capped at `max-height: 100%` so it shrinks to fit instead of spilling. `print-controller.ts` also injects an `@page { size: <w>pt <h>pt }` rule taken from page 1's pdfjs viewport, so the paper matches the document (Legal, landscape) instead of being guessed. Proof: `node qa/print-proof.mjs` prints every fixture through Chromium's own engine and counts the sheets; its `legacy` arm re-applies `qa/print-legacy.css` and must still double them. |
| ALL pages print on ONE sheet | `overflow: hidden` left on `html`/`body` in print media. The app hides its own scrollbars that way, but in print it clips the sheet to a single page box and Chromium stops paginating. Print media must set `overflow: visible !important`. Guarded by `src/components/viewer/print-css.test.ts`. |
| A print job comes out on the wrong paper, or a landscape page prints letterboxed in the middle of a portrait sheet | The `@page` size rule is missing. It is injected as `<style id="librarius-print-page-size">` at prepare time and removed by `finishPrint()`; if a crash leaves the app without it, the fallback `size: auto` in `print.css` takes over and Chromium guesses again. Note the printer still has the last word — a printer loaded with Letter prints Letter; CSS only decides the layout box. |
| `printToPDF` in a QA script hangs or the sheet vanishes before it runs | The renderer tears the sheet down in a `finally` as soon as `app:print` settles, and on a printer-less machine the dialog fails instantly. Re-register the handler to hang — `ipcMain.removeHandler('app:print'); ipcMain.handle('app:print', () => new Promise(() => {}))` — so the sheet stays mounted (`qa/print-proof-lib.mjs` does this). Also: the main-process `evaluate` context has no `require` and no dynamic `import`, so return the PDF as base64 rather than writing it from inside. |

## Opening Word documents, images and spreadsheets (convert lane, 2026-09-15)

Reference doc: `docs/references/convert-to-pdf.md`. Symptom-first index:

| Symptom | Cause → Fix |
| --- | --- |
| "Legion PDF cannot open .doc files" with Word installed | The ProgID probe failed, not Word. It reads `HKLM:\SOFTWARE\Classes\Word.Application` **and** `HKCU:\…` (per-user Office lives in HKCU); if PowerShell cannot be spawned at all, every Office engine reports unavailable. Check `window.librarius.convert.support()` — it says which engines were found and why. |
| A `.docx` opens, a `.doc` does not | By design: `.docx` has a pure-JS fallback (mammoth + Chromium), `.doc`/`.rtf`/`.xlsx`/`.pptx` do not. Save as `.docx` or PDF first. |
| Conversion hangs, then "did not finish converting … within two minutes" | Office COM sat on a modal dialog nobody can see (recovered-document prompt, activation nag, a file marked read-only by another user). Open the file in Word/Excel once by hand, dismiss whatever it asks, close it, try again. The 120 s ceiling is deliberate: a frozen app with no error is the worst of the three outcomes. |
| A **corrupt** Office file takes ~20 s to fail | Word's own recovery attempt, not our timeout. It still fails loudly with "Microsoft Word could not convert <file>". Seen in `office-com.test.ts` (22.8 s). |
| Word COM fails only for files in deep folders | Windows MAX_PATH. Word COM silently fails when the input or output path exceeds ~260 characters — the same trap the `docx-render` skill documents. Our temp output path is short by construction; a deeply nested INPUT can still hit it. |
| Nothing converts in a WSL dev run | `powershell.exe` is not on the PATH in every WSL shell (this machine's is not). `resolvePowerShell()` falls back to `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`; if that file is gone, Office is simply reported unavailable and the built-in engines still work. |
| A `.bmp`/`.gif`/`.webp` is blank or missing | Those three go through a hidden Chromium window, not `nativeImage` — measured 2026-09-15: `nativeImage` returns an EMPTY image for all three (it reads PNG and JPEG only). Anything that needs a window cannot be covered by Vitest; verify in the real app. |
| A scan opens at a strange page size | Working as designed: the page is the picture's real size when the file records its resolution (PNG `pHYs`, JPEG JFIF, TIFF `XResolution`). A 200 × 140 px image tagged 200 DPI IS a 1 × 0.7 inch page. Files with no resolution are fitted to Letter. |
| A `.txt` of 500 lines came out as one paragraph | Regression guard in `core/ops/text-to-pdf.test.ts`. The cause was sanitising the WHOLE text against the PDF font before splitting it: `font.encodeText('\n')` throws, so every newline was replaced with `?` and the file never paginated. Sanitise per line, after splitting. |
| `PDFDocument.create().save()` used as a "0-page PDF" fixture | It is not one — pdf-lib reports **1** page when those bytes are reloaded. Write the PDF by hand with `/Type /Pages /Kids [] /Count 0` (see `convert-file.test.ts`). |
| `import * as UTIF from 'utif'` is undefined at runtime | utif is CommonJS with a single `module.exports`; an ESM namespace import yields only `default`. Use `createRequire` + `as typeof Utif` (see `tiff-decode.ts`), the same pattern `pdf-intake.ts` uses. |
| `npm run lint` fails on `src/public/wasm/*.js` | Third-party pdf.js decoder fallbacks, generated into the worktree and untracked. Not authored here; `src/public/pdfjs/` is gitignored but its sibling `wasm/` is not, and `eslint.config.js` does not ignore it. Lint with `--ignore-pattern 'src/public/**'` until the ignore lists are widened. |
