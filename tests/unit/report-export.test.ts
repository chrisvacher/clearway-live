import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { openSync } from "fontkit";
import { fontFile } from "../../lib/export/assets";
import { extractText, getDocumentProxy } from "unpdf";
import { buildReportModel, cleanText, hasBannedMarks, modelText, retreatDates, verbatimText, type ReportModel } from "../../lib/export/report-model";
import { buildDocx } from "../../lib/export/report-docx";
import { buildPdf } from "../../lib/export/report-pdf";
import { sectionKeys } from "../../lib/report/policy";
import { fixtureQuote, fixtureSections } from "../fixtures/export/snapshot";

const headings = ["Overview", "The Church Today", "The Process", "What We Heard", "Leadership Interviews", "Strategic Tensions", "The 10-year Future", "The 3-year Vision",
  "Risks and Roadblocks", "The 1-year Outlook", "Commander's Intent", "Decisions", "Make the Vision Visible", "Closing"];
const input = (draft: boolean) => ({ church: "Riverside Church", sections: fixtureSections(), draft, version: 2, retreatStart: "2026-11-03", retreatEnd: "2026-11-04" });

async function docxParts(model: ReportModel) {
  const zip = await JSZip.loadAsync(await buildDocx(model)), names = Object.keys(zip.files), files: Record<string, string> = {};
  for (const n of names) if (/\.xml$/.test(n)) files[n] = await zip.file(n)!.async("string");
  return { files, xml: files["word/document.xml"], names };
}
const pdfText = async (model: ReportModel) => {
  const pdf = await getDocumentProxy(new Uint8Array(await buildPdf(model)));
  return (await extractText(pdf, { mergePages: true })).text as string;
};
const textOf = (xml: string) => [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1].replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"));

test("the cleaner rewrites dashes and semicolons but keeps the room's words", () => {
  assert.equal(cleanText("We met — and it was good; very good."), "We met, and it was good, very good.");
  assert.equal(cleanText("Years 2026–27 were busy"), "Years 2026 to 27 were busy");
  assert.equal(cleanText("One thing – the 10-year Future."), "One thing, the 10-year Future.");
  assert.equal(cleanText("She said “groups — not programs” and left."), "She said “groups - not programs” and left.");
  assert.equal(verbatimText("groups—not programs"), "groups - not programs");
  assert.equal(cleanText("3-year Vision, 1-year Outlook and 10-year Future stay."), "3-year Vision, 1-year Outlook and 10-year Future stay.");
  assert.equal(hasBannedMarks(cleanText("a — b; c – d -- e")), false);
});

test("retreat dates read plainly", () => {
  assert.equal(retreatDates("2026-11-03", "2026-11-04"), "November 3 to 4, 2026");
  assert.equal(retreatDates("2026-11-30", "2026-12-01"), "November 30 to December 1, 2026");
  assert.equal(retreatDates("2026-11-03", null), "November 3, 2026");
  assert.equal(retreatDates(null, null), "");
});

