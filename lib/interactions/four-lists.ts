// The Four Helpful Lists (INT-11, SET-05): pure rules shared by the TV board, the phone, the control surface, the review,
// the routes and the tests. The cards, their lists and their agreement counts come from the server's results; what lives
// here is reading them, checking what a phone or a press sends before it goes, and the plain words beside a refusal.
// A card never carries a name: the results hold the words, the list and a count of people who agreed.

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown) => Array.isArray(value) ? value : [];
const isUuid = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const int = (x: unknown) => typeof x === "number" && Number.isFinite(x) ? Math.trunc(x) : 0;
const text = (x: unknown) => typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "";

// The four lists, in the order they stand on the TV, left to right.
export const listKeys = ["right", "wrong", "missing", "confused"] as const;
export type ListKey = typeof listKeys[number];
export const listNames: Record<ListKey, string> = { right: "What's right?", wrong: "What's wrong?", missing: "What's missing?", confused: "What's confused?" };
// A short hint under each heading on the phone. The headings tell the lists apart; colour only helps.
export const listHints: Record<ListKey, string> = {
  right: "Something working that we should protect", wrong: "Something not working that we should fix",
  missing: "Something we do not have yet", confused: "Something unclear or that people see differently",
};
export const isList = (value: unknown): value is ListKey => (listKeys as readonly unknown[]).includes(value);
export const cardMax = 200;
// A person's cards across all four lists. The session's own limit (max_sends) can be lower; this is the default.
export const defaultPerPerson = 12;
// A list on the TV shows this many cards; the rest wait on phones.
export const shownPerList = 8;

// ---------- What the TV reads ----------
export type FlCard = { id: string; col: ListKey; text: string; agree: number; held: number; ai: boolean; pinned: boolean; ids: string[]; order: number };
export type FlColumn = { cards: number; units: number };
export type FourListsResults = { total: number; people: number; ai: boolean; columns: Record<ListKey, FlColumn>; cards: FlCard[] };
export function fourListsOf(results: unknown): FourListsResults {
  const r = record(results), columns = record(r.columns);
  const col = (key: ListKey): FlColumn => { const c = record(columns[key]); return { cards: int(c.cards), units: int(c.units) }; };
  return {
    total: int(r.total), people: int(r.people), ai: r.ai === true,
    columns: { right: col("right"), wrong: col("wrong"), missing: col("missing"), confused: col("confused") },
    cards: list(r.cards).flatMap(value => {
      const c = record(value);
      return isUuid(c.id) && isList(c.col) && text(c.text) ? [{ id: String(c.id), col: c.col, text: text(c.text), agree: int(c.agree), held: Math.max(1, int(c.held)), ai: c.ai === true, pinned: c.pinned === true,
        ids: list(c.ids).filter(isUuid).map(String), order: int(c.order) }] : [];
    }),
  };
}
// One list's cards, as the server ranked them (most agreed first, then oldest).
export const cardsIn = (results: FourListsResults, key: ListKey) => results.cards.filter(c => c.col === key);
// "+ 3 more on phones" under a list that holds more than the TV shows. Cards the TV cannot fit wait on phones.
export const moreOnPhones = (column: FlColumn, shown: number) => column.units > shown ? `+ ${column.units - shown} more on phones` : "";
// The AI line under the heading, once AI has grouped anything on the TV.
export const groupedLine = "Grouped from your answers";
export const agreeWords = (n: number) => n === 1 ? "1 agrees" : `${n} agree`;

// ---------- A phone adds a card ----------
export type CardCheck = { ok: boolean; count: number; message: string };
export function checkCard(value: string, max = cardMax): CardCheck {
  const clean = text(value), count = [...value].length;
  if (!clean) return { ok: false, count, message: "" };
  if ([...clean].length > max) return { ok: false, count, message: `Keep it to ${max} characters or fewer.` };
  return { ok: true, count, message: "" };
}
export const cardsLeft = (used: number, limit: number) => Math.max(0, limit - used);
export const limitLine = (used: number, limit: number) => used >= limit ? `You have added all ${limit} of your cards. You can still agree with others.` : `${used} of ${limit} cards added. Anonymous.`;
export const cardValue = (column: ListKey) => ({ column });
// The list a stored answer sits in (its value is {column}).
export const columnOf = (value: unknown): ListKey | null => { const c = record(value).column; return isList(c) ? c : null; };

