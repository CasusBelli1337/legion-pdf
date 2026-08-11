# Librarius — Troubleshooting & Build Recipes

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
5. Installer lands at `repo\release\LegionArmory-Librarius-<ver>-Setup.exe`;
   `/S` silent-installs per-user (no UAC) to
   `%LOCALAPPDATA%\Programs\Legion Armory - Librarius\`.

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

- Custom app icon (installer currently ships the default Electron icon).
- `core/image/` consolidation (PNG decode primitives duplicated in
  `core/ocr/png-blank.ts` and `core/redact/png-decode.ts`).
- Shared UI atoms (`StatusLine`/`ActionButton`/... duplicated in ocr + redact).
- `RedactSearchRequest` type declared but unwired (regex/case-sensitive search
  needs a ViewerApi change).
- Cosmetic: one leaked blob URL in `print-controller.ts` when `image.decode()`
  rejects on an already-failing path.
- No path-taking Save As in the bridge (dialog only) — matters for scripting.
- **Stretch goal (next session): true text editing with reflow** — whiteout
  and retype shipped instead; see the handoff doc.
