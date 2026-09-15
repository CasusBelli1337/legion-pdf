/**
 * Talking to Windows: PowerShell, and the path translation that makes a WSL
 * path something Word can open.
 *
 * In production this runs ON Windows and both halves are trivial —
 * `powershell.exe` is on the PATH and a path is already a Windows path. The
 * interesting case is development and the Vitest suite, which run in WSL2 on the
 * same machine: `powershell.exe` reaches the Windows host through interop (by
 * absolute path when the PATH carries no /mnt/c entries, which is this machine),
 * and `wslpath -w` turns /home/... into the \\wsl.localhost\... UNC path Office
 * can open. That is what lets the real Word COM path be integration-tested here
 * instead of only on the packaged build.
 *
 * Every spawn is async with a hard timeout. Office COM can hang on a modal
 * dialog nobody can see, and a frozen Legion PDF with no error is worse than
 * either a conversion that works or one that fails out loud.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ConvertFailedError } from './types';

/** Where WSL's interop layer exposes the Windows PowerShell that always exists. */
const WSL_POWERSHELL = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';

const BASE_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'];

let powerShellPath: string | null | undefined;

/** The PowerShell to spawn, or null when this computer has none to reach. */
export function resolvePowerShell(): string | null {
  if (powerShellPath !== undefined) return powerShellPath;
  if (process.platform === 'win32') {
    powerShellPath = 'powershell.exe';
  } else if (existsSync(WSL_POWERSHELL)) {
    powerShellPath = WSL_POWERSHELL;
  } else {
    powerShellPath = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'exit 0']).error
      ? null
      : 'powershell.exe';
  }
  return powerShellPath;
}

/** TEST SUPPORT: forget the cached probe so a suite can re-resolve. */
export function resetPowerShellCache(): void {
  powerShellPath = undefined;
}

/**
 * The path as Windows sees it. Identity on Windows; `wslpath -w` under WSL.
 * A path Windows cannot reach is a loud failure, never a silent wrong path.
 */
export function toWindowsPath(filePath: string): string {
  if (process.platform === 'win32') return filePath;
  const translated = spawnSync('wslpath', ['-w', filePath], { encoding: 'utf8' });
  const out = translated.stdout?.trim() ?? '';
  if (translated.error !== undefined || translated.status !== 0 || out === '') {
    throw new ConvertFailedError(
      `Could not work out the Windows location of ${filePath}, so Office could not open it.`
    );
  }
  return out;
}

/** PowerShell single-quoted strings escape a quote by doubling it. Nothing else. */
export function psQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export interface PowerShellResult {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runPowerShell(args: string[], timeoutMs: number): Promise<PowerShellResult> {
  const command = resolvePowerShell();
  if (command === null) {
    return Promise.reject(
      new ConvertFailedError('Windows PowerShell could not be found on this computer.')
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...BASE_ARGS, ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, timedOut });
    });
  });
}

/** Runs a .ps1 by path — the form Office conversion uses, so nothing is quoted twice. */
export function runPowerShellFile(
  scriptPath: string,
  timeoutMs: number
): Promise<PowerShellResult> {
  return runPowerShell(['-File', toWindowsPath(scriptPath)], timeoutMs);
}

/** One short command, for probes. Resolves '' when PowerShell cannot be run. */
export async function probePowerShell(command: string, timeoutMs = 20_000): Promise<string> {
  try {
    const result = await runPowerShell(['-Command', command], timeoutMs);
    return result.status === 0 && !result.timedOut ? result.stdout.trim() : '';
  } catch {
    return '';
  }
}
