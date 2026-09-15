# Opening Word documents, images, spreadsheets and text as PDFs

Legion PDF opens more than PDFs. A `.docx`, a scan, a spreadsheet or a `.txt`
is converted to PDF in the main process and adopted as an **unsaved** document,
so Save raises Save As and the attorney's original file is never written over.

There is no "convert" command and no convert panel. The conversion rides inside
the two doors a file already comes through:

- `file:open(path)` — every extension in `shared/convert-inputs.ts`
- `ops:merge` — a `MergeSource.filePath` that is not a PDF

`convert:support` reports what this particular computer can do, and
`convert:progress` streams `{ docId: null, phase: 'Converting letter.docx', … }`
while it happens.

## Where the code lives

| File | What it does |
| --- | --- |
| `shared/convert-inputs.ts` | The extension lists. One source of truth (orchestrator-owned). |
| `electron/services/convert/registry.ts` | Extension → engine, in preference order. The routing table. |
| `electron/services/convert/convert-file.ts` | Runs the engine and PROVES the result (non-empty, opens, ≥ 1 page). |
| `electron/services/convert/office-com.ts` | Word / Excel / PowerPoint over COM from PowerShell. |
| `electron/services/convert/builtin-word.ts` | mammoth → HTML → Chromium, when Word is absent. |
| `electron/services/convert/image-engine.ts` | Pictures. |
| `electron/services/convert/tiff-decode.ts` | Multi-page TIFF → PNG pages, DPI carried across. |
| `electron/services/convert/text-engine.ts` | `.txt` and `.html`. |
| `electron/services/convert/chromium-print.ts` | Hidden BrowserWindow → `printToPDF`. |
| `electron/services/convert/windows-shell.ts` | PowerShell resolution, `wslpath`, spawn-with-timeout. |
| `core/ops/image-to-pdf.ts` | Pure: pictures → pages, with the sizing rule. |
| `core/ops/text-to-pdf.ts` | Pure: text → wrapped, paginated Letter pages. |
| `electron/ipc/convert.ts` | `convert:support`, and wiring the progress sink. |

## The engine table

Tried top to bottom; the first engine that claims the extension **and** is
available on this computer gets the job.

| Engine | Handles | Available when |
| --- | --- | --- |
| `word` | `.docx .doc .rtf .txt .html .htm` | `Word.Application` is in the registry |
| `excel` | `.xlsx .xls` | `Excel.Application` is in the registry |
| `powerpoint` | `.pptx .ppt` | `PowerPoint.Application` is in the registry |
| `builtin-word` | `.docx` | Word is NOT installed (it steps aside when Word is) |
| `image` | `.png .jpg .jpeg .tif .tiff .bmp .gif .webp` | always |
| `text` | `.txt .html .htm` | always |

Consequences worth knowing:

- **`.doc` and `.rtf` need Word.** There is no pure-JS fallback for them, and
  the failure says so and tells the attorney to save as `.docx` instead.
- **Spreadsheets and decks need Office.** Same shape of message.
- **Nothing else needs anything installed.** Pictures, `.txt` and `.html` work
  on a bare machine.

Availability is probed once per engine per session and cached
(`resetAvailabilityCache()` / `resetOfficeCache()` exist for tests).

## The Office COM recipe

One PowerShell script per conversion, written to a temp directory, run as
`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <script.ps1>`,
with a **120 second** hard timeout. The temp directory is removed in a `finally`
either way — a client's document never stays in the temp folder.

```powershell
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject Word.Application
$app.Visible = $false
$app.DisplayAlerts = 0
$doc = $null
try {
  # FileName, ConfirmConversions:=false, ReadOnly:=true, AddToRecentFiles:=false
  $doc = $app.Documents.Open('<in>', $false, $true, $false)
  $doc.ExportAsFixedFormat('<out>', 17)   # wdExportFormatPDF
} finally {
  if ($doc -ne $null) { $doc.Close(0) }   # wdDoNotSaveChanges
  $app.Quit()
}
Write-Output 'LEGION_CONVERT_OK'
```

Excel is `Workbooks.Open(file, 0, $true)` + `ExportAsFixedFormat(0, out)`
(`xlTypePDF = 0`); PowerPoint is `Presentations.Open(file, $true, $false, $false)`
(read-only, window-less — PowerPoint refuses to be made invisible) +
`ExportAsFixedFormat(out, 2)` (`ppFixedFormatTypePDF = 2`).

**The sentinel is the proof, not the exit code.** `LEGION_CONVERT_OK` is printed
only after the export returns, so a script that died halfway cannot be mistaken
for one that worked.

**Availability is a registry read**, not a launch: `HKLM:\SOFTWARE\Classes\<ProgID>`
or `HKCU:\SOFTWARE\Classes\<ProgID>` (per-user installs live in HKCU). All three
ProgIDs are probed in one PowerShell call and cached.

**Paths are translated, once.** On Windows a path is already a Windows path. In
WSL (dev and the Vitest suite) `wslpath -w` turns `/home/…` into the
`\\wsl.localhost\…` UNC path Office can open, which is what lets the Word engine
be integration-tested on this machine rather than only on the packaged build.
`powershell.exe` is found on the PATH when interop provides it and at
`/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe` when it does not.

Single quotes in a path are escaped by doubling (`psQuote`), which is the only
escaping a PowerShell single-quoted string has.

