// Milestone 3, step 3: the 2x2 grid (INT-08), the private form (INT-09) and sign
// together (INT-10). Pure rules shared by the TV views, the phone inputs, the options
// editors and the tests. Every number on screen comes from the server's results; what
// lives here is only reading options, laying dots out without overlap and making strokes.

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const list = (value: unknown) => Array.isArray(value) ? value : [];

// A key for a new item or question, made in the browser: the database checks it.
export function newKey(random: () => number = Math.random) {
  let key = "";
  while (key.length < 8) key += Math.floor(random() * 36).toString(36);
  return key;
}

// ---------- INT-08 2x2 grid ----------
export const maxGridItems = 10;
export type GridItem = { key: string; text: string };
export type GridOptions = { preset: "custom" | "pre_mortem"; x_label: string; x_low: string; x_high: string; y_label: string; y_low: string; y_high: string; legend: string; items: GridItem[] };
export const gridPresets: Record<GridOptions["preset"], Omit<GridOptions, "preset" | "items">> = {
  custom: { x_label: "Effort", x_low: "Low", x_high: "High", y_label: "Impact", y_low: "Low", y_high: "High", legend: "Items" },
  // The pre-mortem's grid (milestone 4 reuses it): likelihood and impact.
  pre_mortem: { x_label: "Likelihood", x_low: "Unlikely", x_high: "Likely", y_label: "Impact", y_low: "Low", y_high: "High", legend: "Reasons it failed" },
};
// The Pre-mortem's prompt. The year is the 3-year Vision's, filled in from the engagement's base year.
export const premortemPrompt = "It’s {base year + 3} and this plan failed. Why?";
export function gridOf(options: unknown): GridOptions {
  const o = record(options), preset = o.preset === "pre_mortem" ? "pre_mortem" : "custom", d = gridPresets[preset];
  const items = list(o.items).map(record).filter(i => typeof i.key === "string" && typeof i.text === "string").map(i => ({ key: String(i.key), text: String(i.text) })).slice(0, maxGridItems);
  return { preset, x_label: text(o.x_label, d.x_label), x_low: text(o.x_low, d.x_low), x_high: text(o.x_high, d.x_high),
    y_label: text(o.y_label, d.y_label), y_low: text(o.y_low, d.y_low), y_high: text(o.y_high, d.y_high), legend: text(o.legend, d.legend), items };
}
// Every item keeps its own color from the ten-color item palette, by its number.
export const gridColor = (num: number) => `cwl-i${((Math.max(1, num) - 1) % 10) + 1}`;

// The server's grid results: one entry per listed item, in number order.
export type GridResult = { key: string; num: number; text: string; count: number; x?: number; y?: number; places?: [string, number, number][]; into?: string; mitigations?: string[] };
export function gridResults(results: unknown): GridResult[] {
  return list(record(results).items).map(record).filter(i => typeof i.key === "string").map(i => ({
    key: String(i.key), num: Number(i.num) || 0, text: String(i.text ?? ""), count: Number(i.count) || 0,
    ...(typeof i.x === "number" && typeof i.y === "number" ? { x: i.x, y: i.y } : {}),
    ...(Array.isArray(i.places) ? { places: i.places.filter(p => Array.isArray(p) && p.length === 3).map(p => [String(p[0]), Number(p[1]), Number(p[2])] as [string, number, number]) } : {}),
    ...(typeof i.into === "string" ? { into: i.into } : {}),
    ...(Array.isArray(i.mitigations) && i.mitigations.length ? { mitigations: i.mitigations.filter((m): m is string => typeof m === "string") } : {}),
  }));
}
// A person's own placements, from their one standing answer.
export type Places = Record<string, [number, number]>;
export function placesOf(value: unknown): Places {
  const out: Places = {}, places = record(record(value).places);
  for (const [key, p] of Object.entries(places)) if (Array.isArray(p) && p.length === 2 && p.every(n => typeof n === "number" && n >= 0 && n <= 1)) out[key] = [p[0], p[1]];
  return out;
}
export const clamp01 = (n: number) => Math.max(0, Math.min(1, Math.round(n * 10000) / 10000));
export const gridAnswer = (places: Places, items: GridItem[]) => {
  const placed = items.filter(i => places[i.key]);
  return { text: `${placed.length} of ${items.length} placed`, value: { places: Object.fromEntries(placed.map(i => [i.key, places[i.key]])) } };
};
// The next number still to place, after the one just placed.
export function nextOpen(items: GridItem[], places: Places, after: string | null) {
  const start = Math.max(0, items.findIndex(i => i.key === after));
  for (let k = 1; k <= items.length; k++) { const item = items[(start + k) % items.length]; if (!places[item.key]) return item.key; }
  return after;
}

