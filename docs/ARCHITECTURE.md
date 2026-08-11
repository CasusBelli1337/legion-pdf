# Legion PDF — Architecture & Build Contracts

## Zones (hard boundaries — imports are one-way)

```
shared/   Types + IPC channel names. Imported by ALL zones. No app logic —
          only pure rules BOTH src/ and core/ must agree on (tool schemas,
          watermark placement), which have nowhere else to live.
core/     Pure PDF engine. Functions (bytes: Uint8Array, opts) → OpResult.
          Node-safe. NO Electron, NO DOM, NO React. 100% Vitest-covered.
electron/ Main process. File IO, IPC handlers (thin wrappers around core/),
          OCR worker pool, Anthropic client, safeStorage. No business logic.
src/      Renderer. React 19 + Tailwind. Reaches main ONLY via
          window.librarius (typed bridge from preload). No node imports.
```

Dependency rule: `src → shared ← electron → core → shared`. Nothing else.

## Document model

The renderer owns a `DocumentSession` per open tab:

```ts
interface DocumentSession {
  id: string;              // uuid
  filePath: string | null; // null = unsaved (e.g. fresh combine)
  bytes: Uint8Array;       // CURRENT working copy (post-ops, unsaved)
  pageCount: number;
  dirty: boolean;
}
```

- pdfjs renders from `bytes` (renderer side).
- Mutations: renderer calls `window.librarius.ops.X(docId, opts)` → main
  process runs the `core/` function on its copy of the bytes → returns new
  bytes + OpResult → renderer swaps `bytes`, re-renders, sets `dirty`.
- Main process keeps the byte store (`electron/services/doc-store.ts`) —
  single source of truth; renderer holds a structured-clone copy for pdfjs.
- Save/Save As writes the store's bytes to disk; destructive ops (redaction)
  force Save As.

## OpResult (every core/ function returns this shape)

```ts
interface OpResult<T = undefined> {
  bytes: Uint8Array;       // output PDF — MUST be non-empty
  pagesIn: number;
  pagesOut: number;        // caller asserts expected relation
  detail: T;               // op-specific (e.g. batesApplied: string[])
}
```

Rules: validate ranges against real pageCount BEFORE slicing (throw
`RangeCollapseError` on empty windows); never return silently-empty output.

## IPC contract

All channels + payload types live in `shared/ipc.ts` (single source of
truth; `#seam:ipc-contract` marker on every handler registration site).
Channel groups:

- `file:*`   open dialog, read, save, saveAs, saveTo (no dialog), chooseFolder,
             recent list, undo/redo/undoState
- `ops:*`    merge, split, reorder, rotate, delete, extract, insertBlank,
             insertFrom, bookmarks get/set, scrubMetadata, flatten
- `stamp:*`  bates, exhibit, watermark, pageNumbers, signature list/add/
             addBytes/place, textBox, whiteout
- `ocr:*`    detect, run (streams `ocr:progress`), cancel, bulk, bulkCancel
- `redact:*` apply (streams progress), verify
- `ai:*`     hasKey, setKey, clearKey, ask (streams `ai:chunk`), toolDecision
- `app:*`    print, openPath, version, `app:openFiles` push (OS file opens)

Channels whose lane has not landed yet are declared here in full and
registered by `electron/ipc/not-implemented.ts`, so they reject with
`NotImplemented: <channel>` rather than look wired.

Preload exposes these as `window.librarius.<group>.<method>` with full types
(`shared/bridge.ts` defines the `LibrariusBridge` interface).

Progress streaming: long ops emit `{docId, phase, current, total}` on
`<group>:progress`; UI shows "Page 37/214" (UI golden rule: show movement).

## Viewer overlay API (what stamps/redaction build against)

`src/components/viewer/` exports the React context `ViewerApi`. The interface
itself lives in `src/components/viewer/viewer-types.ts` (with
`PageOverlayContext`, `PageOverlayRenderer`, and `SearchProgress`); import it,
and everything else the lane exposes, from `src/components/viewer` — never from
a file inside.

```ts
interface ViewerApi {
  docId: string;
  pageCount: number;
  currentPage: number;
  goToPage(page: number): void;
  zoom: number;             // 1 = 100%, clamped to 0.1–8 by the store
  setZoom(zoom: number): void;
  // page geometry: convert client coords ↔ PDF user-space coords.
  // Null whenever that page is not currently mounted.
  clientToPdf(page: number, point: ClientPoint): PdfPoint | null;
  pdfToClient(page: number, point: PdfPoint): ClientPoint | null;
  pageSize(page: number): PageSize | null;  // PDF points; null until read
  // overlay mounting: features render into a per-page overlay layer
  registerOverlay(id: string, render: PageOverlayRenderer): () => void;
  // text geometry for search/search-redact; quads are in PDF points
  findText(query: string, onProgress?: SearchProgress): Promise<TextMatch[]>;
}
```

