// The report as one document model (milestone 7, step 5). A sign-off snapshot (or the live draft, marked Draft) goes in; the cover, the fourteen sections
// in Clearway's order and what each holds come out: prose paragraphs, the room's verbatim quotes as quote blocks, thin data labels as callouts, the record
// blocks as tables or labelled cards, and the facilitator's own words as plain paragraphs. The Word file, the PDF and the page's preview all draw this
// one model, so they cannot disagree. Source markers never get in: only text, origin, quote and thin label are read from a sentence.
//
// The text cleaner makes every document line follow Clearway's voice rules: no em or en dashes and no semicolons in anything Claude or a facilitator wrote
// (rewritten to commas). The room's own words keep what they said: inside a quotation an em or en dash becomes a spaced hyphen, and a semicolon stays.
// Horizon terms (10-year Future, 3-year Vision, 1-year Outlook) hold only hyphens, so the cleaner never touches them.
import { seasonCells, sectionKeys, type SectionKey } from "../report/policy";

export const COVER_TITLE = "Wayfinding Report";
export const PREPARED_BY = "Prepared by Clearway Church Solutions";
export const FIRM = "Clearway Church Solutions";
export const DRAFT_MARK = "Draft";
export const COVER_LABELS = { prepared_for: "PREPARED FOR", date: "DATE" } as const;
// The standard cover's confidentiality notice, in the cover's footer.
export const CONFIDENTIAL = { head: "CONFIDENTIAL", body: "This document is prepared exclusively for the named recipient. It contains information belonging to Clearway Church Solutions. Please do not distribute without permission." };
const CONTENT_WIDTH = 9360;

export const defaultHeadings: Record<SectionKey, string> = {
  overview: "Overview", church_today: "The Church Today", process: "The Process", heard: "What We Heard", interviews: "Leadership Interviews", tensions: "Strategic Tensions",
  future: "The 10-year Future", vision: "The 3-year Vision", risks: "Risks and Roadblocks", outlook: "The 1-year Outlook", intent: "Commander's Intent", decisions: "Decisions",
  visibility: "Make the Vision Visible", closing: "Closing",
};

// The part of the report each section belongs to. The eyebrow above a heading names the part in plain words, and the heading keeps Clearway's exact name
// (so a horizon term is never set in capitals). Change the parts here.
export const reportParts: Record<SectionKey, string> = {
  overview: "The church", church_today: "The church", process: "The church", heard: "The church", interviews: "The church", tensions: "The church",
  future: "The direction", vision: "The direction", risks: "The plan", outlook: "The plan", intent: "The plan",
  decisions: "What happens next", visibility: "What happens next", closing: "What happens next",
};

export type CardLine = { label: string; text: string; meta: string };
export type Block =
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "callout"; label: string; text: string }
  | { type: "subheading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; columns: string[]; widths: number[]; rows: string[][] }
  | { type: "card"; title: string; lines: CardLine[] };
export type ModelSection = { key: SectionKey; number: number; eyebrow: string; heading: string; blocks: Block[] };
export type ReportModel = {
  church: string; title: string; dates: string; preparedBy: string; draft: boolean; version: number | null; fileName: string;
  sections: ModelSection[]; contents: boolean; estimatedPages: number;
};

// ---------- The text cleaner ----------
const dashes = /[–—―]/;
const quoted = /“[^”]*”|"[^"]*"|‘(?:[^‘’]|’(?=\w))*’(?!\w)/g;
const squash = (t: string) => t.replace(/[ \t ]+/g, " ").replace(/ +([,.:!?])/g, "$1").trim();

// The room's own words: an em or en dash (or a double hyphen) becomes a spaced hyphen. Nothing else changes.
export function verbatimText(text: string): string {
  return squash(text.replace(/\s*(?:[–—―]|--+)\s*/g, " - "));
}
// Words a person or Claude wrote: dashes and semicolons become commas, a numeric range reads "to", and a quotation inside keeps the room's words.
export function cleanText(text: string): string {
  const parts: string[] = []; let last = 0;
  for (const m of text.matchAll(quoted)) { parts.push(plain(text.slice(last, m.index)), verbatimText(m[0])); last = (m.index ?? 0) + m[0].length; }
  parts.push(plain(text.slice(last)));
  return squash(parts.join("").replace(/^[,\s]+/, "").replace(/,\s*,/g, ",").replace(/[,\s]+$/, (end) => (/[.!?]/.test(end) ? end : "")));
}
// A dash between two numbers, times, amounts, months or weekdays is a range and reads "to" (2026 to 27, 9am to 5pm, $5 to $10, Jan to Mar, Mon to Fri).
const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\\b\\.?";
const DAY = "(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tues|Tue|Wed|Thurs|Thur|Thu|Fri|Sat|Sun)\\b\\.?";
const NUM = "[$\u20ac\u00a3]?\\d[\\d,.:]*(?:\\s?(?:%|[aApP]\\.?[mM]\\b\\.?|[kKmM]\\b))?";
const TOKEN = `(?:${NUM}|${MONTH}|${DAY})`;
const range = new RegExp(`(?<![\\w$])(${TOKEN})\\s*[\\u2013\\u2014\\u2015]\\s*(${TOKEN})(?![\\w])`, "g");
function plain(t: string): string {
  return t
    .replace(range, "$1 to $2")
    .replace(range, "$1 to $2")
    .replace(/([,.:!?])\s*(?:[\u2013\u2014\u2015]|--+)\s*/g, "$1 ")
    .replace(/\s*(?:[\u2013\u2014\u2015]|--+)\s*/g, ", ")
    .replace(/\s*;\s*/g, ", ");
}
export const hasBannedMarks = (text: string) => dashes.test(text) || text.includes(";");

