// The interaction library (PRD "The interaction library"). Every kind is a TV and phone
// pair. The database registers each kind (private.interaction_kinds) when its step lands,
// so the run of show offers only the kinds the server can run; this list fixes the names.
export const interactionKinds = ["word_cloud", "wall", "qa", "choice", "scale", "ranking", "points", "grid", "form", "sign", "statements", "goals", "content", "bullets", "confirm", "intent", "lens", "lens_summary", "candidates", "four_lists"] as const;
export type InteractionKind = typeof interactionKinds[number];
// Names held for the Wayfinding kinds (milestone 4). They join interactionKinds, screenIds and the
// database registry as each step builds them, so no step picks a name another already holds.
export const reservedKinds = [] as const;
export const isReservedKind = (value: unknown): boolean => reservedKinds.includes(value as typeof reservedKinds[number]);
export const screenIds: Record<InteractionKind, string> = {
  word_cloud: "INT-01", wall: "INT-02", qa: "INT-03", choice: "INT-04", scale: "INT-05", ranking: "INT-06", points: "INT-07",
  grid: "INT-08", form: "INT-09", sign: "INT-10", intent: "INT-16", statements: "INT-17", content: "Content", bullets: "D1-11", confirm: "D2-05", goals: "INT-15", lens: "INT-12", lens_summary: "INT-18", candidates: "INT-13", four_lists: "INT-11",
};
// The registry's labels (private.interaction_kinds), for places that have no server kind in hand, such as the
// template preview. The run of show shows the same words.
export const kindLabels: Record<InteractionKind, string> = {
  word_cloud: "Word cloud", wall: "Open text", qa: "Q&A", choice: "Multiple choice", scale: "Scale", ranking: "Ranking", points: "100 points",
  grid: "2x2 grid", form: "Private form", sign: "Sign together", statements: "Statements", content: "Content screen", goals: "CORE goals",
  bullets: "Outcome bullets", confirm: "Outcome confirm", intent: "Commander's intent", lens: "Lens wall", lens_summary: "Lens summary", candidates: "Candidate priorities", four_lists: "Four Helpful Lists",
};
export type KindInfo = {
  kind: InteractionKind; label: string; input: boolean; one_per_person: boolean; counts: "people" | "answers" | "none";
  structured: boolean; shares_answers: boolean; spotlight: "none" | "id" | "key"; named?: "never" | "always" | "setting";
};
// Used only before the server's own kind arrives (an old snapshot): milestone 2's two kinds.
export const fallbackKinds: Record<string, KindInfo> = {
  word_cloud: { kind: "word_cloud", label: "Word cloud", input: true, one_per_person: false, counts: "answers", structured: false, shares_answers: true, spotlight: "key" },
  wall: { kind: "wall", label: "Open text", input: true, one_per_person: false, counts: "answers", structured: false, shares_answers: true, spotlight: "id" },
  content: { kind: "content", label: "Content screen", input: false, one_per_person: false, counts: "none", structured: false, shares_answers: true, spotlight: "none" },
};
export const kindOf = (session: { interaction: string; kind?: KindInfo | null } | null | undefined): KindInfo | null =>
  session ? session.kind ?? fallbackKinds[session.interaction] ?? null : null;
export const isInteraction = (value: unknown): value is InteractionKind => interactionKinds.includes(value as InteractionKind);

// "8 answering" for one-answer-per-person kinds, "23 answers" for text kinds.
export function countOf(results: { total: number; people: number }, counts: KindInfo["counts"] | undefined) {
  return counts === "people" ? results.people : results.total;
}
// A kind may name what it counts (Q&A counts questions).
export const countWords: Partial<Record<InteractionKind, [string, string]>> = { qa: ["question", "questions"], bullets: ["bullet", "bullets"], four_lists: ["card", "cards"] };
export function countUnit(n: number, counts: KindInfo["counts"] | undefined, kind?: InteractionKind) {
  const words = kind ? countWords[kind] : undefined;
  return counts === "people" ? "answering" : words ? words[n === 1 ? 0 : 1] : n === 1 ? "answer" : "answers";
}
// The TV's count badges, read aloud (November 4): "8 answering" where each person gives one response,
// "23 answers from 8 people" where one person can send several. The badges themselves show numbers only.
export const countLabel = (people: number, total: number, counts: KindInfo["counts"] | undefined, kind?: InteractionKind) =>
  counts === "people" ? `${people} ${countUnit(people, counts, kind)}` : `${total} ${countUnit(total, counts, kind)} from ${people} ${people === 1 ? "person" : "people"}`;

