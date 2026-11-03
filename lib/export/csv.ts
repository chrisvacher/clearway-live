// Each session's input as CSV (PRD "Exports"). The server decides what may leave: only
// facilitators export, names travel only for named and private sessions, signatures leave
// as names, never strokes. This only lays the rows out, one column per option, statement,
// item or question so a spreadsheet can sort and total them.
import type { InteractionKind } from "../interactions/kinds";

export type ExportRow = { id: string; at: string; name?: string | null; text: string; value?: Record<string, unknown> | null; hidden: boolean; test: boolean;
  votes?: number | null; answered?: boolean | null; folded_into?: string | null };
export type ExportSession = { id: string; title: string; part: string; mode: string; interaction: InteractionKind; label: string; prompt: string; options: Record<string, unknown> };
export type SessionExport = { status: "ok"; named: boolean; timezone: string; session: ExportSession; rows: ExportRow[] };

type Item = { key: string; text: string };
const items = (options: Record<string, unknown>, field = "items"): Item[] => Array.isArray(options[field])
  ? (options[field] as unknown[]).filter((o): o is Item => Boolean(o) && typeof (o as Item).key === "string" && typeof (o as Item).text === "string") : [];
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

// A cell is quoted when it must be, and a leading =, +, - or @ is kept as text so a
// spreadsheet never runs what someone typed on their phone.
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}
export const csvLine = (cells: unknown[]) => cells.map(csvCell).join(",");
// Spreadsheets read UTF-8 with a byte order mark; lines end in CRLF as RFC 4180 asks.
export const csvFile = (lines: string[]) => "﻿" + lines.join("\r\n") + "\r\n";

// Answered at, in the church's time zone: "2026-11-03 09:15".
export function localStamp(iso: string, zone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
const yes = (on: unknown) => on ? "Yes" : "";
const round = (n: unknown) => typeof n === "number" ? Math.round(n * 100) / 100 : "";

// The kind's own columns: a header and a function from one row to its cells.
function kindColumns(data: SessionExport): { header: string[]; cells: (row: ExportRow) => unknown[] } {
  const s = data.session, o = record(s.options);
  switch (s.interaction) {
    case "qa": {
      const texts = new Map(data.rows.map(r => [r.id, r.text]));
      return { header: ["Question", "Votes", "Answered", "Folded into"], cells: r => [r.text, r.votes ?? 0, yes(r.answered), r.folded_into ? texts.get(r.folded_into) ?? "" : ""] };
    }
    case "choice": {
      const list = items(o);
      return { header: ["Answer", ...list.map(i => i.text)], cells: r => { const picks = Array.isArray(record(r.value).choices) ? record(r.value).choices as string[] : [];
        return [r.text, ...list.map(i => picks.includes(i.key) ? 1 : "")]; } };
    }
    case "scale": return { header: ["Value"], cells: r => [record(r.value).value ?? r.text] };
    case "ranking": {
      const list = items(o);
      return { header: ["Ranking", ...list.map(i => `Place: ${i.text}`)], cells: r => { const order = Array.isArray(record(r.value).order) ? record(r.value).order as string[] : [];
        return [r.text, ...list.map(i => order.includes(i.key) ? order.indexOf(i.key) + 1 : "")]; } };
    }
    case "points": {
      const list = items(o);
      return { header: list.map(i => `Points: ${i.text}`), cells: r => { const pts = record(record(r.value).points); return list.map(i => pts[i.key] ?? 0); } };
    }
    case "statements": {
      const list = items(o);
      return { header: list.map(i => i.text), cells: r => { const ratings = record(record(r.value).ratings); return list.map(i => ratings[i.key] ?? ""); } };
    }
    case "grid": {
      const list = items(o), x = typeof o.x_label === "string" && o.x_label ? o.x_label : "Across", y = typeof o.y_label === "string" && o.y_label ? o.y_label : "Up";
      return { header: list.flatMap(i => [`${i.text}: ${x}`, `${i.text}: ${y}`]), cells: r => { const places = record(record(r.value).places);
        return list.flatMap(i => { const p = places[i.key]; return Array.isArray(p) ? [round(p[0]), round(p[1])] : ["", ""]; }); } };
    }
    case "form": {
      const list = items(o, "questions");
      return { header: list.map(i => i.text), cells: r => { const answers = record(record(r.value).answers); return list.map(i => answers[i.key] ?? ""); } };
    }
    case "sign": return { header: [], cells: () => [] };
    default: return { header: ["Answer"], cells: r => [r.text] };
  }
}

export function sessionCsv(data: SessionExport): string {
  const columns = kindColumns(data);
  const header = ["Answered at", ...(data.named ? ["Name"] : []), ...columns.header, "Hidden from the TV", "Test answer"];
  const lines = data.rows.map(r => csvLine([localStamp(r.at, data.timezone), ...(data.named ? [r.name ?? ""] : []), ...columns.cells(r), yes(r.hidden), yes(r.test)]));
  return csvFile([csvLine(header), ...lines]);
}
// Every session in one file, the answer as the phone sent it, for the recap's download.
export function allSessionsCsv(list: SessionExport[]): string {
  const header = ["Part", "Session", "Interaction", "Mode", "Answered at", "Name", "Answer", "Hidden from the TV", "Test answer"];
  const lines = list.flatMap(data => data.rows.map(r => csvLine([data.session.part, data.session.title, data.session.label, data.session.mode === "self_paced" ? "Self-paced" : "Live",
    localStamp(r.at, data.timezone), data.named ? r.name ?? "" : "", r.text, yes(r.hidden), yes(r.test)])));
  return csvFile([csvLine(header), ...lines]);
}
// "riverside-church-five-lenses-congregation.csv"
export function csvName(...parts: string[]) {
  const slug = parts.join(" ").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${slug || "answers"}.csv`;
}