// ---------- The input, read loosely (a signed snapshot, or the draft's state, which carries more than this reads) ----------
type RawSentence = { id: string; position: number; text: string; origin: string; quote: boolean; thin_label: string | null };
type RawPart = { role: string; sentence_id: string; owner: string | null; due: string | null };
type RawRow = { title: string; cells: unknown[]; parts: RawPart[]; group: string };
type RawSection = { key: SectionKey; position: number; heading: string; kind: string; columns: string[]; rows: RawRow[]; sentences: RawSentence[] };
const str = (v: unknown) => typeof v === "string" ? v : "";
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const rec = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

export function readSections(raw: unknown): RawSection[] {
  return arr(raw).map((s): RawSection => {
    const o = rec(s), blocks = rec(o.blocks);
    return {
      key: str(o.key) as SectionKey, position: Number(o.position) || 0, heading: str(o.heading), kind: str(o.kind),
      columns: arr(blocks.columns).map(str),
      rows: arr(blocks.rows).map((r): RawRow => { const x = rec(r); return { title: str(x.title), cells: arr(x.cells), group: str(x.group),
        parts: arr(x.parts).map((p): RawPart => { const y = rec(p); return { role: str(y.role), sentence_id: str(y.sentence_id), owner: str(y.owner) || null, due: str(y.due) || null }; }) }; }),
      sentences: arr(o.sentences).map((e): RawSentence => { const x = rec(e); return { id: str(x.id), position: Number(x.position) || 0, text: str(x.text), origin: str(x.origin), quote: x.quote === true, thin_label: str(x.thin_label).trim() || null }; })
        .sort((a, b) => a.position - b.position),
    };
  }).filter(s => sectionKeys.includes(s.key));
}

// ---------- Prose ----------
const unquote = (t: string) => t.trim().replace(/^[“"]\s*([\s\S]*?)\s*[”"]$/, "$1");
function thinCallout(label: string): Block {
  const rest = label.replace(/^thin data\s*:?\s*/i, "").trim();
  return { type: "callout", label: "THIN DATA", text: cleanText(rest || label) };
}
// Consecutive sentences read as one paragraph (three at most). A quote stands alone as a quote block, a facilitator's own words as their own
// paragraph, and a thin data label as a callout right after the sentence it belongs to.
function proseBlocks(sentences: RawSentence[]): Block[] {
  const out: Block[] = []; let run: string[] = [];
  const flush = () => { if (run.length) out.push({ type: "paragraph", text: run.join(" ") }); run = []; };
  for (const s of sentences) {
    const text = s.text.trim(); if (!text) continue;
    if (s.quote) { flush(); out.push({ type: "quote", text: verbatimText(unquote(text)) }); if (s.thin_label) out.push(thinCallout(s.thin_label)); continue; }
    if (s.origin === "facilitator") { flush(); out.push({ type: "paragraph", text: cleanText(text) }); if (s.thin_label) out.push(thinCallout(s.thin_label)); continue; }
    run.push(cleanText(text));
    if (s.thin_label) { flush(); out.push(thinCallout(s.thin_label)); } else if (run.length >= 3) flush();
  }
  flush();
  return out;
}

