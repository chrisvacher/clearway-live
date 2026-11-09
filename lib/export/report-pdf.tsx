// The report as a PDF (milestone 7, step 5): the same document model as the Word file, drawn with @react-pdf/renderer in Plus Jakarta Sans (the full font files
// from the design system, regular, bold and italic) and Clearway's document colours. It follows the Word file's look as closely as react-pdf allows: a white page, a
// cover with the logo, eyebrows over H1s, navy table headers with alternating rows, quote and thin data blocks with a left rule, and a footer on every inside page.
import React from "react";
type Lib = typeof import("@react-pdf/renderer");
import { fontFile, logoPath, logoPng } from "./assets";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image has no alt prop; the logo is decorative */
import { CONFIDENTIAL, COVER_LABELS, DRAFT_MARK, FIRM, type Block, type ReportModel } from "./report-model";

const NAVY = "#03294e", ROYAL = "#3f72de", SKY = "#99c5fe", GRAY100 = "#f3f4f6", GRAY200 = "#e5e7eb", GRAY400 = "#9ca3af", GRAY500 = "#6b7280", INSIGHT = "#EBF0FF";
const FAMILY = "Plus Jakarta Sans";
let registered = false;
// @react-pdf/renderer is an ES module only, so it is loaded when a PDF is built (the Node runtime route, and the tests, which run as CommonJS).
function make(R: Lib, model: ReportModel) {
  const { Document, Font, Image, Link, Page, Text, View, StyleSheet } = R;
  if (!registered) {
    registered = true;
    Font.register({ family: FAMILY, fonts: [
      { src: fontFile(400), fontWeight: 400 }, { src: fontFile(700), fontWeight: 700 },
      { src: fontFile(400, "italic"), fontWeight: 400, fontStyle: "italic" }, { src: fontFile(700, "italic"), fontWeight: 700, fontStyle: "italic" },
    ] });
    Font.registerHyphenationCallback(word => [word]);
  }
const s = StyleSheet.create({
  page: { fontFamily: FAMILY, fontSize: 11, color: NAVY, paddingTop: 72, paddingBottom: 96, paddingHorizontal: 72, lineHeight: 1.45 },
  cover: { fontFamily: FAMILY, color: NAVY, padding: 72 },
  metaLabel: { fontSize: 9, color: GRAY400, letterSpacing: 1.8, marginBottom: 3 },
  coverNote: { position: "absolute", left: 72, width: 468, top: 724, borderTopWidth: 0.75, borderTopColor: GRAY200, paddingTop: 8 },
  noteText: { fontSize: 7, color: GRAY400, lineHeight: 1.3 },
  draftMark: { position: "absolute", top: 30, right: 72, fontSize: 9, letterSpacing: 1.8, color: GRAY500 },
  footRule: { position: "absolute", left: 72, width: 468, top: 724, borderTopWidth: 0.75, borderTopColor: GRAY200 },
  footLogo: { position: "absolute", left: 72, top: 736, width: 90, height: 20 },
  footMid: { position: "absolute", left: 72, width: 468, top: 742, textAlign: "center" },
  footRight: { position: "absolute", left: 72, width: 468, top: 742, textAlign: "right" },
  footText: { fontSize: 9, color: GRAY400 },
  eyebrow: { marginTop: 18, marginBottom: 2, fontSize: 8, fontWeight: 700, color: ROYAL, letterSpacing: 1.8 },
  h1: { fontSize: 22, fontWeight: 700, lineHeight: 1.2, paddingBottom: 8, marginBottom: 10, borderBottomWidth: 2, borderBottomColor: ROYAL },
  h2: { fontSize: 16, fontWeight: 700, marginTop: 14, marginBottom: 7 },
  p: { marginBottom: 8 },
  rule: { marginTop: 6, borderTopWidth: 0.75, borderTopColor: GRAY200 },
  quote: { borderLeftWidth: 3, borderLeftColor: SKY, paddingVertical: 8, paddingLeft: 14, paddingRight: 10, marginBottom: 10 },
  quoteText: { fontSize: 12, fontStyle: "italic" },
  callout: { borderLeftWidth: 4.5, borderLeftColor: ROYAL, backgroundColor: INSIGHT, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 10 },
  calloutLabel: { fontSize: 9, color: ROYAL, letterSpacing: 0.8, marginBottom: 3 },
  thead: { flexDirection: "row", backgroundColor: NAVY, borderBottomWidth: 4, borderBottomColor: ROYAL },
  th: { color: "#FFFFFF", fontSize: 10, paddingVertical: 4, paddingHorizontal: 7 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: GRAY200 },
  td: { fontSize: 10, paddingVertical: 4, paddingHorizontal: 7 },
  cardRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: GRAY200, paddingVertical: 4 },
  cardLabel: { width: "23.5%", fontSize: 9, color: ROYAL, paddingRight: 7 },
  cardText: { width: "76.5%", fontSize: 10.5, paddingLeft: 7 },
  meta: { fontSize: 9, color: GRAY500, marginTop: 2 },
  bullet: { flexDirection: "row", marginBottom: 4 },
});