`useViewerApi()` returns `ViewerApi | null` — null whenever no document is open,
so every consumer handles the empty case.

Tool panels register in `src/app/tool-registry.ts`:

```ts
interface ToolPanel {
  id: string;            // 'bates' | 'redact' | ...
  title: string;         // "Bates Stamping"
  icon: LucideIcon;
  panel: React.ComponentType; // rendered in the LEFT tool dock (never overlays doc)
}
```

Config over code: new tool = new entry here, zero shell changes.

## Directory ownership (agent build lanes — do not cross)

| Lane | Owner agent | Paths |
| ---- | ----------- | ----- |
| Foundation | orchestrator | configs, shared/, electron/main.ts, preload, doc-store, src/app/* |
| A Viewer | viewer agent | src/components/viewer/**, src/components/thumbnails/**, src/features/find/** |
| B Core ops | ops agent | core/ops/**, electron/ipc/ops.ts |
| C Stamps | stamps agent | core/stamps/**, src/features/stamps/**, src/features/signature/**, electron/ipc/stamp.ts |
| D OCR | ocr agent | core/ocr/**, electron/services/ocr/**, src/features/ocr/**, electron/ipc/ocr.ts |
| E Redaction | redact agent | core/redact/**, src/features/redact/**, electron/ipc/redact.ts |
| F Centurion | ai agent | electron/services/anthropic.ts, electron/services/keystore.ts, src/features/centurion/**, electron/ipc/ai.ts |

Shared files (`shared/ipc.ts`, `tool-registry.ts`, `package.json`) are
owned by the orchestrator; agents REQUEST additions in their final report
instead of editing them (pre-declared stubs exist for each lane).

## Shell layout and theming

```
TabBar                            (full width, only when a document is open)
ToolDock | ViewerSlot | DocumentRail
  icons  |  toolbar   |  Pages / Bookmarks
  panel  |  document  |
StatusFooter                      (fields | notice | error | Legion credit)
```

Acrobat's arrangement: tools LEFT, document centre, thumbnails/bookmarks RIGHT.
There is exactly ONE chrome row above the document — `ViewerToolbar`
(`src/components/viewer/viewer-toolbar.tsx`) with a document open, `IdleToolbar`
(`src/app/shell/toolbar/`) without one; both compose the same `FileActions`,
`BusyIndicator`, and `ThemeToggle`, and share `TOOLBAR_ROW` so the bar does not
move when the first PDF arrives. The native menu bar is hidden
(`autoHideMenuBar` + `setMenuBarVisibility(false)`) but the MENU is still
installed: it is what registers every accelerator, and `electron/menu-template.ts`
is a pure function so `menu-template.test.ts` can prove each one still exists.

Theming is one attribute. `src/index.html` sets `<html data-theme>` from
localStorage before React loads (no flash); `src/app/theme.ts` owns the key, the
default (LIGHT), and the toggle. `src/styles/tokens.css` declares every colour
in Tailwind's `@theme` with the LIGHT values and re-points the same variables
under `:root[data-theme='dark']` — unlayered, so it outranks Tailwind's
`@layer theme`. Components never name a colour, only a token:

| Token family | Use |
| ------------ | --- |
| `armory-base/surface/elevated/interactive` | surfaces, in rising elevation |
| `armory-canvas` | behind the document only |
| `armory-border`, `armory-border-strong`, `armory-focus` | lines and focus |
| `text-primary/secondary/muted/inverse` | text on a surface |
| `text-on-brand` | text on a brand fill — the ONLY colour allowed there |
| `brand-50…900` | interactive: 300–500 accent, 600–700 solid fills |
| `status-*`, `success/warning/danger/info` | meaning, identical in both themes |

`bg-white` survives in exactly three places and all three are correct in both
themes: the PDF page, signature tiles, and whiteout previews — paper is paper.

## Rasterization note (OCR + redaction both need page→PNG)

pdfjs render-to-canvas happens in the RENDERER (it needs canvas). The
renderer exposes a rasterize helper (`src/lib/rasterize.ts`, foundation-
owned): given docId + page + DPI, returns PNG bytes via OffscreenCanvas.
Main-process flows that need rasters (OCR, redaction apply) request them
from the renderer over IPC (`raster:request` → `raster:response`). This
keeps one rendering engine (pdfjs) for screen and pipeline both.

## Testing

- `core/` — Vitest, node env, fixture PDFs generated in-test with pdf-lib
  (no binary fixtures in git). Every op: happy path + count verification +
  collapsed-window error case.
- `electron/services/` — Vitest where node-testable (keystore mocked).
- UI — smoke-level component tests only; real verification is the Windows
  live-QA pass (CDP-driven against the packaged app).
