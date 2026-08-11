# Legion PDF

A fast, lightweight desktop PDF editor built for litigation attorneys. The
anti-Acrobat: opens instantly, scrolls a 2,000-page transcript smoothly, no
popups, no subscription nags — just the tools a litigator actually uses.

Ships as **Legion PDF**; the repo keeps its build name, `legion-librarius`,
after the *librarius* — the Roman legion's records clerk.

## What it does

- **View** — instant open, smooth scroll, thumbnails, zoom, print, tabs
- **Assemble** — combine/split PDFs, reorder/rotate/delete/extract pages, blank pages
- **Stamp** — Bates numbering, exhibit stamps, watermarks, page numbers, signatures
- **OCR** — local Tesseract, all cores in parallel, fully offline
- **Redact** — true redaction (content destroyed, not covered) with verification,
  plus search-based redaction ("redact every instance of this account number")
- **Produce** — metadata scrubbing and annotation flattening before anything
  leaves the office
- **Centurion** — built-in Claude Opus panel to ask questions about the open document

## Stack

Electron + React 19 + TypeScript (strict) + Tailwind 4, PDF rendering via
PDF.js, PDF writing via pdf-lib, OCR via bundled Tesseract. Legion light
theme by default, Armory dark theme on the toolbar toggle — every colour is a
variable in `src/styles/tokens.css`. See `docs/ARCHITECTURE.md`.

## Development

```bash
npm install
npm run dev          # electron-vite dev mode
npm test             # Vitest (core PDF engine tests, no Electron needed)
npm run typecheck    # tsc --noEmit across all tsconfigs
npm run lint
npm run build:icon   # resources/brand/fav.svg -> build/icon.png (app icon)
npm run build:win    # package Windows NSIS installer into release/
```

Environment variables are listed in `.env.example`. The Anthropic API key is
never stored in files — it is entered in Settings and encrypted with the
machine's own credential vault.