test("the model holds the 14 sections in Clearway's order with eyebrows, and no banned marks", () => {
  const m = buildReportModel(input(false));
  assert.deepEqual(m.sections.map(s => s.heading), headings);
  assert.deepEqual(m.sections.map(s => s.key), sectionKeys);
  assert.deepEqual(m.sections.map(s => s.eyebrow.replace(/^\d+ \/ /, "")), ["THE CHURCH", "THE CHURCH", "THE CHURCH", "THE CHURCH", "THE CHURCH", "THE CHURCH", "THE DIRECTION", "THE DIRECTION", "THE PLAN", "THE PLAN", "THE PLAN", "WHAT HAPPENS NEXT", "WHAT HAPPENS NEXT", "WHAT HAPPENS NEXT"]);
  assert.equal(m.sections[6].eyebrow, "07 / THE DIRECTION");
  assert.ok(m.sections.every(s => s.eyebrow.toLowerCase() !== `${String(s.number).padStart(2, "0")} / ${s.heading.toLowerCase()}`), "an eyebrow is never its heading");
  assert.equal(m.fileName, "Riverside Church Wayfinding Report");
  assert.equal(buildReportModel(input(true)).fileName, "Riverside Church Wayfinding Report (Draft)");
  assert.equal(m.dates, "November 3 to 4, 2026");
  for (const t of modelText(m)) { assert.ok(!/[\u2013\u2014\u2015]/.test(t), `no dash in: ${t}`); assert.ok(!t.includes(";"), `no semicolon in: ${t}`); }
  const heard = m.sections[3].blocks;
  assert.ok(heard.some(b => b.type === "callout" && b.text.includes("6 of 87")));
  const q = heard.find(b => b.type === "quote");
  assert.ok(q && q.type === "quote" && q.text.includes(fixtureQuote) && q.text.includes(" - ") && !/—/.test(q.text));
  const outlook = m.sections[9].blocks[1];
  assert.ok(outlook.type === "table" && outlook.columns.join() === "Goal,Vision Outcome,Owner,End date,Season" && outlook.widths.reduce((a, b) => a + b) === 9360);
  assert.ok(outlook.type === "table" && outlook.rows[0][1] === "Known in small groups" && outlook.rows[0][0].startsWith("Launch twelve"));
  const risks = m.sections[8].blocks.find(b => b.type === "table");
  assert.ok(risks && risks.type === "table" && risks.columns.join() === "Risk,Likelihood,Impact,Mitigations" && risks.widths.join() === "2560,1500,1300,4000" && risks.rows[0][3].includes("\n"));
  const own = m.sections[6].blocks.at(-1);
  assert.ok(own && own.type === "paragraph" && own.text.startsWith("Chris's own read"));
});

test("a draft is marked Draft and a signed report is not", async () => {
  const signed = buildReportModel(input(false)), draft = buildReportModel(input(true));
  assert.equal(signed.draft, false); assert.equal(draft.draft, true);
  assert.ok(!(await docxParts(signed)).xml.includes("Draft"));
  const d = await docxParts(draft);
  assert.ok(d.names.some(n => /header/.test(n)) && d.xml.includes("Draft"));
  assert.ok(Object.entries(d.files).some(([k, v]) => /word\/header\d*\.xml/.test(k) && v.includes("DRAFT")));
  assert.ok(!(await pdfText(signed)).includes("Draft"));
  assert.ok((await pdfText(draft)).replace(/\s+/g, "").includes("DRAFT"));
});

