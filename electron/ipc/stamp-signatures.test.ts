import { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makePng } from '@core/ocr/png-fixture.testkit';
import { SignatureLibrary } from './stamp-signatures';

let root = '';
let sourceDirectory = '';

async function writePng(name: string, width = 240, height = 80): Promise<string> {
  const path = join(sourceDirectory, name);
  await writeFile(path, makePng({ width, height, channels: 4, paint: () => [0, 0, 0, 255] }));
  return path;
}

beforeEach(async () => {
  sourceDirectory = await mkdtemp(join(tmpdir(), 'librarius-sig-src-'));
  root = join(await mkdtemp(join(tmpdir(), 'librarius-sig-')), 'signatures');
});

afterEach(async () => {
  await rm(sourceDirectory, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
});

describe('SignatureLibrary', () => {
  it('starts empty rather than failing on a library that does not exist yet', async () => {
    expect(await new SignatureLibrary(root).list()).toEqual([]);
  });

  it('stores an imported PNG with its real dimensions', async () => {
    const library = new SignatureLibrary(root);
    const asset = await library.add(await writePng('sig.png', 300, 100), 'Full signature');

    expect(asset.label).toBe('Full signature');
    expect(asset.widthPx).toBe(300);
    expect(asset.heightPx).toBe(100);
    expect(asset.filePath.startsWith(root)).toBe(true);
    expect((await library.list()).map((stored) => stored.id)).toEqual([asset.id]);
  });

  it('keeps every signature in the library, in import order', async () => {
    const library = new SignatureLibrary(root);
    await library.add(await writePng('one.png'), 'Full signature');
    await library.add(await writePng('two.png'), 'Initials');
    expect((await library.list()).map((asset) => asset.label)).toEqual([
      'Full signature',
      'Initials',
    ]);
  });

  it('names an unlabelled import rather than storing a blank', async () => {
    const library = new SignatureLibrary(root);
    const asset = await library.add(await writePng('sig.png'), '   ');
    expect(asset.label).toBe('Signature');
  });

  it('copies the file rather than pointing at the original', async () => {
    const library = new SignatureLibrary(root);
    const source = await writePng('sig.png');
    const asset = await library.add(source, 'Full signature');
    await rm(source);
    expect((await library.bytesOf(asset.id)).byteLength).toBeGreaterThan(0);
  });

  it('hands back the exact bytes for a placement', async () => {
    const library = new SignatureLibrary(root);
    const source = await writePng('sig.png');
    const asset = await library.add(source, 'Full signature');
    const stored = await library.bytesOf(asset.id);
    expect(Buffer.from(stored).equals(await readFile(source))).toBe(true);
  });

  /**
   * The cleaned-up scan the import dialog draws on a canvas never existed as a
   * file, so it arrives as bytes. It passes exactly the same gate.
   */
  describe('adding from bytes', () => {
    const png = (width = 240, height = 80): Uint8Array =>
      makePng({ width, height, channels: 4, paint: () => [0, 0, 0, 255] });

    it('stores the bytes with their real dimensions', async () => {
      const library = new SignatureLibrary(root);
      const asset = await library.addBytes(png(300, 100), 'Cleaned signature');

      expect(asset.label).toBe('Cleaned signature');
      expect(asset.widthPx).toBe(300);
      expect(asset.heightPx).toBe(100);
      expect(asset.filePath.startsWith(root)).toBe(true);
    });

    it('writes the exact bytes it was handed', async () => {
      const library = new SignatureLibrary(root);
      const bytes = png();
      const asset = await library.addBytes(bytes, 'Cleaned signature');
      expect(Buffer.from(await library.bytesOf(asset.id)).equals(Buffer.from(bytes))).toBe(true);
    });

    it('carries the thumbnail back, like a file import does', async () => {
      const library = new SignatureLibrary(root);
      const asset = await library.addBytes(png(), 'Cleaned signature');
      expect(asset.dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('lands in the same list as a file import, in order', async () => {
      const library = new SignatureLibrary(root);
      await library.add(await writePng('one.png'), 'From a file');
      await library.addBytes(png(), 'From the canvas');
      expect((await library.list()).map((asset) => asset.label)).toEqual([
        'From a file',
        'From the canvas',
      ]);
    });

    it('names an unlabelled import rather than storing a blank', async () => {
      const asset = await new SignatureLibrary(root).addBytes(png(), '  ');
      expect(asset.label).toBe('Signature');
    });

    it('refuses bytes that are not a PNG, and stores nothing', async () => {
      const library = new SignatureLibrary(root);
      await expect(library.addBytes(new Uint8Array(200).fill(1), 'Bad')).rejects.toThrow(
        /not a PNG/
      );
      expect(await library.list()).toEqual([]);
    });

    it('refuses an empty buffer loudly rather than storing a zero-byte image', async () => {
      const library = new SignatureLibrary(root);
      await expect(library.addBytes(new Uint8Array(0), 'Empty')).rejects.toThrow(
        /came through empty/
      );
      expect(await library.list()).toEqual([]);
    });

    it('refuses bytes larger than the library allows', async () => {
      const huge = new Uint8Array(5 * 1024 * 1024 + 1);
      huge.set(png(4, 4));
      await expect(new SignatureLibrary(root).addBytes(huge, 'Huge')).rejects.toThrow(/under 5 MB/);
    });
  });

  describe('thumbnails', () => {
    it('carries the image inline so the renderer can show a real thumbnail', async () => {
      const library = new SignatureLibrary(root);
      const source = await writePng('sig.png');
      await library.add(source, 'Full signature');

      const [listed] = await library.listWithThumbnails();
      expect(listed?.dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
      const encoded = listed?.dataUrl?.split(',')[1] ?? '';
      expect(Buffer.from(encoded, 'base64').equals(await readFile(source))).toBe(true);
    });

    it('hands back a thumbnail with a fresh import, not only on the next list', async () => {
      const library = new SignatureLibrary(root);
      const source = await writePng('sig.png');
      const asset = await library.add(source, 'Full signature');
      const encoded = asset.dataUrl?.split(',')[1] ?? '';
      expect(Buffer.from(encoded, 'base64').equals(await readFile(source))).toBe(true);
    });

    it('keeps the image bytes out of the stored index', async () => {
      const library = new SignatureLibrary(root);
      await library.add(await writePng('sig.png'), 'Full signature');

      expect((await library.list()).map((stored) => stored.dataUrl)).toEqual([undefined]);
      expect(await readFile(join(root, 'index.json'), 'utf8')).not.toContain('dataUrl');
    });

    it('still lists a signature whose image has gone missing, minus its thumbnail', async () => {
      const library = new SignatureLibrary(root);
      const asset = await library.add(await writePng('sig.png'), 'Full signature');
      await rm(asset.filePath);

      const listed = await library.listWithThumbnails();
      expect(listed.map((stored) => stored.label)).toEqual(['Full signature']);
      expect(listed[0]?.dataUrl).toBeUndefined();
    });
  });

  describe('removing', () => {
    it('removes the chosen signature and hands back what is left', async () => {
      const library = new SignatureLibrary(root);
      const first = await library.add(await writePng('one.png'), 'Full signature');
      await library.add(await writePng('two.png'), 'Initials');

      const remaining = await library.remove(first.id);
      expect(remaining.map((stored) => stored.label)).toEqual(['Initials']);
      expect(remaining[0]?.dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
      expect((await library.list()).map((stored) => stored.label)).toEqual(['Initials']);
    });

    it('deletes the PNG from disk, not just the index entry', async () => {
      const library = new SignatureLibrary(root);
      const asset = await library.add(await writePng('sig.png'), 'Full signature');
      await library.remove(asset.id);
      await expect(access(asset.filePath)).rejects.toThrow();
    });

    it('rewrites the index atomically, leaving no half-written file behind', async () => {
      const library = new SignatureLibrary(root);
      const first = await library.add(await writePng('one.png'), 'Full signature');
      const second = await library.add(await writePng('two.png'), 'Initials');
      await library.remove(first.id);

      const files = await readdir(root);
      expect(files.filter((name) => name.endsWith('.tmp'))).toEqual([]);
      expect(files).toContain('index.json');
      const index: unknown = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'));
      expect(index).toMatchObject({ version: 1, signatures: [{ id: second.id }] });
    });

    it('drops the index entry even when the image is already gone', async () => {
      const library = new SignatureLibrary(root);
      const asset = await library.add(await writePng('sig.png'), 'Full signature');
      await rm(asset.filePath);
      expect(await library.remove(asset.id)).toEqual([]);
      expect(await library.list()).toEqual([]);
    });
  });

  describe('refusals', () => {
    it('refuses a file that is not a PNG', async () => {
      const library = new SignatureLibrary(root);
      const path = join(sourceDirectory, 'sig.jpg');
      await writeFile(path, Buffer.alloc(200, 1));
      await expect(library.add(path, 'Bad')).rejects.toThrow(/not a PNG/);
      expect(await library.list()).toEqual([]);
    });

    it('refuses a PNG larger than the library allows', async () => {
      const library = new SignatureLibrary(root);
      const path = join(sourceDirectory, 'huge.png');
      const huge = Buffer.alloc(5 * 1024 * 1024 + 1);
      huge.set(makePng({ width: 4, height: 4, channels: 4, paint: () => [0, 0, 0, 255] }));
      await writeFile(path, huge);
      await expect(library.add(path, 'Huge')).rejects.toThrow(/under 5 MB/);
    });

    it('refuses an import with no file chosen', async () => {
      await expect(new SignatureLibrary(root).add('  ', 'None')).rejects.toThrow(
        /No image was chosen/
      );
    });

    it('says so when a stored signature is asked for and is not there', async () => {
      await expect(new SignatureLibrary(root).bytesOf('missing')).rejects.toThrow(
        /no longer in your library/
      );
    });

    it('says so plainly when asked to remove a signature that is not there', async () => {
      const library = new SignatureLibrary(root);
      const kept = await library.add(await writePng('sig.png'), 'Full signature');
      await expect(library.remove('missing')).rejects.toThrow(/not in your library/);
      expect((await library.list()).map((stored) => stored.id)).toEqual([kept.id]);
    });

    it('reports a damaged library instead of silently starting over', async () => {
      const library = new SignatureLibrary(root);
      await library.add(await writePng('sig.png'), 'Full signature');
      await writeFile(join(root, 'index.json'), '{ not json');
      await expect(library.list()).rejects.toThrow(/damaged/);
    });
  });
});
