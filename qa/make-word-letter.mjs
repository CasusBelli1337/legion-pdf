// A fictional two-paragraph letter, set the way Word sets pleadings: Times New Roman
// body, a Calibri bold heading, curly quotes, an em dash — the shapes a real Word PDF has.
import { writeFileSync } from 'node:fs';
import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';
const doc = new Document({
  sections: [
    {
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'SETTLEMENT TERM SHEET', bold: true, font: 'Calibri', size: 28 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 240 },
          children: [new TextRun({ text: '', font: 'Times New Roman', size: 24 })],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: 480 },
          children: [
            new TextRun({
              text: 'The parties, Ashford Holdings LLC and Meridian Fabrication Corp., agree that the closing date is March 3, 2026, unless extended in writing by both sides. Payment of the settlement amount shall be made by wire transfer within ten days of closing — time being of the essence.',
              font: 'Times New Roman',
              size: 24,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: 480 },
          children: [
            new TextRun({
              text: 'Each party shall bear its own attorneys’ fees and costs. This term sheet is “binding” on signature and will be superseded by a long-form agreement.',
              font: 'Times New Roman',
              size: 24,
            }),
          ],
        }),
      ],
    },
  ],
});
writeFileSync(process.argv[2], await Packer.toBuffer(doc));
console.error('wrote', process.argv[2]);
