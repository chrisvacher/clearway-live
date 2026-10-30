/* @ds-bundle: {"format":4,"namespace":"ClearwayLive","components":[]} */
/* Clearway Live helpers: stage, textures, FLIP motion, the arrival flow,
   word sizing, counts and the preview scaffold. Vanilla JS, no libraries.
   Every color is read from --cwl-* tokens. No raw hex values. */
(function () {
  "use strict";
  var MARK_PATH = "M48.49 0.00 46.02 0.13 43.47 0.40 38.96 1.20 34.71 2.36 32.18 3.24 29.60 4.31 25.38 6.44 23.27 7.71 21.11 9.16 19.09 10.67 17.31 12.13 15.24 14.02 13.58 15.71 11.87 17.62 10.36 19.49 7.71 23.27 5.62 26.89 4.31 29.60 3.24 32.18 1.82 36.49 1.20 38.96 0.73 41.29 0.33 44.00 0.11 46.31 0.00 48.49 0.00 51.49 0.13 53.96 0.40 56.51 1.20 61.02 2.36 65.27 3.24 67.80 4.31 70.38 6.44 74.60 7.71 76.71 9.16 78.87 10.67 80.89 12.13 82.67 14.02 84.73 15.71 86.40 17.62 88.11 19.49 89.62 23.27 92.27 26.89 94.36 29.60 95.67 32.18 96.73 36.49 98.16 38.96 98.78 41.29 99.24 44.00 99.64 46.31 99.87 48.49 99.98 51.49 99.98 53.96 99.84 56.51 99.58 61.02 98.78 65.27 97.62 67.80 96.73 70.38 95.67 74.60 93.53 76.71 92.27 78.87 90.82 80.89 89.31 82.67 87.84 84.73 85.96 86.40 84.27 88.11 82.36 89.62 80.49 92.27 76.71 94.38 73.04 95.67 70.38 96.73 67.80 98.16 63.49 98.78 61.02 99.24 58.69 99.64 55.98 99.87 53.67 99.98 51.49 99.98 48.49 99.84 46.02 99.58 43.47 98.78 38.96 97.62 34.71 96.73 32.18 95.67 29.60 93.53 25.38 92.27 23.27 90.82 21.11 89.31 19.09 87.84 17.31 85.96 15.24 84.27 13.58 82.36 11.87 80.49 10.36 76.71 7.71 73.09 5.62 70.38 4.31 67.80 3.24 63.49 1.82 61.02 1.20 58.69 0.73 55.98 0.33 53.67 0.11 51.49 0.00ZM89.58 55.67 89.31 57.36 88.71 60.04 88.16 61.98 87.40 64.16 86.58 66.16 85.58 68.24 84.36 70.44 83.29 72.13 81.71 74.33 80.49 75.84 78.87 77.64 77.22 79.27 75.29 80.96 73.69 82.20 71.67 83.60 70.00 84.62 68.56 85.42 65.87 86.71 64.00 87.47 61.64 88.27 59.09 88.96 57.40 89.31 55.16 89.67 52.67 89.91 50.04 90.00 48.11 89.96 45.78 89.78 43.76 89.51 41.51 89.09 39.36 88.56 36.87 87.78 35.11 87.09 37.40 84.22 40.33 80.91 43.31 77.89 46.09 75.33 48.98 72.91 52.13 70.51 55.47 68.22 59.31 65.87 62.36 64.20 65.89 62.47 69.38 60.96 73.40 59.44 77.31 58.20 81.56 57.09 85.64 56.24ZM39.91 67.42 40.64 63.16 41.20 58.51 41.49 54.47 41.60 50.18 41.51 45.96 41.20 41.44 40.73 37.42 39.93 32.51 43.38 35.36 47.04 38.09 50.64 40.51 54.27 42.71 58.44 44.98 62.13 46.76 65.87 48.36 70.18 49.98 65.40 51.78 61.91 53.29 58.29 55.04 54.24 57.24 50.56 59.49 47.09 61.82 43.33 64.62ZM25.29 18.58 26.71 22.18 28.04 26.18 29.36 31.00 30.11 34.49 30.69 37.84 31.22 42.16 31.51 46.18 31.60 50.18 31.47 54.62 31.16 58.44 30.62 62.53 29.87 66.67 28.91 70.71 27.89 74.27 26.60 78.07 25.27 81.40 23.93 80.31 22.07 78.60 20.33 76.80 18.60 74.76 17.33 73.07 15.93 70.96 14.82 69.04 13.71 66.84 12.20 63.13 11.38 60.49 10.82 58.18 10.40 55.80 10.11 53.27 10.00 51.31 10.00 48.67 10.11 46.71 10.40 44.18 10.82 41.80 11.29 39.82 11.84 37.91 12.67 35.58 13.47 33.67 14.44 31.64 16.36 28.36 17.62 26.51 19.07 24.64 20.56 22.93 22.07 21.38 23.93 19.67ZM35.13 12.87 36.87 12.20 39.36 11.42 41.51 10.89 43.62 10.49 45.78 10.20 48.11 10.02 52.67 10.07 55.16 10.31 57.40 10.67 59.09 11.02 61.64 11.71 63.82 12.44 65.87 13.27 68.56 14.56 70.00 15.36 71.67 16.38 73.60 17.71 75.29 19.02 77.22 20.71 78.87 22.33 80.62 24.29 83.20 27.71 84.42 29.64 85.58 31.73 87.29 35.53 88.18 38.07 88.71 39.93 89.11 41.62 89.58 44.27 85.98 43.76 81.71 42.89 77.13 41.69 73.31 40.47 69.47 39.02 65.82 37.44 62.47 35.80 59.33 34.09 55.62 31.82 52.33 29.58 49.36 27.33 45.82 24.38 43.07 21.82 40.13 18.82 37.56 15.91Z";
  var root = document.documentElement;

  function v(name, el) { return getComputedStyle(el || root).getPropertyValue("--" + name).trim(); }
  function ms(name) { var s = v(name); if (!s) return 0; return /ms$/.test(s) ? parseFloat(s) : parseFloat(s) * 1000; }
  function reduced(el) {
    var n = el && el.closest ? el.closest("[data-motion]") : null;
    var a = n ? n.getAttribute("data-motion") : root.getAttribute("data-motion");
    if (a === "reduced") return true;
    if (a === "full") return false;
    return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- The Clearway mark (traced from the base logo-mark artwork, 99.7% match) ---------- */
  function markSVG(kind, attrs) {
    attrs = attrs || "";
    var body = kind === "outline"
      ? '<path d="' + MARK_PATH + '" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>'
      : '<path d="' + MARK_PATH + '" fill="currentColor" fill-rule="evenodd"/>';
    return '<svg viewBox="-1 -1 102 102" aria-hidden="true" ' + attrs + ">" + body + "</svg>";
  }
  function markMaskURI(kind, strokeW) {
    var p = kind === "outline"
      ? '<path d="' + MARK_PATH + '" fill="none" stroke="black" stroke-width="' + (strokeW || 1.6) + '" stroke-linejoin="round"/>'
      : '<path d="' + MARK_PATH + '" fill="black" fill-rule="evenodd"/>';
    return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 102 102">' + p + "</svg>") + '")';
  }
  function tileMaskURI(kind) {
    /* offset pattern: large marks (260px on a 640px tile, about a quarter of the screen height),
       the second mark dropped half a tile so rows stagger and marks crop at the screen edges.
       Uniform scale only. "mixed" pairs a solid mark with an outline mark in each tile. */
    var solid = ' fill="black" fill-rule="evenodd"';
    var line = ' fill="none" stroke="black" stroke-width="1.1" stroke-linejoin="round"';
    var a = kind === "outline" ? line : kind === "mixed" ? solid + ' fill-opacity="0.45"' : solid;
    var b = kind === "solid" ? solid : line;
    var m = function (x, y, ink) { return '<path transform="translate(' + x + " " + y + ') scale(2.6)" d="' + MARK_PATH + '"' + ink + "/>"; };
    return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">' + m(30, 30, a) + m(350, 350, b) + "</svg>") + '")';
  }

  /* texture(el, {option: "none"|"pattern"|"strip"|"oversized", kind: "solid"|"outline", glow: bool, live: bool}) */
  function texture(el, o) {
    o = o || {};
    var old = el.querySelectorAll(":scope > .cwl-texture");
    for (var i = 0; i < old.length; i++) old[i].remove();
    if (el._cwlLimeWatch) { el._cwlLimeWatch.disconnect(); el._cwlLimeWatch = null; }
    var layer = h("div", "cwl-texture");
    if (o.glow) layer.appendChild(h("div", "cwl-texture-glow"));
    if (o.option === "pattern") {
      var p = h("div", "cwl-texture-pattern is-" + (o.kind || "outline"));
      p.style.webkitMaskImage = p.style.maskImage = tileMaskURI(o.kind);
      layer.appendChild(p);
    } else if (o.option === "oversized") {
      var big = h("div", "cwl-texture-oversized is-" + (o.kind || "outline"));
      big.style.webkitMaskImage = big.style.maskImage = markMaskURI(o.kind, 0.5);
      layer.appendChild(big);
    } else if (o.option === "strip") {
      var strip = h("div", "cwl-texture-strip is-" + (o.kind || "outline"));
      for (var k = 0; k < 20; k++) {
        var cell = h("span", "cwl-strip-mark" + (k === 0 && o.live ? " is-live" : ""), markSVG(o.kind));
        strip.appendChild(cell);
      }
      layer.appendChild(strip);
      if (o.live && window.MutationObserver) {
        /* Lime handoff: the strip's Lime mark is the LIVE marker. While a newest-arrival
           Lime moment is on screen it eases back to the strip ink, so there is one Lime moment. */
        var liveMark = strip.firstChild;
        var check = function () { liveMark.classList.toggle("is-live", !el.querySelector(".cwl-card.is-newest, .cwl-word.is-new")); };
        var mo = new MutationObserver(check); mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
        el._cwlLimeWatch = mo; setTimeout(check, 0);
      }
    }
    el.insertBefore(layer, el.firstChild);
    if (o.fade && !reduced(el)) layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("cwl-dur-phones-dim"), easing: v("cwl-ease-signature") });
    return layer;
  }

  /* ---------- TV stage (1920x1080, scaled uniformly to its box) and phone frame ---------- */
  function fit(box, inner, w, hgt) {
    function go() { var s = box.clientWidth / w; inner.style.transform = "scale(" + s + ")"; box.style.height = (hgt * s) + "px"; }
    go(); if (window.ResizeObserver) new ResizeObserver(go).observe(box);
  }
  function stage(box, theme) {
    box.classList.add("cwl-stage-box");
    var tv = h("div", "cwl-tv"); tv.setAttribute("data-surface", "tv"); tv.setAttribute("data-theme", theme || "dark");
    box.appendChild(tv); fit(box, tv, 1920, 1080); return tv;
  }
  function phone(box, theme) {
    box.classList.add("cwl-phone-box");
    var ph = h("div", "cwl-phone"); ph.setAttribute("data-surface", "phone"); ph.setAttribute("data-theme", theme || "dark");
    box.appendChild(ph); fit(box, ph, 360, 740); return ph;
  }

  /* ---------- FLIP: animate every child from where it was to where it is ---------- */
  function flip(container, mutate, o) {
    o = o || {};
    var kids = Array.prototype.slice.call(container.querySelectorAll(o.selector || ":scope > *"));
    var before = new Map();
    kids.forEach(function (k) { before.set(k, k.getBoundingClientRect()); });
    mutate();
    var scale = container.getBoundingClientRect().width / (container.offsetWidth || 1) || 1;
    var after = Array.prototype.slice.call(container.querySelectorAll(o.selector || ":scope > *"));
    var red = reduced(container);
    var dur = red ? 0 : (o.duration || ms("cwl-dur-make-room"));
    var ease = o.easing || v("cwl-ease-signature");
    var arrivals = [];
    after.forEach(function (k, i) {
      var b = before.get(k);
      if (!b) { arrivals.push(k); return; }
      var a = k.getBoundingClientRect();
      var dx = (b.left - a.left) / scale, dy = (b.top - a.top) / scale;
      if (!dx && !dy) return;
      if (red) return;
      var delay = o.stagger ? Math.min(i, 12) * o.stagger : 0;
      k.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], { duration: dur, easing: ease, delay: delay, fill: "backwards" });
    });
    arrivals.forEach(function (k) { arrive(k); });
  }
  function arrive(el) {
    if (reduced(el)) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("cwl-dur-reduced") }); return; }
    el.animate([{ opacity: 0, transform: "translateY(12px) scale(0.92)" }, { opacity: 1, transform: "none" }],
      { duration: ms("cwl-dur-arrive"), easing: v("cwl-ease-arrive"), fill: "backwards" });
  }
  function leave(el, done) {
    var d = reduced(el) ? ms("cwl-dur-reduced") : ms("cwl-dur-hide");
    var a = el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.96)" }], { duration: d, easing: v("cwl-ease-exit"), fill: "forwards" });
    a.onfinish = function () { if (done) done(); };
  }

  /* ---------- The arrival flow: steady stagger, never hold an answer past 1.5s ---------- */
  function ArrivalFlow(release) {
    this.q = []; this.release = release; this.last = 0; this.maxHold = 0; this.count = 0; var self = this;
    function tick(now) {
      if (self.q.length) {
        var stagger = ms("cwl-delay-stagger"), minS = ms("cwl-delay-stagger-min"), maxH = ms("cwl-delay-max-hold");
        var oldest = self.q[0], waited = now - oldest.t;
        /* plan to clear the queue by 80% of the limit, leaving headroom for slow frames */
        var budget = Math.max(0, maxH * 0.8 - waited);
        var interval = Math.max(minS, Math.min(stagger, budget / self.q.length));
        var go = now - self.last >= interval ? 1 : 0;
        while (self.q.length && (go-- > 0 || now - self.q[0].t >= maxH - 50)) {
          var it = self.q.shift(); self.last = now; self.count++;
          self.maxHold = Math.max(self.maxHold, now - it.t);
          self.release(it.item, now - it.t);
        }
      }
      self.raf = requestAnimationFrame(tick);
    }
    this.raf = requestAnimationFrame(tick);
  }
  ArrivalFlow.prototype.push = function (item) { this.q.push({ item: item, t: performance.now() }); };
  ArrivalFlow.prototype.stop = function () { cancelAnimationFrame(this.raf); };

  /* ---------- Word sizing: square root of the count, TV minimum to headline size ---------- */
  function wordSize(count, maxCount, minPx, maxPx) {
    if (maxCount <= 1) return minPx;
    return minPx + (maxPx - minPx) * (Math.sqrt(count) - 1) / (Math.sqrt(maxCount) - 1);
  }

  /* ---------- Counts tick, never jump ---------- */
  function countTo(el, to, fmt) {
    var from = parseFloat(el.getAttribute("data-n") || "0"); el.setAttribute("data-n", to);
    fmt = fmt || function (n) { return Math.round(n); };
    if (reduced(el) || from === to) { el.textContent = fmt(to); return; }
    var d = ms("cwl-dur-count"), t0 = performance.now();
    (function step(t) { var k = Math.min(1, (t - t0) / d); var e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); })(t0);
  }


  /* ---------- Crowded TV: step type down to the floor, then take turns ---------- */
  function fitWall(wall, maxH) {
    var steps = ["", "is-body", "is-compact"];
    var cards = Array.prototype.slice.call(wall.querySelectorAll(".cwl-card"));
    cards.forEach(function (c) { c.style.transition = "none"; });
    requestAnimationFrame(function () { cards.forEach(function (c) { c.style.transition = ""; }); });
    for (var i = 0; i < steps.length; i++) {
      cards.forEach(function (c) { c.classList.remove("is-body", "is-compact"); if (steps[i]) c.classList.add(steps[i]); });
      if (wall.scrollHeight <= maxH) return 0;
    }
    var hidden = 0, more = h("div", "cwl-tv-quiet"); wall.appendChild(more);
    while (wall.scrollHeight > maxH && cards.length > 1) { cards.shift().remove(); hidden++; more.textContent = "+ " + hidden + " more, taking turns"; }
    if (!hidden) more.remove();
    return hidden;
  }

  /* ---------- Shared renderers (TV) ---------- */
  function bars(host, items, o) {
    /* items: [{id,label,value,display}] ; o: {cut: n, max} */
    o = o || {};
    var list = host.querySelector(".cwl-bars");
    if (!list) { list = h("div", "cwl-bars"); host.appendChild(list); list.appendChild(h("div", "cwl-cut-line", '<span class="cwl-cut-label"></span>')); }
    var sorted = items.slice().sort(function (a, b) { return b.value - a.value; });
    var max = o.max || Math.max.apply(null, sorted.map(function (i) { return i.value; }).concat([1]));
    var lead = sorted.length && sorted[0].value > 0 ? sorted[0].value : null;
    flip(list, function () {
      sorted.forEach(function (it) {
        var row = list.querySelector('[data-id="' + it.id + '"]');
        if (!row) {
          row = h("div", "cwl-bar-row"); row.setAttribute("data-id", it.id);
          row.innerHTML = '<div class="cwl-bar-label"></div><div class="cwl-bar-track"><div class="cwl-bar-fill"><span class="cwl-bar-value"></span></div></div>';
          list.appendChild(row);
        }
        row.querySelector(".cwl-bar-label").textContent = it.label;
        row.querySelector(".cwl-bar-value").textContent = it.display != null ? it.display : it.value;
        row.querySelector(".cwl-bar-fill").style.width = Math.max(0, it.value / max * 100) + "%";
        row.classList.toggle("is-leader", lead !== null && it.value === lead);
        list.appendChild(row);
      });
      var cut = list.querySelector(".cwl-cut-line");
      list.appendChild(cut);
      if (o.cut && o.cut < sorted.length) {
        cut.style.display = "";
        cut.querySelector(".cwl-cut-label").textContent = o.cutLabel || ("Top " + o.cut);
        var rows = list.querySelectorAll(".cwl-bar-row");
        var r = rows[o.cut - 1];
        cut.style.top = (r.offsetTop + r.offsetHeight + 12) + "px";
      } else cut.style.display = "none";
    }, { selector: ".cwl-bar-row", duration: ms("cwl-dur-bar-trade") });
    return list;
  }

  function wordCloud(host, words, o) {
    /* words: [{text,count,isNew}] */
    o = o || {};
    var anchors = host.querySelector(".cwl-cloud-anchors"), stream = host.querySelector(".cwl-cloud-stream");
    if (!anchors) { anchors = h("div", "cwl-cloud-anchors"); stream = h("div", "cwl-cloud-stream"); host.appendChild(anchors); host.appendChild(stream); }
    var reps = words.filter(function (w) { return w.count > 1; }).sort(function (a, b) { return b.count - a.count; });
    var singles = words.filter(function (w) { return w.count === 1; });
    var max = reps.length ? reps[0].count : 1;
    var minPx = parseFloat(v("cwl-fs-tv-main")) || 56, maxPx = o.maxPx || 180;
    var lead = reps.length ? reps[0].count : null;
    var ordered = [];
    reps.forEach(function (w, i) { if (i % 2) ordered.push(w); else ordered.unshift(w); });
    flip(anchors, function () {
      ordered.forEach(function (w) {
        var el = anchors.querySelector('[data-w="' + w.text + '"]') || stream.querySelector('[data-w="' + w.text + '"]');
        if (!el) { el = h("span", "cwl-word"); el.setAttribute("data-w", w.text); el.textContent = w.text; }
        el.style.fontSize = wordSize(w.count, max, minPx, maxPx) + "px";
        el.className = "cwl-word " + (w.count === lead ? "is-leader" : "is-repeated") + (w.isNew && w.count !== lead ? " is-new" : "");
        anchors.appendChild(el);
      });
    }, { selector: ".cwl-word" });
    singles.forEach(function (w) {
      var el = stream.querySelector('[data-w="' + w.text + '"]');
      if (!el) { el = h("span", "cwl-word is-single"); el.setAttribute("data-w", w.text); el.textContent = w.text; stream.appendChild(el); arrive(el); }
      el.classList.toggle("is-new", !!w.isNew);
    });
    Array.prototype.slice.call(stream.children).forEach(function (el) {
      if (!singles.some(function (w) { return w.text === el.getAttribute("data-w"); })) el.remove();
    });
    /* the oldest single mentions slide off when the row is full */
    while (stream.children.length > 1 && stream.scrollWidth > stream.clientWidth + 1) stream.removeChild(stream.firstChild);
    if (o.newHold !== false) {
      setTimeout(function () {
        host.querySelectorAll(".cwl-word.is-new").forEach(function (e) { e.classList.remove("is-new"); });
      }, ms("cwl-dur-new-hold"));
    }
  }

  /* ---------- Preview scaffold ---------- */
  var STATES = ["Empty", "First item", "Typical", "Crowded", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"];
  function card(o) {
    var rootEl = document.getElementById(o.root || "root");
    rootEl.className = "cwl-doc";
    rootEl.innerHTML = '<div class="cwl-doc-head"><div><div class="cwl-doc-eyebrow"></div><div class="cwl-doc-title"></div></div></div>' +
      '<div class="cwl-tabs" role="tablist"></div><div class="cwl-pair"></div><div class="cwl-doc-note" aria-live="polite"></div>';
    rootEl.querySelector(".cwl-doc-eyebrow").textContent = o.eyebrow || "";
    rootEl.querySelector(".cwl-doc-title").textContent = o.title || "";
    var pair = rootEl.querySelector(".cwl-pair");
    var tvBox, phBox, tv, ph;
    if (o.tv !== false) { tvBox = h("div", "cwl-pair-tv"); tvBox.appendChild(h("div", "cwl-frame-label", "TV")); var b1 = h("div"); tvBox.appendChild(b1); pair.appendChild(tvBox); tv = stage(b1, o.theme); }
    if (o.phone !== false) { phBox = h("div", "cwl-pair-phone"); phBox.appendChild(h("div", "cwl-frame-label", "Phone")); var b2 = h("div"); phBox.appendChild(b2); pair.appendChild(phBox); ph = phone(b2, o.phoneTheme || o.theme); }
    if (o.tv === false) pair.classList.add("is-phone-only");
    if (o.phone === false) pair.classList.add("is-tv-only");
    var tabs = rootEl.querySelector(".cwl-tabs"), note = rootEl.querySelector(".cwl-doc-note");
    var states = o.states || STATES;
    function select(i) {
      tabs.querySelectorAll("button").forEach(function (b, j) { b.setAttribute("aria-selected", i === j ? "true" : "false"); });
      var s = states[i];
      clearTimers();
      [tv, ph].forEach(function (el) { if (el) el.setAttribute("data-motion", s === "Reduced motion" ? "reduced" : "full"); });
      var txt = o.render(s, tv, ph) || "";
      note.textContent = txt;
      icons();
    }
    states.forEach(function (s, i) { var b = h("button", "cwl-tab"); b.type = "button"; b.setAttribute("role", "tab"); b.textContent = s; b.onclick = function () { select(i); }; tabs.appendChild(b); });
    if (states.length < 2) tabs.style.display = "none";
    select(o.start || 0);
    return { tv: tv, phone: ph, select: select };
  }
  function lucide(name, cls) { return '<i data-lucide="' + name + '" class="cwl-icon ' + (cls || "") + '"></i>'; }
  var LUCIDE = "https://cdn.jsdelivr.net/npm/lucide@0.441.0/dist/umd/lucide.min.js";
  var QR = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
  function load(src, ready, cb) {
    if (ready()) { cb(); return; }
    var s = document.querySelector('script[data-src="' + src + '"]');
    if (!s) { s = document.createElement("script"); s.src = src; s.setAttribute("data-src", src); document.head.appendChild(s); }
    s.addEventListener("load", function () { if (ready()) cb(); });
  }
  function icons() { load(LUCIDE, function () { return !!window.lucide; }, function () { window.lucide.createIcons(); }); }
  function qr(el, text) {
    load(QR, function () { return !!window.qrcode; }, function () {
      var q = window.qrcode(0, "M"); q.addData(text); q.make();
      el.innerHTML = q.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
    });
  }
  /* Texture by screen type, applied automatically. Outline mark throughout.
     holding: join, welcome, breaks, Nothing live (G1) · opener: day, lens or part title cards (E1)
     input: word cloud, wall, bars, grids, tally (B1; its Lime mark is the LIVE marker)
     content: headline with depth, Scripture, prayer (D) · phone-waiting: waiting and phones down (A1)
     phone-answering: answering, plain Navy */
  var TEXTURE_BY_SCREEN = {
    "holding": { option: "oversized", kind: "outline", glow: true, code: "G1" },
    "opener": { option: "pattern", kind: "outline", glow: true, code: "E1" },
    "input": { option: "strip", kind: "outline", live: true, code: "B1" },
    "content": { option: "none", glow: true, code: "D" },
    "phone-waiting": { option: "pattern", kind: "outline", code: "A1" },
    "phone-answering": { option: "none", code: "none" }
  };
  function screenTexture(el, type, extra) {
    type = type || (el.getAttribute("data-surface") === "phone" ? "phone-answering" : "input");
    var o = {}, base = TEXTURE_BY_SCREEN[type] || {};
    for (var k in base) o[k] = base[k];
    if (extra) for (var j in extra) o[j] = extra[j];
    el.setAttribute("data-screen", type);
    return texture(el, o);
  }
  var timers = [];
  function every(fn, msec) { var id = setInterval(fn, msec); timers.push(id); return id; }
  function later(fn, msec) { var id = setTimeout(fn, msec); timers.push(id); return id; }
  function clearTimers() { timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers = []; }

  window.ClearwayLive = {
    MARK_PATH: MARK_PATH, v: v, ms: ms, reduced: reduced, h: h, esc: esc,
    markSVG: markSVG, markMaskURI: markMaskURI, texture: texture,
    stage: stage, phone: phone, flip: flip, arrive: arrive, leave: leave,
    ArrivalFlow: ArrivalFlow, wordSize: wordSize, countTo: countTo,
    bars: bars, wordCloud: wordCloud, fitWall: fitWall, card: card, STATES: STATES, lucide: lucide, icons: icons,
    qr: qr, load: load, TEXTURE_BY_SCREEN: TEXTURE_BY_SCREEN, screenTexture: screenTexture, every: every, later: later, clearTimers: clearTimers
  };
})();