// Dot radius by the people who placed the item: the TV floor's dot for one person,
// growing with the square root of the count, up to the leader.
export function dotRadius(count: number, maxCount: number, base: number, grow: number) {
  if (maxCount <= 1) return base;
  return base + grow * (Math.sqrt(Math.max(1, count)) - 1) / (Math.sqrt(maxCount) - 1);
}
// Two dots never overlap: each overlapping pair is pushed apart along the line between
// them, only as far as needed, and every dot stays inside the plot.
export type Dot = { key: string; x: number; y: number; r: number };
export function separate(dots: Dot[], width: number, height: number, gap = 10): Dot[] {
  const out = dots.map(d => ({ ...d }));
  const keep = (d: Dot) => { d.x = Math.max(d.r, Math.min(width - d.r, d.x)); d.y = Math.max(d.r, Math.min(height - d.r, d.y)); };
  out.forEach(keep);
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) {
      const p = out[a], q = out[b], need = p.r + q.r + gap;
      let dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d >= need - 0.01) continue;
      // Exactly on top of each other: part them sideways, by key so it is stable.
      if (d < 0.01) { dx = p.key < q.key ? 1 : -1; dy = 0; d = 1; }
      const push = (need - Math.hypot(q.x - p.x, q.y - p.y)) / 2, ux = dx / d, uy = dy / d;
      p.x -= ux * push; p.y -= uy * push; q.x += ux * push; q.y += uy * push; keep(p); keep(q); moved = true;
    }
    if (!moved) break;
  }
  return out;
}

// ---------- INT-09 Private form ----------
export const maxQuestions = 8, maxFormAnswer = 1000;
export type FormQuestion = { key: string; text: string };
export const formOf = (options: unknown): FormQuestion[] =>
  list(record(options).questions).map(record).filter(q => typeof q.key === "string" && typeof q.text === "string").map(q => ({ key: String(q.key), text: String(q.text) })).slice(0, maxQuestions);
export function formAnswersOf(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(record(record(value).answers)).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v as string]));
}
export function formAnswer(drafts: Record<string, string>, questions: FormQuestion[]) {
  const answers: Record<string, string> = Object.fromEntries(questions.map(q => [q.key, (drafts[q.key] ?? "").trim()] as [string, string]).filter(([, v]) => v));
  const n = Object.keys(answers).length;
  return { ok: n > 0 && Object.values(answers).every(v => [...v].length <= maxFormAnswer), text: `Answered ${n} of ${questions.length}`, value: { answers } };
}

