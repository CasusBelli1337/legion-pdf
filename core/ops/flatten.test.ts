import { describe, expect, it } from 'vitest';
import { flattenAnnotations } from './flatten';
import {
  annotationCounts,
  containsText,
  hasAcroForm,
  labelledPages,
  makeTestPdf,
  pageXObjectNames,
  withWidgetAnnotation,
} from './test-fixtures';

const SIGNED_WIDGET = {
  page: 2,
  rect: [100, 100, 300, 150] as [number, number, number, number],
  ink: 'SIGNATURE-INK-MARKER',
  note: 'PRIVATE-ANNOTATION-NOTE',
};

async function signedDocument(): Promise<Uint8Array> {
  const base = await makeTestPdf({ pages: labelledPages(3, 'F', 300) });
  return withWidgetAnnotation(base, SIGNED_WIDGET);
}

describe('flattenAnnotations', () => {
  it('paints the signature into the page and leaves no annotation object behind', async () => {
    const source = await signedDocument();
    expect(await annotationCounts(source)).toEqual([0, 1, 0]);

    const result = await flattenAnnotations(source, {});

    expect(result.detail.annotationsFlattened).toBe(1);
    expect(result.pagesIn).toBe(3);
    expect(result.pagesOut).toBe(3);
    expect(await annotationCounts(result.bytes)).toEqual([0, 0, 0]);
    expect(await pageXObjectNames(result.bytes, 2)).toContain('LibrariusFlat2_0');
    expect(containsText(result.bytes, 'SIGNATURE-INK-MARKER')).toBe(true);
  });

  it('deletes the annotation’s own note along with the annotation', async () => {
    const source = await signedDocument();
    expect(containsText(source, 'PRIVATE-ANNOTATION-NOTE')).toBe(true);

    const result = await flattenAnnotations(source, {});

    expect(containsText(result.bytes, 'PRIVATE-ANNOTATION-NOTE')).toBe(false);
  });

  it('removes the interactive form so the field cannot be rebuilt', async () => {
    const source = await signedDocument();
    expect(await hasAcroForm(source)).toBe(true);

    const result = await flattenAnnotations(source, {});

    expect(await hasAcroForm(result.bytes)).toBe(false);
  });

  it('places the appearance on its rectangle, scaling a mismatched bounding box', async () => {
    const base = await makeTestPdf({ pages: labelledPages(1, 'F', 400) });
    const source = await withWidgetAnnotation(base, {
      page: 1,
      rect: [10, 20, 110, 45],
      ink: 'SCALED-INK',
      note: 'note',
      bbox: [0, 0, 200, 50],
    });

    const result = await flattenAnnotations(source, {});

    // 100x25 rectangle over a 200x50 appearance: half size, shifted to (10, 20).
    expect(containsText(result.bytes, '0.5 0 0 0.5 10 20 cm')).toBe(true);
  });

  it('draws an appearance whose box already matches at its own scale', async () => {
    const result = await flattenAnnotations(await signedDocument(), {});
    expect(containsText(result.bytes, '1 0 0 1 100 100 cm')).toBe(true);
  });

  it('removes a hidden annotation without painting it', async () => {
    const base = await makeTestPdf({ pages: labelledPages(1, 'F', 300) });
    const source = await withWidgetAnnotation(base, {
      page: 1,
      rect: [10, 10, 60, 30],
      ink: 'HIDDEN-INK-MARKER',
      note: 'hidden note',
      hidden: true,
    });

    const result = await flattenAnnotations(source, {});

    expect(result.detail.annotationsFlattened).toBe(0);
    expect(await annotationCounts(result.bytes)).toEqual([0]);
    expect(await pageXObjectNames(result.bytes, 1)).not.toContain('LibrariusFlat1_0');
  });

  it('removes an annotation that carries no appearance stream', async () => {
    const base = await makeTestPdf({ pages: labelledPages(1, 'F', 300) });
    const source = await withWidgetAnnotation(base, {
      page: 1,
      rect: [10, 10, 60, 30],
      ink: 'unused',
      note: 'LINK-STYLE-NOTE',
      withoutAppearance: true,
    });

    const result = await flattenAnnotations(source, {});

    expect(result.detail.annotationsFlattened).toBe(0);
    expect(await annotationCounts(result.bytes)).toEqual([0]);
    expect(containsText(result.bytes, 'LINK-STYLE-NOTE')).toBe(false);
  });

  it('flattens only the pages it was given and keeps the form for the rest', async () => {
    const source = await signedDocument();

    const result = await flattenAnnotations(source, { pages: [1, 3] });

    expect(result.detail.annotationsFlattened).toBe(0);
    expect(await annotationCounts(result.bytes)).toEqual([0, 1, 0]);
    expect(await hasAcroForm(result.bytes)).toBe(true);
  });

  it('prunes the form entry when a flattened page held the only widget', async () => {
    const source = await signedDocument();

    const result = await flattenAnnotations(source, { pages: [2] });

    expect(result.detail.annotationsFlattened).toBe(1);
    expect(await annotationCounts(result.bytes)).toEqual([0, 0, 0]);
    expect(await hasAcroForm(result.bytes)).toBe(true);
    expect(containsText(result.bytes, 'PRIVATE-ANNOTATION-NOTE')).toBe(false);
  });

  it('is a no-op on a document with no annotations, and still verifies the count', async () => {
    const result = await flattenAnnotations(await makeTestPdf({ pages: labelledPages(2) }), {});

    expect(result.detail.annotationsFlattened).toBe(0);
    expect(result.pagesOut).toBe(2);
  });

  it('refuses a page the document does not have', async () => {
    await expect(
      flattenAnnotations(await makeTestPdf({ pages: labelledPages(2) }), { pages: [5] })
    ).rejects.toThrow(
      'The pages to flatten includes page 5, but this document has pages 1 through 2.'
    );
  });
});
