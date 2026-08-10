/**
 * Recent-files list, persisted as JSON under app.getPath('userData').
 * Path is injected so the store is unit-testable without Electron.
 */

import { basename, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { RecentFile } from '@shared/types';

const DEFAULT_MAX = 12;

function isRecentFile(value: unknown): value is RecentFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['filePath'] === 'string' &&
    typeof candidate['fileName'] === 'string' &&
    typeof candidate['openedAt'] === 'string'
  );
}

export class RecentFilesStore {
  private readonly storePath: string;
  private readonly max: number;

  constructor(storePath: string, max: number = DEFAULT_MAX) {
    this.storePath = storePath;
    this.max = Math.max(1, max);
  }

  /** Never throws: a missing or corrupt file reads as an empty list. */
  list(): RecentFile[] {
    if (!existsSync(this.storePath)) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.storePath, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter(isRecentFile).slice(0, this.max) : [];
    } catch {
      return [];
    }
  }

  /** Moves `filePath` to the front, de-duplicating, and returns the new list. */
  record(filePath: string, now: Date = new Date()): RecentFile[] {
    const entry: RecentFile = {
      filePath,
      fileName: basename(filePath),
      openedAt: now.toISOString(),
    };
    const next = [entry, ...this.list().filter((item) => item.filePath !== filePath)].slice(
      0,
      this.max
    );
    this.write(next);
    return next;
  }

  clear(): RecentFile[] {
    this.write([]);
    return [];
  }

  private write(list: RecentFile[]): void {
    const directory = dirname(this.storePath);
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
    writeFileSync(this.storePath, JSON.stringify(list, null, 2), 'utf8');
  }
}
