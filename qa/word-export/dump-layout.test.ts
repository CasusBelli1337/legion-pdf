/// <reference types="node" />
/**
 * A debugging aid, not a test: `WORD_DUMP=<pdf> npm run test:word -- dump-layout`
 * writes what the layout pipeline sees on each page — every run with its role,
 * position, size, and font, every rule, every picture — to
 * qa/output/word-export/<name>.layout.json, and prints a per-page digest.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'vitest';
import { buildDocx, documentXmlOf, pleadingOf } from '@core/export';
import { layoutsOf } from '@renderer/lib/layout/node-pipeline.testkit';
import { readPdf, recognizeScannedPages } from './ocr';

const target = process.env.WORD_DUMP;
const OUTPUT = path.join(import.meta.dirname, '../../qa/output/word-export');

describe.skipIf(target === undefined)('layout dump', () => {
  it('writes the layouts', async () => {
    const pdfPath = path.resolve(target ?? '');
    const source = await recognizeScannedPages(await readPdf(pdfPath), pdfPath);
    const layouts = await layoutsOf(source.bytes);
    await mkdir(OUTPUT, { recursive: true });
    const name = path.basename(pdfPath, '.pdf');
    await writeFile(
      path.join(OUTPUT, `${name}.layout.json`),
      JSON.stringify(
        layouts,
        (key, value) => (key === 'png' ? `<${(value as Uint8Array).byteLength} bytes>` : value),
        1
      )
    );
    if (process.env.WORD_DUMP_TEXT === '1') {
      const build = await buildDocx(layouts, { title: name });
      const xml = await documentXmlOf(build.bytes);
      const paragraphs = xml.match(/<w:p\b[^>]*>.*?<\/w:p>/gs) ?? [];
      const lines = paragraphs.map((paragraph) =>
        (paragraph.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:br\/>|<w:tab\/>/g) ?? [])
          .map((piece) =>
            piece === '<w:br/>' ? '⏎' : piece === '<w:tab/>' ? '⇥' : piece.replace(/<[^>]*>/g, '')
          )
          .join('')
      );
      await writeFile(path.join(OUTPUT, `${name}.text.txt`), lines.join('\n'));
      process.stdout.write(`wrote ${lines.length} paragraphs of text\n`);
    }
    for (const layout of layouts) {
      const roles = new Map<string, number>();
      for (const run of layout.runs) roles.set(run.role, (roles.get(run.role) ?? 0) + 1);
      const pleading = pleadingOf(layout);
      const vertical = layout.rules.filter(
        (rule) => rule.rect.width <= 3 && rule.rect.height > 100
      );
      const horizontal = layout.rules.filter(
        (rule) => rule.rect.height <= 3 && rule.rect.width > 50
      );
      process.stdout.write(
        `page ${layout.page} ${layout.size.width}x${layout.size.height}: ${[...roles].map(([role, count]) => `${role}=${count}`).join(' ')}; ` +
          `fonts=${Object.values(layout.fonts)
            .map((font) => `${font.name}${font.bold ? '/b' : ''}`)
            .join(',')}; images=${layout.images.length}; ` +
          `vrules=${vertical.map((rule) => `x${rule.rect.x.toFixed(1)} w${rule.rect.width.toFixed(2)} y${rule.rect.y.toFixed(0)}-${(rule.rect.y + rule.rect.height).toFixed(0)}`).join(' ')}; ` +
          `hrules=${horizontal.map((rule) => `y${rule.rect.y.toFixed(1)} x${rule.rect.x.toFixed(0)}-${(rule.rect.x + rule.rect.width).toFixed(0)}`).join(' ')}; ` +
          `pleading=${pleading === null ? 'no' : `pitch ${pleading.pitchPt.toFixed(2)} n=${pleading.count} first=${pleading.firstBaseline.toFixed(2)} last=${pleading.lastBaseline.toFixed(2)} numRight=${pleading.numberRight.toFixed(1)}`}\n`
      );
    }
  });
});
