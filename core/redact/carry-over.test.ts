import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { BookmarkNode } from '@shared/types';
import { REDACTED_TITLE, carryMetadata, redactTitles } from './carry-over';

const SECRET = 'SSN 545-45-6789';

const TREE: BookmarkNode[] = [
  {
    title: `Account ${SECRET}`,
    page: 1,
    children: [{ title: 'Closing statement', page: 2, children: [] }],
  },
  { title: 'Exhibit A', page: 3, children: [] },
];

describe('redactTitles', () => {
  it('silences a title that quotes destroyed text', () => {
    expect(redactTitles(TREE, [SECRET])[0]?.title).toBe(REDACTED_TITLE);
  });

  it('leaves clean titles and the tree shape alone', () => {
    const redacted = redactTitles(TREE, [SECRET]);
    expect(redacted[0]?.children[0]?.title).toBe('Closing statement');
    expect(redacted[1]?.title).toBe('Exhibit A');
    expect(redacted[0]?.page).toBe(1);
  });

  it('matches regardless of case', () => {
    expect(redactTitles(TREE, ['ssn 545-45-6789'])[0]?.title).toBe(REDACTED_TITLE);
  });

  it('changes nothing when nothing was marked', () => {
    expect(redactTitles(TREE, [])).toEqual(TREE);
  });

  it('silences a nested title too', () => {
    const nested: BookmarkNode[] = [
      { title: 'Public', page: 1, children: [{ title: SECRET, page: 2, children: [] }] },
    ];
    expect(redactTitles(nested, [SECRET])[0]?.children[0]?.title).toBe(REDACTED_TITLE);
  });
});

describe('carryMetadata', () => {
  async function documents(): Promise<[PDFDocument, PDFDocument]> {
    const source = await PDFDocument.create({ updateMetadata: false });
    source.setAuthor('Rothrock Legal');
    source.setTitle(`File for ${SECRET}`);
    source.setSubject('Production set 3');
    const target = await PDFDocument.create({ updateMetadata: false });
    return [source, target];
  }

  it('copies the fields that do not quote destroyed text', async () => {
    const [source, target] = await documents();
    const carried = carryMetadata(source, target, [SECRET]);
    expect(carried.copied).toEqual(['Author', 'Subject']);
    expect(target.getAuthor()).toBe('Rothrock Legal');
    expect(target.getSubject()).toBe('Production set 3');
  });

  it('drops the field that quotes the secret rather than carrying it across', async () => {
    const [source, target] = await documents();
    const carried = carryMetadata(source, target, [SECRET]);
    expect(carried.dropped).toEqual(['Title']);
    expect(target.getTitle()).toBeUndefined();
  });

  it('copies everything when nothing was marked', async () => {
    const [source, target] = await documents();
    expect(carryMetadata(source, target, []).dropped).toEqual([]);
    expect(target.getTitle()).toBe(`File for ${SECRET}`);
  });
});