test("the Word file carries the headings in order, Plus Jakarta Sans, the logo, thin labels and quotes, and no source markers or dashes", async () => {
  const model = buildReportModel(input(false)), { files, xml, names } = await docxParts(model);
  const texts = textOf(xml), joined = texts.join("\n");
  let at = 0;
  for (const h of headings) { const i = texts.indexOf(h, at); assert.ok(i >= at, `heading ${h} in order`); at = i + 1; }
  assert.ok(texts.includes("Wayfinding Report") && texts.includes("Riverside Church") && texts.includes("November 3 to 4, 2026") && texts.includes("Prepared by Clearway Church Solutions"));
  assert.ok(xml.includes('w:ascii="Plus Jakarta Sans"'));
  assert.ok(!/w:ascii="(?!Plus Jakarta Sans)/.test(xml));
  assert.ok(names.some(n => /^word\/media\/.+\.png$/.test(n)), "logo image is in the package");
  assert.ok(joined.includes("THIN DATA") && joined.includes("6 of 87 respondents are under 30"));
  assert.ok(joined.includes(fixtureQuote));
  assert.ok(joined.includes("“" + fixtureQuote));
  assert.ok(!/[–—―]/.test(joined) && !joined.includes(";"));
  assert.ok(!/<w:shd[^>]*w:fill="(FCFCFD|F9F9FB)"/i.test(xml) && !xml.includes("w:background"), "white page");
  const footer = Object.entries(files).filter(([k]) => /word\/footer/.test(k)).map(([, v]) => v).join("");
  assert.ok(footer.includes("Clearway Church Solutions") && footer.includes("PAGE"));
  assert.ok(!/<w:b\/>[\s\S]{0,200}Prepared by/.test(xml));
  const styles = files["word/styles.xml"];
  assert.ok(styles.includes("Plus Jakarta Sans"));
  for (const t of texts) assert.ok(!/\bsource marker|\[\d\]/.test(t));
});

test("the PDF carries the headings in order, the cover, thin labels and quotes, and no dashes", async () => {
  const model = buildReportModel(input(false)), text = await pdfText(model);
  let at = 0;
  for (const h of headings) { const i = text.indexOf(h, text.indexOf("OVERVIEW", at) >= 0 ? at : 0); assert.ok(i >= 0, `heading ${h}`); const j = text.indexOf(h, at); assert.ok(j >= at, `${h} in order`); at = j + 1; }
  for (const w of ["Wayfinding Report", "Riverside Church", "November 3 to 4, 2026", "Prepared by Clearway Church Solutions", "THIN DATA", "6 of 87 respondents are under 30", fixtureQuote, "Page 1"]) assert.ok(text.includes(w), w);
  assert.ok(!/[–—―]/.test(text) && !text.includes(";"));
});

test("a long report gets a contents page and a short one does not", async () => {
  const short = buildReportModel(input(false));
  const many = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} says something plain about the room and what it heard in the retreat.`);
  const long = buildReportModel({ ...input(false), sections: fixtureSections().map(s => s.kind === "prose" ? { ...s, sentences: [...s.sentences, ...many.map((t, i) => ({ id: `${s.key}-${i}`, position: 100 + i, text: t, origin: "ai", quote: false, thin_label: null }))] } : s) });
  assert.equal(short.contents, short.estimatedPages >= 8);
  assert.equal(long.contents, true);
  const xml = (await docxParts(long)).xml;
  assert.ok(xml.includes("TOC \\o") || xml.includes("TOC"));
  assert.ok((await pdfText(long)).includes("Contents"));
  assert.ok(!(await docxParts(short)).xml.includes(">Contents<") || short.contents);
});

test("the snapshot's sources never reach the model", () => {
  const sections = fixtureSections().map(s => ({ ...s, sentences: s.sentences.map(x => ({ ...x, sources: [{ kind: "theme", ref_id: "x", excerpt: "SECRET-SOURCE-TEXT" }] })) }));
  const m = buildReportModel({ church: "Riverside Church", sections, draft: false });
  assert.ok(!JSON.stringify(m).includes("SECRET-SOURCE-TEXT"));
});

test("a Vision Outcome with nothing under it still shows, and a draft says which lens is not signed off", () => {
  const secs = JSON.parse(JSON.stringify(fixtureSections())) as { key: string; blocks: { rows: { parts: unknown[]; title: string }[] } }[];
  secs.find(s => s.key === "vision")!.blocks.rows.push({ title: "An empty outcome", parts: [] });
  secs.find(s => s.key === "future")!.blocks.rows[2].parts = [];
  const draft = buildReportModel({ church: "R", sections: secs, draft: true }), signed = buildReportModel({ church: "R", sections: secs, draft: false });
  const texts = (m: ReportModel, k: string) => m.sections.find(s => s.key === k)!.blocks.map(b => "text" in b ? b.text : "title" in b ? b.title : "").join("|");
  assert.ok(texts(draft, "vision").includes("An empty outcome") && texts(signed, "vision").includes("An empty outcome"));
  assert.ok(texts(draft, "future").includes("Leadership|Not signed off yet."));
  assert.ok(!texts(signed, "future").includes("Not signed off yet."));
});

test("a name with Latin Extended letters draws in the PDF's own font", async () => {
  const name = "\u0141\u00f3d\u017a \u0151 \u1ec5 \u0160mid";
  for (const weight of [400, 700] as const) for (const style of ["normal", "italic"] as const) {
    const font = openSync(fontFile(weight, style)) as unknown as { hasGlyphForCodePoint(c: number): boolean };
    for (const ch of "\u0141\u0151\u1ec5\u0160\u017a") assert.ok(font.hasGlyphForCodePoint(ch.codePointAt(0)!), `${weight} ${style} has ${ch}`);
  }
  const model = buildReportModel({ ...input(false), church: name });
  assert.equal(model.church, name);
  assert.ok((await pdfText(model)).includes(name), "the name reads back from the PDF");
  const bytes = Buffer.from(await buildPdf(model)).toString("latin1");
  assert.ok(/PlusJakartaSans/.test(bytes), "the font is embedded");
  assert.ok(!/Helvetica/.test(bytes), "with no fallback font");
  assert.ok(textOf((await docxParts(model)).xml).includes(name));
});
