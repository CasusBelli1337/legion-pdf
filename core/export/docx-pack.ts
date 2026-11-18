/**
 * The assembled sections packed into the .docx file: the document's default
 * face and size, the footnotes, and the separator Word needs named
 * (docx-footnotes.ts).
 */

import { Document, Packer } from 'docx';
import type { ISectionOptions } from 'docx';
import type { LayoutFont, PageLayout } from '@shared/types';
import { footnoteOptions, separatorHeight, withFootnoteSeparator } from './docx-footnotes';
import type { FootnoteBook } from './docx-footnotes';
import { bodyRuns } from './page-setup';
import { halfPoints, runStyleFor } from './styles';

type Fonts = Readonly<Record<string, LayoutFont>>;

export interface Packable {
  sections: ISectionOptions[];
  footnotes: FootnoteBook;
}

/** The face and size most of the document's characters are set in. */
function dominantStyle(layouts: readonly PageLayout[], fonts: Fonts) {
  const byFont = new Map<string, number>();
  const bySize = new Map<number, number>();
  for (const layout of layouts) {
    for (const run of bodyRuns(layout)) {
      const font = fonts[run.fontKey];
      const name = font === undefined ? 'Times New Roman' : runStyleFor(font).wordFont;
      byFont.set(name, (byFont.get(name) ?? 0) + run.text.length);
      const size = halfPoints(run.sizePt);
      bySize.set(size, (bySize.get(size) ?? 0) + run.text.length);
    }
  }
  const top = <T>(counts: Map<T, number>, fallback: T): T =>
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
  return { font: top(byFont, 'Times New Roman'), size: top(bySize, 24) };
}

export async function packDocx(
  layouts: readonly PageLayout[],
  fonts: Fonts,
  assembly: Packable,
  title: string | undefined
): Promise<Uint8Array> {
  const style = dominantStyle(layouts, fonts);
  const { footnotes, footnoteReference } = footnoteOptions(assembly.footnotes, fonts);
  const document = new Document({
    ...(title === undefined ? {} : { title }),
    creator: 'Legion PDF',
    styles: {
      default: {
        document: { run: { font: style.font, size: style.size } },
        ...(footnoteReference === undefined ? {} : { footnoteReference }),
      },
    },
    ...(footnotes === undefined ? {} : { footnotes }),
    sections: assembly.sections,
  });
  const bytes = new Uint8Array(await Packer.toBuffer(document));
  if (footnotes === undefined) return bytes;
  return withFootnoteSeparator(bytes, separatorHeight(assembly.footnotes));
}
