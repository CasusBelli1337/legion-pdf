import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    expect(await library.list()).toEqual([asset]);
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

    it('reports a damaged library instead of silently starting over', async () => {
      const library = new SignatureLibrary(root);
      await library.add(await writePng('sig.png'), 'Full signature');
      await writeFile(join(root, 'index.json'), '{ not json');
      await expect(library.list()).rejects.toThrow(/damaged/);
    });
  });
});
