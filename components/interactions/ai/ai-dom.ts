// The AI icon for the TV's DOM-built views (the word cloud, the wall, Q&A rows), the same
// two forms as ai-icon.tsx. Built with DOM calls; no text is ever read as markup.
//  * aiIconEl: the plain icon in currentColor (the summary's header band).
//  * aiMarkEl: the gradient icon, "gradient ink with a sweep" (Chris, November 3). An element whose
//    background is the AI gradient and whose shape is a mask of the icon (ai.css), so the sweep is
//    a background-position animation. No badge tile anywhere.
import { aiIconPath } from "./ai-path";

const ns = "http://www.w3.org/2000/svg";
export function aiIconEl() {
  const el = document.createElementNS(ns, "svg"), path = document.createElementNS(ns, "path");
  el.setAttribute("viewBox", "0 0 24 24"); el.setAttribute("aria-hidden", "true"); el.setAttribute("focusable", "false"); el.setAttribute("class", "cwl-ai-icon");
  path.setAttribute("fill", "currentColor"); path.setAttribute("fill-rule", "evenodd"); path.setAttribute("d", aiIconPath);
  el.appendChild(path);
  return el;
}
export function aiMarkEl(label = "AI") {
  const mark = document.createElement("span"); mark.className = "cwl-ai-mark"; mark.setAttribute("role", "img"); mark.setAttribute("aria-label", label);
  return mark;
}
// "AI icon + words": what AI did, beside the icon (the foot line, a Q&A row).
export function aiLineEl(words: string, className = "ai-line") {
  const line = document.createElement("span"); line.className = className;
  line.append(aiMarkEl(), document.createTextNode(` ${words}`));
  return line;
}

// The sweep: when AI acts (a regroup, a combine, a fold, a draft), a light passes through the icon
// once, background-position 0% to 100% over cwl-dur-ai-sweep on cwl-ease-calm. It ends where it
// started, so the icon rests on its plain gradient. It never loops, a running sweep is never
// restarted, and reduced motion (the TV's own setting, or the system setting) has none.
// The reduced motion rule is lib/tv/board.ts's reducedMotion, kept here so the two files never import each other.
function reduced(el: Element) {
  const setting = el.closest("[data-motion]")?.getAttribute("data-motion");
  if (setting === "reduced") return true;
  if (setting === "full") return false;
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
const sweeping = new WeakSet<Element>();
export function sweepAi(target: Element | null | undefined) {
  const marks = !target ? [] : target.classList.contains("cwl-ai-mark") ? [target] : [...target.querySelectorAll(".cwl-ai-mark")];
  for (const mark of marks) {
    if (!(mark instanceof HTMLElement) || !mark.isConnected || typeof mark.animate !== "function" || reduced(mark) || sweeping.has(mark)) continue;
    const style = getComputedStyle(mark), value = style.getPropertyValue("--cwl-dur-ai-sweep").trim();
    const duration = value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;
    if (!(duration > 0)) continue;
    sweeping.add(mark);
    const run = mark.animate([{ backgroundPosition: "0% 50%" }, { backgroundPosition: "100% 50%" }],
      { duration, easing: style.getPropertyValue("--cwl-ease-calm").trim() || "ease-in-out" });
    const done = () => sweeping.delete(mark);
    run.onfinish = done; run.oncancel = done;
    mark.dataset.aiSweep = String(Number(mark.dataset.aiSweep ?? 0) + 1);
  }
}

// What counts as one AI change, shared by the TV boards and the React hook: each thing AI has done
// is named by a key (a group and an answer it holds, an absorbed word, a folded question). The first
// set seen is where a view starts, so a screen opening on AI's earlier work never sweeps. After that,
// a key never seen before is AI acting; a key coming back (Undo then Redo, AI off then on with the
// same groups) or going away (Undo) is not, and neither is an ordinary re-render.
export class AiChanges {
  private seen: Set<string> | null = null;
  // Returns the keys in this set that AI has not shown here before (none the first time).
  next(keys: Iterable<string>): string[] {
    const list = [...keys];
    if (!this.seen) { this.seen = new Set(list); return []; }
    const fresh = list.filter(key => !this.seen!.has(key));
    for (const key of fresh) this.seen.add(key);
    return fresh;
  }
}
