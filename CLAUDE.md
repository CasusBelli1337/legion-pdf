# Legion Armory — Librarius

## Overview

Lightweight desktop PDF editor for litigation attorneys — the Acrobat
replacement. Fast viewer plus the litigation toolset: combine/organize,
Bates/exhibit stamps, watermarks, signatures, local OCR, true redaction,
metadata scrubbing, and an embedded Claude ("Centurion") panel.
Ships as a Windows .exe installer. Deferred stretch goal: editing existing
PDF text (whiteout-and-retype ships instead).

## Tech Stack

- Language: TypeScript (strict, no `any`, entire stack)
- Shell: Electron (electron-vite build, electron-builder NSIS packaging)
- UI: React 19 + Tailwind CSS 4 — Armory design system (dark/purple)
- PDF read/render: pdfjs-dist (renderer process)
- PDF write/mutate: pdf-lib (main process, pure functions in `core/`)
- OCR: bundled Tesseract binaries, spawned from main process worker pool
- AI: @anthropic-ai/sdk, model `claude-opus-5`, key via Electron safeStorage
- Testing: Vitest (core engine + services), tests next to source

## Commands

- `npm run dev` — electron-vite dev mode (hot reload)
- `npm test` — Vitest
- `npm run typecheck` — tsc --noEmit (node + web tsconfigs)
- `npm run lint` — ESLint + Prettier check
- `npm run build:win` — package Windows installer into `release/`

## Architecture

Three zones with hard boundaries (see `docs/ARCHITECTURE.md` for contracts):

```
core/      Pure PDF engine. Node-safe pure functions over Uint8Array.
           NO Electron, NO DOM, NO React imports — ever. Fully unit-tested.
electron/  Main process: window, file IO, IPC handlers, OCR worker pool,
           Anthropic client, key storage. Thin — real logic lives in core/.
src/       Renderer: React UI. Talks to main ONLY through the typed IPC
           bridge in shared/ipc.ts via window.librarius.
shared/    Types + IPC channel contract imported by all three zones.
```

Feature panels register in `src/app/tool-registry.ts` (config over code —
new tool = new registry entry, no shell changes).

## Non-negotiable engineering rules

1. **No silent data loss.** Every PDF operation validates its output: page
   counts in vs out, non-empty byte arrays, ranges validated against actual
   document length before slicing (collapsed window = loud error, never an
   empty success). Every op returns an `OpResult` with counts; callers check.
2. **Redaction is destruction.** Redacted pages are rasterized and rebuilt;
   the verify step re-extracts text and proves the redacted strings are gone.
   Never ship a redaction path that only draws rectangles.
3. **Centurion stop_reason check.** Every Anthropic call inspects
   `stop_reason`; `max_tokens` is a failure, never a result to display/persist.
4. **The API key never touches a file, a log, or the renderer.** safeStorage
   in main process only; renderer gets a boolean `hasKey`, never the key.
5. **UI shows movement** (global UI rule): every batch op streams progress
   ("Page 12/65") over IPC; no frozen spinners.

## Environment Variables

See `.env.example` — dev-only conveniences. Production has no env vars; the
API key lives in safeStorage, settings in `app.getPath('userData')`.

## Design

Armory design system, tokens in `src/styles/tokens.css` — copied from
legion-armory `docs/DESIGN_SYSTEM.md`. Dark-first, purple = interactive,
Inter + JetBrains Mono, no emojis/gradients/bounce. Window chrome:
"LEGION ARMORY — LIBRARIUS" mono uppercase, purple accent.

## Quality Gates

- 300-line file limit, 50-line function limit, ESLint `complexity: 10`
- New features and bug fixes require tests (core/ ops especially)
- `npm run typecheck && npm run lint && npm test` green before every commit
