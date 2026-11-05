// The draft Clearway Map (D2-15). Two pages assembled on the server from the engagement's records.
// Horizon terms are written exactly: 10-year Future, 3-year Vision, 1-year Outlook.
export type MapField = { text?: string; items?: string[]; empty?: boolean; why?: string };
export type MapLens = { lens: number; name: string; state: "signed_off" | "not_signed_off"; version?: number; lines: string[]; why?: string };
export type MapOutcome = { id: string; n: number; title: string; description?: string; status: string; stop?: string; indicators: string[] };
export type MapGoal = { id: string; title: string; result?: string; outcome?: string; outcome_n?: number; owner?: string; end_date?: string; season?: string; risks?: string[] };
export type MapIssue = { kind: "risk" | "tension" | "question"; text: string; mitigations?: string[] };
export type MapListed<T> = { items: T[]; empty?: boolean; why?: string };
export type MapPages = {
  church: string; title: string;
  years: { base: number; future: number; vision: number; outlook: number };
  page1: { mission: MapField; purpose: MapField; values: MapField; strategy: MapField;
    future: { year: number; lenses: MapLens[] };
    vision: { year: number; outcomes: MapOutcome[]; empty?: boolean; why?: string } };
  page2: { priorities: { empty: true; why: string };
    outlook: { year: number; goals: MapGoal[]; empty?: boolean; why?: string; unmet: number;
      metrics: MapListed<{ text: string; rank?: number }>; celebrations: MapListed<{ text: string; theme?: string }> };
    season: { label?: string; goals: MapGoal[]; empty?: boolean; why?: string };
    rhythms: MapField; issues: MapListed<MapIssue> };
};
export type MapDraft = { status: "ok"; version: number; assembled_at: string; pages: MapPages };

const issueLabel: Record<MapIssue["kind"], string> = { risk: "Risk", tension: "Tension", question: "Question" };
const empty = (why?: string) => `_Empty. ${why ?? ""}_`.trim();
const bullets = (items: string[]) => items.map(i => `- ${i}`).join("\n");
const field = (f: MapField) => f.empty ? empty(f.why) : f.items ? bullets(f.items) : f.text ?? "";
const goalLine = (g: MapGoal) => `- ${g.title}${g.result ? `: ${g.result}` : ""}${g.owner ? ` (${g.owner}` : ""}${g.owner && g.end_date ? `, ${g.end_date})` : g.owner ? ")" : g.end_date ? ` (${g.end_date})` : ""}`;

// A plain text copy of the Map, for the export.
export function mapMarkdown(d: MapDraft): string {
  const { pages: p } = d, a = p.page1, b = p.page2, out: string[] = [];
  out.push(`# ${p.church} Clearway Map (draft)`, `${p.title}`, "", "## Page 1: Identity and direction", "");
  out.push("### Mission", field(a.mission), "", "### Purpose", field(a.purpose), "", "### Values", field(a.values), "", "### Strategy", field(a.strategy), "");
  out.push(`### 10-year Future (${a.future.year})`, "");
  for (const l of a.future.lenses) out.push(`**${l.name}**`, l.state === "signed_off" ? bullets(l.lines) : empty(l.why), "");
  out.push(`### 3-year Vision (${a.vision.year})`, "");
  if (a.vision.empty) out.push(empty(a.vision.why), "");
  for (const o of a.vision.outcomes) out.push(`**${o.n}. ${o.title}**${o.status === "confirmed" ? "" : " (provisional)"}`, ...(o.description ? [o.description] : []), ...(o.indicators.length ? [bullets(o.indicators)] : []), "");
  out.push("## Page 2: Action", "", "### This Year's Priorities", empty(b.priorities.why), "", `### 1-year Outlook (${b.outlook.year})`, "");
  out.push(b.outlook.empty ? empty(b.outlook.why) : b.outlook.goals.map(goalLine).join("\n"), "");
  out.push("**Key metrics**", b.outlook.metrics.empty ? empty(b.outlook.metrics.why) : bullets(b.outlook.metrics.items.map(m => m.text)), "");
  out.push("**Celebrations**", b.outlook.celebrations.empty ? empty(b.outlook.celebrations.why) : bullets(b.outlook.celebrations.items.map(m => m.text)), "");
  out.push(`### This Season's Goals${b.season.label ? ` (${b.season.label})` : ""}`, b.season.empty ? empty(b.season.why) : b.season.goals.map(goalLine).join("\n"), "");
  out.push("### Leadership Rhythms", field(b.rhythms), "", "### Key Issues");
  out.push(b.issues.empty ? empty(b.issues.why) : b.issues.items.map(i => `- ${issueLabel[i.kind]}: ${i.text}${i.mitigations?.length ? ` (${i.mitigations.join("; ")})` : ""}`).join("\n"), "");
  return out.join("\n");
}