// ---------- Record blocks ----------
const roleLabels: Record<string, string> = { description: "Outcome", indicator: "Indicator", stop: "What we'll stop", intent: "Intent", must_do: "Must do", step: "First step", metric: "Measure", line: "" };
const nice = (role: string) => roleLabels[role] ?? (role ? role[0].toUpperCase() + role.slice(1).replace(/_/g, " ") : "");
const metaOf = (p: RawPart) => [p.owner && `Owner: ${p.owner}`, p.due && `Due: ${p.due}`].filter(Boolean).map(x => cleanText(String(x))).join(". ");
const widthsFor: Record<string, number[]> = {
  outlook: [2800, 1900, 1500, 1700, 1460], risks: [2560, 1500, 1300, 4000], decisions: [4680, 4680], visibility: [1500, 1300, 1500, 3400, 1660],
};
export const evenWidths = (n: number): number[] => { const w = Math.floor(CONTENT_WIDTH / Math.max(n, 1)); const out = Array(n).fill(w) as number[]; out[n - 1] += CONTENT_WIDTH - w * n; return out; };
const sumTo = (w: number[], n: number) => w.length === n && w.reduce((a, b) => a + b, 0) === CONTENT_WIDTH ? w : evenWidths(n);

function recordBlocks(sec: RawSection, draft: boolean): { lead: Block[]; body: Block[]; own: Block[] } {
  const byId = new Map(sec.sentences.map(s => [s.id, s]));
  const inBlock = new Set(sec.rows.flatMap(r => r.parts.map(p => p.sentence_id)));
  const free = sec.sentences.filter(s => !inBlock.has(s.id));
  const lead = proseBlocks(free.filter(s => s.origin !== "facilitator")), own = proseBlocks(free.filter(s => s.origin === "facilitator"));
  // A row stands on its first sentence: when it is gone, so is the row (the database's rule, applied again so a draft reads like a signed copy).
  const live = (r: RawRow) => !r.parts.length || (r.cells.length ? byId.has(r.parts[0].sentence_id) : r.parts.some(p => byId.has(p.sentence_id)));
  const rows = sec.rows.filter(live).map(r => ({ ...r, parts: r.parts.filter(p => byId.has(p.sentence_id)) }));
  const cellText = (c: unknown): string => {
    if (typeof c === "string") return cleanText(c);
    const o = rec(c);
    if (Array.isArray(o.s)) return o.s.map(id => byId.get(String(id))?.text ?? "").filter(Boolean).map(cleanText).join("\n");
    return cleanText(str(o.t));
  };
  const lineText = (id: string, verbatim = false) => { const t = byId.get(id)?.text ?? ""; return verbatim ? verbatimText(t) : cleanText(t); };
  const body: Block[] = [];
  const key = sec.key;
  if (key === "future") {
    // The five lens summaries the room signed off, word for word: only a dash changes, to a spaced hyphen, and nothing else is touched.
    for (const r of rows) {
      const lines = r.parts.map(p => lineText(p.sentence_id, true)).filter(Boolean);
      // A lens with no signed off summary still shows in a draft, and says so. A signed report cannot have one (sign-off checks the lens summaries).
      if (!lines.length) { if (draft) body.push({ type: "subheading", text: cleanText(r.title) }, { type: "paragraph", text: "Not signed off yet." }); continue; }
      body.push({ type: "subheading", text: cleanText(r.title) }, ...lines.map((text): Block => ({ type: "paragraph", text })));
    }
  } else if (key === "vision" || key === "intent") {
    for (const r of rows) {
      const lines: CardLine[] = r.parts.map((p, i) => ({ label: r.group === "metrics" ? String(i + 1) : nice(p.role), text: lineText(p.sentence_id), meta: metaOf(p) })).filter(l => l.text);
      // An outcome or card with nothing under it still shows, by its title.
      body.push(lines.length ? { type: "card", title: cleanText(r.title), lines } : { type: "subheading", text: cleanText(r.title) });
    }
  } else if (key === "visibility") {
    const plan = rows.filter(r => r.group !== "actions"), actions = rows.filter(r => r.group === "actions");
    if (plan.length) body.push({ type: "table", columns: sec.columns.map(cleanText), widths: sumTo(widthsFor.visibility, sec.columns.length), rows: plan.map(r => r.cells.map(c => cellText(c))) });
    const items = actions.map(r => r.parts.length ? lineText(r.parts[0].sentence_id) : "").filter(Boolean);
    if (items.length) body.push({ type: "subheading", text: "Actions the room named" }, { type: "list", items });
  } else if (rows.length) {
    // Goals, risks and decisions are tables. The goals table leads with the goal, as the report's readers look for it first.
    let columns = sec.columns.map(cleanText), table = rows.map(r => r.cells.map(c => cellText(c)));
    if (key === "outlook") {
      // A table built before the season was worded as the Map words it still holds the code: it reads as the label here too.
      table = table.map(r => seasonCells(columns, r));
      const want = ["Goal", "Vision Outcome", "Owner", "Ends", "Season"], at = want.map(w => columns.indexOf(w));
      if (at.every(i => i >= 0)) { table = table.map(r => at.map(i => r[i] ?? "")); columns = ["Goal", "Vision Outcome", "Owner", "End date", "Season"]; }
    }
    if (key === "risks") columns = columns.map(c => c === "What we will do" ? "Mitigations" : c);
    body.push({ type: "table", columns, widths: sumTo(widthsFor[key] ?? [], columns.length), rows: table });
  }
  return { lead, body, own };
}