// ---------- INT-10 Sign together ----------
// The signature field is 600 by 200; a stroke is "M12 34L13 35...", whole numbers only.
export const sigWidth = 600, sigHeight = 200, maxInk = 7000;
export const signText = (options: unknown) => text(record(options).text);
export const strokesOf = (value: unknown): string[] => list(record(value).strokes).filter((s): s is string => typeof s === "string" && /^M\d{1,3} \d{1,3}(L\d{1,3} \d{1,3})*$/.test(s));
export const inkLength = (strokes: string[]) => strokes.reduce((n, s) => n + s.length, 0);
// Adds a point to the stroke being drawn, skipping points too close to the last one.
export function addPoint(stroke: string | null, x: number, y: number, minStep = 3) {
  const px = Math.round(Math.max(0, Math.min(sigWidth, x))), py = Math.round(Math.max(0, Math.min(sigHeight, y)));
  if (stroke === null) return `M${px} ${py}`;
  const last = stroke.match(/(\d+) (\d+)$/);
  if (last && Math.hypot(px - Number(last[1]), py - Number(last[2])) < minStep) return stroke;
  return `${stroke}L${px} ${py}`;
}
// One path for the whole signature: a lone point draws as a dot with round caps.
export const signaturePath = (strokes: string[]) => strokes.map(s => s.includes("L") ? s : `${s}L${s.slice(1)}`).join(" ");
export type Signer = { id: string; name: string };
export const signersOf = (results: unknown): Signer[] => list(record(results).signers).map(record).filter(s => typeof s.id === "string").map(s => ({ id: String(s.id), name: String(s.name ?? "") }));
// Spotlight on a signature lifts the name, from the server's list of who signed.
export function signSpot(results: unknown, id: string) {
  const signer = signersOf(results).find(s => s.id === id);
  return signer ? { text: signer.name, meta: "Signed" } : null;
}

// ---------- This step's own presses ----------
// Merge and undo on the grid, close signing. Checked here, decided under the room lock.
const isUuid = (x: unknown) => typeof x === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const isKey = (x: unknown) => typeof x === "string" && /^[a-z0-9]{1,24}$/.test(x);
export type KindPress = { rpc: "grid_control" | "sign_control"; id: string; action: string; p: Record<string, unknown> };
export function kindPress(value: unknown): KindPress | null {
  const v = record(value);
  if (!isUuid(v.id) || (v.from !== null && !isUuid(v.from))) return null;
  if (v.kind === "grid" && (v.action === "merge" || v.action === "unmerge")) {
    if (!isKey(v.item) || (v.action === "merge" && (!isKey(v.into) || v.into === v.item))) return null;
    return { rpc: "grid_control", id: String(v.id), action: v.action, p: { from: v.from, item: v.item, ...(v.action === "merge" ? { into: v.into } : {}) } };
  }
  if (v.kind === "sign" && v.action === "close") return { rpc: "sign_control", id: String(v.id), action: "close", p: { from: v.from } };
  // A hidden name comes back with its signature (the engine's Unhide carries no value).
  if (v.kind === "sign" && v.action === "unhide" && isUuid(v.item)) return { rpc: "sign_control", id: String(v.id), action: "unhide", p: { from: v.from, item: v.item } };
  return null;
}

// The signature wall: rows from the top. When it is full and quiet it rolls slowly down to
// the newest row and back, never jumping.
export function wallLayout(n: number, width: number, columns: number, rowHeight: number, gapX: number, gapY: number) {
  const w = (width - gapX * (columns - 1)) / columns;
  return Array.from({ length: n }, (_, i) => ({ x: (i % columns) * (w + gapX), y: Math.floor(i / columns) * (rowHeight + gapY), w }));
}

// One signature card in multiples of its name's type size: the gaps between cards, a name
// line, the rule and padding above the name, and the signature's height (smallest readable,
// comfortable, largest). The "+ 4 more" line takes one more line under a wall that rolls.
export const wallUnits = { gapX: 0.9, gapY: 0.5, line: 1.15, rule: 0.44, sigLeast: 1, sigEasy: 1.6, sigMost: 3.6, more: 1.5 };
// How a set of names sets at a type size and column width: the most lines any name takes,
// whether every word fits on a line (no name breaks inside a word), and how many names run
// past two lines.
export type NameFit = { lines: number; words: boolean; over: number };
export type WallFit = { cols: number; rows: number; font: number; w: number; rowH: number; gapX: number; gapY: number; lines: number; capacity: number; more: number };

