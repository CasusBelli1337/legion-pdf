# Librarius — Architecture & Build Contracts

## Zones (hard boundaries — imports are one-way)

```
shared/   Types + IPC channel names. Imported by ALL zones. No logic.
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

- `file:*`   open dialog, read, save, saveAs, recent list
- `ops:*`    merge, split, reorder, rotate, delete, extract, insertBlank,
             insertFrom, bookmarks get/set, scrubMetadata, flatten
- `stamp:*`  bates, exhibit, watermark, pageNumbers, signature list/add/
             place, textBox, whiteout
- `ocr:*`    detect, run (streams `ocr:progress`), cancel
- `redact:*` apply (streams progress), verify
- `ai:*`     hasKey, setKey, clearKey, ask (streams `ai:chunk`)
- `app:*`    print, openPath, version

Preload exposes these as `window.librarius.<group>.<method>` with full types
(`shared/bridge.ts` defines the `LibrariusBridge` interface).

Progress streaming: long ops emit `{docId, phase, current, total}` on
`<group>:progress`; UI shows "Page 37/214" (UI golden rule: show movement).

## Viewer overlay API (what stamps/redaction build against)

`src/components/viewer/` exports React context `ViewerApi`:

```ts
interface ViewerApi {
  docId: string;
  currentPage: number;
  goToPage(n: number): void;
  zoom: number;
  // page geometry: convert client coords ↔ PDF user-space coords
  clientToPdf(page: number, pt: {x: number; y: number}): PdfPoint | null;
  pdfToClient(page: number, pt: PdfPoint): {x: number; y: number} | null;
  pageSize(page: number): {width: number; height: number}; // PDF points
  // overlay mounting: features render into a per-page overlay layer
  registerOverlay(id: string, render: PageOverlayRenderer): () => void;
  // text geometry for search/search-redact
  findText(query: string): Promise<TextMatch[]>; // page + quad boxes
}
```

Tool panels register in `src/app/tool-registry.ts`:

```ts
interface ToolPanel {
  id: string;            // 'bates' | 'redact' | ...
  title: string;         // "Bates Stamping"
  icon: LucideIcon;
  panel: React.ComponentType; // rendered in right dock (never overlays doc)
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
