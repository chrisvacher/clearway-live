// How many items of a stacked list fit whole in the space a TV view leaves them, counted from one
// end: the newest end for Outcome bullets, the top for the lens summary's suggestion cards. The
// rest are counted on a "+ N on phones" line instead, so a list never runs under that line or off
// the bottom of the screen. A list can ask for at least one item (Outcome bullets: the newest always
// shows, even when it is taller than the space); a side list (suggestion cards) can show none.
export function fitCount(heights: number[], gap: number, space: number, from: "start" | "end" = "start", least = 1): number {
  const list = from === "end" ? [...heights].reverse() : heights;
  let used = 0, n = 0;
  for (const h of list) {
    const next = used + (n ? gap : 0) + h;
    if (next > space + 0.5) break;
    used = next; n++;
  }
  return Math.min(heights.length, Math.max(least, n));
}

// Whole lines of text that fit in a height, up to a most.
export function fitLines(space: number, lineHeight: number, most: number): number {
  if (!(lineHeight > 0) || !(space > 0)) return 0;
  return Math.max(0, Math.min(most, Math.floor((space + 0.5) / lineHeight)));
}
