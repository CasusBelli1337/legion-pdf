/// <reference types="node" />
/**
 * Real Word, reached from WSL. The `docx-render` skill's script drives the
 * Windows host's Word through PowerShell COM and exports a PDF; this wraps it
 * for the suite, refusing a soffice fallback (LibreOffice lies about fonts and
 * header frames — the exact things the suite measures) and copying the .docx
 * to a short scratch path first, because Word COM fails silently past ~260
 * characters of \\wsl.localhost path.
 */

import { execFile } from 'node:child_process';
import { existsSync, globSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const RENDER_SCRIPT = path.join(homedir(), '.claude/skills/docx-render/docx_to_pdf.sh');
const POWERSHELL = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';

/** Word on the host, PowerShell to reach it, the skill to drive it — and not switched off. */
export function wordReachable(): boolean {
  if (process.env.WORD_E2E === '0') return false;
  if (!existsSync(RENDER_SCRIPT) || !existsSync(POWERSHELL)) return false;
  return globSync('/mnt/c/Program Files*/Microsoft Office/root/Office*/WINWORD.EXE').length > 0;
}

export function popplerReachable(): boolean {
  return ['pdftotext', 'pdftoppm', 'pdfinfo'].every((tool) =>
    (process.env.PATH ?? '').split(':').some((dir) => existsSync(path.join(dir, tool)))
  );
}

/**
 * Renders a .docx to PDF with real Word; resolves with the PDF's path. Throws
 * when Word did not do the rendering — a fallback would grade the wrong thing.
 */
export async function renderWithWord(docxPath: string, outDir: string): Promise<string> {
  const scratch = await mkdtemp(path.join(tmpdir(), 'wx-'));
  const shortDocx = path.join(scratch, 'd.docx');
  await copyFile(docxPath, shortDocx);
  const { stdout, stderr } = await run('bash', [RENDER_SCRIPT, shortDocx, scratch], {
    timeout: 240_000,
    maxBuffer: 1 << 24,
  });
  const log = `${stdout}\n${stderr}`;
  if (!/Rendered \(real Word\)/.test(log)) {
    throw new Error(`Word did not render ${path.basename(docxPath)}:\n${log.slice(-800)}`);
  }
  await mkdir(outDir, { recursive: true });
  const pdfPath = path.join(outDir, `${path.basename(docxPath, '.docx')}.pdf`);
  await copyFile(path.join(scratch, 'd.pdf'), pdfPath);
  return pdfPath;
}

/** Every page of a PDF as `<prefix>-<n>.png` at the given DPI, via poppler. */
export async function rasterizePages(pdfPath: string, prefix: string, dpi = 100): Promise<void> {
  await mkdir(path.dirname(prefix), { recursive: true });
  await run('pdftoppm', ['-r', String(dpi), '-png', pdfPath, prefix], { timeout: 120_000 });
}

export async function pageCountOf(pdfPath: string): Promise<number> {
  const { stdout } = await run('pdfinfo', [pdfPath]);
  const count = Number(/Pages:\s+(\d+)/.exec(stdout)?.[1] ?? NaN);
  if (!Number.isFinite(count)) throw new Error(`pdfinfo gave no page count for ${pdfPath}`);
  return count;
}