// Content screens (PRD "Content screens").
export const contentScreens = ["headline", "scripture", "prayer", "image", "holding", "screen_check"] as const;
export type ContentScreen = typeof contentScreens[number];
export const contentLabels: Record<ContentScreen, string> = {
  headline: "Headline with depth", scripture: "Scripture", prayer: "Prayer and silence", image: "Image or document page", holding: "Holding and walk-in", screen_check: "Screen check",
};
export type ContentOptions = { screen?: ContentScreen; number?: string; source?: string; reference?: string; translation?: string; line?: string; outline?: string; media?: string; size?: "body" };
export const contentOf = (options: unknown): ContentOptions & { screen: ContentScreen } => {
  const o = options && typeof options === "object" && !Array.isArray(options) ? options as ContentOptions : {};
  const { size, ...rest } = o;
  return { ...rest, ...(o.screen === "scripture" && size === "body" ? { size } : {}), screen: contentScreens.includes(o.screen as ContentScreen) ? o.screen as ContentScreen : "headline" };
};

// A passage or headline may mark phrases bold with **two stars**. Plain text otherwise:
// nothing a facilitator types is ever read as markup.
export function boldParts(text: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  text.split(/(\*\*[^*\n]+\*\*)/g).forEach(part => {
    if (!part) return;
    const bold = /^\*\*[^*\n]+\*\*$/.test(part);
    out.push({ text: bold ? part.slice(2, -2) : part, bold });
  });
  return out;
}
export const plainText = (text: string) => boldParts(text).map(part => part.text).join("");

// Phone depth: paragraphs; a line starting "> " is a quote, and a line that follows it
// starting "- " is the quote's source; "## Title" starts a "Read more" section.
export type DepthBlock = { kind: "text"; text: string } | { kind: "quote"; text: string; source?: string } | { kind: "section"; title: string; blocks: DepthBlock[] };
export function depthBlocks(depth: string): DepthBlock[] {
  const top: DepthBlock[] = [];
  let target = top;
  for (const raw of depth.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = raw.split("\n").map(line => line.trimEnd()).filter(Boolean);
    if (!lines.length) continue;
    if (lines[0].startsWith("## ")) {
      const section: DepthBlock = { kind: "section", title: lines[0].slice(3).trim(), blocks: [] };
      top.push(section); target = section.blocks;
      lines.shift(); if (!lines.length) continue;
    }
    if (lines[0].startsWith("> ")) {
      const quote = lines.filter(line => line.startsWith("> ")).map(line => line.slice(2)).join(" ");
      const source = lines.find(line => line.startsWith("- "))?.slice(2).trim();
      target.push({ kind: "quote", text: quote, ...(source ? { source } : {}) });
    } else target.push({ kind: "text", text: lines.join("\n") });
  }
  return top;
}
// The holding screen's outline: one item per line, an optional time first ("9:00 Welcome").
export function outlineRows(outline: string) {
  return outline.split("\n").map(line => line.trim()).filter(Boolean).slice(0, 12).map(line => {
    const match = line.match(/^(\d{1,2}(?::\d\d)?\s*(?:am|pm)?)\s+(.+)$/i);
    return match ? { time: match[1], text: match[2] } : { time: "", text: line };
  });
}

// The words the template preview shows for a session: the kind's label, or the content screen's own label.
export const kindLabel = (interaction: string, screen: string | null) => interaction === "content"
  ? contentLabels[contentScreens.includes(screen as ContentScreen) ? screen as ContentScreen : "headline"] : kindLabels[interaction as InteractionKind] ?? fallbackKinds[interaction]?.label ?? interaction;
