/**
 * The main-process byte store: single source of truth for every open document.
 * The renderer holds a structured-clone copy for pdfjs; every mutation lands
 * here first. No Electron APIs — paths and helpers are injected so this is
 * fully unit-testable in plain Node.
 */

import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import type { DocumentSession, DocumentSummary, RecentFile, SaveResult } from '@shared/types';
import { countPages as defaultCountPages } from '@core/pdf-meta';
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

  list(): DocumentSummary[] {
    return [...this.documents.values()].map(({ bytes: _bytes, ...summary }) => summary);
  }

  /** Swaps in post-op bytes and marks the document dirty. Rejects empty output. */
  async setBytes(docId: string, bytes: Uint8Array): Promise<DocumentSession> {
    const document = this.require(docId);
    if (bytes.byteLength === 0) {
      throw new Error(`Refusing to store an empty result for ${document.fileName}.`);
    }
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
    const temporaryPath = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, document.bytes);
      await rename(temporaryPath, filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    document.filePath = filePath;
    document.fileName = basename(filePath);
    document.dirty = false;
    this.recentFiles.record(filePath);
    return {
      filePath,
      byteLength: document.bytes.byteLength,
      savedAt: new Date().toISOString(),
    };
  }

  close(docId: string): void {
    this.documents.delete(docId);
  }

  recent(): RecentFile[] {
    return this.recentFiles.list();
  }

  clearRecent(): RecentFile[] {
    return this.recentFiles.clear();
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
