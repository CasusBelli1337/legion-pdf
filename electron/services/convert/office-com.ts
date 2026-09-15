/**
 * Word, Excel and PowerPoint, driven over COM from PowerShell.
 *
 * WHY this and not a JavaScript converter: the attorney's document has to come
 * out looking exactly like it does when they press Save as PDF in Word — same
 * fonts, same pagination, same tracked-change state, same pleading-paper line
 * numbers. Nothing short of Word itself does that. So when Office is installed
 * we use it, and the pure-JS paths are the fallback for machines without it.
 *
 * Config over code: a fourth Office app would be a fourth row in OFFICE_APPS.
 * The script shape (open read-only, export, close, quit, print a sentinel) is
 * written once and shared.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PRESENTATION_EXTENSIONS,
  SPREADSHEET_EXTENSIONS,
  TEXT_EXTENSIONS,
  WORD_EXTENSIONS,
} from '@shared/convert-inputs';
import { withTempDir } from './temp-workspace';
import {
  probePowerShell,
  psQuote,
  resolvePowerShell,
  runPowerShellFile,
  toWindowsPath,
} from './windows-shell';
import { ConvertFailedError, type ConvertEngine, type ConvertJob } from './types';

/** Office COM can sit on an invisible dialog forever; two minutes is the ceiling. */
const TIMEOUT_MS = 120_000;
/** Printed only when the export actually finished — the proof, not the exit code. */
const SENTINEL = 'LEGION_CONVERT_OK';

interface OfficeApp {
  id: string;
  label: string;
  /** The registry key whose presence means the app is installed. */
  progId: string;
  extensions: readonly string[];
  /** What the attorney is told when this app is missing. */
  missingNote: string;
  /** The open/export/close middle of the script; paths are already quoted. */
  body(input: string, output: string): string;
}

const OFFICE_APPS: readonly OfficeApp[] = [
  {
    id: 'word',
    label: 'Microsoft Word',
    progId: 'Word.Application',
    extensions: [...WORD_EXTENSIONS, ...TEXT_EXTENSIONS],
    missingNote:
      'Microsoft Word is not installed on this computer, so Word documents open through the ' +
      'built-in converter instead.',
    // wdExportFormatPDF = 17. Open(FileName, ConfirmConversions, ReadOnly,
    // AddToRecentFiles) — no conversion prompt, no edit, no trace in Word's
    // recent list. Close(0) = wdDoNotSaveChanges.
    body: (input, output) => `$app = New-Object -ComObject Word.Application
$app.Visible = $false
$app.DisplayAlerts = 0
$doc = $null
try {
  $doc = $app.Documents.Open(${input}, $false, $true, $false)
  $doc.ExportAsFixedFormat(${output}, 17)
} finally {
  if ($doc -ne $null) { $doc.Close(0) }
  $app.Quit()
}`,
  },
  {
    id: 'excel',
    label: 'Microsoft Excel',
    progId: 'Excel.Application',
    extensions: SPREADSHEET_EXTENSIONS,
    missingNote: 'Microsoft Excel is not installed on this computer.',
    // xlTypePDF = 0. Open(Filename, UpdateLinks, ReadOnly) — links stay as saved
    // so the sheet is not silently recalculated against files that moved.
    body: (input, output) => `$app = New-Object -ComObject Excel.Application
$app.Visible = $false
$app.DisplayAlerts = $false
$book = $null
try {
  $book = $app.Workbooks.Open(${input}, 0, $true)
  $book.ExportAsFixedFormat(0, ${output})
} finally {
  if ($book -ne $null) { $book.Close($false) }
  $app.Quit()
}`,
  },
  {
    id: 'powerpoint',
    label: 'Microsoft PowerPoint',
    progId: 'PowerPoint.Application',
    extensions: PRESENTATION_EXTENSIONS,
    missingNote: 'Microsoft PowerPoint is not installed on this computer.',
    // ppFixedFormatTypePDF = 2. Open(FileName, ReadOnly, Untitled, WithWindow) —
    // PowerPoint refuses to be made invisible, so it is opened window-less.
    body: (input, output) => `$app = New-Object -ComObject PowerPoint.Application
$deck = $null
try {
  $deck = $app.Presentations.Open(${input}, $true, $false, $false)
  $deck.ExportAsFixedFormat(${output}, 2)
} finally {
  if ($deck -ne $null) { $deck.Close() }
  $app.Quit()
}`,
  },
];

