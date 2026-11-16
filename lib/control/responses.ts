import type { ControlItem } from "./types";
// The Responses list (MD-1): how many are shown and hidden, and which rows a filter keeps.
export function responsesView(items: ControlItem[], filter: "all" | "hidden") {
  const hidden = items.filter(i => i.hidden);
  return { shown: items.length - hidden.length, hidden: hidden.length, list: filter === "hidden" ? hidden : items };
}