const pct = (w: number[], i: number) => `${(w[i] / 9360 * 100).toFixed(2)}%`;
const cellLines = (t: string) => { const l = t.split("\n").filter(Boolean); return l.length ? l : [""]; };

// Page breaks. A heading is drawn together with the start of what it heads, inside a box that cannot split, so the pair moves to the next page as one and a
// heading is never the last thing on a page. What counts as the start: a card is the whole card (cards are short; a very long one may split), a table is its
// header and first row, a list is its first item. A table's last two rows stay together too, so no page starts with a single stray row. A paragraph is plain
// text that may split, so a heading before one asks for room for a few lines instead.
const longCard = (b: Extract<Block, { type: "card" }>) => b.lines.reduce((n, l) => n + l.text.length + l.meta.length, 0) > 1800;

function CardView({ b, split }: { b: Extract<Block, { type: "card" }>; split: boolean }) {
  return <View style={{ marginBottom: 10 }} wrap={split}><Text style={s.h2} minPresenceAhead={split ? 90 : 0}>{b.title}</Text>
    {b.lines.map((l, i) => <View key={i} style={s.cardRow} wrap={false}><Text style={s.cardLabel}>{l.label}</Text><View style={s.cardText}><Text>{l.text}</Text>{l.meta ? <Text style={s.meta}>{l.meta}</Text> : null}</View></View>)}</View>;
}

function TableParts({ b }: { b: Extract<Block, { type: "table" }> }) {
  const row = (r: string[], n: number) => <View key={n} style={[s.tr, { backgroundColor: n % 2 === 0 ? GRAY100 : "#FFFFFF" }]} wrap={false}>
    {b.columns.map((_, i) => <View key={i} style={[s.td, { width: pct(b.widths, i) }]}>{cellLines(r[i] ?? "").map((t, k) => <Text key={k} style={k ? { marginTop: 4 } : undefined}>{t}</Text>)}</View>)}</View>;
  const head = <View style={s.thead} wrap={false}>{b.columns.map((c, i) => <Text key={i} style={[s.th, { width: pct(b.widths, i) }]}>{c}</Text>)}</View>;
  const n = b.rows.length, tail = n >= 3 ? n - 2 : n;
  return {
    lead: <>{head}{n ? row(b.rows[0], 0) : null}</>,
    rest: <View style={{ marginBottom: 10 }}>{b.rows.slice(1, tail).map((r, k) => row(r, k + 1))}
      {tail < n ? <View wrap={false}>{b.rows.slice(tail).map((r, k) => row(r, tail + k))}</View> : null}</View>,
  };
}

// The block as a start (kept with a heading before it) and the rest.
function parts(b: Block): { lead: React.ReactNode; rest: React.ReactNode } {
  switch (b.type) {
    case "paragraph": return { lead: null, rest: <Text style={s.p}>{b.text}</Text> };
    case "quote": return { lead: <View style={s.quote} wrap={false}><Text style={s.quoteText}>{`“${b.text}”`}</Text></View>, rest: null };
    case "callout": return { lead: <View style={s.callout} wrap={false}><Text style={s.calloutLabel}>{b.label}</Text><Text>{b.text}</Text></View>, rest: null };
    case "subheading": return { lead: null, rest: null };
    case "list": return { lead: b.items.length ? <View style={s.bullet} wrap={false}><Text style={{ width: 16 }}>{"•"}</Text><Text style={{ flex: 1 }}>{b.items[0]}</Text></View> : null,
      rest: <View>{b.items.slice(1).map((t, i) => <View key={i} style={s.bullet} wrap={false}><Text style={{ width: 16 }}>{"•"}</Text><Text style={{ flex: 1 }}>{t}</Text></View>)}</View> };
    case "card": return b.lines.length && !longCard(b) ? { lead: <CardView b={b} split={false} />, rest: null }
      : { lead: <><Text style={s.h2}>{b.title}</Text>{b.lines.slice(0, 1).map((l, i) => <View key={i} style={s.cardRow} wrap={false}><Text style={s.cardLabel}>{l.label}</Text><View style={s.cardText}><Text>{l.text}</Text>{l.meta ? <Text style={s.meta}>{l.meta}</Text> : null}</View></View>)}</>,
        rest: <View style={{ marginBottom: 10 }}>{b.lines.slice(1).map((l, i) => <View key={i} style={s.cardRow} wrap={false}><Text style={s.cardLabel}>{l.label}</Text><View style={s.cardText}><Text>{l.text}</Text>{l.meta ? <Text style={s.meta}>{l.meta}</Text> : null}</View></View>)}</View> };
    case "table": return TableParts({ b });
  }
}

