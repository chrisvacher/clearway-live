// INT-12, lens seeding and the lens wall: the shapes the server sends and the pure rules every
// surface shares. A lens session is either the seeding step ({ seed: true }, self-paced, all five
// lenses) or one lens's wall ({ lens: 1..5 }). Every number is the server's.
import { isLens, lensNumbers, type LensNumber } from "@/lib/wayfinding/lens";
import { wallOf, type WallGroup } from "@/lib/interactions/ai";

export const heldText = "Hidden until Day 1";
// The phone's "Who sees my answers?" line on the seeding step. Sentences are held from everyone, the facilitator
// included, until each lens opens (PRD), so the general line about the screen would say the opposite.
export const seedingWhoText = "No one, until each lens opens on Day 1. Not even the facilitator.";
export type LensOptions = { seed: boolean; lens: LensNumber | null; recording: string; names: string[]; ai: boolean };
export function lensOptions(options: unknown): LensOptions {
  const o = options && typeof options === "object" && !Array.isArray(options) ? options as Record<string, unknown> : {};
  const names = Array.isArray(o.lens_names) ? o.lens_names.filter((n): n is string => typeof n === "string") : [];
  return { seed: o.seed === true, lens: isLens(o.lens) ? o.lens : null, recording: typeof o.recording === "string" && /^https:\/\//.test(o.recording) ? o.recording : "", names, ai: o.ai !== false };
}

// What the lens wall's results carry (private.results_lens).
export type LensResults = { total: number; people: number; lens: LensNumber | null; lensName: string; ai: boolean; seeded: { id: string; text: string }[]; groups: WallGroup[] };
export function lensOf(results: unknown): LensResults {
  const r = results && typeof results === "object" ? results as Record<string, unknown> : {};
  const seeded = Array.isArray(r.seeded) ? (r.seeded as unknown[]).filter((s): s is { id: string; text: string } => !!s && typeof (s as { id?: unknown }).id === "string" && typeof (s as { text?: unknown }).text === "string") : [];
  const { ai, groups } = wallOf(results);
  return { total: Number(r.total) || 0, people: Number(r.people) || 0, lens: isLens(r.lens) ? r.lens : null, lensName: typeof r.lens_name === "string" ? r.lens_name : "", ai, seeded, groups };
}

// A lens sentence describes the 10-year Future in the present tense. The phone nudges, never blocks.
const futureWords = /\b(will|would|should|shall|could|might|hope(?:s|d)? to|hoping|want(?:s|ed)? to|wish(?:es)? to|plan(?:s|ned)? to|going to|aim(?:s)? to|need(?:s)? to|someday|one day|by then)\b/i;
export function futureTense(text: string): boolean { return futureWords.test(text); }
export const presentTenseNudge = "Say it as if it is already true. Try “We welcome…” instead of “We will welcome…”.";
// A seeded sentence may run to 400 characters (the database's limit); the live lens wall keeps its own, shorter one.
export const seedSentenceMax = 400, wallSentenceMax = 280;
export const sentenceCap = (max: number, seed = false) => seed ? seedSentenceMax : Math.min(max || 200, wallSentenceMax);
export function checkSentence(text: string, max: number, seed = false): { ok: boolean; message: string; count: string } {
  const trimmed = text.trim(), length = [...trimmed].length, cap = sentenceCap(max, seed);
  if (trimmed === heldText) return { ok: false, message: "Write your own sentence.", count: `${length} / ${cap}` };
  return { ok: length > 0 && length <= cap, count: `${length} / ${cap}`, message: length > cap ? `${length - cap} characters over. Keep it to ${cap}.` : "" };
}

// Seeding on the phone: a person's own sentences by lens (their text is held back; the lens rides in value).
export function seededByLens(mine: { value?: unknown; withdrawn: boolean }[]): Record<LensNumber, number> {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<LensNumber, number>;
  for (const a of mine) { const lens = (a.value as { lens?: unknown } | null | undefined)?.lens; if (!a.withdrawn && isLens(lens)) out[lens]++; }
  return out;
}

// The cluster label's size by count: tv-floor at one, tv-main at six or more (motion spec 1).
export const clusterGrowth = (count: number) => Math.max(0, Math.min(1, (count - 1) / 5));
// The sentences that drift together when AI groups them: the first twelve, 40ms apart.
export const driftSteps = 12;

// The control surface: how many were written, per lens. Numbers only until the lens opens.
export type SeedCount = { lens: LensNumber; seeded: number; people: number; open: boolean };
export function seedCounts(value: unknown): SeedCount[] {
  const rows = (value as { lenses?: unknown } | null | undefined)?.lenses;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(r => isLens(r?.lens) ? [{ lens: r.lens as LensNumber, seeded: Number(r.seeded) || 0, people: Number(r.people) || 0, open: r.open === true }] : []);
}
export const seedLine = (c: SeedCount) => c.open ? "Open on the TV" : c.seeded ? `${c.seeded} ${c.seeded === 1 ? "sentence" : "sentences"} from ${c.people} ${c.people === 1 ? "person" : "people"}` : "None yet";
export { lensNumbers };
