> Copied from the clearway-docs skill (`references/clearway-design-system.md`). Chris's October 2026 formatting preferences apply on top of it: restrained bold, a white page, no contents page under about eight pages, headings kept with what follows, and tables left to flow.

# Clearway Document Design System

This reference defines the complete visual system for all Clearway Church Solutions documents created with docx-js. Every new document should follow these patterns to maintain brand consistency.

Read this file whenever creating a new document. The patterns below are tested and verified to render correctly in Google Docs, Microsoft Word, and LibreOffice.

> **2026 refresh.** This version adds section eyebrows, a redesigned investment/pricing block, a one-pager header, a stat strip, and a lead paragraph, and it tightens the lime and pricing rules. Where a pattern changed, it is called out inline.

---

## Brand Colors

```javascript
const NAVY     = "03294e";  // Primary text, dark backgrounds, headers, total block
const ROYAL    = "3f72de";  // Links, primary accent, eyebrows, outlines, "Included"
const SKY      = "99c5fe";  // Quote borders, labels on dark, soft accents
const LIME      = "d2ff71"; // Accent marks on DARK only: accent bar, one-word pop, marker underline. Never a filled field
const SOFT_LIME = "e6ffa8"; // Reversed text or labels on navy (e.g. pricing partnership header, immersive subtitle). Never a filled field
const B_BLUE    = "b8d4fe"; // Sub-text on navy blocks
const OFF_WHT  = "fcfcfd";  // Page backgrounds
const GRAY100  = "f3f4f6";  // Alternating table rows, exec summary, stat cells
const GRAY200  = "e5e7eb";  // Borders, dividers, horizontal rules
const GRAY400  = "9ca3af";  // Footer text, metadata labels, struck "standard" prices
const GRAY500  = "6b7280";  // Subtitles, secondary text
const WHITE    = "FFFFFF";
const ORANGE   = "f15025";  // Caution callouts only, never as decoration
```

### Lime rule (hard)

