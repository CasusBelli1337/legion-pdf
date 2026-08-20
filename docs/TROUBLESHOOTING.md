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
