// The AI icon for the TV's DOM-built views (the word cloud, the wall, Q&A rows), the same
// three forms as ai-icon.tsx. Built with DOM calls; no text is ever read as markup.
import { aiIconPath } from "./ai-path";

const ns = "http://www.w3.org/2000/svg";
let glyphs = 0;
function svg(fill: string) {
  const el = document.createElementNS(ns, "svg"), path = document.createElementNS(ns, "path");
  el.setAttribute("viewBox", "0 0 24 24"); el.setAttribute("aria-hidden", "true"); el.setAttribute("focusable", "false");
  path.setAttribute("fill", fill); path.setAttribute("fill-rule", "evenodd"); path.setAttribute("d", aiIconPath);
  el.appendChild(path);
  return el;
}
export function aiIconEl() { const el = svg("currentColor"); el.setAttribute("class", "cwl-ai-icon"); return el; }
export function aiBadgeEl() {
  const badge = document.createElement("span"); badge.className = "cwl-ai-badge"; badge.setAttribute("role", "img"); badge.setAttribute("aria-label", "AI");
  badge.appendChild(aiIconEl());
  return badge;
}
export function aiGlyphEl() {
  const id = `cwl-ai-d${++glyphs}`, wrap = document.createElement("span"), el = svg(`url(#${id})`);
  wrap.className = "cwl-ai-glyph"; wrap.setAttribute("role", "img"); wrap.setAttribute("aria-label", "AI");
  const defs = document.createElementNS(ns, "defs"), grad = document.createElementNS(ns, "linearGradient");
  grad.setAttribute("id", id); grad.setAttribute("gradientUnits", "userSpaceOnUse");
  for (const [k, v] of [["x1", "3"], ["y1", "2"], ["x2", "21"], ["y2", "22"]]) grad.setAttribute(k, v);
  for (const [offset, cls] of [["0", "cwl-ai-stop-start"], ["1", "cwl-ai-stop-end"]]) {
    const stop = document.createElementNS(ns, "stop"); stop.setAttribute("offset", offset); stop.setAttribute("class", cls); grad.appendChild(stop);
  }
  defs.appendChild(grad); el.insertBefore(defs, el.firstChild); wrap.appendChild(el);
  return wrap;
}
// "AI badge + words": what AI did, beside the badge (the foot line, a Q&A row).
export function aiLineEl(words: string, className = "ai-line") {
  const line = document.createElement("span"); line.className = className;
  line.append(aiBadgeEl(), document.createTextNode(` ${words}`));
  return line;
}
