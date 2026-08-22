/**
 * "Export fillable": builds a COPY of the document that a recipient can
 * complete in Acrobat or any other viewer. Name / date / text / initials
 * become REAL AcroForm text fields; a signature spot becomes a drawn guide box
 * (page content, not a field) labelled for its signer, because no plain
 * AcroForm field gives a cross-viewer ink signature — Fill & Sign does.
 *
 * Pure over bytes and Node-safe: no Electron, no DOM, no React (core zone).
 * Every placement is validated LOUDLY against the real document before
 * anything is touched, and the output is reopened to prove the fields landed.
 */

import { PDFHexString, PDFName, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFForm, PDFPage, PDFTextField } from 'pdf-lib';
import type {
  EsignField,
  EsignFieldKind,
  EsignSigner,
  FillableFormDetail,
  FillableFormOptions,
  OpResult,
} from '@shared/types';
import { finish, loadPdf } from '../ops/pdf-io';
import type { ProgressReporter } from '../ops/pdf-io';

const FIELD_FONT_SIZE = 10;
const GUIDE_LABEL_SIZE = 7;
const GUIDE_LABEL_INSET = 3;
/** Thin light gray, visible in Acrobat without shouting over the document. */
const BOX_GRAY = rgb(0.72, 0.72, 0.72);
const LABEL_GRAY = rgb(0.45, 0.45, 0.45);
const FIELD_BORDER_WIDTH = 0.75;
const GUIDE_BORDER_WIDTH = 1;

/** Tooltip wording per kind; a 'text' field prefers its own label. */
const KIND_PROMPTS: Record<EsignFieldKind, string> = {
  signature: 'Signature',
  initials: 'Initials',
  name: 'Full name',
  date: 'Date',
  text: 'Text',
};

/** A field and the signer it resolved to — proven to exist before any mutation. */
interface PlacedField {
  field: EsignField;
  signer: EsignSigner;
}

function resolveSigner(signers: EsignSigner[], field: EsignField): EsignSigner {
  const signer = signers.find((candidate) => candidate.id === field.signerId);
  if (signer === undefined) {
    throw new Error(
      `The ${field.kind} field on page ${field.page} belongs to a signer who is not on this request.`
    );
  }
  return signer;
}

function assertFieldPlacement(field: EsignField, pageCount: number): void {
  const { page, rect } = field;
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new RangeError(
      `A ${field.kind} field sits on page ${page}, but this document has only ${pageCount} page(s).`
    );
  }
  if (!(rect.width > 0) || !(rect.height > 0)) {
    throw new RangeError(
      `The ${field.kind} field on page ${page} has no size — ` +
        `its box is ${rect.width} x ${rect.height} points.`
    );
  }
}

/** Drop what the built-in fonts cannot encode (WinAnsi) rather than crash mid-draw. */
function sanitizeForFont(font: PDFFont, text: string): string {
  return Array.from(text)
    .filter((character) => {
      try {
        font.encodeText(character);
        return true;
      } catch {
        return false;
      }
    })
    .join('');
}

function tooltipFor(field: EsignField, signer: EsignSigner): string {
  const prompt =
    field.kind === 'text' && field.label !== undefined && field.label.trim().length > 0
      ? field.label.trim()
      : KIND_PROMPTS[field.kind];
  return `${prompt} — ${signer.name}`;
}

function createEsignTextField(
  form: PDFForm,
  page: PDFPage,
  placed: PlacedField,
  ordinal: number,
  font: PDFFont
): void {
  const { field, signer } = placed;
  const textField: PDFTextField = form.createTextField(`esign_${ordinal}_${field.kind}`);
  if (field.required) textField.enableRequired();
  textField.addToPage(page, {
    ...field.rect,
    font,
    borderColor: BOX_GRAY,
    borderWidth: FIELD_BORDER_WIDTH,
    // pdf-lib paints the widget white unless the key is PRESENT; an explicit
    // undefined keeps the document visible underneath the box.
    backgroundColor: undefined,
  });
  // Only after addToPage: setFontSize rewrites the /DA that addToPage created.
  textField.setFontSize(FIELD_FONT_SIZE);
  // 'TU' is the AcroForm alternate text — the tooltip Acrobat and screen
  // readers show. pdf-lib has no high-level setter, so it lands on the dict.
  textField.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(tooltipFor(field, signer)));
  textField.updateAppearances(font);
}

function drawSignatureGuide(page: PDFPage, placed: PlacedField, font: PDFFont): void {
  const { x, y, width, height } = placed.field.rect;
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: BOX_GRAY,
    borderWidth: GUIDE_BORDER_WIDTH,
  });
  const label = sanitizeForFont(font, `Sign here — ${placed.signer.name}`);
  page.drawText(label, {
    x: x + GUIDE_LABEL_INSET,
    y: y + GUIDE_LABEL_INSET,
    size: GUIDE_LABEL_SIZE,
    font,
    color: LABEL_GRAY,
  });
}

/** Reopens the SAVED bytes and proves every AcroForm field actually landed. */
async function assertFieldsSurvived(
  result: OpResult<FillableFormDetail>,
  expected: number
): Promise<void> {
  const reopened = await loadPdf(result.bytes, 'fillable copy');
  const found = reopened.getForm().getFields().length;
  if (found !== expected) {
    throw new Error(
      `The fillable copy came out with ${found} form fields but ${expected} were expected — ` +
        'the export was abandoned rather than saved.'
    );
  }
}

/**
 * Places every requested field on a copy of the document. All placements are
 * validated against the real page count and signer list before anything is
 * written; the result is reopened and its field count re-verified, so a copy
 * that quietly lost its boxes can never report success.
 */
export async function buildFillableForm(
  bytes: Uint8Array,
  options: FillableFormOptions,
  onProgress?: ProgressReporter
): Promise<OpResult<FillableFormDetail>> {
  if (options.fields.length === 0) {
    throw new Error(
      'No fields were placed — refusing to export a fillable copy with nothing to fill.'
    );
  }
  const document = await loadPdf(bytes, 'document to export');
  const pagesIn = document.getPageCount();
  for (const field of options.fields) assertFieldPlacement(field, pagesIn);
  const placements: PlacedField[] = options.fields.map((field) => ({
    field,
    signer: resolveSigner(options.signers, field),
  }));

  const font = await document.embedFont(StandardFonts.Helvetica);
  const form = document.getForm();
  const preexisting = form.getFields().length;
  let fieldsCreated = 0;
  let guidesDrawn = 0;
  placements.forEach((placed, index) => {
    const page = document.getPage(placed.field.page - 1);
    if (placed.field.kind === 'signature') {
      drawSignatureGuide(page, placed, font);
      guidesDrawn += 1;
    } else {
      createEsignTextField(form, page, placed, index + 1, font);
      fieldsCreated += 1;
    }
    onProgress?.(index + 1, placements.length);
  });

  const detail: FillableFormDetail = { fieldsCreated, guidesDrawn };
  const result = await finish(document, pagesIn, pagesIn, detail, 'fillable copy');
  await assertFieldsSurvived(result, preexisting + fieldsCreated);
  return result;
}
