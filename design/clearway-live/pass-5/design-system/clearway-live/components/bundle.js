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
      /* The first mark carries the word LIVE beside it (tv-floor, cwl-text), so the meaning
         never rests on color alone. Mark and word share one state. */
      var liveGroup = h("span", "cwl-strip-live" + (o.live ? " is-live" : ""));
      liveGroup.appendChild(h("span", "cwl-strip-mark", markSVG(o.kind)));
      liveGroup.appendChild(h("span", "cwl-strip-label", "Live"));
      liveGroup.setAttribute("role", "status");
      strip.appendChild(liveGroup);
      for (var k = 1; k < 18; k++) strip.appendChild(h("span", "cwl-strip-mark", markSVG(o.kind)));
      layer.appendChild(strip);
      if (o.live && window.MutationObserver) {
        /* Lime handoff: the strip's Lime mark and its LIVE word are the LIVE marker. While a
           newest-arrival Lime moment is on screen they step back, so there is one Lime moment. */
        var liveMark = liveGroup;
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


  /* ---------- LIVE mark, church lockup, foot ---------- */
  /* The LIVE marker is the Clearway mark: liveMark() Lime, liveMark("handed") Off-White while another Lime moment holds the screen,
     liveMark("offline") gray and breathing while it reconnects. */
  function liveMark(state, fixed) {
    var off = state === "offline";
    return '<span class="cwl-live-marker' + (state === "handed" ? " is-handed-off" : "") + (off ? " is-offline is-reconnecting" : "") + '"' + (fixed ? " data-fixed" : "") + ' role="img" aria-label="' + (off ? "Reconnecting" : "Live") + '">' + markSVG("solid") + "</span>";
  }
  /* The quiet Sky mark that sits beside a not-live word: Phones down, Closed. */
  function quietMark() { return '<span class="cwl-state-mark" aria-hidden="true">' + markSVG("solid") + "</span>"; }
  /* The church's logo tile, top left of the TV. A monogram placeholder until the church's own logo is read from Team Hub. */
  function churchLockup(name, short) {
    name = name || ""; short = short || name.split(" ")[0];
    return '<span class="cwl-church-logo" role="img" aria-label="' + esc(name) + ' logo"><span class="mono" aria-hidden="true">' + esc(short.charAt(0)) + "</span>" + esc(short) + "</span>";
  }
  /* The right side of the TV foot. The count (cwl-tally) always sits last, in the bottom right corner; other marks (Reconnecting) sit before it. */
  function footRight(tv, content, where) {
    var r = tv.querySelector(".cwl-tv-foot-right");
    if (!r) { var f = h("div", "cwl-tv-foot"); f.innerHTML = "<span></span>"; r = h("span", "cwl-tv-foot-right"); f.appendChild(r); tv.appendChild(f); }
    var node = content;
    if (typeof content === "string") { var tmp = document.createElement("span"); tmp.innerHTML = content; node = tmp.firstElementChild; }
    if (where === "start") r.insertBefore(node, r.firstChild); else r.appendChild(node);
    return node;
  }

  /* ---------- The AI icon (Chris, Nov 2 2026) ----------
     "Generative" by LAFS on Flaticon (flaticon.com/free-icon/generative_16806607): a rounded square holding the letters AI, with a
     four-point sparkle at its corner. Free license with attribution (see assets/Icons/README.md). Traced from the 512px file; swap in
     the official SVG path when it is downloaded. It replaces Lucide sparkles everywhere AI is meant: lucide("sparkles") returns it.
     - aiIcon(): the icon in currentColor, sized like any Lucide icon.
     - aiBadge(): the icon in Navy (cwl-on-ai) on the AI gradient badge. The icon already says AI, so the badge carries no word.
     - aiBadge(true) / aiGlyph(): the icon filled with the AI gradient itself, no badge, for marks that sit on an item. */
  var AI_ICON_D = "M18.671 22.183 C18.640 22.163 18.446 21.718 18.239 21.193 C17.817 20.125 17.683 19.886 17.310 19.546 C16.983 19.247 16.955 19.233 15.797 18.770 C14.937 18.426 14.834 18.374 14.822 18.271 C14.814 18.208 14.835 18.135 14.869 18.109 C14.902 18.083 15.371 17.886 15.911 17.671 C17.445 17.060 17.576 16.927 18.226 15.329 C18.450 14.779 18.669 14.306 18.714 14.278 C18.851 14.194 18.950 14.358 19.289 15.234 C19.660 16.191 19.762 16.405 19.978 16.676 C20.289 17.069 20.627 17.268 21.711 17.697 C22.276 17.921 22.739 18.131 22.754 18.170 C22.814 18.328 22.672 18.413 21.718 18.787 C20.093 19.425 19.970 19.547 19.315 21.182 C18.903 22.211 18.847 22.298 18.671 22.183 Z M6.469 20.178 C5.361 19.943 4.452 19.186 3.998 18.117 C3.744 17.519 3.746 17.574 3.762 11.836 C3.778 5.919 3.753 6.370 4.114 5.638 C4.438 4.984 4.984 4.438 5.638 4.114 C6.370 3.753 5.919 3.778 11.836 3.762 C16.548 3.749 17.174 3.755 17.505 3.822 C18.728 4.069 19.669 4.902 20.095 6.117 L20.227 6.492 L20.240 9.425 C20.254 12.349 20.254 12.358 20.155 12.483 C20.033 12.638 19.858 12.647 19.513 12.516 C19.378 12.465 19.146 12.410 18.997 12.395 C18.666 12.361 18.488 12.297 18.437 12.195 C18.416 12.152 18.388 10.915 18.375 9.445 L18.352 6.773 L18.222 6.509 C18.070 6.200 17.756 5.893 17.446 5.750 L17.227 5.648 L12.000 5.648 L6.773 5.648 L6.554 5.750 C6.244 5.893 5.930 6.200 5.778 6.509 L5.648 6.773 L5.648 12.000 L5.648 17.227 L5.778 17.491 C5.930 17.800 6.244 18.107 6.554 18.250 C6.770 18.350 6.823 18.352 9.773 18.375 C11.423 18.388 12.799 18.415 12.830 18.435 C12.861 18.455 12.954 18.597 13.035 18.750 C13.117 18.903 13.318 19.190 13.482 19.388 C13.821 19.795 13.857 19.944 13.666 20.135 L13.551 20.250 L10.162 20.246 C7.475 20.243 6.710 20.229 6.469 20.178 Z M7.160 15.512 C7.111 15.483 7.078 15.408 7.078 15.324 C7.078 15.116 9.322 8.144 9.411 8.074 C9.516 7.993 10.639 7.993 10.748 8.074 C10.796 8.111 11.255 9.470 11.953 11.648 C12.573 13.582 13.092 15.210 13.107 15.265 C13.124 15.332 13.100 15.400 13.035 15.465 C12.951 15.549 12.881 15.562 12.517 15.562 C12.012 15.562 12.042 15.594 11.784 14.801 L11.605 14.250 L10.071 14.250 C8.651 14.250 8.536 14.256 8.514 14.332 C8.344 14.923 8.174 15.415 8.118 15.480 C8.061 15.547 7.972 15.562 7.645 15.561 C7.423 15.560 7.205 15.538 7.160 15.512 Z M14.890 15.477 C14.819 15.399 14.812 15.074 14.812 11.781 C14.812 8.343 14.817 8.167 14.898 8.093 C15.028 7.976 15.752 7.982 15.860 8.101 C15.931 8.180 15.938 8.504 15.938 11.797 C15.938 15.235 15.933 15.411 15.852 15.485 C15.722 15.602 14.998 15.596 14.890 15.477 Z M11.237 13.066 C11.225 13.034 10.965 12.234 10.659 11.288 C10.352 10.343 10.088 9.583 10.071 9.601 C10.054 9.618 9.787 10.419 9.479 11.379 L8.919 13.125 L10.088 13.125 C11.004 13.125 11.253 13.112 11.237 13.066 Z";
  function aiIcon(cls) { return '<svg class="cwl-icon cwl-ai-icon ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="' + AI_ICON_D + '"/></svg>'; }
  var aiGlyphN = 0;
  function aiGlyph() {
    var id = "cwl-ai-g" + (++aiGlyphN);
    return '<span class="cwl-ai-glyph" role="img" aria-label="AI"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="3" y1="2" x2="21" y2="22">' +
      '<stop offset="0" style="stop-color:var(--cwl-ai-start)"/><stop offset="1" style="stop-color:var(--cwl-ai-end)"/></linearGradient></defs><g fill="url(#' + id + ')"><path fill-rule="evenodd" d="' + AI_ICON_D + '"/></g></svg></span>';
  }
  function aiBadge(iconOnly) { return iconOnly ? aiGlyph() : '<span class="cwl-ai-badge" role="img" aria-label="AI">' + aiIcon() + "</span>"; }

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
  function lucide(name, cls) { if (name === "sparkles") return aiIcon(cls); /* AI is always the AI icon */ return '<i data-lucide="' + name + '" class="cwl-icon ' + (cls || "") + '"></i>'; }
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
  /* Texture by screen type, applied automatically. Solid mark throughout.
     holding: join, welcome, breaks, Nothing live (G2: oversized solid mark with glow)
     opener: day, lens or part title cards (E2: solid offset pattern with glow)
     input: word cloud, wall, bars, grids, tally (D: glow only) · content: headline with depth, Scripture, prayer (D)
     phone-waiting: waiting and phones down (A2: solid offset pattern) · phone-answering: plain Navy */
  var TEXTURE_BY_SCREEN = {
    "holding": { option: "oversized", kind: "solid", glow: true, code: "G2" },
    "opener": { option: "pattern", kind: "solid", glow: true, code: "E2" },
    "input": { option: "none", glow: true, code: "D" },
    "content": { option: "none", glow: true, code: "D" },
    "phone-waiting": { option: "pattern", kind: "solid", code: "A2" },
    "phone-answering": { option: "none", code: "none" }
  };
  function screenTexture(el, type, extra) {
    type = type || (el.getAttribute("data-surface") === "phone" ? "phone-answering" : "input");
    var o = {}, base = TEXTURE_BY_SCREEN[type] || {};
    for (var k in base) o[k] = base[k];
    if (extra) for (var j in extra) o[j] = extra[j];
    el.setAttribute("data-screen", type);
    var layer = texture(el, o);
    if (type === "input" && window.MutationObserver && !el._cwlLimeWatch) {
      /* Lime handoff on the TV: while a newest arrival has its Lime moment, the LIVE marker
         takes its outline form, so the screen keeps one Lime moment. */
      var check = function () {
        var m = el.querySelector(".cwl-tv-top .cwl-live-marker:not([data-fixed])");
        if (m) m.classList.toggle("is-handed-off", !!el.querySelector(".cwl-card.is-newest, .cwl-word.is-new"));
      };
      var mo = new MutationObserver(check); mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
      el._cwlLimeWatch = mo;
    }
    return layer;
  }
  var timers = [];
  function every(fn, msec) { var id = setInterval(fn, msec); timers.push(id); return id; }
  function later(fn, msec) { var id = setTimeout(fn, msec); timers.push(id); return id; }
  function clearTimers() { timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers = []; }


  /* ---------- App surfaces: frames and the preview scaffold ---------- */
  var APP_STATES = ["Default", "Hover", "Focus", "Disabled", "Error", "Empty", "Loading", "Very long text"];
  function appFrame(box, w, hgt, surface) {
    box.classList.add("cwl-app-box");
    var a = h("div", "cwl-app cwl-app-frame"); a.setAttribute("data-surface", surface || "setup"); a.setAttribute("data-theme", "light");
    a.style.width = w + "px"; a.style.height = hgt + "px";
    box.appendChild(a); fit(box, a, w, hgt); return a;
  }
  function appPhone(box, surface) {
    var ph = phone(box, "light"); ph.setAttribute("data-surface", surface || "control"); ph.classList.add("cwl-app"); return ph;
  }
  /* appCard({title, eyebrow, surface, w, h, phone, states, render(state, el)}) */
  function appCard(o) {
    var rootEl = document.getElementById(o.root || "root");
    rootEl.className = "cwl-doc";
    rootEl.innerHTML = '<div class="cwl-doc-eyebrow"></div><div class="cwl-doc-title"></div><div class="cwl-tabs" role="tablist"></div><div class="cwl-app-stage"></div><div class="cwl-doc-note" aria-live="polite"></div>';
    rootEl.querySelector(".cwl-doc-eyebrow").textContent = o.eyebrow || "App surfaces";
    rootEl.querySelector(".cwl-doc-title").textContent = o.title || "";
    var stageEl = rootEl.querySelector(".cwl-app-stage"), box = h("div");
    if (o.phone) { box.style.width = "240px"; box.style.margin = "0 auto"; }
    stageEl.appendChild(box);
    var el = o.phone ? appPhone(box, o.surface) : appFrame(box, o.w || 920, o.h || 420, o.surface);
    var tabs = rootEl.querySelector(".cwl-tabs"), note = rootEl.querySelector(".cwl-doc-note");
    var states = o.states || APP_STATES;
    function select(i) {
      tabs.querySelectorAll("button").forEach(function (b, j) { b.setAttribute("aria-selected", i === j ? "true" : "false"); });
      clearTimers();
      el.setAttribute("data-motion", states[i] === "Reduced motion" ? "reduced" : "full");
      el.innerHTML = "";
      note.textContent = o.render(states[i], el) || "";
      icons();
    }
    states.forEach(function (s, i) { var b = h("button", "cwl-tab"); b.type = "button"; b.setAttribute("role", "tab"); b.textContent = s; b.onclick = function () { select(i); }; tabs.appendChild(b); });
    select(0);
    return { el: el, select: select };
  }

  window.ClearwayLive = {
    MARK_PATH: MARK_PATH, v: v, ms: ms, reduced: reduced, h: h, esc: esc,
    markSVG: markSVG, markMaskURI: markMaskURI, liveMark: liveMark, aiBadge: aiBadge, aiIcon: aiIcon, aiGlyph: aiGlyph, quietMark: quietMark, churchLockup: churchLockup, footRight: footRight, texture: texture,
    stage: stage, phone: phone, flip: flip, arrive: arrive, leave: leave,
    ArrivalFlow: ArrivalFlow, wordSize: wordSize, countTo: countTo,
    bars: bars, wordCloud: wordCloud, fitWall: fitWall, card: card, STATES: STATES, lucide: lucide, icons: icons,
    qr: qr, load: load, APP_STATES: APP_STATES, appFrame: appFrame, appPhone: appPhone, appCard: appCard, TEXTURE_BY_SCREEN: TEXTURE_BY_SCREEN, screenTexture: screenTexture, every: every, later: later, clearTimers: clearTimers
  };
})();
