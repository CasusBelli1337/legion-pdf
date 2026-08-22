import { PDFDocument, PDFHexString, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { EsignField, EsignSigner } from '@shared/types';
import { buildFillableForm } from './fillable-form';

/** Two fictional signers — the repo is public, so no real parties ever. */
const SIGNERS: EsignSigner[] = [
  { id: 's1', name: 'Maria Vance', email: 'maria.vance@example.com' },
  { id: 's2', name: 'Declan Ruiz', email: 'declan.ruiz@example.com' },
];

/** One field of every kind, spread over both pages and both signers. */
const FIELDS: EsignField[] = [
  {
    id: 'f1',
    kind: 'name',
    signerId: 's1',
    page: 1,
    rect: { x: 72, y: 700, width: 200, height: 18 },
    required: true,
  },
  {
    id: 'f2',
    kind: 'date',
    signerId: 's1',
    page: 1,
    rect: { x: 300, y: 700, width: 100, height: 18 },
    required: false,
  },
  {
    id: 'f3',
    kind: 'text',
    signerId: 's2',
    page: 2,
    rect: { x: 72, y: 600, width: 200, height: 18 },
    label: 'Title',
    required: false,
  },
  {
    id: 'f4',
    kind: 'initials',
    signerId: 's2',
    page: 2,
    rect: { x: 300, y: 600, width: 40, height: 18 },
    required: true,
  },
  {
    id: 'f5',
    kind: 'signature',
    signerId: 's1',
    page: 1,
    rect: { x: 72, y: 500, width: 220, height: 50 },
    required: true,
  },
];

async function makeTwoPagePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.addPage([612, 792]);
  document.addPage([612, 792]);
  return document.save();
}

function annotationCount(document: PDFDocument, pageIndex: number): number {
  return document.getPage(pageIndex).node.Annots()?.size() ?? 0;
}

/** Every decodable stream in the document, as latin1 — content streams included. */
async function decodedStreams(bytes: Uint8Array): Promise<string> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  let all = '';
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream) {
      all += Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');
    }
  }
  return all;
}

/** Drawn text lands in the content stream as uppercase hex: `<5369...> Tj`. */
function drawnHex(text: string): string {
  return Buffer.from(text, 'latin1').toString('hex').toUpperCase();
}

describe('buildFillableForm', () => {
  it('creates one AcroForm text field per non-signature field, at its rectangle', async () => {
    const result = await buildFillableForm(await makeTwoPagePdf(), {
      signers: SIGNERS,
      fields: FIELDS,
    });

    expect(result.detail).toEqual({ fieldsCreated: 4, guidesDrawn: 1 });
    expect(result.pagesIn).toBe(2);
    expect(result.pagesOut).toBe(2);
    expect(result.bytes.byteLength).toBeGreaterThan(0);

    const reopened = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(reopened.getPageCount()).toBe(2);
    const form = reopened.getForm();
    expect(form.getFields()).toHaveLength(4);

    const nameField = form.getTextField('esign_1_name');
    const widget = nameField.acroField.getWidgets()[0];
    expect(widget).toBeDefined();
    // pdf-lib grows the widget by half the border width on each side, so the
    // box sits AT the requested rectangle rather than exactly equalling it.
    const rect = widget!.getRectangle();
    expect(Math.abs(rect.x - 72)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.y - 700)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.width - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.height - 18)).toBeLessThanOrEqual(1);
    form.getTextField('esign_2_date');
    form.getTextField('esign_3_text');
    form.getTextField('esign_4_initials');
  });

  it('puts each field widget on the page it was placed on', async () => {
    const result = await buildFillableForm(await makeTwoPagePdf(), {
      signers: SIGNERS,
      fields: FIELDS,
    });
    const reopened = await PDFDocument.load(result.bytes, { updateMetadata: false });
    // Page 1 holds the name + date widgets; the signature guide is page CONTENT,
    // never an annotation. Page 2 holds the text + initials widgets.
    expect(annotationCount(reopened, 0)).toBe(2);
    expect(annotationCount(reopened, 1)).toBe(2);
  });

  it('carries the required flag and a signer-naming tooltip on each field', async () => {
    const result = await buildFillableForm(await makeTwoPagePdf(), {
      signers: SIGNERS,
      fields: FIELDS,
    });
    const form = (await PDFDocument.load(result.bytes, { updateMetadata: false })).getForm();

    expect(form.getTextField('esign_1_name').isRequired()).toBe(true);
    expect(form.getTextField('esign_2_date').isRequired()).toBe(false);

    const alternate = form.getTextField('esign_3_text').acroField.dict.get(PDFName.of('TU'));
    expect(alternate).toBeInstanceOf(PDFHexString);
    expect((alternate as PDFHexString).decodeText()).toBe('Title — Declan Ruiz');
  });

  it('draws the signature guide as page content with a signer-naming label', async () => {
    const result = await buildFillableForm(await makeTwoPagePdf(), {
      signers: SIGNERS,
      fields: FIELDS,
    });
    // Decoding the content streams and finding the label proves the guide is
    // real ink on the page, not just a count in the detail.
    const content = await decodedStreams(result.bytes);
    expect(content).toContain(drawnHex('Sign here'));
    expect(content).toContain(drawnHex('Maria Vance'));
  });

  it('strips characters the built-in fonts cannot print instead of crashing', async () => {
    const signers: EsignSigner[] = [
      { id: 's1', name: 'Maria \u{1F31F} Vance', email: 'maria.vance@example.com' },
    ];
    const fields: EsignField[] = [
      {
        id: 'f1',
        kind: 'signature',
        signerId: 's1',
        page: 1,
        rect: { x: 72, y: 500, width: 220, height: 50 },
        required: true,
      },
    ];
    const result = await buildFillableForm(await makeTwoPagePdf(), { signers, fields });
    expect(result.detail).toEqual({ fieldsCreated: 0, guidesDrawn: 1 });
    expect(await decodedStreams(result.bytes)).toContain(drawnHex('Vance'));
  });

  it('names the page when a field sits outside the document', async () => {
    const fields: EsignField[] = [{ ...FIELDS[0]!, page: 5 }];
    await expect(
      buildFillableForm(await makeTwoPagePdf(), { signers: SIGNERS, fields })
    ).rejects.toThrow(/page 5, but this document has only 2 page/);
  });

  it('refuses a field whose signer is not on the request', async () => {
    const fields: EsignField[] = [{ ...FIELDS[0]!, signerId: 'ghost' }];
    await expect(
      buildFillableForm(await makeTwoPagePdf(), { signers: SIGNERS, fields })
    ).rejects.toThrow(/belongs to a signer who is not on this request/);
  });

  it('refuses a zero-size box loudly', async () => {
    const fields: EsignField[] = [{ ...FIELDS[0]!, rect: { x: 72, y: 700, width: 0, height: 18 } }];
    await expect(
      buildFillableForm(await makeTwoPagePdf(), { signers: SIGNERS, fields })
    ).rejects.toThrow(/has no size/);
  });

  it('refuses an empty field list outright', async () => {
    await expect(
      buildFillableForm(await makeTwoPagePdf(), { signers: SIGNERS, fields: [] })
    ).rejects.toThrow('No fields were placed');
  });

  it('validates every placement before touching the document', async () => {
    // First field is fine; second is out of range — nothing may be created.
    const fields: EsignField[] = [FIELDS[0]!, { ...FIELDS[1]!, page: 9 }];
    await expect(
      buildFillableForm(await makeTwoPagePdf(), { signers: SIGNERS, fields })
    ).rejects.toThrow(/page 9/);
  });
});
