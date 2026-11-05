// The frame watcher shared by the live-screen acceptance kits (milestones 3 and 4), as plain script text so no
// bundler helper reaches the page.
// The frame watcher, as plain script text so no bundler helper reaches the page. On every
// frame it records, for each item the current kind draws (window.__acc.sel), how far the item
// moved since the last frame, and whether the session scene had a visible layer at all.
// Items are told apart by element, not by key, so a word moving from the chips to the field
// is two items, never one long jump. Only items shown on both frames are compared.
export const watcher = `(() => {
  const w = window; if (w.__acc) return;
  const a = w.__acc = { sel: "", frames: 0, blank: 0, dim: 0, worst: 0, worstKey: "", worstDt: 0, steps: 0, jumps: [], stop: false };
  const ids = new WeakMap(); let n = 0, last = new Map(), then = performance.now();
  const id = el => { if (!ids.has(el)) ids.set(el, ++n); return ids.get(el); };
  const read = now => {
    if (a.stop) return; const dt = now - then; then = now; a.frames++;
    const scene = document.querySelector(".tv-scene.tv-session.is-active");
    if (scene) {
      const layers = [...scene.querySelectorAll(".tv-layer")];
      // Blank: the session scene has no layer and no other scene is still fading out over it.
      const others = [...document.querySelectorAll(".tv-scene:not(.tv-session), .tv-check")].some(el => +getComputedStyle(el).opacity > 0.5);
      if (!layers.length && !others) a.blank++;
      // A cross-fade shows two layers at once: what the room sees is their combined cover.
      else if (1 - layers.reduce((x, l) => x * (1 - +getComputedStyle(l).opacity), 1) < 0.5 && !document.querySelector(".tv-check.is-active")) a.dim++;
    }
    const next = new Map();
    if (a.sel) for (const el of document.querySelectorAll(a.sel)) {
      if (el.closest(".tv-layer.is-leaving") || el.classList.contains("is-going") || !el.offsetWidth) continue;
      if (+getComputedStyle(el).opacity < 0.5) continue;
      const r = el.getBoundingClientRect(), c = [r.left + r.width / 2, r.top + r.height / 2], k = id(el), p = last.get(k);
      if (p) { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); a.steps++; if (d > a.worst) { a.worst = d; a.worstKey = (el.className + " " + (el.dataset.key || el.textContent || "")).slice(0, 80); a.worstDt = dt; } if (d >= 150) a.jumps.push([(el.className + " " + (el.dataset.key || el.textContent || "")).slice(0, 80), Math.round(d), Math.round(dt), Math.round(p[0]), Math.round(c[0]), Math.round(p[1]), Math.round(c[1])]); }
      next.set(k, c);
    }
    last = next; requestAnimationFrame(read);
  };
  requestAnimationFrame(read);
})()`;
export type Watch = { frames: number; blank: number; dim: number; worst: number; worstKey: string; worstDt: number; steps: number; jumps: (string | number)[][] };


// Holds the TV's main thread for `ms` every time a new session layer is added to the page, the way a slow frame would
// (a big image decoding, a busy CI machine). A cross-fade must keep a screen in view even then.
export const stallOnNewLayer = (ms: number) => `(() => {
  const w = window; if (w.__stall) return; w.__stall = 1;
  const stall = () => { const end = performance.now() + ${ms}; while (performance.now() < end) { /* hold the frame */ } };
  new MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && n.classList.contains("tv-layer") && !n.classList.contains("is-leaving")))) stall(); })
    .observe(document.body, { childList: true, subtree: true });
})()`;
