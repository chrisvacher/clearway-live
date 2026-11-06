// The thin data rule (PRD "Discover", Default): a theme or segment is thin when it rests on fewer than 10
// responses, on under 10 percent of respondents, or on one interview. It is worked out here, in code, from
// the counts. AI never decides it and the database never stores it.
//
// Where the rule is silent (the Four Helpful Lists, a few people at a table) this step flags a theme that
// rests on one person, the same way one interview is thin. Flagged for Chris in docs/discover-records.md.

export type ThemeSource = "survey" | "four_lists" | "conversations";

export const THIN_MIN_RESPONSES = 10;
export const THIN_MIN_SHARE = 0.1;

export type Counts = { source: ThemeSource; restsOn: number; outOf?: number | null };
export type Thin = { thin: boolean; reason: string };

const respondents = (n: number, of?: number | null) => of ? `${n} of ${of} respondents` : `${n} ${n === 1 ? "respondent" : "respondents"}`;

export function thin({ source, restsOn, outOf }: Counts): Thin {
  const n = Number.isFinite(restsOn) ? Math.max(0, Math.floor(restsOn)) : 0;
  const of = outOf && Number.isFinite(outOf) && outOf > 0 ? Math.floor(outOf) : null;
  if (source === "conversations") return n <= 1 ? { thin: true, reason: n === 1 ? "one conversation" : "no conversations" } : { thin: false, reason: "" };
  if (source === "four_lists") return n <= 1 ? { thin: true, reason: n === 1 ? "one person" : "no people" } : { thin: false, reason: "" };
  if (n < THIN_MIN_RESPONSES) return { thin: true, reason: `${respondents(n, of)}, fewer than ${THIN_MIN_RESPONSES}` };
  if (of && n / of < THIN_MIN_SHARE) return { thin: true, reason: `${respondents(n, of)}, under ${Math.round(THIN_MIN_SHARE * 100)} percent` };
  return { thin: false, reason: "" };
}

export const isThin = (counts: Counts) => thin(counts).thin;

// "27 of 87", "4 of 5 conversations", "3 of 8 people": what a theme rests on, as the screens say it.
export function restsOnLabel({ source, restsOn, outOf }: Counts): string {
  const of = outOf && outOf > 0 ? ` of ${outOf}` : "";
  if (source === "conversations") return `${restsOn}${of || ""} ${outOf === 1 || (!outOf && restsOn === 1) ? "conversation" : "conversations"}`;
  if (source === "four_lists") return `${restsOn}${of} ${(outOf ?? restsOn) === 1 ? "person" : "people"}`;
  return of ? `${restsOn}${of}` : `${restsOn} ${restsOn === 1 ? "respondent" : "respondents"}`;
}
