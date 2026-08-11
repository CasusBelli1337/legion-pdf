/**
 * LANE C (stamps) — the signature library on disk.
 *
 * Signatures are the attorney's own scanned ink, so they live in userData and
 * nowhere else: `<userData>/signatures/<uuid>.png` plus an `index.json` naming
 * them. Nothing is uploaded, nothing is copied into a document until a
 * placement is applied, and every import is checked to be a real PNG of sane
 * size before it is stored (core/stamps/png-asset.ts).
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SignatureAsset } from '@shared/types';
import { readPngInfo } from '@core/stamps';

const INDEX_FILE = 'index.json';

interface SignatureIndex {
  version: 1;
  signatures: SignatureAsset[];
}

function isAsset(value: unknown): value is SignatureAsset {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.label === 'string' &&
    typeof record.filePath === 'string' &&
    typeof record.widthPx === 'number' &&
    typeof record.heightPx === 'number' &&
    typeof record.createdAt === 'string'
  );
}

/** A stored PNG as inline bytes — the renderer is not allowed to read files. */
function dataUrlOf(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function parseIndex(text: string, path: string): SignatureAsset[] {
  const parsed: unknown = JSON.parse(text);
  const signatures = (parsed as Partial<SignatureIndex>)?.signatures;
  if (!Array.isArray(signatures)) {
    throw new Error(`The signature list at ${path} is not in a shape Librarius understands.`);
  }
  return signatures.filter(isAsset);
}

export class SignatureLibrary {
  constructor(private readonly root: string) {}

  private get indexPath(): string {
    return join(this.root, INDEX_FILE);
  }

  /** Every stored signature, newest last. An empty library is not an error. */
  async list(): Promise<SignatureAsset[]> {
    try {
      return parseIndex(await readFile(this.indexPath, 'utf8'), this.indexPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      if (error instanceof SyntaxError) {
        throw new Error(
          `The signature list at ${this.indexPath} is damaged. Delete that file to start a fresh library.`,
          { cause: error }
        );
      }
      throw error;
    }
  }

  /**
   * The library as the renderer needs it: every signature carrying its own
   * image inline. A signature whose PNG has gone missing is still listed — its
   * tile falls back to the label — so one lost file never hides the rest.
   */
  async listWithThumbnails(): Promise<SignatureAsset[]> {
    return Promise.all((await this.list()).map((asset) => this.withThumbnail(asset)));
  }

  /** Copies a PNG into the library. Rejects anything that is not a sane PNG. */
  async add(sourcePath: string, label: string): Promise<SignatureAsset> {
    if (sourcePath.trim().length === 0) {
      throw new Error('No image was chosen — pick a PNG of your signature to import.');
    }
    const bytes = new Uint8Array(await readFile(sourcePath));
    const info = readPngInfo(bytes);

    await mkdir(this.root, { recursive: true });
    const id = randomUUID();
    const filePath = join(this.root, `${id}.png`);
    await writeFile(filePath, bytes);

    const asset: SignatureAsset = {
      id,
      label: label.trim().length === 0 ? 'Signature' : label.trim(),
      filePath,
      widthPx: info.width,
      heightPx: info.height,
      createdAt: new Date().toISOString(),
    };
    await this.write([...(await this.list()), asset]);
    return this.withThumbnail(asset);
  }

  /**
   * Deletes a signature from the library: the index entry first, then the PNG.
   * That order matters — a crash in between leaves a stray file behind rather
   * than a library pointing at an image that is no longer on disk.
   */
  async remove(signatureId: string): Promise<SignatureAsset[]> {
    const signatures = await this.list();
    const asset = signatures.find((stored) => stored.id === signatureId);
    if (asset === undefined) {
      throw new Error(
        'That signature is not in your library — it may already have been removed. Nothing was changed.'
      );
    }
    await this.write(signatures.filter((stored) => stored.id !== signatureId));
    await unlink(asset.filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return this.listWithThumbnails();
  }

  /** The PNG bytes behind a stored signature, refusing loudly when it is gone. */
  async bytesOf(signatureId: string): Promise<Uint8Array> {
    const asset = (await this.list()).find((stored) => stored.id === signatureId);
    if (asset === undefined) {
      throw new Error('That signature is no longer in your library — import it again.');
    }
    try {
      return new Uint8Array(await readFile(asset.filePath));
    } catch (error) {
      throw new Error(
        `The image for "${asset.label}" is missing from ${asset.filePath} — import it again.`,
        { cause: error }
      );
    }
  }

  /** The stored PNG read back at response time, never cached in the index. */
  private async withThumbnail(asset: SignatureAsset): Promise<SignatureAsset> {
    try {
      return { ...asset, dataUrl: dataUrlOf(await readFile(asset.filePath)) };
    } catch {
      return asset;
    }
  }

  /** Atomic index write: a crash mid-save must not leave a half-written list. */
  private async write(signatures: SignatureAsset[]): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const index: SignatureIndex = { version: 1, signatures };
    const temporary = `${this.indexPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(index, null, 2));
      await rename(temporary, this.indexPath);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}
