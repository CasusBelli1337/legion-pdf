# core/edit — rewriting what a page says

## What it does

`core/edit` changes a page's own drawing instructions instead of drawing
something new on top of them. Today it has exactly one job: **delete the text a
whiteout box covers**, so "cover it and type over it" is honest — the covered
words stop existing for extraction, OCR, copy/paste, and Centurion.

It is **not redaction**. Redaction (`core/redact`) rebuilds a page from a raster
because a scan carries its words as pixels; this removes text operators only.
The Text panel says so in as many words.

## Data flow

```
applyWhiteout(bytes, { …, removeCoveredText: true })
  └─ removeTextInRect(document, { page, rect })
       ├─ resourcesOf(page.Resources)      fonts + form XObjects, resolved up front
       ├─ contentStreamsOf(page)           every /Contents stream, decoded, with its PDFRef
       ├─ join(...)                        the streams as ONE buffer (they are one logical stream)
       ├─ scanText(buffer, resources)      graphics/text state machine → glyph boxes in user space
       ├─ refuseHiddenText(...)            covered text inside a form XObject → loud stop
       ├─ editFor(operation, rect)         per show operator: which glyphs go, what replaces them
       ├─ applyEdits + writeBack           new PDFRawStream assigned to the SAME ref
       └─ proveEmpty + assertCounts        re-read, re-place, refuse to return if anything survives
  └─ drawRect(...)                         the white patch, painted after the removal
```

## Files

| File                     | What it owns                                                     |
| ------------------------ | ---------------------------------------------------------------- |
| `content-lexer.ts`       | Tokenizes a stream **with byte offsets**. Byte-class dispatch table. |
| `matrix.ts`              | `cm`/`Tm` arithmetic, upright bounds, rectangle overlap.          |
| `font-widths.ts`         | Glyph advances: `/Widths`, `/W`+`/DW`, base-14 via pdf-lib, fallback. |
| `text-runs.ts`           | The state machine. `Tj`/`TJ`/`'`/`"` → glyph boxes + advances.    |
| `rewrite-shows.ts`       | Coverage decision (≥60% of a glyph's box) and replacement bytes.  |
| `page-resources.ts`      | Fonts + form XObjects for a resource dict; addressable streams.   |
| `remove-text-in-rect.ts` | Orchestration, write-back, and the two verification gates.        |
| `edit-testkit.ts`        | TEST ONLY: pages with placed text, split streams, form XObjects.  |

`core/stamps/stamp-testkit.ts` is the test-only ancestor these were
productionised from; `core/ocr/content-text.ts` is the shown-character counter
they reuse for count verification.

## Decisions worth knowing

**A show operator that loses nothing is not touched.** Its bytes stay exactly
where they were. That is what lets `remove-text-in-rect.test.ts` prove (with
pdfjs, not our own walker) that surviving text is at the same coordinates it had.

**A rewritten operator becomes `prefix [ … ] TJ`.** Whatever it was —
`Tj`, `TJ`, `'`, `"` — the replacement keeps the survivors as hex strings and
puts a **numeric adjustment** where the deleted glyphs were. That number moves
the pen exactly as far as the deleted text did (`n = -1000 · advance / size`),
so words still standing on the same line do not slide left into the gap.
Deleting the operator outright is the obvious version of this, and it silently
re-flows the page. `'` and `"` carry their line move and spacing in the prefix.

**Coverage is decided per glyph, not per run.** A glyph goes when ≥60% of its
own box lies inside the rectangle (`COVERAGE_THRESHOLD`). Consecutive glyphs are
then grouped, which splits a straddling run for free and keeps the outside half.

**Form XObjects are read but never rewritten.** A form can be shared by several
pages, so editing one would edit every page that draws it. Covered text inside a
form therefore fails LOUD (`UnreachableTextError`) with a plain-English sentence
pointing at Redaction. Text in a form that the box does not reach is left alone.
Recursion depth is capped at 8.

**Text render mode is ignored on purpose.** Mode 3 is invisible text — an OCR
layer — and invisible text under a whiteout is the text most likely to leak.

**Rotation needs no special case.** `/Rotate` is a viewing transform; both the
glyphs and the whiteout rectangle are in user space, so they compare directly.

**Two verification gates, both loud.** After the edit the page is re-read and
re-placed: any glyph still inside the rectangle raises `RemovalNotProvedError`.
Then `countShownCharacters(before) − countShownCharacters(after)` must equal the
bytes the edits claimed to delete. A silent partial removal cannot report success.

## Known limits

- **Approximate widths.** A face with no readable width table falls back to a
  nominal half-em and sets `approximateWidths` on the detail. The bias is
  towards removing: a leak is the dangerous failure, an over-wide estimate is
  the visible one.
- **One token per stream.** A lexical token that straddles two `/Contents`
  streams is refused rather than rewritten blind (no writer produces one).
- **Rewritten streams are stored uncompressed** (`/Filter` dropped). Only the
  streams that were edited; everything else keeps its original encoding.
- **Undo is the byte history.** Removal is a normal document mutation, so the
  ordinary undo stack restores the covered text.

## Seed for real text editing

Phase 1 of the deferred "edit existing PDF text" goal (see `docs/HANDOFF.md`)
wanted a content-stream walker that maps a text quad to the exact operator that
drew it. `scanText` is that walker: it already returns each show operation's
byte range, its per-glyph boxes in user space, and its advances. Replacing a
span becomes `editFor`'s problem — keep the survivors, and instead of a numeric
adjustment, emit the new string re-encoded in the same font. The font-glyph
reality check from the handoff still applies: `font-widths.ts` reads widths, not
glyph coverage, so a subset font that lacks a replacement character has to be
detected before a swap is offered.
