import { describe, expect, it } from 'vitest';
import { scrubMetadata } from './scrub';
import { containsText, labelledPages, makeTestPdf } from './test-fixtures';

const EVERYTHING = { clearInfoDict: true, clearXmp: true, removeAttachments: true };
const XMP_PACKET =
  '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">' +
  '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description>' +
  '<dc:creator>XMP-AUTHOR-MARKER</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';

async function loadedDocument(): Promise<Uint8Array> {
  return makeTestPdf({
    pages: labelledPages(3, 'S', 300),
    info: {
      Author: 'INFO-AUTHOR-MARKER',
      Title: 'INFO-TITLE-MARKER',
      Producer: 'INFO-PRODUCER-MARKER',
      Creator: 'INFO-CREATOR-MARKER',
      Subject: 'INFO-SUBJECT-MARKER',
      Keywords: 'INFO-KEYWORDS-MARKER',
    },
    xmp: XMP_PACKET,
    attachments: [{ name: 'damages-model.txt', content: 'ATTACHED-SPREADSHEET-MARKER' }],
  });
}

describe('scrubMetadata', () => {
  it('leaves no author, title, or producer in the saved bytes', async () => {
    const source = await loadedDocument();
    for (const marker of ['INFO-AUTHOR-MARKER', 'INFO-TITLE-MARKER', 'INFO-PRODUCER-MARKER']) {
      expect(containsText(source, marker)).toBe(true);
    }

    const result = await scrubMetadata(source, EVERYTHING);

    for (const marker of [
      'INFO-AUTHOR-MARKER',
      'INFO-TITLE-MARKER',
      'INFO-PRODUCER-MARKER',
      'INFO-CREATOR-MARKER',
      'INFO-SUBJECT-MARKER',
      'INFO-KEYWORDS-MARKER',
    ]) {
      expect(containsText(result.bytes, marker)).toBe(false);
    }
  });

  it('reports every field it cleared and keeps the page count', async () => {
    const result = await scrubMetadata(await loadedDocument(), EVERYTHING);

    expect(result.pagesIn).toBe(3);
    expect(result.pagesOut).toBe(3);
    expect(result.detail.clearedFields).toEqual(
      expect.arrayContaining(['Author', 'Title', 'Producer', 'XMP metadata'])
    );
  });

  it('removes the XMP packet', async () => {
    const source = await loadedDocument();
    expect(containsText(source, 'XMP-AUTHOR-MARKER')).toBe(true);

    const result = await scrubMetadata(source, EVERYTHING);

    expect(containsText(result.bytes, 'XMP-AUTHOR-MARKER')).toBe(false);
  });

  it('warns about an attachment without removing it unless asked', async () => {
    const result = await scrubMetadata(await loadedDocument(), {
      clearInfoDict: true,
      clearXmp: true,
      removeAttachments: false,
    });

    expect(result.detail.attachmentsFound).toBe(1);
    expect(containsText(result.bytes, 'ATTACHED-SPREADSHEET-MARKER')).toBe(true);
  });

  it('removes the attachment and its contents when asked', async () => {
    const source = await loadedDocument();
    expect(containsText(source, 'ATTACHED-SPREADSHEET-MARKER')).toBe(true);

    const result = await scrubMetadata(source, EVERYTHING);

    expect(result.detail.attachmentsFound).toBe(1);
    expect(containsText(result.bytes, 'ATTACHED-SPREADSHEET-MARKER')).toBe(false);
    expect(result.detail.clearedFields).toContain('1 embedded file(s)');
  });

  it('leaves the metadata alone when the options say so', async () => {
    const result = await scrubMetadata(await loadedDocument(), {
      clearInfoDict: false,
      clearXmp: false,
      removeAttachments: false,
    });

    expect(result.detail.clearedFields).toEqual([]);
    expect(containsText(result.bytes, 'INFO-AUTHOR-MARKER')).toBe(true);
  });

  it('is safe to run on a document that has no metadata at all', async () => {
    const bare = await makeTestPdf({ pages: labelledPages(1) });
    const result = await scrubMetadata(bare, EVERYTHING);

    expect(result.pagesOut).toBe(1);
    expect(result.detail.attachmentsFound).toBe(0);
  });
});
