/**
 * The list arithmetic. A wrong index here reorders an exhibit set silently,
 * which is the worst kind of bug this panel could have.
 */

import { describe, expect, it } from 'vitest';
import type { DocumentSession } from '@shared/types';
import {
  entryForPath,
  entryForSession,
  fileNameOf,
  kindOf,
  moveBefore,
  moveBy,
  newEntries,
} from './combine-list';

const LIST = ['a', 'b', 'c', 'd'];

describe('moveBy', () => {
  it('steps a row up', () => {
    expect(moveBy(LIST, 2, -1)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('steps a row down', () => {
    expect(moveBy(LIST, 0, 1)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('does nothing at either end', () => {
    expect(moveBy(LIST, 0, -1)).toEqual(LIST);
    expect(moveBy(LIST, 3, 1)).toEqual(LIST);
  });

  it('never mutates the list it was given', () => {
    const original = [...LIST];
    moveBy(original, 1, 1);
    expect(original).toEqual(LIST);
  });
});

describe('moveBefore', () => {
  it('drops a row in front of a later one', () => {
    expect(moveBefore(LIST, 0, 3)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('drops a row in front of an earlier one', () => {
    expect(moveBefore(LIST, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('drops a row at the end of the list', () => {
    expect(moveBefore(LIST, 0, LIST.length)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('drops a row at the front of the list', () => {
    expect(moveBefore(LIST, 2, 0)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('leaves the order alone when the row is dropped where it already is', () => {
    expect(moveBefore(LIST, 1, 1)).toEqual(LIST);
    expect(moveBefore(LIST, 1, 2)).toEqual(LIST);
  });

  it('ignores a drag that starts or lands outside the list', () => {
    expect(moveBefore(LIST, 9, 1)).toEqual(LIST);
    expect(moveBefore(LIST, 1, 99)).toEqual(LIST);
    expect(moveBefore(LIST, 1, -3)).toEqual(LIST);
  });
});

describe('kindOf', () => {
  it("names the type in the attorney's words", () => {
    expect(kindOf('deposition.pdf')).toBe('PDF');
    expect(kindOf('Declaration of Ashford.DOCX')).toBe('Word');
    expect(kindOf('exhibit.jpeg')).toBe('Image');
    expect(kindOf('costs.xlsx')).toBe('Excel');
    expect(kindOf('slides.pptx')).toBe('PowerPoint');
    expect(kindOf('notes.txt')).toBe('Text');
  });

  it('says File rather than guessing at something unknown', () => {
    expect(kindOf('mystery.bin')).toBe('File');
    expect(kindOf('no-extension')).toBe('File');
  });
});

describe('fileNameOf', () => {
  it('reads a Windows path', () => {
    expect(fileNameOf('C:\\Matters\\Ashford\\Motion to Compel.pdf')).toBe('Motion to Compel.pdf');
  });

  it('reads a posix path', () => {
    expect(fileNameOf('/tmp/fixtures/exhibit-part-a.pdf')).toBe('exhibit-part-a.pdf');
  });
});

describe('entries', () => {
  const session: DocumentSession = {
    id: 'doc-1',
    filePath: null,
    fileName: 'combined.pdf',
    bytes: new Uint8Array([1]),
    pageCount: 9,
    dirty: true,
  };

  it('describes a file on disk without claiming to know its page count', () => {
    expect(entryForPath('C:\\a\\brief.docx')).toEqual({
      key: 'file:C:\\a\\brief.docx',
      label: 'brief.docx',
      kind: 'Word',
      pageCount: null,
      source: { filePath: 'C:\\a\\brief.docx' },
    });
  });

  it('describes an open document by its id, with the pages already known', () => {
    expect(entryForSession(session)).toEqual({
      key: 'doc:doc-1',
      label: 'combined.pdf',
      kind: 'PDF',
      pageCount: 9,
      source: { docId: 'doc-1' },
    });
  });

  it('keeps a file that is already listed from being combined with itself', () => {
    const listed = [entryForPath('/a/one.pdf')];
    const additions = [entryForPath('/a/one.pdf'), entryForPath('/a/two.pdf')];
    expect(newEntries(listed, additions).map((entry) => entry.label)).toEqual(['two.pdf']);
  });

  it('drops a repeat inside one batch too', () => {
    const additions = [entryForPath('/a/one.pdf'), entryForPath('/a/one.pdf')];
    expect(newEntries([], additions)).toHaveLength(1);
  });
});
