// SET-05's download: every card of every Four Helpful Lists step as CSV, one row per card, a folded card on its own row
// beneath its survivor. No one is named: the database never sends a person with a card. Same laying out as the other
// exports (csvLine, csvFile, a leading = + - @ kept as text).
import { csvFile, csvLine } from "./csv";
import { columnLabels, fourColumns, type FourReview } from "../interactions/four-lists";

export function fourListsCsv(review: FourReview): string {
  const header = ["Step", "List", "Card", "People agreeing", "Folded into", "Folded by", "Pinned", "Hidden from the TV"];
  const lines = review.sessions.flatMap(s => {
    const rank = (c: { column: string }) => fourColumns.indexOf(c.column as typeof fourColumns[number]);
    return [...s.cards].sort((a, b) => rank(a) - rank(b) || Number(Boolean(a.hidden)) - Number(Boolean(b.hidden)) || a.rank - b.rank).flatMap(c => [
      csvLine([s.title, columnLabels[c.column], c.text, c.hidden ? "" : c.agree, "", "", c.pinned ? "Yes" : "", c.hidden ? "Yes" : ""]),
      ...(c.members ?? []).map(m => csvLine([s.title, columnLabels[c.column], m.text, "", c.text, m.by === "ai" ? "AI" : "Matching words", "", ""])),
    ]);
  });
  return csvFile([csvLine(header), ...lines]);
}
