import { uuid } from "../room/identity";
import { parts, type SessionInput, type ShowSession } from "./types";

export function fillYears(text: string, base: number) {
  return text.replace(/\{base year(?:\s*\+\s*(1|3|10))?\}/g, (_, years) => String(base + Number(years || 0)));
}
export function sortSessions(sessions: ShowSession[]) {
  return [...sessions].sort((a, b) => parts.indexOf(a.part) - parts.indexOf(b.part) || a.position - b.position || a.id.localeCompare(b.id));
}
export function sessionInput(value: unknown): SessionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Check the session details.");
  const v = value as Record<string, unknown>;
  const text = (key: string, max: number, required = false) => {
    const s = v[key];
    if (typeof s !== "string" || [...s].length > max || (required && !s.trim())) throw new Error(`Check ${key.replaceAll("_", " ")}.`);
    return s.trim();
  };
  const integer = (key: string, low: number, high: number) => {
    const n = v[key]; if (typeof n !== "number" || !Number.isInteger(n) || n < low || n > high) throw new Error(`Check ${key.replaceAll("_", " ")}.`); return n;
  };
  const instant = (key: string) => {
    if (v[key] === null || v[key] === "") return null;
    const s = text(key, 40);
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(s) || !Number.isFinite(Date.parse(s))) throw new Error("Check the session times.");
    return new Date(s).toISOString();
  };
  if (!uuid(v.id) || (v.revision !== null && (!Number.isInteger(v.revision) || Number(v.revision) < 0))) throw new Error("Reload the session before saving.");
  if (!parts.includes(v.part as typeof parts[number]) || !["live", "self_paced"].includes(String(v.mode)) || !["word_cloud", "wall", "content"].includes(String(v.interaction))
    || !["draft", "ready", "open", "live", "phones_down", "closed"].includes(String(v.state))) throw new Error("Choose a session type and state.");
  const settings = v.settings as Record<string, unknown>;
  if (!settings || settings.anonymous !== true || typeof settings.join_strip !== "boolean" || ![3, 4, 5].includes(Number(settings.burst_minutes)) || typeof settings.burst_minutes !== "number") throw new Error("Choose the session settings.");
  const opens = instant("opens_at"), closes = instant("closes_at");
  if (v.mode === "self_paced" && (!opens || !closes || opens >= closes)) throw new Error("Set an opening time before the closing time.");
  return { id: v.id, revision: v.revision as number | null, title: text("title", 200, true), part: v.part as SessionInput["part"],
    planned_start: instant("planned_start"), planned_minutes: integer("planned_minutes", 1, 1440), mode: v.mode as SessionInput["mode"], opens_at: opens, closes_at: closes,
    interaction: v.interaction as SessionInput["interaction"], prompt: text("prompt", 4000), phone_depth: text("phone_depth", 20000), notes: text("notes", 30000),
    lands_in: text("lands_in", 200), state: v.state as string, max_sends: integer("max_sends", 1, 100), max_characters: integer("max_characters", 1, 280), max_words: integer("max_words", 1, 50),
    settings: { anonymous: true, burst_minutes: settings.burst_minutes as number, join_strip: settings.join_strip as boolean } };
}