## The fallbacks

**`builtin-word` (.docx without Word).** mammoth reads the document's own XML and
emits semantic HTML — headings, lists, tables, embedded pictures as data: URIs —
which a hidden `BrowserWindow` prints with
`printToPDF({ pageSize: 'Letter', margins: { marginType: 'default' } })`. It
cannot reproduce Word's pagination, exact fonts, or pleading-paper line numbers,
because none of that is in the file; Word computes it at layout time. The
`ConvertSupport` note says exactly that, in plain English.

**`.html` without Word** is the same hidden window, `loadFile` + `printToPDF`.

**JavaScript is switched off** in that window (`webPreferences.javascript: false`)
and every asset is inlined as a `data:` URI. A converted document is someone
else's file: it must render, not run, and not reach anything else on the disk.

## Pictures: the sizing rule

`core/ops/image-to-pdf.ts`, one page per picture:

- The file records its own resolution (PNG `pHYs`, JPEG JFIF density, TIFF
  `XResolution`/`YResolution`) → **the page is the picture's real size**. A 600 ×
  900 px image at 300 DPI becomes a 2 × 3 inch page. This is what makes a 300 DPI
  scan of a letter come out 8.5 × 11.
- It records nothing, or something absurd (under 3 pt or over the PDF format's
  14 400 pt ceiling) → **fitted to a Letter page**, centred, aspect preserved.

PNG and JPEG are embedded by pdf-lib with no re-encode, so a 40 MB scan stays
exactly the picture the attorney was given.

**TIFF** is decoded page by page with `utif` (they are routinely multi-page:
fax servers and document scanners) and re-encoded as PNG with the repo's own
`core/redact/png-encode.ts`. The re-encode drops the resolution, so the TIFF's
own DPI is read out of the tags and passed alongside the bytes.

**BMP, GIF and WebP go to Chromium.** Electron's `nativeImage` was measured
first, on this machine (2026-09-15, Electron 43, a 200 × 140 fixture of each
format written by Pillow):

| Format | `nativeImage.createFromPath(...).isEmpty()` |
| --- | --- |
| `.png` | false — 200 × 140, 1 083 byte PNG |
| `.jpg` | false — 200 × 140, 5 956 byte PNG |
| `.bmp` | **true (empty)** |
| `.gif` | **true (empty)** |
| `.webp` | **true (empty)** |

nativeImage reads PNG and JPEG and nothing else, which is also what Electron's
own documentation says. Since PNG and JPEG never reach it (they are embedded
directly), a nativeImage step would be dead code, so there is none: those three
formats go straight to a hidden window as an `<img>` on a Letter page.

## Text

`core/ops/text-to-pdf.ts`: Letter, 1 inch margins, Courier 11 pt (Times is an
option), wrapped at the column, long unbroken words broken by character, a form
feed on its own line starts a page. The page count is verified against the saved
bytes like every other core op.

The built-in PDF fonts speak WinAnsi only. A character outside it (an emoji, a
Chinese name) is replaced with `?` and **counted** in `detail.unprintable` —
refusing to open a whole file over one stray glyph would be worse, and a silent
substitution nobody could count would be worse still. When Word is installed
`.txt` goes there instead and this does not arise.

## Verification proof

Everything below is verified in the suite; the rows marked *real app* were also
driven through the built Electron app on 2026-09-15 (`run-legion-pdf` driver,
tmux session `lpdf-convert`).

| Route | Evidence |
| --- | --- |
| `.docx` → Word COM | `office-com.test.ts` (runs for real when Word is reachable; text pulled back out with `pdftotext`). *Real app*: `letter.pdf`, 1 page, `filePath: null`, `dirty: true`, 48 705 bytes. |
| `.xlsx` → Excel COM | *Real app*: `damages.pdf`, 1 page, 56 914 bytes. |
| `.txt` → Word | *Real app*: `notes.pdf`, 1 page. |
| `.txt` → built-in | `core/ops/text-to-pdf.test.ts`, `text-engine.test.ts` |
| `.png` / `.jpg` | `image-to-pdf.test.ts`, `image-engine.test.ts`. *Real app*: 1 page each. |
| multi-page `.tif` | `image-engine.test.ts` (3-page fixture). *Real app*: 3-page TIFF → 3-page PDF. |
| `.bmp` / `.gif` / `.webp` | *Real app only* (needs Chromium): 1 page each. |
| `ops:merge` mixed list | `electron/ipc/ops-convert.test.ts` — PDF(3) + PNG + PDF(2) = 6 pages. |
| unsaved / Save As | `electron/services/doc-store-convert.test.ts` |
| unsupported type | *Real app*: "Legion PDF cannot open .xyz files." |
| `convert:progress` | `convert-file.test.ts`. *Real app*: `Converting scan.tif 0/1 → 1/3 → 2/3 → 3/3 → 3/3`. |

## Not covered by Vitest

`.bmp`, `.gif`, `.webp`, `.html` and the `builtin-word` fallback all need a
Chromium window, which does not exist in a Node test run. They are exercised in
the real app and in the Windows live QA pass. `builtin-word` additionally only
fires on a machine with no Word, which this one is not — it is covered by the
registry tests (ordering, availability, wording) and by the real-app check on a
Word-less machine at QA time.