// Fits every signature on the wall (pass 3 change 13, the practice-room fix of November 3).
// Names start at the room's TV floor and the cards reflow into more columns as people sign;
// once the room's floor cannot hold everyone, names shrink toward the 1080p TV minimum. The
// largest type that holds every name and a comfortable signature wins, then the largest
// signature. Past the minimum the wall keeps its smallest cards, rolls slowly, and counts the
// names out of view ("+ 4 more"), so no one who signed is ever silently left off.
export function fitWall(n: number, width: number, height: number, room: number, least: number, measure: (font: number, width: number) => NameFit): WallFit {
  const u = wallUnits, count = Math.max(1, n), floor = Math.min(room, least);
  const fonts: number[] = [];
  for (let f = room; f > floor + 0.5; f *= 0.92) fonts.push(f);
  fonts.push(floor);
  const nameH = (lines: number, f: number) => (lines * u.line + u.rule) * f;
  // Names whole first. A name too long to hold whole may break inside a word, and only then
  // do the very longest names (one in eight at most) end after two lines (the very long
  // names state), so one long name never pushes everyone else off the wall.
  for (const pass of ["whole", "break", "end"] as const) {
    let fallback: WallFit | null = null;
    for (const f of fonts) {
      let best: (WallFit & { sig: number }) | null = null;
      for (let cols = 1; cols <= 8; cols++) {
        const gapX = f * u.gapX, gapY = f * u.gapY, w = (width - gapX * (cols - 1)) / cols;
        if (w < f * 3) break;
        const m = measure(f, w), lines = Math.min(2, m.lines);
        if ((pass === "end" ? m.over > Math.ceil(count / 8) : m.lines > 2) || (pass === "whole" && !m.words)) continue;
        const rows = Math.ceil(count / cols), name = nameH(lines, f);
        const rowH = Math.min(name + f * u.sigMost, (height - gapY * (rows - 1)) / rows);
        // A signature keeps its 3:1 shape, so a narrow card shows it smaller.
        const sig = Math.min(rowH - name, w / 3);
        if (sig < f * u.sigLeast) continue;
        if (!best || sig > best.sig + 0.5) best = { cols, rows, font: f, w, rowH, gapX, gapY, lines, capacity: cols * rows, more: 0, sig };
      }
      if (best && best.sig >= f * u.sigEasy) return best;
      if (best && !fallback) fallback = best;
    }
    if (fallback) return fallback;
  }
  // More names than the wall can hold at the TV minimum: the most columns that keep names
  // whole (or, failing that, readable), the rows that fit above the "+ 4 more" line, and a roll.
  const f = floor, gapX = f * u.gapX, gapY = f * u.gapY;
  type Pick = { cols: number; w: number; lines: number };
  let whole: Pick | null = null, ended: Pick | null = null, widest: Pick = { cols: 1, w: width, lines: 2 };
  for (let cols = 1; cols <= 8; cols++) {
    const w = (width - gapX * (cols - 1)) / cols;
    if (w < f * 3) break;
    const m = measure(f, w), lines = Math.min(2, m.lines);
    if (w >= f * 5) widest = { cols, w, lines };
    if (m.words && m.lines <= 2) whole = { cols, w, lines };
    if (m.over <= Math.ceil(count / 8)) ended = { cols, w, lines };
  }
  const { cols, w, lines } = whole ?? ended ?? widest, rows = Math.ceil(count / cols);
  const rowH = nameH(lines, f) + f * u.sigEasy;
  const fit = (h: number) => Math.max(1, Math.floor((h + gapY) / (rowH + gapY)));
  const all = fit(height) >= rows, shown = all ? rows : fit(height - f * u.more);
  return { cols, rows, font: f, w, rowH, gapX, gapY, lines, capacity: cols * shown, more: all ? 0 : Math.max(0, n - cols * shown) };
}
