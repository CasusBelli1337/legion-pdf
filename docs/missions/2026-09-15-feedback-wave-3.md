# Mission — Arthur's third feedback wave (2026-09-15)

Arthur's requests after using v0.4.1, and how they were split into build
lanes. Every lane builds against the contracts pre-declared in commit
"feat(contracts): wave-3 lanes" (shared/ipc.ts, shared/bridge.ts,
shared/options-{export,convert,edit}.ts, shared/layout-model.ts,
shared/export-formats.ts, shared/convert-inputs.ts, menu + dock stubs).

| Lane | Request | Owner | Branch |
| --- | --- | --- | --- |
| H Print | "Said 15 pages, printed ~30 single-sided" — every page image spills onto a second sheet | Opus | `lane/print` |
| I Page rail | Right rail: multi-select pages, right-click → Delete / Extract to new PDF, drag to reorder | Opus | `lane/rail` |
| J Convert | Open Word docs, images, spreadsheets, text as PDFs (File > Open / Create PDF) | Opus | `lane/convert` |
| K Explorer combine | Multi-select PDFs + Word docs in Explorer → right-click → Combine in Legion PDF (Acrobat-style flow) | Opus | `lane/combine` |
| L Export | Export to PNG, JPEG, multi-page TIFF, TXT — Export dock panel + File > Export As | Opus | `lane/export` |
| M Word export | Export to .docx preserving fonts, sizes, layout, headers/footers, images | Fable | `lane/word` |
| N Text edit | Edit existing PDF text in place, reflowed, in the document's own font | Fable | `main` (orchestrator) |

## Rules every lane follows

- Work ONLY in the paths the ownership table in `docs/ARCHITECTURE.md` gives
  the lane. Shared files (`shared/*`, `tool-registry.ts`, `menu-*`,
  `document-actions.ts`, `package.json`) are the orchestrator's: request
  changes in the final report unless the mission brief says otherwise.
- `npm run typecheck && npm run lint && npm test` green before every commit.
  300-line files, 50-line functions, complexity 10, no `any`, no hex colours.
- Every op proves its counts (pages in/out, files written, glyphs removed).
  "Fast and empty" is a bug.
- UI shows movement: every batch op streams progress over its
  `<group>:progress` channel and the panel shows "Page 12/65".
- Plain English for the attorney in every label, error, and receipt.
- Tests next to the code. New behaviour = new tests. Bug fix = regression test.
- Verify in the REAL app (`.claude/skills/run-legion-pdf`) with a screenshot
  before reporting done — text inspection alone is not verification.

## Merge order

H → I → L → J → K → M → N (orchestrator merges each lane branch into `main`,
re-running the gates after each). Package as v0.5.0 on the Windows host,
silent-install, verify Explorer verbs and print from the installed build.
