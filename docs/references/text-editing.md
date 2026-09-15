# core/edit — editing the text a page already has

## What it does

"Edit text" lets the attorney click a paragraph, retype it, and have the page's
own drawing instructions rewritten: the old glyphs are deleted from the content
stream, the new words are laid out again in the paragraph's frame (same left
edge, measure, first-line indent, leading, alignment, colour), and drawn back —
in the document's own embedded font whenever that font can spell the new text,
otherwise in the closest built-in face, and the receipt says which and why.

This is the stretch goal deferred since v0.1 (`docs/HANDOFF.md`). Whiteout
removal (`docs/references/content-stream-editing.md`) was its seed; everything
there still holds — the walker, the rewrite rules, the two verification gates.

## Data flow

```
edit:inspect(docId, { page, at })
  └─ readPageText(document, page)
       ├─ resourcesOf / fontCodecsOf        widths for placement, codecs for meaning
       ├─ joinStreams + scanText            every glyph placed, with font/colour/mode/origin
       └─ placedGlyphs                      flattened, tagged with show/item/index
  └─ findBlock(pageText, at)
       ├─ nearest glyph → text direction    the paragraph's own frame (along / across)
       ├─ refuse: mode-3 text, form XObjects
       ├─ groupLines                        by baseline; gutters split columns; blank lines dropped
       ├─ lineAt / paragraphAround          same column only; the typesetter's first-word rule
       └─ TextEditBlock                     lines, text, font, leading, alignment, angle

edit:replaceText(docId, { page, block, text, dryRun? })
  └─ findAgain                             the block must still read as it did
  └─ plan: codec.encode(text)              document-font when nothing is missing
           else builtInChoiceFor(name)     + assertBuiltInCanPrint
  └─ layoutParagraph                       greedy wrap on the old measure
  └─ (dryRun → detail only)
  └─ removeOld: editRemoving per show op   survivors keep their coordinates (TJ compensation)
  └─ emitDocumentFontLines | emitBuiltIn   pushOperators (q/BT …/Q) | page.drawText
  └─ finish                                save, page count proven
  └─ prove                                 reload: shown-character delta + the band reads back the text
```

## Files

| File                    | What it owns                                                               |
| ----------------------- | -------------------------------------------------------------------------- |
| `text-state.ts`         | Graphics/text state + the operators that set it, now incl. colour and `Tr`. |
| `text-runs.ts`          | The walker: show ops with font name, colour, render mode, glyph origins.     |
| `cmap-parse.ts`         | `/ToUnicode` CMaps (bfchar, bfrange, arrays, surrogates).                     |
| `encodings.ts`          | WinAnsi (explicit 0x80–0x9F), MacRoman, Standard; `/Differences`.            |
| `glyph-names.ts`        | The Adobe Glyph List slice a legal document reaches for; `uniXXXX`.          |
| `truetype-glyphs.ts`    | `head`/`maxp`/`loca`/`cmap`: does this embedded program have an outline?     |
| `font-codec.ts`         | Decode codes → text, encode text → codes, with missing characters by name.   |
| `text-lines.ts`         | Frame math, lines, gutters, paragraph walk, alignment, leading.              |
| `text-layout.ts`        | Wrapping and alignment of the new text.                                      |
| `inspect-text.ts`       | `edit:inspect`; the refusals.                                                |
| `emit-text.ts`          | Drawing lines back in the page's own font resource.                          |
| `replace-text.ts`       | `edit:replaceText`: plan, remove, emit, finish, prove.                       |

Renderer: `src/features/text/use-block-editing.ts` (open / dry run / commit),
`block-editor.tsx` + `block-editor-layout.ts` (the surface over the paragraph),
`edit-notes.ts` (every sentence the attorney reads). Wired into the Text tab of
Stamps & Marks by `src/features/stamps/text-actions.ts`.

## Decisions worth knowing

**The font reality check is real, not a guess.** A subset font's `/Widths` and
even its `cmap` may list characters it never carried. For embedded TrueType the
`loca` table is the truth: no outline, no glyph — and a `cmap` that sends a
character to glyph 0 means the same. For Type0/Identity fonts the reverse
`ToUnicode` map is the set of glyphs the writer kept. A character that fails is
reported by name; the edit then goes to a built-in face, and the note says so
before the attorney commits (`dryRun`).

**Paragraphs end where a typesetter would end them.** Lines join while the
gap is a plausible leading (up to 2.6× the size — Word's double spacing is
2.3×), the sizes match, they share a column, and the next line's first word
would NOT have fitted on this one. That single rule handles justified and
ragged-right prose alike; a gap of 1.6 em along a baseline is a gutter and cuts
a pleading's line numbers off from the text.

**The new text goes in the same font resource.** `/F2 12 Tf` is re-used by
name, so nothing is embedded twice. Spaces are the font's own space glyph when
it has one; justification is a `TJ` adjustment between words.

**Verification is on the saved bytes.** pdf-lib's own content streams cannot
be re-read in place, so the document is finished (saved and page-counted) and
then reloaded: the shown-character count must move by exactly the glyphs
removed and added, and the band the new lines occupy must read back the typed
text. A rewrite that fails either is thrown away, never returned.

## Known limits

- One font per paragraph: a bold word inside a paragraph is re-set in the
  paragraph's main face (the detail carries a note).
- Text drawn through a form XObject, and invisible OCR text over a scan, are
  refused with a plain-English message pointing at Cover and retype.
- Mixed colours inside a paragraph become the most common colour.
- Character spacing (`Tc`) and horizontal scaling (`Tz`) of the original are not
  reproduced; the new lines are set at natural widths.
- A Type0 font whose encoding is not Identity-H/V is not reusable.
- Tables and multi-column pages edit one cell / column at a time.

## Fixture

`qa/fixtures/word-letter.pdf` is a PDF Microsoft Word wrote from
`qa/make-word-letter.mjs` (via the docx-render skill): subset TrueType with
WinAnsi and no ToUnicode, plus a CID face for the curly quotes and em dash.
`core/edit/replace-text.word.test.ts` edits it in Word's own Times and proves
the missing-glyph fallback.