// ---------- A phone reads everyone's cards and agrees ----------
export type PhoneCard = { id: string; col: ListKey; text: string; agree: number; mine: boolean; own: boolean };
export function phoneCardsOf(data: unknown): PhoneCard[] {
  return list(record(data).cards).flatMap(value => {
    const c = record(value);
    return isUuid(c.id) && isList(c.col) && text(c.text) ? [{ id: String(c.id), col: c.col, text: text(c.text), agree: int(c.agree), mine: c.mine === true, own: c.own === true }] : [];
  });
}
export type AgreeBody = { card: string; on: boolean };
export function agreeBody(value: unknown): AgreeBody | null {
  const v = record(value);
  return isUuid(v.card) && typeof v.on === "boolean" ? { card: String(v.card).toLowerCase(), on: v.on } : null;
}
// Apply an agreement to a list of cards at once (the phone shows it before the server answers).
export const withAgreement = (cards: PhoneCard[], id: string, on: boolean): PhoneCard[] =>
  cards.map(c => c.id === id && c.mine !== on ? { ...c, mine: on, agree: Math.max(0, c.agree + (on ? 1 : -1)) } : c);
export const agreeMessages: Record<string, string> = {
  own: "You can't agree with your own card.", closed: "This step is not taking input right now.", missing: "That card is no longer there.",
  denied: "Join the room again to agree.", invalid_request: "That did not go through.", unavailable: "Couldn't reach the room. Try again.",
};

// ---------- The review (SET-05) ----------
export type ReviewCard = { id: string; col: ListKey; text: string; original: string; edited: boolean; hidden: boolean; kept: boolean; merged_into: string | null;
  agree: number; heard: boolean; tensions: boolean; members: number; at: string };
export type Review = { session: string; title: string; ai: boolean; took_part: number; cards: ReviewCard[] };
export function reviewOf(data: unknown): Review | null {
  const r = record(data);
  if (r.status !== "ok" || !isUuid(r.session)) return null;
  return {
    session: String(r.session), title: text(r.title), ai: r.ai === true, took_part: int(r.took_part),
    cards: list(r.cards).flatMap(value => {
      const c = record(value);
      return isUuid(c.id) && isList(c.col) ? [{ id: String(c.id), col: c.col, text: text(c.text), original: text(c.original), edited: c.edited === true, hidden: c.hidden === true, kept: c.kept !== false,
        merged_into: isUuid(c.merged_into) ? String(c.merged_into) : null, agree: int(c.agree), heard: c.heard === true, tensions: c.tensions === true, members: int(c.members), at: text(c.at) }] : [];
    }),
  };
}
// A card standing on its own in the review: not set aside and not merged into another.
export const standing = (cards: ReviewCard[]) => cards.filter(c => c.kept && !c.merged_into);
export const mergedInto = (cards: ReviewCard[], id: string) => cards.filter(c => c.merged_into === id);
// Strategic Tensions come from what is wrong or confused; What We Heard can come from any list.
export const canFeedTensions = (col: ListKey) => col === "wrong" || col === "confused";
export const reviewCounts = (cards: ReviewCard[]) => ({
  heard: standing(cards).filter(c => c.heard).length, tensions: standing(cards).filter(c => c.tensions).length,
  kept: standing(cards).length, aside: cards.filter(c => !c.kept).length,
});

export const reviewActions = ["edit", "keep", "merge", "unmerge", "mark"] as const;
export type ReviewAction = typeof reviewActions[number];
export type ReviewPress = { session: string; action: ReviewAction; p: Record<string, unknown> };
export function reviewPress(value: unknown): ReviewPress | null {
  const v = record(value);
  if (!isUuid(v.session) || !(reviewActions as readonly unknown[]).includes(v.action)) return null;
  const session = String(v.session).toLowerCase(), action = v.action as ReviewAction, lower = (x: unknown) => String(x).toLowerCase();
  if (action === "merge") {
    const cards = list(v.cards);
    return cards.length >= 2 && cards.length <= 20 && cards.every(isUuid) ? { session, action, p: { cards: cards.map(lower) } } : null;
  }
  if (!isUuid(v.card)) return null;
  const card = lower(v.card);
  if (action === "edit") { const words = text(v.text); return words && [...words].length <= cardMax ? { session, action, p: { card, text: words } } : null; }
  if (action === "keep") return typeof v.kept === "boolean" ? { session, action, p: { card, kept: v.kept } } : null;
  if (action === "unmerge") return { session, action, p: { card } };
  return typeof v.heard === "boolean" && typeof v.tensions === "boolean" ? { session, action, p: { card, heard: v.heard, tensions: v.tensions } } : null;
}
export const reviewMessages: Record<string, string> = {
  filtered: "Those words are screened by the word filter.", invalid_request: "Check the words: up to 200 characters.", invalid_state: "That isn't available for this card.",
  missing: "That card is no longer there.", closed: "This engagement is closed.", denied: "Only a facilitator can do that.", unavailable: "Couldn't reach the room. Try again.",
};