function script(app: OfficeApp, inputPath: string, outputPath: string): string {
  const body = app.body(psQuote(toWindowsPath(inputPath)), psQuote(toWindowsPath(outputPath)));
  return `$ErrorActionPreference = 'Stop'\n${body}\nWrite-Output '${SENTINEL}'\n`;
}

let installed: Promise<ReadonlySet<string>> | null = null;

/**
 * Which Office apps this computer has, in ONE probe. A ProgID under
 * HKLM\SOFTWARE\Classes (machine-wide) or HKCU\SOFTWARE\Classes (per-user
 * install) is what "installed" means to COM, and it is far cheaper to ask than
 * to start Word and see.
 */
function probeInstalledApps(): Promise<ReadonlySet<string>> {
  if (installed !== null) return installed;
  if (resolvePowerShell() === null) {
    installed = Promise.resolve(new Set<string>());
    return installed;
  }
  const ids = OFFICE_APPS.map((app) => `'${app.progId}'`).join(',');
  installed = probePowerShell(
    `foreach ($id in ${ids}) { if ((Test-Path "HKLM:\\SOFTWARE\\Classes\\$id") -or ` +
      `(Test-Path "HKCU:\\SOFTWARE\\Classes\\$id")) { Write-Output $id } }`
  ).then(
    (stdout) =>
      new Set(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      )
  );
  return installed;
}

/** TEST SUPPORT: forget the cached probe so a suite can re-resolve. */
export function resetOfficeCache(): void {
  installed = null;
}

/** The one question the built-in Word fallback has to ask before offering itself. */
export async function wordIsInstalled(): Promise<boolean> {
  return (await probeInstalledApps()).has('Word.Application');
}

async function exportWithOffice(app: OfficeApp, job: ConvertJob): Promise<Uint8Array> {
  return withTempDir(app.id, async (directory) => {
    const scriptPath = join(directory, 'convert.ps1');
    const outputPath = join(directory, 'converted.pdf');
    await writeFile(scriptPath, script(app, job.filePath, outputPath), 'utf8');
    const result = await runPowerShellFile(scriptPath, TIMEOUT_MS);
    if (result.timedOut) {
      throw new ConvertFailedError(
        `${app.label} did not finish converting ${job.fileName} within two minutes. It may be ` +
          'waiting on a dialog — try opening the file in ' +
          `${app.label} first, then close it and try again.`
      );
    }
    if (result.status !== 0 || !result.stdout.includes(SENTINEL)) {
      throw new ConvertFailedError(
        `${app.label} could not convert ${job.fileName}. ${firstLine(result.stderr)}`.trim()
      );
    }
    return new Uint8Array(await readFile(outputPath));
  });
}

/** PowerShell errors are pages of stack; the attorney gets the sentence. */
function firstLine(stderr: string): string {
  const line = stderr.split(/\r?\n/).find((entry) => entry.trim().length > 0) ?? '';
  return line.trim().slice(0, 200);
}

function toEngine(app: OfficeApp): ConvertEngine {
  return {
    id: app.id,
    label: app.label,
    extensions: app.extensions,
    note: (available) =>
      available
        ? `${app.label} is installed, so these files convert exactly the way its own ` +
          'Save as PDF does.'
        : app.missingNote,
    available: async () => (await probeInstalledApps()).has(app.progId),
    run: (job) => exportWithOffice(app, job),
  };
}

export const OFFICE_ENGINES: readonly ConvertEngine[] = OFFICE_APPS.map(toEngine);