Lime and soft lime are **highlights, never backgrounds.** On a dark (navy) surface, split by role:
- **Reversed text or a label** on navy uses **Soft Lime (#e6ffa8)** (e.g. the pricing table's partnership-column header, an immersive-cover subtitle). Easier on the eye than full lime at text size.
- **A small accent mark** (an accent bar, a one-word emphasis pop, a faint marker underline behind a single figure) uses **Lime (#d2ff71)**.

Never fill a card, row, or block with either lime. The "You save" figure sits in a **white, royal-outlined** card, not a lime field (see Investment Block). Across a whole document, lime should account for well under 5% of the visible ink.

---

## Typography

- **Font**: `"Plus Jakarta Sans"`, the Clearway brand font, available natively in Google Docs
- **Body**: 11pt (size: 22), Dark Navy, 1.15 line spacing (line: 276)
- **Default paragraph spacing**: after: 160

### Print Type Scale

| Element | Size (half-pts) | Weight | Color | Notes |
|---------|-----------------|--------|-------|-------|
| Cover title | 56 (28pt) | Bold | NAVY | Largest element in doc |
| Section eyebrow | 16 (8pt) | Bold | ROYAL | UPPERCASE, characterSpacing 120, sits directly above an H1 |
| H1 | 44 (22pt) | Bold | NAVY | Royal Blue underline |
| H2 | 32 (16pt) | Bold | NAVY | No underline |
| H3 | 24 (12pt) | Bold | ROYAL | ALL CAPS (written manually) |
| Lead | 26 (13pt) | Regular | NAVY | Opening line of a one-pager or major section |
| Body | 22 (11pt) | Regular | NAVY | |
| Stat number | 44 (22pt) | Bold | ROYAL | Stat strip |
| Metadata labels | 18 (9pt) | Regular | GRAY400 | Footer, cover labels |
| Small/caption | 14 (7pt) | Regular | GRAY400 | Confidentiality notice, table notes |

---

## Page Setup and Sections

US Letter, 1-inch margins, content width 9360 DXA.

```javascript
const pageProps = {
  page: {
    size: { width: 12240, height: 15840 },
    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
  }
};
const CONTENT_WIDTH = 9360;
```

Documents use two or three sections, each with its own footer:
1. **Cover page**: no header, confidentiality notice in footer
2. **Table of Contents** (optional): no header, branded footer
3. **Content pages**: no header, branded footer

Each section needs its own header/footer definition because Word/Google Docs don't share them across sections.

**One-pagers skip the cover and TOC**: they open with the One-Pager Header (below) at the top of the single content section.

---

## Section Eyebrow (NEW)

Every H1 in a multi-section document is introduced by a small royal eyebrow on the line above it, e.g. `01 / OVERVIEW`, `02 / CURRENT REALITY`, `03 / THE PLAN`. This is the signature of the refreshed system: it gives each section a wayfinding label and rhythm. Use a short number + a one or two word tag. Written in actual uppercase.

```javascript
function eyebrow(text) {
  return new Paragraph({
    spacing: { before: 360, after: 40 },
    keepNext: true, // stay attached to the H1 that follows
    children: [
      new TextRun({ text: text.toUpperCase(), font: FONT, size: 16, bold: true, color: ROYAL, characterSpacing: 120 })
    ]
  });
}
```

Emit `eyebrow("01 / Overview")` immediately before each `h1(...)`. The H1 keeps its royal underline.

### Eyebrow tag vs. H1 title

The eyebrow is the short **wayfinding tag** (the section's category). The H1 is the section's **plain-language title**. The two are never identical. The H1 is always a fuller, human heading, not an echo of the tag. Even a clean one-word tag like Overview or Current Reality gets its own title (e.g. "Why We're Here", "Where Things Stand"), never a repeat of the tag word.

### Proposal section map (recommended)

For an engagement proposal, use this section flow. The eyebrow tags stay consistent proposal to proposal; the H1 titles carry the plain-language heading. Not every proposal uses every section, and titles can be tuned to the engagement, but keep the tag/title distinction.

| # | Eyebrow tag | H1 title |
|---|-------------|----------|
| 01 | Overview | Why We're Here |
| 02 | Current Reality | Where Things Stand |
| 03 | The Plan | The Path Forward (or How We Will Work Together) |
| 04 | Scope | What's Included (or Deliverables) |
| 05 | Investment | Components & Cost |
| 06 | Payment & Next Steps | Where We Go From Here |

The Investment section still uses the redesigned pricing block below; only its H1 title changes (the eyebrow tag stays "Investment"). The Payment & Next Steps section keeps that eyebrow tag and lands on a specific, owner-assigned next step under the "Where We Go From Here" title.

---

## Cover Pages

There are two cover styles. Choose based on the document type.

### Standard Cover (default)

Use for formal deliverables: proposals, reports, assessments, staffing plans, and anything that benefits from a traditional, corporate feel. White background with structured branding elements. No header. Confidentiality notice in the footer.

#### Structure (top to bottom):
1. Clearway logo, dark version (160x35px), `references/clearway-logo-dark.png`, top left
2. Vertical spacer (before: 1800 DXA)
3. Brand label: "CLEARWAY CHURCH SOLUTIONS", Royal Blue, 9pt bold, characterSpacing: 120
4. Document title: 28pt bold, Dark Navy (a light-weight setup line followed by a bold emphasis line reads most on-brand, e.g. a 28pt regular "2026/27" over a 28pt bold "Partnership Proposal")
5. Subtitle: 12pt, Gray 500
6. Royal Blue accent bar: 12pt thick bottom border
7. **Metadata row, TWO fields by default: "Prepared for" and "Date".** Labels in Gray 400 (9pt, uppercase, characterSpacing 120). **Do not put "Version" on the cover**: it is an internal artifact, not client-facing. Add an **optional third field only when the document needs it** (e.g. "Valid until" on a time-bound proposal, "Facilitated by" on a workshop brief).

The **"Prepared for" value is a stacked recipient block**, not a single line:
- Line 1: **Name**, and **`, Title`** when a title is known (Navy 11pt **bold**)
- Line 2: **Organization name** (Navy 11pt regular)
- Line 3: **City, Province/State** (Gray 500 11pt regular)

**Determining the name.** If the person naming the recipient hasn't given a primary contact in the conversation, look the church up in the **Clearway team hub** (the same client source the `clearway-agreements` skill reads) and use its primary contact. If the contact can't be found there and hasn't been provided, ask before finalizing the cover. Include the title only when it is actually on record; omit line 1's title otherwise.

Metadata as a borderless 2- or 3-column table (`columnWidths` summing to CONTENT_WIDTH; e.g. two columns `[4680, 4680]`, three columns `[3120, 3120, 3120]`).

```javascript
// Stacked "Prepared for" cell. `lines` = [{ text, bold, color }, ...]
function preparedForCell(label, lines, cellWidth) {
  return new TableCell({
    width: { size: cellWidth, type: WidthType.DXA }, borders: noBorders,
    margins: { top: 0, bottom: 0, left: 0, right: 120 },
    children: [
      new Paragraph({ spacing: { after: 40 }, children: [
        new TextRun({ text: label, font: FONT, size: 18, color: GRAY400, characterSpacing: 120 })
      ] }),
      ...lines.map((ln, i) => new Paragraph({
        spacing: { after: i === lines.length - 1 ? 0 : 20, line: 264 },
        children: [ new TextRun({ text: ln.text, font: FONT, size: ln.size || 22, bold: !!ln.bold, color: ln.color || NAVY }) ]
      })),
    ]
  });
}
// Recipient lines, e.g.:
// preparedForCell("PREPARED FOR", [
//   { text: "Michelle Mercer", bold: true, color: NAVY },          // add ", Lead Pastor" if title known
//   { text: "Calvary Church", color: NAVY },
//   { text: "Peterborough, ON", color: GRAY500 },
// ], 4680)
```

### Immersive Cover (alternate)

Use for guides, workbooks, toolkits, diagnostics, and workshop materials, documents that feel more like a resource someone picks up and works through, rather than a report they receive. Full Royal Blue patterned background with white text.

This cover requires two extra steps:
1. Generate the background pattern: `python scripts/generate-cover-pattern.py /tmp/clearway-docs/cover-pattern.png` (auto-installs cairosvg if needed)
2. Use the light logo: `references/clearway-logo-light.png` (lime icon + white wordmark, designed for dark backgrounds)

Additional imports needed for the floating background image:
```javascript
const { HorizontalPositionAlign, VerticalPositionAlign, HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom, TextWrappingType } = require("docx");
```

#### Structure (top to bottom):
1. Floating background image, the generated pattern PNG, behind text, covering the full page
2. Clearway logo, light version (160x35px), `references/clearway-logo-light.png`, top left
3. Large vertical spacer (before: 3200 DXA)
4. Short Lime (#d2ff71) accent bar, a small table cell, 800 DXA wide, with Lime shading (this is a sanctioned small lime accent ON the dark background)
5. Document title line 1: 30pt bold, white (the main noun/concept)
6. Document title line 2: 30pt regular, white (the document type)
7. Subtitle: 11pt, Soft Lime (#e6ffa8), key elements separated by " / " (e.g., "Character / Competency / Credibility / Chemistry")
8. Description: 11pt, light blue (#b8d4fe), one to two sentences
9. Cream metadata card: three-column table with #FFF9ED background, Royal Blue labels, Gray 200 underlines for fill-in fields. Use "PREPARED FOR", "DATE", and a third field appropriate to the document (e.g., "FACILITATED BY", "COMPLETED BY"). Not "Version".

Page margins for immersive cover: standard 1440 all sides (the pattern image bleeds behind them as a floating element).

#### Floating background image pattern:
```javascript
new Paragraph({
  spacing: { after: 0 },
  children: [
    new ImageRun({
      type: "png",
      data: coverPatternImg,
      transformation: { width: 816, height: 1056 },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
        wrap: { type: TextWrappingType.NONE },
        behindDocument: true,
        lockAnchor: true,
      },
    }),
  ],
}),
```

#### Lime accent bar pattern:
```javascript
new Table({
  width: { size: 800, type: WidthType.DXA },
  columnWidths: [800],
  rows: [ new TableRow({ children: [ new TableCell({
    width: { size: 800, type: WidthType.DXA }, borders: noBorders,
    shading: { fill: "d2ff71", type: ShadingType.CLEAR },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [ new TextRun({ text: " ", font: FONT, size: 10 }) ] })]
  }) ] }) ]
}),
```

#### Cream metadata card pattern:
```javascript
const CREAM = "FFF9ED";
// Each cell: shading fill CREAM, noBorders, Royal Blue label (size 16, bold, characterSpacing 60),
// underline via paragraph with bottom border (Gray 200, 1pt, space 4)
```

### Confidentiality Notice (in cover page footer):
```javascript
new Footer({
  children: [
    new Paragraph({
      spacing: { before: 0, after: 40 },
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: "e5e7eb", space: 6 } },
      children: [ new TextRun({ text: "CONFIDENTIAL", font: FONT, size: 14, bold: true, color: "9ca3af", characterSpacing: 60 }) ]
    }),
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [ new TextRun({ text: "This document is prepared exclusively for the named recipient. It contains information belonging to Clearway Church Solutions. Please do not distribute without permission.", font: FONT, size: 14, color: "9ca3af" }) ]
    }),
  ]
})
```

---

## One-Pager Header (NEW)

For single-page documents (a summary, a leave-behind, a one-page brief) do **not** spend a whole page on a cover. Open with a compact header instead: a borderless two-column table with the eyebrow + title on the left and the dark logo on the right, sitting on a 4pt royal bottom border.

```javascript
function onePagerHeader(title, eyebrowText) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [6600, 2760],
    borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 24, color: ROYAL, space: 6 } },
    rows: [ new TableRow({ children: [
      new TableCell({
        width: { size: 6600, type: WidthType.DXA }, borders: noBorders, verticalAlign: "bottom",
        margins: { top: 0, bottom: 60, left: 0, right: 0 },
        children: [
          new Paragraph({ spacing: { after: 40 }, children: [ new TextRun({ text: (eyebrowText || "Clearway Church Solutions").toUpperCase(), font: FONT, size: 16, bold: true, color: ROYAL, characterSpacing: 120 }) ] }),
          new Paragraph({ spacing: { after: 0 }, children: [ new TextRun({ text: title, font: FONT, size: 40, bold: true, color: NAVY }) ] }),
        ]
      }),
      new TableCell({
        width: { size: 2760, type: WidthType.DXA }, borders: noBorders, verticalAlign: "bottom",
        margins: { top: 0, bottom: 60, left: 0, right: 0 },
        children: [ new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [
          new ImageRun({ type: "png", data: logoDark, transformation: { width: 110, height: 24 }, altText: { title: "Clearway", description: "Clearway logo", name: "onepager-logo" } })
        ] }) ]
      }),
    ] }) ]
  });
}
```

Follow it with a `lead(...)` line and, optionally, a `statStrip(...)`.

---

## Lead Paragraph (NEW)

A single larger opening line, one notch above body. Use it to frame a one-pager or open a major section. One idea only.

```javascript
function lead(text) {
  return new Paragraph({
    spacing: { before: 120, after: 220 }, // line spacing a touch looser than body
    children: [ new TextRun({ text, font: FONT, size: 26, color: NAVY }) ]
  });
}
```

---

## Stat Strip (NEW)

An optional row of two to four figures, for reports and one-pagers. Borderless table; each cell has a Gray 100 background, a big royal number, and a small gray label. **Use with restraint**: only genuinely meaningful numbers, never invented stats to fill space.

```javascript
function statStrip(items) { // items: [{ value, label }, ...] (2-4)
  const gutter = 200;
  const w = Math.floor((CONTENT_WIDTH - gutter * (items.length - 1)) / items.length);
  const cells = [];
  items.forEach((it, i) => {
    if (i > 0) cells.push(new TableCell({ width: { size: gutter, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ children: [] })] }));
    cells.push(new TableCell({
      width: { size: w, type: WidthType.DXA }, borders: noBorders,
      shading: { fill: GRAY100, type: ShadingType.CLEAR },
      margins: { top: 160, bottom: 160, left: 180, right: 180 },
      children: [
        new Paragraph({ spacing: { after: 20 }, children: [ new TextRun({ text: it.value, font: FONT, size: 44, bold: true, color: ROYAL }) ] }),
        new Paragraph({ spacing: { after: 0 }, children: [ new TextRun({ text: it.label, font: FONT, size: 18, color: "6b7280" }) ] }),
      ]
    }));
  });
  const colWidths = []; items.forEach((it, i) => { if (i > 0) colWidths.push(gutter); colWidths.push(w); });
  return new Table({ layout: TableLayoutType.FIXED, width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: colWidths, rows: [ new TableRow({ cantSplit: true, children: cells }) ] });
}
```

---

## Footer

Content pages use a three-column borderless table for the footer, which renders correctly in Google Docs (tab stops with images break there). The footer has a thin Gray 200 divider line above it with 240 DXA spacing.

Layout: **Logo (left)** | **Document title (center)** | **Page N (right)**. All footer text: 9pt (size: 18), Gray 400.

```javascript
function contentFooter(docTitle) {
  return new Footer({
    children: [
      new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "e5e7eb", space: 1 } }, children: [] }),
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [ new TableRow({ children: [
          new TableCell({ width: { size: 3120, type: WidthType.DXA }, borders: noBorders, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: "center",
            children: [new Paragraph({ spacing: { after: 0 }, children: [ new ImageRun({ type: "png", data: logoDark, transformation: { width: 100, height: 22 }, altText: { title: "Clearway Logo", description: "Clearway Church Solutions logo", name: "footer-logo" } }) ] })] }),
          new TableCell({ width: { size: 3120, type: WidthType.DXA }, borders: noBorders, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: "center",
            children: [new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: docTitle, font: FONT, size: 18, color: "9ca3af" })] })] }),
          new TableCell({ width: { size: 3120, type: WidthType.DXA }, borders: noBorders, margins: { top: 0, bottom: 0, left: 0, right: 0 }, verticalAlign: "center",
            children: [new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.RIGHT, children: [ new TextRun({ text: "Page ", font: FONT, size: 18, color: "9ca3af" }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "9ca3af" }) ] })] }),
        ] }) ]
      })
    ]
  });
}
```

The logo file is at: `references/clearway-logo-dark.png` (relative to the skill root).

---

## Table of Contents

Placed on its own page (section 2). Title is "Contents" in 22pt bold Navy (a plain styled paragraph, not a heading, so it doesn't appear in the TOC itself). Royal Blue accent bar below. Include for documents of 5+ content pages; skip for short guides, one-pagers, and workbooks.

```javascript
new Paragraph({ spacing: { after: 300 }, children: [ new TextRun({ text: "Contents", font: FONT, size: 44, bold: true, color: NAVY }) ] }),
new Paragraph({ spacing: { after: 400 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ROYAL, space: 8 } }, children: [] }),
new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
```

Enable field update so the TOC populates in Word: `features: { updateFields: true }`. Google Docs converts the field code into its native TOC widget automatically. For the TOC to pick up headings, each heading MUST use `heading: HeadingLevel.HEADING_n`.

---

## Executive Summary

A gray-shaded box immediately after the first H1 (after its eyebrow). Borderless single-cell table, Gray 100 background, generous padding.

```javascript
new Table({
  layout: TableLayoutType.FIXED,
  width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [CONTENT_WIDTH],
  rows: [ new TableRow({ cantSplit: true, children: [ new TableCell({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    shading: { fill: "f3f4f6", type: ShadingType.CLEAR }, borders: noBorders,
    margins: { top: 200, bottom: 200, left: 240, right: 240 },
    children: [ /* 1-3 paragraphs of summary text at 11pt Navy */ ]
  }) ] }) ]
})
```

---

## Headings

Override built-in styles. All headings use Plus Jakarta Sans.

```javascript
styles: {
  paragraphStyles: [
    { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 44, bold: true, font: FONT, color: NAVY },
      paragraph: { spacing: { before: 200, after: 200 }, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ROYAL, space: 8 } } } },
    { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 32, bold: true, font: FONT, color: NAVY },
      paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 1 } },
    { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 24, bold: true, font: FONT, color: ROYAL },
      paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 } },
  ]
}
```

Note: H1 `spacing.before` is reduced to 200 because the eyebrow (with its own `before: 360`) now supplies the space above the heading. **H3 text must be written in actual UPPERCASE characters**: Google Docs ignores `allCaps`/`smallCaps`.

---

## Body Text and Lists

Body: 11pt Plus Jakarta Sans, Dark Navy, 1.15 line spacing.

### Bullets
```javascript
numbering: { config: [
  { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
] }
```
Each bullet item: spacing after: 80.

### Numbered Lists
Same indent structure, `LevelFormat.DECIMAL`, text: `"%1."`. Never use unicode bullet characters directly, always use the numbering config. For a "next steps" list where the ordinal should read as a royal token, a numbered list is fine; keep it simple.

---

## Tables (plain / data)

Minimal, borderless design for schedules, responsibilities, and comparisons. Navy header row, alternating Gray 100 / white body rows, subtle Gray 200 bottom borders only.

- **Header row**: NAVY background (`ShadingType.CLEAR`), white 10pt bold text, Royal Blue 4pt bottom border, no other borders.
- **Data rows**: alternating Gray 100 / white, Gray 200 1pt bottom border only, 10pt Navy text, cell padding `{ top: 80, bottom: 80, left: 140, right: 140 }`.
- **Widths**: always `WidthType.DXA`; `columnWidths` must sum to the table width; each cell `width` matches its column; full-width tables use CONTENT_WIDTH (9360).

```javascript
function dataTable(headers, rows, colWidths) {
  // Navy header row + alternating body rows, per the spec above.
}
```

---

## Investment / Pricing Block (REDESIGNED)

The pricing moment of a proposal. It has three parts: a **comparison table**, a **totals band**, and a **note**.

### Pricing rules (hard)

1. **Show the cost, not the tax.** The headline figure and the table's final row are the **pre-tax partnership cost**. Note that HST applies (e.g. a "Plus HST (13%)" sub-line), but **never add tax on top** into a grand total, and never show a tax-inclusive number as the total. There is **no Subtotal + HST + Total stack**: the table ends on a single **Total** row at the cost.
2. **Two price columns.** A struck-through **Standard** column (Gray 400, `strike: true`) and a bold **Partnership** column (Navy). Items included at no charge read **"Included"** in Royal, not "$0".
3. **Savings is outlined, not filled.** The "You save" figure sits in a **white, royal-outlined** card, never a lime block.

### Comparison table

- Header row: NAVY background. `Component` white left-aligned; `Standard` in Gray 400 right-aligned; the partnership column label (e.g. `2026/27 Partnership`) in **Soft Lime (#e6ffa8)** bold right-aligned, a sanctioned reversed label on the dark header. Royal 4pt bottom border.
- Body rows: alternating Gray 100 / white. Component cell = name (Navy 10.5pt, `bold: true`) plus an optional descriptor paragraph (Gray 500, 9pt). Standard cell = Gray 400 with `strike: true`. Partnership cell = Navy bold, or "Included" in Royal.
- Final row = **Total**: label "Total for [year]" Navy 11pt bold; Standard struck; Partnership Navy 11pt bold (the cost). No bottom border on this last row.

Suggested column widths: `[5760, 1680, 1920]` (sum 9360).

### Totals band

A borderless two-column table below the comparison. Left = the cost, on navy. Right = the saving, outlined.

```javascript
function totalsBand({ label, includes, total, saved }) {
  const GUT = 240, LEFT = 5340, RIGHT = 3780; // 5340 + 240 + 3780 = 9360
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [LEFT, GUT, RIGHT],
    rows: [ new TableRow({ cantSplit: true, children: [
      // Total block: solid NAVY (docx has no gradient; solid navy is the correct translation)
      new TableCell({
        width: { size: LEFT, type: WidthType.DXA }, borders: noBorders,
        shading: { fill: NAVY, type: ShadingType.CLEAR },
        margins: { top: 200, bottom: 200, left: 240, right: 240 }, verticalAlign: "center",
        children: [
          new Paragraph({ spacing: { after: 40 }, children: [ new TextRun({ text: label.toUpperCase(), font: FONT, size: 16, bold: true, color: SKY, characterSpacing: 120 }) ] }),
          new Paragraph({ spacing: { after: 40 }, children: [ new TextRun({ text: total, font: FONT, size: 52, bold: true, color: "FFFFFF" }) ] }),
          new Paragraph({ spacing: { after: 0 }, children: [ new TextRun({ text: includes, font: FONT, size: 18, color: "b8d4fe" }) ] }),
        ]
      }),
      new TableCell({ width: { size: GUT, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ children: [] })] }),
      // Savings block: WHITE with a ROYAL outline (never lime fill)
      new TableCell({
        width: { size: RIGHT, type: WidthType.DXA },
        shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
        borders: { top: { style: BorderStyle.SINGLE, size: 12, color: ROYAL }, bottom: { style: BorderStyle.SINGLE, size: 12, color: ROYAL }, left: { style: BorderStyle.SINGLE, size: 12, color: ROYAL }, right: { style: BorderStyle.SINGLE, size: 12, color: ROYAL } },
        margins: { top: 200, bottom: 200, left: 220, right: 220 }, verticalAlign: "center",
        children: [
          new Paragraph({ spacing: { after: 40 }, children: [ new TextRun({ text: "YOU SAVE", font: FONT, size: 16, bold: true, color: ROYAL, characterSpacing: 120 }) ] }),
          new Paragraph({ spacing: { after: 40 }, children: [ new TextRun({ text: saved, font: FONT, size: 44, bold: true, color: NAVY }) ] }),
          new Paragraph({ spacing: { after: 0 }, children: [ new TextRun({ text: "against standard pricing", font: FONT, size: 18, color: "6b7280" }) ] }),
        ]
      }),
    ] }) ]
  });
}
```

`label` is e.g. "Total for 2026/27"; `includes` is a short list ending in the HST note, e.g. "Coaching, three sessions, CORE, and ad hoc support. Plus HST (13%)."; `total` is the cost (e.g. "$8,400"); `saved` is the difference against standard (e.g. "$3,100").

### Note line

A small Gray 500 paragraph under the band, stating that prices are the partnership cost and HST applies on top:

```javascript
new Paragraph({ spacing: { before: 200, after: 0 }, children: [
  new TextRun({ text: "Prices shown are the partnership cost for the year. HST of 13% is applied on top.", font: FONT, size: 20, color: "6b7280" })
] })
```

---

## Callout Boxes

Single-cell tables with a thick left border accent. Three variants. All callout body text 11pt Navy; label-to-body spacing 60; cell margins `{ top: 140, bottom: 140, left: 200, right: 200 }`.

- **Key Insight (Blue)**: left border Royal (#3f72de) 18pt; background #EBF0FF; label "KEY INSIGHT" Royal 9pt bold, characterSpacing 60.
- **Action Step (Green)**: left border #7AB830 18pt; background #F0FAE6; label "ACTION STEP" #4A7A15.
- **Caution (Orange)**: left border #f15025 18pt; background #FEF0EC; label "CAUTION" #c13d1a. Use sparingly.

```javascript
function calloutBox(label, labelColor, borderColor, bgFill, bodyText) {
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [CONTENT_WIDTH],
    rows: [ new TableRow({ cantSplit: true, children: [ new TableCell({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      shading: { fill: bgFill, type: ShadingType.CLEAR },
      borders: { top: noBorder, right: noBorder, bottom: noBorder, left: { style: BorderStyle.SINGLE, size: 18, color: borderColor } },
      margins: { top: 140, bottom: 140, left: 200, right: 200 },
      children: [
        new Paragraph({ spacing: { after: 60 }, children: [ new TextRun({ text: label, font: FONT, size: 18, bold: true, color: labelColor, characterSpacing: 60 }) ] }),
        new Paragraph({ spacing: { after: 0 }, children: [ new TextRun({ text: bodyText, font: FONT, size: 22, color: NAVY }) ] }),
      ]
    }) ] }) ]
  });
}
```

---

## Quote Block

For testimonials, scripture, or standout statements. Sky Blue left border (24pt), white background. Quote 12pt italic Navy. Attribution 9pt Gray 500, on its own line, with no em-dash prefix (brand rule: never lead an attribution with an em dash). If you want a lead mark, prefix the name with a middot: `"\u2022 " + name`.

```javascript
new Table({
  width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [CONTENT_WIDTH],
  rows: [ new TableRow({ children: [ new TableCell({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    borders: { top: noBorder, right: noBorder, bottom: noBorder, left: { style: BorderStyle.SINGLE, size: 24, color: "99c5fe" } },
    shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
    margins: { top: 160, bottom: 160, left: 280, right: 200 },
    children: [
      new Paragraph({ spacing: { after: 100 }, children: [ new TextRun({ text: "\u201C" + quoteText + "\u201D", font: FONT, size: 24, italics: true, color: NAVY }) ] }),
      new Paragraph({ spacing: { after: 0 }, children: [ new TextRun({ text: attribution, font: FONT, size: 18, color: "6b7280" }) ] }),
    ]
  }) ] }) ]
})
```

---

## Two-Column Layout

For side-by-side comparisons (e.g. "What is strong" / "Where the year needs attention"). Three-column borderless table: content | gutter | content.

- Column width: 4440 DXA each, 480 DXA gutter
- Left column header: 13pt bold Navy with **Royal Blue** 4pt bottom border. Right column header: 13pt bold Navy with **Sky Blue** 4pt bottom border (differentiates the two sides).
- Item title: 11pt bold Navy; item detail: 10.5pt Gray 600. Body text 11pt Navy.

```javascript
new Table({ layout: TableLayoutType.FIXED, width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [4440, 480, 4440], rows: [ /* header + content rows, each new TableRow({ cantSplit: true, ... }) */ ] })
```

---

## Timeline / Milestones

Two-column borderless table with a Royal Blue vertical line connecting phases.

- Left column (1800 DXA): phase labels, 8pt bold Royal Blue UPPERCASE (characterSpacing 100), right-aligned. **Right border on the left column: Royal Blue, 6pt**: this is the vertical rail.
- Right column (7560 DXA): title in 12pt bold Navy, description in 11pt Navy.
- Give each row `top`/`bottom` cell margins so the phases breathe (e.g. `{ top: 40, bottom: 200 }` on the right column).
- **Baseline alignment.** The 8pt phase label and the 12pt title start at the same top, so the smaller label otherwise sits above the title's line. Drop the label so their baselines meet: left (label) cell top margin ≈ 104 DXA, content cell top margin ≈ 40 DXA, so the small label baseline meets the title baseline. Adjust the label top margin if the title size changes.

(The on-brand HTML version places a dot node where each phase meets the rail; Word cannot reliably center a floating node on a cell border, so the docx timeline uses the clean rail + label treatment. Do not attempt to fake the dot with a positioned image.)

---

## Signature Block

Follows a horizontal rule (and usually a page break). The block uses the **handwritten signature image**, not a drawn line or a "Prepared by" label. Structure, top to bottom:

1. Handwritten signature image: `references/signature.png` (source 600x300, transparent PNG, 2:1). Left-aligned, ~200x100px. Keep the 2:1 ratio if you resize.
2. Name: 12pt bold Navy (Chris Vacher)
3. Title: 10pt Gray 500 (Founder & Lead Consultant)
4. Organization: 10pt Gray 500 (Clearway Church Solutions)
5. Email: 10pt Royal Blue (chris@clearway.co)

The image sits directly above the name with tight spacing; the four text lines are closely stacked. There is no "Prepared by" label and no drawn 2pt signature line (that older treatment is retired).

```javascript
const fs = require("fs");
const signatureImg = fs.readFileSync("references/signature.png"); // load once, near the logos

function signatureBlock() {
  return [
    new Paragraph({
      spacing: { before: 0, after: 40 },
      children: [ new ImageRun({
        type: "png", data: signatureImg,
        transformation: { width: 200, height: 100 }, // source 600x300, keep 2:1
        altText: { title: "Signature", description: "Chris Vacher signature", name: "signature" }
      }) ]
    }),
    new Paragraph({ spacing: { after: 20 }, children: [ new TextRun({ text: "Chris Vacher", font: FONT, size: 24, bold: true, color: NAVY }) ] }),
    new Paragraph({ spacing: { after: 20 }, children: [ new TextRun({ text: "Founder & Lead Consultant", font: FONT, size: 20, color: GRAY500 }) ] }),
    new Paragraph({ spacing: { after: 20 }, children: [ new TextRun({ text: "Clearway Church Solutions", font: FONT, size: 20, color: GRAY500 }) ] }),
    new Paragraph({ spacing: { after: 0 }, children: [ new TextRun({ text: "chris@clearway.co", font: FONT, size: 20, color: ROYAL }) ] }),
  ];
}
// Emit with a spread: ...signatureBlock() (it returns an array of paragraphs)
```

---

## Closing Section

After the signature block:
1. Royal Blue accent bar (12pt thick bottom border)
2. Centered contact line: "clearway.co  |  chris@clearway.co", with "clearway.co" Royal bold, the pipe Gray 400, and the email Gray 500.

---

## Horizontal Rules

Paragraph with bottom border only. Gray 200, 2pt. Spacing: before 300, after 300.

```javascript
new Paragraph({ spacing: { before: 300, after: 300 }, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "e5e7eb", space: 1 } }, children: [] })
```

---

## Google Docs Compatibility

These patterns are tested in Google Docs. Key rules:

1. **`TableOfContents` with `features: { updateFields: true }`**: Google Docs converts the field code into its native TOC widget. Do NOT build the TOC manually.
2. **Borderless tables for every multi-column layout**: footers, totals band, stat strip, two-column, one-pager header. Tab stops with images break in Google Docs.
3. **Write H3 and eyebrow/label text in actual uppercase**: Google Docs ignores `allCaps`/`smallCaps`.
4. **Always `WidthType.DXA`** for widths, since `WidthType.PERCENTAGE` breaks.
5. **`ShadingType.CLEAR`** for cell backgrounds, since `ShadingType.SOLID` renders black.
6. **No gradients, no rounded corners, no box-shadows** exist in docx. The navy total block is a solid navy fill; the savings card is a square royal-outlined white cell. This is the correct translation of the brand's rounded/gradient web treatment; do not try to emulate them.
7. **Plus Jakarta Sans** renders natively in Google Docs.
8. **Never place two tables directly against each other.** Google Docs merges adjacent tables that touch, forcing the second into the first table's column grid (a full-width summary box collapses to one narrow column). Always put a spacer paragraph between consecutive block elements built as tables, executive summary, stat strip, callouts, two-column, timeline, pricing table, totals band. Use `new Paragraph({ spacing: { after: 140 }, children: [] })` between them. LibreOffice does not merge tables, so this bug only shows in Google Docs; a clean LibreOffice/PDF render does not clear it.
9. **Every table sets `layout: TableLayoutType.FIXED`** so Google Docs honors the DXA column widths instead of auto-fitting to content. Import it with the other docx symbols: `const { ..., TableLayoutType } = require("docx");`
10. **Box-style tables set `cantSplit: true` on their rows** so a shaded block, callout, stat strip, totals band, two-column layout, or timeline phase does not break across a page. Apply to the row(s) of: executive summary, callout boxes, stat strip, totals band, two-column, timeline. (Long plain data tables may still split; that is fine.)

Helper for the table gap (rule 8):

```javascript
function tableGap() { return new Paragraph({ spacing: { after: 140 }, children: [] }); }
```

The executive summary reflects rules 9 and 10 (`layout: TableLayoutType.FIXED` on the table, `cantSplit: true` on the box row):

```javascript
new Table({
  layout: TableLayoutType.FIXED,                 // was: (none)
  width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [CONTENT_WIDTH],
  rows: [ new TableRow({ cantSplit: true, children: [ /* ...cell... */ ] }) ]
})
```

Apply the same two properties (`layout: TableLayoutType.FIXED` on the table, `cantSplit: true` on box rows) to `calloutBox`, `statStrip`, `totalsBand`, the two-column layout, and the timeline.
