// The report as a Clearway-branded Word file (milestone 7, step 5), drawn from the document model with the docx package and following
// docs/clearway-document-standard.md with Chris's October 2026 preferences on top: a white page (no page colour is set), restrained bold (the cover's emphasis
// line, section eyebrows, H1 and H2 only), a contents page only for a long report, headings kept with what follows, tables left to flow. Widths are DXA and
// shading is CLEAR so the file opens the same in Google Docs, Word and LibreOffice.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LevelFormat, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableOfContents,
  TableRow, TextRun, WidthType, type FileChild, type ParagraphChild,
} from "docx";
import { logoPng, logoSize } from "./assets";
import { DRAFT_MARK, FIRM, type Block, type ReportModel } from "./report-model";

export const FONT = "Plus Jakarta Sans";
const NAVY = "03294e", ROYAL = "3f72de", SKY = "99c5fe", GRAY100 = "f3f4f6", GRAY200 = "e5e7eb", GRAY400 = "9ca3af", GRAY500 = "6b7280", WHITE = "FFFFFF", INSIGHT = "EBF0FF";
const W = 9360;
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const noBorders = { top: none, bottom: none, left: none, right: none } as const;
const run = (text: string, o: { size?: number; bold?: boolean; italics?: boolean; color?: string; spacing?: number } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? 22, bold: o.bold ?? false, italics: o.italics ?? false, color: o.color ?? NAVY, characterSpacing: o.spacing });

const gap = () => new Paragraph({ spacing: { after: 140 }, children: [] });
const para = (text: string, o: { after?: number; keepNext?: boolean } = {}) => new Paragraph({ spacing: { after: o.after ?? 160, line: 276 }, keepNext: o.keepNext, children: [run(text)] });
const eyebrow = (text: string) => new Paragraph({ spacing: { before: 360, after: 40 }, keepNext: true, keepLines: true, children: [run(text, { size: 16, bold: true, color: ROYAL, spacing: 120 })] });
const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, keepLines: true, children: [new TextRun({ text, font: FONT })] });
const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, keepLines: true, children: [new TextRun({ text, font: FONT })] });

function callout(label: string, text: string): Table {
  return new Table({
    layout: TableLayoutType.FIXED, width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ cantSplit: true, children: [new TableCell({
      width: { size: W, type: WidthType.DXA }, shading: { fill: INSIGHT, type: ShadingType.CLEAR },
      borders: { top: none, right: none, bottom: none, left: { style: BorderStyle.SINGLE, size: 18, color: ROYAL } },
      margins: { top: 140, bottom: 140, left: 200, right: 200 },
      children: [new Paragraph({ spacing: { after: 60 }, children: [run(label, { size: 18, color: ROYAL, spacing: 60 })] }), new Paragraph({ spacing: { after: 0 }, children: [run(text)] })],
    })] })],
  });
}

function quote(text: string): Table {
  return new Table({
    layout: TableLayoutType.FIXED, width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ cantSplit: true, children: [new TableCell({
      width: { size: W, type: WidthType.DXA }, shading: { fill: WHITE, type: ShadingType.CLEAR },
      borders: { top: none, right: none, bottom: none, left: { style: BorderStyle.SINGLE, size: 24, color: SKY } },
      margins: { top: 160, bottom: 160, left: 280, right: 200 },
      children: [new Paragraph({ spacing: { after: 0 }, children: [run(`“${text}”`, { size: 24, italics: true })] })],
    })] })],
  });
}

const cellParas = (text: string, o: { color?: string; size?: number } = {}) =>
  (text.split("\n").filter(Boolean).length ? text.split("\n").filter(Boolean) : [""]).map((t, i, a) => new Paragraph({ spacing: { after: i === a.length - 1 ? 0 : 80 }, children: [run(t, { size: o.size ?? 20, color: o.color })] }));

function dataTable(columns: string[], widths: number[], rows: string[][]): Table {
  const head = new TableRow({ tableHeader: true, cantSplit: true, children: columns.map((c, i) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, shading: { fill: NAVY, type: ShadingType.CLEAR },
    borders: { top: none, left: none, right: none, bottom: { style: BorderStyle.SINGLE, size: 24, color: ROYAL } },
    margins: { top: 80, bottom: 80, left: 140, right: 140 }, children: cellParas(c, { color: WHITE }),
  })) });
  const body = rows.map((r, n) => new TableRow({ cantSplit: true, children: columns.map((_, i) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, shading: { fill: n % 2 === 0 ? GRAY100 : WHITE, type: ShadingType.CLEAR },
    borders: { top: none, left: none, right: none, bottom: { style: BorderStyle.SINGLE, size: 6, color: GRAY200 } },
    margins: { top: 80, bottom: 80, left: 140, right: 140 }, children: cellParas(r[i] ?? ""),
  })) }));
  return new Table({ layout: TableLayoutType.FIXED, width: { size: W, type: WidthType.DXA }, columnWidths: widths, rows: [head, ...body] });
}