// One section's blocks, each heading kept with the start of the block after it. The section's own heading counts as one: pass it as `top`.
function Blocks({ blocks, top }: { blocks: Block[]; top?: React.ReactNode }) {
  const out: React.ReactNode[] = [];
  let head: React.ReactNode = top ?? null, held = top !== undefined;
  blocks.forEach((b, k) => {
    if (b.type === "subheading" || (b.type === "card" && b.lines.length === 0)) { head = <>{held ? head : null}<Text style={s.h2}>{b.type === "card" ? b.title : b.text}</Text></>; held = true; return; }
    const p = parts(b);
    if (held) { out.push(<View key={`h${k}`} wrap={false} minPresenceAhead={p.lead ? 0 : 120}>{head}{p.lead}</View>); held = false; head = null; }
    else if (p.lead) out.push(<View key={`l${k}`} wrap={false}>{p.lead}</View>);
    if (p.rest) out.push(<React.Fragment key={`r${k}`}>{p.rest}</React.Fragment>);
  });
  if (held) out.push(<View key="end" wrap={false}>{head}</View>);
  return <>{out}</>;
}

function ReportPdf() {
  const mark = model.draft ? <Text style={s.draftMark} fixed>{DRAFT_MARK.toUpperCase()}</Text> : null;
  return <Document title={`${model.church} ${model.title}${model.draft ? ` (${DRAFT_MARK})` : ""}`} author={FIRM} creator={FIRM} producer={FIRM}>
    <Page size="LETTER" style={s.cover}>
      {mark}
      <Image src={logoPath()} style={{ width: 160, height: 35 }} />
      <Text style={{ marginTop: 90, marginBottom: 6, fontSize: 9, color: ROYAL, letterSpacing: 1.8 }}>CLEARWAY CHURCH SOLUTIONS</Text>
      <Text style={{ fontSize: 28, lineHeight: 1.2 }}>{model.church}</Text>
      <Text style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, marginBottom: 8 }}>{model.title}</Text>
      <View style={{ borderTopWidth: 4.5, borderTopColor: ROYAL, marginBottom: 12 }} />
      <View style={{ flexDirection: "row", marginBottom: 16 }}>
        <View style={{ width: "50%" }}><Text style={s.metaLabel}>{COVER_LABELS.prepared_for}</Text><Text>{model.church}</Text></View>
        {model.dates ? <View style={{ width: "50%" }}><Text style={s.metaLabel}>{COVER_LABELS.date}</Text><Text>{model.dates}</Text></View> : null}
      </View>
      <Text style={{ color: GRAY500, marginBottom: 6 }}>{model.preparedBy}</Text>
      {model.draft ? <Text style={{ color: GRAY500 }}>{`${DRAFT_MARK}. This report has not been signed off.`}</Text> : null}
      <View style={s.coverNote} fixed><Text style={s.footText}>{CONFIDENTIAL.head}</Text><Text style={s.noteText}>{CONFIDENTIAL.body}</Text></View>
    </Page>
    {model.contents && <Page size="LETTER" style={s.page}>
      {mark}
      <Text style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Contents</Text>
      <View style={{ borderTopWidth: 1.5, borderTopColor: ROYAL, marginBottom: 14 }} />
      {model.sections.map(sec => <Link key={sec.key} src={`#sec-${sec.number}`} style={{ color: NAVY, textDecoration: "none", marginBottom: 7 }}>{`${String(sec.number).padStart(2, "0")}   ${sec.heading}`}</Link>)}
    </Page>}
    <Page size="LETTER" style={s.page} wrap>
      {mark}
      <View style={s.footRule} fixed />
      <Image src={{ data: logoPng(), format: "png" }} style={s.footLogo} fixed />
      <Text style={[s.footText, s.footMid]} fixed>{model.title}</Text>
      <Text style={[s.footText, s.footRight]} fixed render={({ pageNumber }) => `Page ${pageNumber - 1 - (model.contents ? 1 : 0)}`} />
      {model.sections.map((sec, i) => <View key={sec.key}>
        {i > 0 && <View style={s.rule} />}
        <Blocks blocks={sec.blocks} top={<><Text style={s.eyebrow}>{sec.eyebrow}</Text><Text style={s.h1} id={`sec-${sec.number}`}>{sec.heading}</Text></>} />
      </View>)}
    </Page>
  </Document>;
}


  return <ReportPdf />;
}

export async function buildPdf(model: ReportModel): Promise<Buffer> {
  const R = await import("@react-pdf/renderer");
  return R.renderToBuffer(make(R, model));
}