// ---------- The model ----------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ymd = (v: string | null | undefined) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? ""); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
export function retreatDates(start?: string | null, end?: string | null): string {
  const a = ymd(start), b = ymd(end) ?? a; if (!a || !b) return "";
  const one = `${MONTHS[a.m]} ${a.d}, ${a.y}`;
  if (a.y === b.y && a.m === b.m && a.d === b.d) return one;
  if (a.y === b.y && a.m === b.m) return `${MONTHS[a.m]} ${a.d} to ${b.d}, ${a.y}`;
  if (a.y === b.y) return `${MONTHS[a.m]} ${a.d} to ${MONTHS[b.m]} ${b.d}, ${a.y}`;
  return `${one} to ${MONTHS[b.m]} ${b.d}, ${b.y}`;
}
export const fileBase = (church: string, draft: boolean) => {
  const name = church.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim() || "Clearway";
  return `${name} Wayfinding Report${draft ? " (Draft)" : ""}`;
};

const blockWords = (b: Block): number => {
  const w = (t: string) => t.split(/\s+/).filter(Boolean).length;
  switch (b.type) {
    case "paragraph": case "quote": case "subheading": return w(b.text);
    case "callout": return w(b.text) + 4;
    case "list": return b.items.reduce((n, t) => n + w(t), 0);
    case "table": return b.rows.reduce((n, r) => n + r.reduce((m, c) => m + w(c), 0) + 8, 0);
    case "card": return b.lines.reduce((n, l) => n + w(l.text) + w(l.meta) + 4, w(b.title) + 4);
  }
};
// About how many pages the Word file runs, for the one decision that depends on it: a contents page only for a long report (about eight pages or more).
export const estimatePages = (sections: ModelSection[]) => Math.max(1, Math.round(1 + sections.reduce((n, s) => n + 70 + s.blocks.reduce((m, b) => m + blockWords(b), 0), 0) / 330));

export type ModelInput = { church: string; sections: unknown; draft: boolean; version?: number | null; retreatStart?: string | null; retreatEnd?: string | null };
export function buildReportModel(input: ModelInput): ReportModel {
  const raw = readSections(input.sections), byKey = new Map(raw.map(s => [s.key, s]));
  const sections: ModelSection[] = [];
  sectionKeys.forEach((key, i) => {
    const sec = byKey.get(key); if (!sec) return;
    const heading = cleanText(sec.heading || defaultHeadings[key]), number = i + 1;
    let blocks: Block[];
    if (sec.kind === "record" || sec.rows.length) { const r = recordBlocks(sec, input.draft); blocks = [...r.lead, ...r.body, ...r.own]; } else blocks = proseBlocks(sec.sentences);
    if (!blocks.length) blocks = [{ type: "paragraph", text: sec.kind === "record" || sec.rows.length ? "Nothing has been recorded for this section yet." : "Nothing has been written for this section yet." }];
    sections.push({ key, number, heading, eyebrow: `${String(number).padStart(2, "0")} / ${reportParts[key]}`.toUpperCase(), blocks });
  });
  const estimatedPages = estimatePages(sections);
  return {
    church: cleanText(input.church), title: COVER_TITLE, dates: retreatDates(input.retreatStart, input.retreatEnd), preparedBy: PREPARED_BY, draft: input.draft,
    version: input.draft ? null : input.version ?? null, fileName: fileBase(input.church, input.draft), sections, contents: estimatedPages >= 8, estimatedPages,
  };
}

// Every line of text the model carries, in reading order (the tests and the checks read this).
export function modelText(model: ReportModel): string[] {
  const out = [model.church, model.title, model.dates, model.preparedBy, COVER_LABELS.prepared_for, ...(model.dates ? [COVER_LABELS.date] : [])];
  for (const s of model.sections) {
    out.push(s.eyebrow, s.heading);
    for (const b of s.blocks) {
      switch (b.type) {
        case "paragraph": case "quote": case "subheading": out.push(b.text); break;
        case "callout": out.push(b.label, b.text); break;
        case "list": out.push(...b.items); break;
        case "table": out.push(...b.columns, ...b.rows.flat()); break;
        case "card": out.push(b.title, ...b.lines.flatMap(l => [l.label, l.text, l.meta])); break;
      }
    }
  }
  return out.filter(Boolean);
}
