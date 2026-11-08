// The report as a PDF (milestone 7, step 5): the same document model as the Word file, drawn with @react-pdf/renderer in Plus Jakarta Sans (the woff files
// from @fontsource, regular, bold and italic) and Clearway's document colours. It follows the Word file's look as closely as react-pdf allows: a white page, a
// cover with the logo, eyebrows over H1s, navy table headers with alternating rows, quote and thin data blocks with a left rule, and a footer on every inside page.
import React from "react";
type Lib = typeof import("@react-pdf/renderer");
import { fontFile, logoPath, logoPng } from "./assets";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image has no alt prop; the logo is decorative */
import { DRAFT_MARK, FIRM, type Block, type ReportModel } from "./report-model";

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
  draftMark: { position: "absolute", top: 30, right: 72, fontSize: 9, letterSpacing: 1.8, color: GRAY500 },
  footRule: { position: "absolute", left: 72, width: 468, top: 724, borderTopWidth: 0.75, borderTopColor: GRAY200 },
  footLogo: { position: "absolute", left: 72, top: 736, width: 90, height: 20 },
  footMid: { position: "absolute", left: 72, width: 468, top: 742, textAlign: "center" },
  footRight: { position: "absolute", left: 72, width: 468, top: 742, textAlign: "right" },
  footText: { fontSize: 9, color: GRAY400 },
  eyebrow: { marginTop: 18, marginBottom: 2, fontSize: 8, fontWeight: 700, color: ROYAL, letterSpacing: 1.8 },
  h1: { fontSize: 22, fontWeight: 700, lineHeight: 1.2, paddingBottom: 8, marginBottom: 10, borderBottomWidth: 2, borderBottomColor: ROYAL },
  h2: { fontSize: 14, fontWeight: 700, marginTop: 14, marginBottom: 7 },
  p: { marginBottom: 8 },
  rule: { marginTop: 6, borderTopWidth: 0.75, borderTopColor: GRAY200 },
  quote: { borderLeftWidth: 3, borderLeftColor: SKY, paddingVertical: 8, paddingLeft: 14, paddingRight: 10, marginBottom: 10 },
  quoteText: { fontSize: 12, fontStyle: "italic" },
  callout: { borderLeftWidth: 4.5, borderLeftColor: ROYAL, backgroundColor: INSIGHT, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 10 },
  calloutLabel: { fontSize: 9, color: ROYAL, letterSpacing: 0.8, marginBottom: 3 },
  thead: { flexDirection: "row", backgroundColor: NAVY, borderBottomWidth: 1.5, borderBottomColor: ROYAL },
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

function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case "paragraph": return <Text style={s.p}>{b.text}</Text>;
    case "quote": return <View style={s.quote} wrap={false}><Text style={s.quoteText}>{`“${b.text}”`}</Text></View>;
    case "callout": return <View style={s.callout} wrap={false}><Text style={s.calloutLabel}>{b.label}</Text><Text>{b.text}</Text></View>;
    case "subheading": return <Text style={s.h2}>{b.text}</Text>;
    case "list": return <View>{b.items.map((t, i) => <View key={i} style={s.bullet} wrap={false}><Text style={{ width: 16 }}>{"•"}</Text><Text style={{ flex: 1 }}>{t}</Text></View>)}</View>;
    case "card": return <View style={{ marginBottom: 10 }}><Text style={s.h2}>{b.title}</Text>
      {b.lines.map((l, i) => <View key={i} style={s.cardRow} wrap={false}><Text style={s.cardLabel}>{l.label}</Text><View style={s.cardText}><Text>{l.text}</Text>{l.meta ? <Text style={s.meta}>{l.meta}</Text> : null}</View></View>)}</View>;
    case "table": return <View style={{ marginBottom: 10 }}>
      <View style={s.thead} wrap={false}>{b.columns.map((c, i) => <Text key={i} style={[s.th, { width: pct(b.widths, i) }]}>{c}</Text>)}</View>
      {b.rows.map((r, n) => <View key={n} style={[s.tr, { backgroundColor: n % 2 === 0 ? GRAY100 : "#FFFFFF" }]} wrap={false}>
        {b.columns.map((_, i) => <View key={i} style={[s.td, { width: pct(b.widths, i) }]}>{cellLines(r[i] ?? "").map((t, k) => <Text key={k} style={k ? { marginTop: 4 } : undefined}>{t}</Text>)}</View>)}</View>)}</View>;
  }
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
      {model.dates ? <Text style={{ fontSize: 12, color: GRAY500, marginBottom: 12 }}>{model.dates}</Text> : null}
      <View style={{ borderTopWidth: 4.5, borderTopColor: ROYAL, marginBottom: 12 }} />
      <Text style={{ color: GRAY500, marginBottom: 6 }}>{model.preparedBy}</Text>
      {model.draft ? <Text style={{ color: GRAY500 }}>{`${DRAFT_MARK}. This report has not been signed off.`}</Text> : null}
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
      <Text style={[s.footText, s.footMid]} fixed>{FIRM}</Text>
      <Text style={[s.footText, s.footRight]} fixed render={({ pageNumber }) => `Page ${pageNumber - 1 - (model.contents ? 1 : 0)}`} />
      {model.sections.map((sec, i) => <View key={sec.key}>
        {i > 0 && <View style={s.rule} />}
        <View wrap={false}><Text style={s.eyebrow}>{sec.eyebrow}</Text><Text style={s.h1} id={`sec-${sec.number}`}>{sec.heading}</Text></View>
        {sec.blocks.map((b, k) => <BlockView key={k} b={b} />)}
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
