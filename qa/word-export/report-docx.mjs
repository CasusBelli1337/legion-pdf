// Turns the Markdown build report into a Word document for Arthur's review:
// real headings, real tables, Times New Roman, no markdown left behind.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
const [, , input, output] = process.argv;
const lines = readFileSync(input, 'utf8').split('\n');
const children = [];
const inline = (text) => {
  const runs = [];
  const parts = text.split(/(`[^`]*`|\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (part === '') continue;
    if (part.startsWith('`'))
      runs.push(new TextRun({ text: part.slice(1, -1), font: 'Consolas', size: 20 }));
    else if (part.startsWith('**')) runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    else runs.push(new TextRun({ text: part.replace(/\\([_*])/g, '$1') }));
  }
  return runs;
};
const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
let i = 0;
let paragraphBuffer = [];
const flush = () => {
  if (paragraphBuffer.length === 0) return;
  const text = paragraphBuffer.join(' ').replace(/\s+/g, ' ').trim();
  paragraphBuffer = [];
  if (text.length === 0) return;
  const list = /^(\d+)\.\s+/.exec(text);
  if (list)
    children.push(
      new Paragraph({
        children: inline(text.replace(/^\d+\.\s+/, '')),
        numbering: { reference: 'items', level: 0 },
        spacing: { after: 120 },
      })
    );
  else if (text.startsWith('- '))
    children.push(
      new Paragraph({
        children: inline(text.slice(2)),
        bullet: { level: 0 },
        spacing: { after: 100 },
      })
    );
  else
    children.push(
      new Paragraph({
        children: inline(text),
        spacing: { after: 160 },
        alignment: AlignmentType.LEFT,
      })
    );
};
while (i < lines.length) {
  const line = lines[i];
  if (/^#{1,3} /.test(line)) {
    flush();
    const level = line.match(/^#+/)[0].length;
    const text = line.replace(/^#+\s+/, '');
    children.push(
      new Paragraph({
        text,
        heading:
          level === 1
            ? HeadingLevel.TITLE
            : level === 2
              ? HeadingLevel.HEADING_1
              : HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
      })
    );
    i += 1;
    continue;
  }
  if (line.startsWith('|')) {
    flush();
    const rows = [];
    while (i < lines.length && lines[i].startsWith('|')) {
      rows.push(lines[i]);
      i += 1;
    }
    const cells = rows
      .filter((r) => !/^\|\s*-/.test(r))
      .map((r) =>
        r
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
      );
    const width = Math.max(...cells.map((c) => c.length));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: cells.map(
          (row, ri) =>
            new TableRow({
              tableHeader: ri === 0,
              children: Array.from(
                { length: width },
                (_, ci) =>
                  new TableCell({
                    borders: { top: border, bottom: border, left: border, right: border },
                    margins: { top: 40, bottom: 40, left: 80, right: 80 },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: (row[ci] ?? '').replace(/`/g, '').replace(/\*\*/g, ''),
                            size: 18,
                            bold: ri === 0,
                          }),
                        ],
                        spacing: { after: 0 },
                      }),
                    ],
                  })
              ),
            })
        ),
      })
    );
    children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    continue;
  }
  if (line.trim() === '') {
    flush();
    i += 1;
    continue;
  }
  if ((line.startsWith('- ') || /^\d+\.\s/.test(line)) && paragraphBuffer.length > 0) flush();
  paragraphBuffer.push(line.trim());
  i += 1;
}
flush();
const doc = new Document({
  creator: 'Legion PDF',
  styles: {
    default: { document: { run: { font: 'Times New Roman', size: 24 } } },
    paragraphStyles: [],
  },
  numbering: {
    config: [
      {
        reference: 'items',
        levels: [
          {
            level: 0,
            format: 'decimal',
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 540, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      children,
    },
  ],
});
writeFileSync(output, await Packer.toBuffer(doc));
console.error('wrote', output, children.length, 'blocks');
