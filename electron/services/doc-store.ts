/**
 * The main-process byte store: single source of truth for every open document.
 * The renderer holds a structured-clone copy for pdfjs; every mutation lands
 * here first. No Electron APIs — paths and helpers are injected so this is
 * fully unit-testable in plain Node.
 */

import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import type {
  DocumentSession,
  DocumentSummary,
  RecentFile,
  SaveResult,
  UndoResult,
  UndoState,
} from '@shared/types';
import { countPages as defaultCountPages } from '@core/pdf-meta';
import { writeFileAtomic } from './atomic-write';
import { DocumentHistory } from './doc-history';
import { RecentFilesStore } from './recent-files';

export interface DocStoreOptions {
  /** Absolute path of the recent-files JSON (userData in production). */
  recentFilePath: string;
  maxRecent?: number;
  /** Injectable for tests; defaults to the pdf-lib page counter in core/. */
  countPages?: (bytes: Uint8Array) => Promise<number>;
}

interface StoredDocument {
  id: string;
  filePath: string | null;
  fileName: string;
  bytes: Uint8Array;
  pageCount: number;
  dirty: boolean;
  /** Undo/redo snapshots for this document only; dropped when it closes. */
  history: DocumentHistory;
  /**
   * The exact byte array last written to (or read from) disk. Undoing back onto
   * it makes the document clean again, so the attorney is not asked about
   * "unsaved changes" they have already stepped out of.
   */
  savedBytes: Uint8Array | null;
}

/** Thrown when a docId is not in the store — always a caller bug, never silent. */
export class UnknownDocumentError extends Error {
  readonly code = 'UNKNOWN_DOCUMENT';
  constructor(docId: string) {
    super(`No open document with id ${docId}.`);
    this.name = 'UnknownDocumentError';
  }
}

export class DocStore {
  private readonly documents = new Map<string, StoredDocument>();
  private readonly recentFiles: RecentFilesStore;
  private readonly countPages: (bytes: Uint8Array) => Promise<number>;

  constructor(options: DocStoreOptions) {
    this.recentFiles = new RecentFilesStore(options.recentFilePath, options.maxRecent);
    this.countPages = options.countPages ?? defaultCountPages;
  }

  /** Reads a PDF off disk into the store and records it as recently opened. */
  async openFile(filePath: string): Promise<DocumentSession> {
    const bytes = new Uint8Array(await readFile(filePath));
    const pageCount = await this.countPages(bytes);
    const document: StoredDocument = {
      id: randomUUID(),
      filePath,
      fileName: basename(filePath),
      bytes,
      pageCount,
      dirty: false,
      history: new DocumentHistory(),
      savedBytes: bytes,
    };
    this.documents.set(document.id, document);
    this.recentFiles.record(filePath);
    return toSession(document);
  }

  /** Registers bytes with no file behind them yet (a merge result, for example). */
  async adopt(bytes: Uint8Array, fileName: string): Promise<DocumentSession> {
    const pageCount = await this.countPages(bytes);
    const document: StoredDocument = {
      id: randomUUID(),
      filePath: null,
      fileName,
      bytes,
      pageCount,
      dirty: true,
      history: new DocumentHistory(),
      savedBytes: null,
    };
    this.documents.set(document.id, document);
    return toSession(document);
  }

  has(docId: string): boolean {
    return this.documents.has(docId);
  }

  session(docId: string): DocumentSession {
    return toSession(this.require(docId));
  }

  bytes(docId: string): Uint8Array {
    return this.require(docId).bytes;
  }

  /** Built off `toSession` so store-internal fields (history) can never leak out. */
  list(): DocumentSummary[] {
    return [...this.documents.values()].map((document) => {
      const { bytes: _bytes, ...summary } = toSession(document);
      return summary;
    });
  }

  /**
   * Swaps in post-op bytes and marks the document dirty. Rejects empty output.
   * The version being replaced goes on the undo stack first: this is the one
   * door every mutation passes through, so Undo covers all of them by
   * construction rather than by each op remembering to record itself.
   */
  async setBytes(docId: string, bytes: Uint8Array): Promise<DocumentSession> {
    const document = this.require(docId);
    if (bytes.byteLength === 0) {
      throw new Error(`Refusing to store an empty result for ${document.fileName}.`);
    }
    document.history.record(document.bytes);
    document.bytes = bytes;
    document.pageCount = await this.countPages(bytes);
    document.dirty = true;
    return toSession(document);
  }

  /** Writes over the document's own path. Throws when it has never been saved. */
  async save(docId: string): Promise<SaveResult> {
    const document = this.require(docId);
    if (document.filePath === null) {
      throw new Error(`${document.fileName} has no file on disk yet — use Save As.`);
    }
    return this.saveTo(docId, document.filePath);
  }

  /** Atomic write: temp file in the target directory, then rename over the target. */
  async saveTo(docId: string, filePath: string): Promise<SaveResult> {
    const document = this.require(docId);
    await writeFileAtomic(filePath, document.bytes);
    document.filePath = filePath;
    document.fileName = basename(filePath);
    document.dirty = false;
    // Saving is not an edit: the history survives it, so the attorney can still
    // step back through what they did before the save.
    document.savedBytes = document.bytes;
    this.recentFiles.record(filePath);
    return {
      filePath,
      byteLength: document.bytes.byteLength,
      savedAt: new Date().toISOString(),
    };
  }

  /** Steps the document back one edit. `applied: false` means there was none. */
  async undo(docId: string): Promise<UndoResult> {
    return this.step(this.require(docId), 'back');
  }

  /** Steps the document forward into the edit that was last undone. */
  async redo(docId: string): Promise<UndoResult> {
    return this.step(this.require(docId), 'forward');
  }

  undoState(docId: string): UndoState {
    return this.require(docId).history.state;
  }

  close(docId: string): void {
    this.documents.get(docId)?.history.clear();
    this.documents.delete(docId);
  }

  recent(): RecentFile[] {
    return this.recentFiles.list();
  }

  clearRecent(): RecentFile[] {
    return this.recentFiles.clear();
  }

  /**
   * Restores a snapshot with the same sanity the forward path applies: real
   * bytes and a real page count, both re-derived from what is being restored. A
   * restore that produced an empty or unreadable document would be exactly the
   * silent data loss undo exists to prevent, so it throws instead — and it
   * validates BEFORE the history moves, so a refused restore leaves both the
   * document and its history untouched.
   */
  private async step(document: StoredDocument, direction: 'back' | 'forward'): Promise<UndoResult> {
    const history = document.history;
    const restored = direction === 'back' ? history.peekBack() : history.peekForward();
    if (restored === null) return { applied: false, ...history.state };
    if (restored.byteLength === 0) {
      throw new Error(`Refusing to restore an empty version of ${document.fileName}.`);
    }
    const pageCount = await this.countPages(restored);
    if (pageCount === 0) {
      throw new Error(`Refusing to restore a 0-page version of ${document.fileName}.`);
    }
    if (direction === 'back') history.stepBack(document.bytes);
    else history.stepForward(document.bytes);
    document.bytes = restored;
    document.pageCount = pageCount;
    document.dirty = restored !== document.savedBytes;
    return { applied: true, ...history.state };
  }

  private require(docId: string): StoredDocument {
    const document = this.documents.get(docId);
    if (document === undefined) throw new UnknownDocumentError(docId);
    return document;
  }
}

function toSession(document: StoredDocument): DocumentSession {
  return {
    id: document.id,
    filePath: document.filePath,
    fileName: document.fileName,
    bytes: document.bytes,
    pageCount: document.pageCount,
    dirty: document.dirty,
  };
}