// A card (a Vision Outcome or an intent card): a title, then label and words in two columns.
function cardTable(lines: { label: string; text: string; meta: string }[]): Table {
  const L = 2200, R = W - L;
  return new Table({
    layout: TableLayoutType.FIXED, width: { size: W, type: WidthType.DXA }, columnWidths: [L, R],
    rows: lines.map(l => new TableRow({ cantSplit: true, children: [
      new TableCell({ width: { size: L, type: WidthType.DXA }, borders: { top: none, left: none, right: none, bottom: { style: BorderStyle.SINGLE, size: 6, color: GRAY200 } }, margins: { top: 80, bottom: 80, left: 0, right: 140 },
        children: [new Paragraph({ spacing: { after: 0 }, children: [run(l.label, { size: 18, color: ROYAL })] })] }),
      new TableCell({ width: { size: R, type: WidthType.DXA }, borders: { top: none, left: none, right: none, bottom: { style: BorderStyle.SINGLE, size: 6, color: GRAY200 } }, margins: { top: 80, bottom: 80, left: 140, right: 0 },
        children: [new Paragraph({ spacing: { after: l.meta ? 40 : 0 }, children: [run(l.text, { size: 21 })] }), ...(l.meta ? [new Paragraph({ spacing: { after: 0 }, children: [run(l.meta, { size: 18, color: GRAY500 })] })] : [])] }),
    ] })),
  });
}

function blockChildren(b: Block): FileChild[] {
  switch (b.type) {
    case "paragraph": return [para(b.text)];
    case "quote": return [quote(b.text), gap()];
    case "callout": return [callout(b.label, b.text), gap()];
    case "subheading": return [h2(b.text)];
    case "list": return b.items.map(t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80, line: 276 }, children: [run(t)] }));
    case "table": return [dataTable(b.columns, b.widths, b.rows), gap()];
    case "card": return [h2(b.title), cardTable(b.lines), gap()];
  }
}

function cover(model: ReportModel, logo: Buffer): FileChild[] {
  const out: FileChild[] = [
    new Paragraph({ spacing: { after: 0 }, children: [new ImageRun({ type: "png", data: logo, transformation: logoSize(160), altText: { title: "Clearway", description: "Clearway Church Solutions logo", name: "cover-logo" } })] }),
    new Paragraph({ spacing: { before: 1800, after: 120 }, children: [run("CLEARWAY CHURCH SOLUTIONS", { size: 18, color: ROYAL, spacing: 120 })] }),
    new Paragraph({ spacing: { after: 0 }, children: [run(model.church, { size: 56 })] }),
    new Paragraph({ spacing: { after: 160 }, children: [run(model.title, { size: 56, bold: true })] }),
  ];
  if (model.dates) out.push(new Paragraph({ spacing: { after: 240 }, children: [run(model.dates, { size: 24, color: GRAY500 })] }));
  out.push(new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 96, color: ROYAL, space: 4 } }, children: [] }));
  out.push(new Paragraph({ spacing: { after: 120 }, children: [run(model.preparedBy, { size: 22, color: GRAY500 })] }));
  if (model.draft) out.push(new Paragraph({ spacing: { after: 0 }, children: [run(`${DRAFT_MARK}. This report has not been signed off.`, { size: 22, color: GRAY500 })] }));
  return out;
}

function footer(logo: Buffer): Footer {
  const cell = (children: ParagraphChild[], align: (typeof AlignmentType)[keyof typeof AlignmentType]) => new TableCell({
    width: { size: 3120, type: WidthType.DXA }, borders: noBorders, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: "center",
    children: [new Paragraph({ spacing: { after: 0 }, alignment: align, children })],
  });
  return new Footer({ children: [
    new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GRAY200, space: 1 } }, children: [] }),
    new Table({ layout: TableLayoutType.FIXED, width: { size: W, type: WidthType.DXA }, columnWidths: [3120, 3120, 3120], borders: noBorders, rows: [new TableRow({ children: [
      cell([new ImageRun({ type: "png", data: logo, transformation: logoSize(100), altText: { title: "Clearway", description: "Clearway Church Solutions logo", name: "footer-logo" } })], AlignmentType.LEFT),
      cell([run(FIRM, { size: 18, color: GRAY400 })], AlignmentType.CENTER),
      cell([run("Page ", { size: 18, color: GRAY400 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: GRAY400 })], AlignmentType.RIGHT),
    ] })] }),
  ] });
}

// Drafts carry the mark in every page's header. A signed report has no header at all.
const header = (model: ReportModel) => model.draft ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [run(DRAFT_MARK.toUpperCase(), { size: 18, color: GRAY500, spacing: 120 })] })] }) } : undefined;

export async function buildDocx(model: ReportModel): Promise<Buffer> {
  const logo = logoPng();
  const page = { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } };
  const content: FileChild[] = [];
  model.sections.forEach((s, i) => {
    if (i > 0) content.push(new Paragraph({ spacing: { before: 120, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GRAY200, space: 1 } }, children: [] }));
    content.push(eyebrow(s.eyebrow), h1(s.heading), ...s.blocks.flatMap(blockChildren));
  });
  const sections = [{ properties: { page }, headers: header(model), children: cover(model, logo) }];
  if (model.contents) sections.push({ properties: { page }, headers: header(model), children: [
    new Paragraph({ spacing: { after: 300 }, children: [run("Contents", { size: 44, bold: true })] }),
    new Paragraph({ spacing: { after: 400 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ROYAL, space: 8 } }, children: [] }),
    new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-1" }),
  ] });
  const doc = new Document({
    creator: FIRM, title: `${model.church} ${model.title}${model.draft ? ` (${DRAFT_MARK})` : ""}`, description: model.title,
    features: { updateFields: model.contents },
    styles: {
      default: { document: { run: { font: FONT, size: 22, color: NAVY } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 44, bold: true, font: FONT, color: NAVY },
          paragraph: { spacing: { before: 200, after: 200 }, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ROYAL, space: 8 } } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 28, bold: true, font: FONT, color: NAVY }, paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 } },
      ],
    },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    sections: [
      ...sections,
      { properties: { page: { ...page, pageNumbers: { start: 1 } } }, headers: header(model), footers: { default: footer(logo) }, children: content },
    ],
  });
  return Packer.toBuffer(doc);
}
