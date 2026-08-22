/**
 * Writes values into AcroForm fields — the commit half of court-form filling.
 * The renderer's form layer holds edits until save; this op is the one door
 * they pass through into the bytes. Every requested field must land or the
 * whole op throws: a form where "12 of 19 answers saved" quietly is exactly
 * the silent partial output this codebase refuses to ship.
 *
 * A side effect worth knowing: pdf-lib drops hybrid XFA data the moment the
 * form is touched. For Judicial Council forms that is the correct outcome —
 * Acrobat prefers the XFA copy when both exist, and an unfilled XFA copy
 * would mask the values written here.
 */

import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
} from 'pdf-lib';
import type { PDFField, PDFForm } from 'pdf-lib';
import type { FillFormDetail, FillFormOptions, OpResult } from '@shared/types';
import { finish, loadPdf } from './pdf-io';
import type { ProgressReporter } from './pdf-io';

/** A field that cannot take the value it was given — always named, never skipped. */
export class FormFieldError extends Error {
  readonly code = 'FORM_FIELD';
  constructor(message: string) {
    super(message);
    this.name = 'FormFieldError';
  }
}

function fieldOrThrow(form: PDFForm, name: string): PDFField {
  try {
    return form.getField(name);
  } catch {
    throw new FormFieldError(`This document has no form field named "${name}".`);
  }
}

function applyText(field: PDFTextField, name: string, value: string): void {
  try {
    field.setText(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new FormFieldError(`The value for "${name}" was not accepted: ${reason}`);
  }
}

function applySelect(
  field: PDFRadioGroup | PDFDropdown | PDFOptionList,
  name: string,
  value: string
): void {
  try {
    field.select(value);
  } catch {
    const options = field.getOptions().join('", "');
    throw new FormFieldError(
      `"${value}" is not one of the choices for "${name}" (choices: "${options}").`
    );
  }
}

function applyValue(field: PDFField, name: string, value: string | boolean): void {
  if (field instanceof PDFCheckBox && typeof value === 'boolean') {
    if (value) field.check();
    else field.uncheck();
  } else if (field instanceof PDFTextField && typeof value === 'string') {
    applyText(field, name, value);
  } else if (isSelectable(field) && typeof value === 'string') {
    applySelect(field, name, value);
  } else {
    throw new FormFieldError(
      `Form field "${name}" (${field.constructor.name}) cannot take the value ${JSON.stringify(value)}.`
    );
  }
}

function isSelectable(field: PDFField): field is PDFRadioGroup | PDFDropdown | PDFOptionList {
  return (
    field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList
  );
}

/**
 * Write every value in `options.values` into the form and regenerate the
 * fields' appearance streams so the answers render in any viewer. All-or-throw;
 * the detail's counts always match by construction and exist so callers can
 * verify that anyway.
 */
export async function fillFormFields(
  bytes: Uint8Array,
  options: FillFormOptions,
  onProgress?: ProgressReporter
): Promise<OpResult<FillFormDetail>> {
  const total = options.values.length;
  if (total === 0) {
    throw new FormFieldError('No field values were given — refusing to write an empty fill.');
  }
  const document = await loadPdf(bytes, 'form document');
  const pagesIn = document.getPageCount();
  const form = document.getForm();

  let applied = 0;
  for (const [index, entry] of options.values.entries()) {
    onProgress?.(index + 1, total);
    applyValue(fieldOrThrow(form, entry.name), entry.name, entry.value);
    applied += 1;
  }
  form.updateFieldAppearances(await document.embedFont(StandardFonts.Helvetica));

  return finish(document, pagesIn, pagesIn, { requested: total, applied }, 'filled form');
}
