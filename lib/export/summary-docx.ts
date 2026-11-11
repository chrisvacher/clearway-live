// The workshop summary as a small Clearway Word file: the church, the event, the date and the summary's paragraphs, in the same type and
// colours as the report (lib/export/report-docx.ts). One page, no cover.
import { BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { FONT } from "./report-docx";

const NAVY = "03294e", ROYAL = "3f72de", GRAY500 = "6b7280";
const run = (text: string, o: { size?: number; bold?: boolean; color?: string; spacing?: number } = {}) => new TextRun({ text, font: FONT, size: o.size ?? 22, bold: o.bold ?? false, color: o.color ?? NAVY, characterSpacing: o.spacing });

export function buildSummaryDocx(m: { church: string; title: string; date: string; paragraphs: string[] }) {
  const doc = new Document({
    creator: "Clearway Church Solutions", title: `${m.church} ${m.title} summary`,
    styles: { default: { document: { run: { font: FONT, size: 22, color: NAVY } } },
      paragraphStyles: [{ id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 40, bold: true, font: FONT, color: NAVY },
        paragraph: { spacing: { before: 80, after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ROYAL, space: 8 } } } }] },
    sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: [
      new Paragraph({ spacing: { after: 40 }, children: [run(m.church.toUpperCase(), { size: 16, bold: true, color: ROYAL, spacing: 120 })] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: m.title, font: FONT })] }),
      ...(m.date ? [new Paragraph({ spacing: { after: 280 }, children: [run(m.date, { size: 20, color: GRAY500 })] })] : []),
      ...m.paragraphs.map(p => new Paragraph({ spacing: { after: 200, line: 300 }, children: [run(p)] })),
    ] }],
  });
  return Packer.toBuffer(doc);
}
