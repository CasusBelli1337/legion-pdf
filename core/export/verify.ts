/**
 * The export proves its own work before it is handed over. A .docx is a zip;
 * the document is re-opened and read back, and the file is refused unless it
 * holds at least the paragraphs that were built and the text the first run of
 * each of them carries. A Word file that opens fine and is missing a page is
 * the failure this codebase fears most — it looks exactly like success.
 */

import JSZip from 'jszip';

export interface DocxExpectations {
  paragraphCount: number;
  /** Plain text the document must contain, verbatim. */
  samples: readonly string[];
  /** Footnotes the file must hold, when the document has any. */
  footnotes?: number;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A paragraph opening tag: `<w:p>`, `<w:p ...>`, or the empty `<w:p/>`. */
const PARAGRAPH_TAG = /<w:p(?=[\s/>])/g;

/** The document XML inside a .docx, or a loud refusal. */
export async function documentXmlOf(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file('word/document.xml');
  if (entry === null) throw new Error('The Word file has no document inside it.');
  return entry.async('string');
}

/** A footnote the attorney can see: every one but the separators, which carry a type. */
const FOOTNOTE_TAG = /<w:footnote w:id="\d+">/g;

async function verifyFootnotes(bytes: Uint8Array, expected: number): Promise<void> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = (await zip.file('word/footnotes.xml')?.async('string')) ?? '';
  const held = xml.match(FOOTNOTE_TAG)?.length ?? 0;
  if (held !== expected) {
    throw new Error(
      `The Word file holds ${held} footnotes where ${expected} were built — refusing to hand it over.`
    );
  }
}

/** Throws in plain English when the bytes do not hold what was built. */
export async function verifyDocx(bytes: Uint8Array, expected: DocxExpectations): Promise<void> {
  if (bytes.byteLength === 0) throw new Error('The Word file came out empty.');
  const xml = await documentXmlOf(bytes);
  const paragraphs = xml.match(PARAGRAPH_TAG)?.length ?? 0;
  if (paragraphs < expected.paragraphCount) {
    throw new Error(
      `The Word file holds ${paragraphs} paragraphs where ${expected.paragraphCount} were built — refusing to hand it over.`
    );
  }
  if ((expected.footnotes ?? 0) > 0) await verifyFootnotes(bytes, expected.footnotes ?? 0);
  const missing = expected.samples.find((sample) => !xml.includes(escapeXml(sample)));
  if (missing !== undefined) {
    throw new Error(
      `The text "${missing}" did not make it into the Word file — refusing to hand it over.`
    );
  }
}
