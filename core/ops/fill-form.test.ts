import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { FormFieldError, fillFormFields } from './fill-form';

/** A little court form: text field, checkbox, radio group, dropdown. */
async function makeFormPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false });
  const page = document.addPage([612, 792]);
  const form = document.getForm();

  const name = form.createTextField('party.name');
  name.addToPage(page, { x: 90, y: 700, width: 300, height: 18 });

  const box = form.createCheckBox('requests.definitions');
  box.addToPage(page, { x: 90, y: 660, width: 14, height: 14 });

  const role = form.createRadioGroup('party.role');
  role.addOptionToPage('plaintiff', page, { x: 90, y: 620, width: 14, height: 14 });
  role.addOptionToPage('defendant', page, { x: 140, y: 620, width: 14, height: 14 });

  const county = form.createDropdown('court.county');
  county.addOptions(['Santa Clara', 'Alameda']);
  county.addToPage(page, { x: 90, y: 580, width: 160, height: 18 });

  return document.save();
}

describe('fillFormFields', () => {
  it('writes every field kind and the values survive a reopen', async () => {
    const result = await fillFormFields(await makeFormPdf(), {
      values: [
        { name: 'party.name', value: 'James L. Ashford' },
        { name: 'requests.definitions', value: true },
        { name: 'party.role', value: 'defendant' },
        { name: 'court.county', value: 'Santa Clara' },
      ],
    });

    expect(result.detail).toEqual({ requested: 4, applied: 4 });
    expect(result.pagesOut).toBe(1);

    const reopened = await PDFDocument.load(result.bytes, { updateMetadata: false });
    const form = reopened.getForm();
    expect(form.getTextField('party.name').getText()).toBe('James L. Ashford');
    expect(form.getCheckBox('requests.definitions').isChecked()).toBe(true);
    expect(form.getRadioGroup('party.role').getSelected()).toBe('defendant');
    expect(form.getDropdown('court.county').getSelected()).toEqual(['Santa Clara']);
  });

  it('unchecking a box and clearing a text field both stick', async () => {
    const first = await fillFormFields(await makeFormPdf(), {
      values: [
        { name: 'requests.definitions', value: true },
        { name: 'party.name', value: 'temporary' },
      ],
    });
    const second = await fillFormFields(first.bytes, {
      values: [
        { name: 'requests.definitions', value: false },
        { name: 'party.name', value: '' },
      ],
    });

    const reopened = await PDFDocument.load(second.bytes, { updateMetadata: false });
    expect(reopened.getForm().getCheckBox('requests.definitions').isChecked()).toBe(false);
    expect(reopened.getForm().getTextField('party.name').getText()).toBeUndefined();
  });

  it('names the missing field instead of skipping it', async () => {
    await expect(
      fillFormFields(await makeFormPdf(), {
        values: [{ name: 'no.such.field', value: 'x' }],
      })
    ).rejects.toThrow('This document has no form field named "no.such.field".');
  });

  it('refuses a value of the wrong shape for the field', async () => {
    await expect(
      fillFormFields(await makeFormPdf(), {
        values: [{ name: 'party.name', value: true }],
      })
    ).rejects.toThrow(FormFieldError);
  });

  it('refuses a radio choice that is not on the list, and says what the list is', async () => {
    // Dropdowns are different: Acrobat combo boxes may be editable, and
    // pdf-lib accepts a custom dropdown value — so only the radio group
    // guards its option list.
    await expect(
      fillFormFields(await makeFormPdf(), {
        values: [{ name: 'party.role', value: 'intervenor' }],
      })
    ).rejects.toThrow(/not one of the choices for "party.role"/);
  });

  it('refuses an empty fill outright', async () => {
    await expect(fillFormFields(await makeFormPdf(), { values: [] })).rejects.toThrow(
      'No field values were given'
    );
  });
});
