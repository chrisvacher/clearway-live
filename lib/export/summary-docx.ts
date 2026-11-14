// The workshop summary as a small Clearway Word file: the church, the event, the date and the summary's paragraphs, in the same type and
// colours as the report (lib/export/report-docx.ts). One page, no cover.
// For a Novetera engagement it is Novetera's document design instead, as the canvas's SummaryPage artboard lays it out (see buildNoveteraSummary below).
import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, TabStopType, TextRun } from "docx";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { skinOf, type Skin } from "../brand";
import { copyFor } from "../brand/copy";
import { FONT } from "./report-docx";

const NAVY = "03294e", ROYAL = "3f72de", GRAY500 = "6b7280";
const run = (text: string, o: { size?: number; bold?: boolean; color?: string; spacing?: number } = {}) => new TextRun({ text, font: FONT, size: o.size ?? 22, bold: o.bold ?? false, color: o.color ?? NAVY, characterSpacing: o.spacing });

export function buildSummaryDocx(m: { church: string; title: string; date: string; paragraphs: string[]; skin?: Skin }) {
  if (skinOf(m.skin) === "novetera") return buildNoveteraSummary(m);
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

// ---------- The Novetera summary ----------
// Novetera's design system has no document standard yet, so the canvas derives one from it and this follows the canvas: Letter page, the mark and
// NOVETERA over a heavy rule, the church as an oxblood eyebrow, the title in Public Sans bold, the date in muted Slate, the summary in Public Sans
// regular at a 1.55 line, and the footer with the tagline in Source Serif 4 italic and "Novetera · page" under a hairline. Word has no weight 800,
// so the wordmark is Public Sans Bold. The palette names are Novetera's (design/novetera-live/novetera_tokens.css); hex is how Word wants them.
const NOVETERA = { charcoal: "1F2328", slate600: "454B54", stone150: "E3E0D9", oxblood700: "7A1F2B" } as const;
const NV_SANS = "Public Sans", NV_SERIF = "Source Serif 4";
const noveteraFont = (file: string) => readFileSync(join(process.cwd(), "lib/export/assets/fonts/novetera", file));
const noveteraMark = () => readFileSync(join(process.cwd(), "lib/export/assets/novetera-mark.png"));
const nv = (text: string, o: { size?: number; bold?: boolean; italics?: boolean; color?: string; spacing?: number; font?: string } = {}) =>
  new TextRun({ text, font: o.font ?? NV_SANS, size: o.size ?? 24, bold: o.bold ?? false, italics: o.italics ?? false, color: o.color ?? NOVETERA.charcoal, characterSpacing: o.spacing });

function buildNoveteraSummary(m: { church: string; title: string; date: string; paragraphs: string[] }) {
  const words = copyFor("novetera");
  const doc = new Document({
    creator: words.summary.creator, title: `${m.church} ${m.title} summary`,
    // Public Sans (regular and bold) and Source Serif 4 italic travel inside the file, so it reads the same on a computer without them.
    // Source Serif 4 is only used in italic, so its one file is given as both the regular and the italic face.
    fonts: [
      { name: NV_SANS, data: noveteraFont("PublicSans-Regular.ttf"), bold: noveteraFont("PublicSans-Bold.ttf") },
      { name: NV_SERIF, data: noveteraFont("SourceSerif4-It.ttf"), italic: noveteraFont("SourceSerif4-It.ttf") },
    ],
    styles: { default: { document: { run: { font: NV_SANS, size: 24, color: NOVETERA.charcoal } } },
      paragraphStyles: [{ id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 51, bold: true, font: NV_SANS, color: NOVETERA.charcoal },
        paragraph: { spacing: { before: 0, after: 150, line: 288 } } }] },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1200, right: 1440, bottom: 1300, left: 1440, footer: 600 } } },
      footers: { default: new Footer({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: NOVETERA.stone150, space: 8 } },
        children: [...(words.summary.footerTagline ? [nv(words.summary.footerTagline, { font: NV_SERIF, italics: true, size: 27 })] : []),
          new TextRun({ children: ["\t", `${words.summary.footerName} \u00b7 `, PageNumber.CURRENT], font: NV_SANS, size: 18, color: NOVETERA.slate600 })],
      })] }) },
      children: [
        new Paragraph({ spacing: { after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NOVETERA.charcoal, space: 8 } }, children: [
          new ImageRun({ type: "png", data: noveteraMark(), transformation: { width: 20, height: 20 }, altText: { name: "Novetera", title: "Novetera", description: "The Novetera mark" } }),
          nv("  NOVETERA", { size: 30, bold: true, spacing: 6 })] }),
        new Paragraph({ spacing: { before: 840, after: 150 }, children: [nv(m.church.toUpperCase(), { size: 18, bold: true, color: NOVETERA.oxblood700, spacing: 40 })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: m.title, font: NV_SANS })] }),
        ...(m.date ? [new Paragraph({ spacing: { after: 540 }, children: [nv(m.date, { size: 21, color: NOVETERA.slate600 })] })] : []),
        ...m.paragraphs.map(p => new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 240, line: 372 }, children: [nv(p)] })),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}
