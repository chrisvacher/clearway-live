/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 2 · live-room.js
   window.ClearwayLivePass2: a persistent TV stage and a participant
   phone that follow one simulated room state. Built only on the
   design system's helpers (ClearwayLive.flip, arrive, leave,
   ArrivalFlow, wordCloud, countTo, screenTexture). The TV is built
   once and never rebuilt: every change animates from the current state.
   This is a motion simulation, not a network model.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, h = CL.h, esc = CL.esc, L = CL.lucide;

  var ROOM = {
    church: "Riverside Church",
    link: "live.clearway.co/riverside",
    event: "Wayfinding · Day 1",
    people: ["Mark", "Priya", "Daniel", "Grace", "Tasha", "Sam", "Ruth", "Ben"]
  };

  var SESSIONS = {
    cloud: {
      kind: "cloud", title: "Celebration: one word", interaction: "word cloud",
      eyebrow: "Celebration",
      headline: "One word for what God is doing <strong>at Riverside</strong>",
      prompt: "One word for what God is doing at Riverside",
      unit: "answers",
      seed: [["youth", 4], ["alpha", 3], ["baptisms", 3], ["momentum", 2], ["welcome", 2], ["families", 1], ["prayer", 1], ["worship", 1]],
      one: ["hope", "generosity", "neighbours", "joy", "students", "seniors", "kids", "music", "outreach", "groups", "unity", "care"],
      burst: ["youth", "alpha", "momentum", "baptisms", "youth", "welcome", "families", "alpha", "youth", "prayer", "momentum", "worship", "generosity", "youth", "alpha", "baptisms", "hope", "community", "momentum", "welcome", "youth", "kids", "joy", "alpha", "students", "baptisms", "seniors", "youth", "care", "momentum", "welcome", "alpha", "groups", "youth", "prayer", "unity", "baptisms", "neighbours", "momentum", "alpha", "youth", "music", "families", "welcome", "outreach", "youth", "momentum", "hope", "alpha", "baptisms"]
    },
    wall: {
      kind: "wall", title: "Celebration: what's worth celebrating", interaction: "open text",
      eyebrow: "Celebration",
      headline: "What is God doing that's <strong>worth celebrating?</strong>",
      prompt: "What is God doing that's worth celebrating?",
      unit: "answers",
      seed: ["Teenagers asking to be baptized", "Alpha full three seasons running", "Young families finding us online", "Seniors' lunch serving the whole street", "Worship team doubled since spring", "Three baptisms at Easter", "Kids' ministry has a waiting list", "More young families every month", "New believers in Alpha asking real questions"],
      one: ["The food bank partnership with St. Mark's", "Small groups starting in homes again", "People staying for coffee after the service", "Our youth leading worship once a month", "New believers asking real questions", "Volunteers who show up early every week", "Prayer team meeting on Wednesday nights", "Kids' ministry has a waiting list", "Generous giving through a hard year", "Newcomers in a group within weeks"],
      burst: null
    }
  };
  (function buildWallBurst() {
    var a = ["Teenagers", "Young families", "Seniors", "New believers", "Volunteers", "Our youth", "Small groups", "The prayer team", "Newcomers", "Kids' ministry"];
    var b = ["asking to be baptized", "finding us online", "serving the whole street", "staying for coffee", "leading worship", "meeting in homes again", "showing up early", "inviting their neighbours", "growing every season", "asking real questions"];
    var out = [];
    for (var i = 0; i < 50; i++) out.push(a[i % a.length] + " " + b[(i * 3 + Math.floor(i / 10)) % b.length]);
    SESSIONS.wall.burst = out;
  })();

  /* Simulated AI grouping for the review: each answer joins the first theme whose words it uses.
     In the build, Claude proposes the groups and short labels (milestone 3); this stands in for it. */
  var THEMES = [
    ["Baptisms", /baptiz|baptism/i], ["Alpha", /alpha|new believers|real questions/i], ["Young families", /famil/i],
    ["Next generation", /teen|youth|kids|students/i], ["Small groups", /small group|homes/i], ["Worship", /worship/i],
    ["Prayer", /prayer/i], ["Serving neighbours", /serving|neighbour|street|food bank/i], ["Volunteers", /volunteer|showing up|show up/i],
    ["Welcome", /coffee|newcomer|welcom|finding us/i], ["Seniors", /senior/i], ["Generosity", /giv|generous/i]
  ];
  function themeOf(text) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i][1].test(text)) return THEMES[i][0]; return null; }

  function ms(n) { return CL.ms(n); }

  /* The TV lockup: Clearway mark, a hairline, then the church's logo tile (placeholder monogram until Team Hub's logo is read). */
  function lockup(church) {
    church = church || ROOM;
    return '<span class="p2-lockup"><span class="cwl-tv-logo">' + CL.markSVG("solid") + '</span><span class="p2-lockup-rule" aria-hidden="true"></span>' +
      '<span class="p2-church-logo" aria-label="' + esc(church.church) + ' logo"><span class="mono" aria-hidden="true">R</span>Riverside</span></span>';
  }

  function springStep(x, v, target, w, dt) {
    var d = x - target, e = Math.exp(-w * dt);
    return [target + (d + (v + w * d) * dt) * e, (v - w * (v + w * d) * dt) * e];
  }

  /* ---------- Field: an organic layout for the word cloud and the wall's group labels ----------
     Each item keeps its own place. On every update the field works out a clean arrangement in which nothing
     overlaps: larger items are placed first and keep their spot if it is still free; anything that no longer fits
     moves to the nearest free spot; a new item takes the free spot nearest the middle. Every item then glides to its
     place, and grows or shrinks, on one gentle spring that settles over cwl-dur-regroup (1200ms) and never resets its
     speed. New items fade in over cwl-dur-make-room; removed items fade where they stand. Sizes step down together
     (never below 36px) if the items would crowd the space. Reduced motion: items take their places at once. */
  function Field(root, make, opt) {
    this.root = root; this.make = make; this.opt = opt || {}; this.items = new Map(); this.order = [];
    var self = this, last = performance.now();
    var replan = function () { if (self.last && root.isConnected) self.set(self.last); };
    if (window.ResizeObserver) { var lw = 0, lh = 0; new ResizeObserver(function () { if (root.clientWidth !== lw || root.clientHeight !== lh) { lw = root.clientWidth; lh = root.clientHeight; replan(); } }).observe(root); }
    if (document.fonts) { document.fonts.ready.then(replan); if (document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", replan); }
    (function tick(now) {
      var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      if (!root.isConnected) return;
      self.step(dt);
      requestAnimationFrame(tick);
    })(last);
  }
  Field.prototype.measure = function (it, fs) {
    var keep = it.el.style.fontSize; it.el.style.fontSize = fs + "px";
    var r = { w: it.el.offsetWidth, h: it.el.offsetHeight }; it.el.style.fontSize = keep; return r;
  };
  Field.prototype.layout = function (live) {
    var W = this.root.clientWidth, H = this.root.clientHeight, gx = this.opt.gapX || 32, gy = this.opt.gapY || 12, placed = [];
    function fits(x, y, w, h) {
      if (x - w / 2 < 0 || x + w / 2 > W || y - h / 2 < 0 || y + h / 2 > H) return false;
      for (var i = 0; i < placed.length; i++) { var p = placed[i]; if (Math.abs(p.x - x) < (p.w + w) / 2 + gx && Math.abs(p.y - y) < (p.h + h) / 2 + gy) return false; }
      return true;
    }
    var ok = true;
    function nearest(x0, y0, w, h) {
      if (fits(x0, y0, w, h)) return [x0, y0];
      for (var r = 6; r < Math.max(W, H); r += 6) {
        var steps = Math.max(12, Math.round(r / 4));
        for (var k = 0; k < steps; k++) {
          var a = (k / steps) * Math.PI * 2, x = x0 + Math.cos(a) * r * 1.6, y = y0 + Math.sin(a) * r * 0.7;
          if (fits(x, y, w, h)) return [x, y];
        }
      }
      ok = false;
      return [x0, y0];
    }
    live.slice().sort(function (p, q) { return q.tw * q.th - p.tw * p.th; }).forEach(function (it) {
      var start = it.placed ? [it.tx, it.ty] : [W / 2, H / 2];
      var pos = nearest(start[0], start[1], it.tw, it.th);
      it.tx = pos[0]; it.ty = pos[1]; it.placed = true;
      placed.push({ x: it.tx, y: it.ty, w: it.tw, h: it.th });
    });
    return ok;
  };
  /* list: [{ key, size, update(el) }] */
  Field.prototype.set = function (list, instant) {
    var self = this, want = {}, W = this.root.clientWidth, H = this.root.clientHeight;
    var snap = instant || CL.reduced(this.root);
    list.forEach(function (d) { want[d.key] = d; });
    this.items.forEach(function (it, key) { if (!want[key]) it.going = true; });
    list.forEach(function (d) {
      var it = self.items.get(d.key);
      if (it && it.going) { it.el.remove(); self.items.delete(d.key); it = null; }
      if (!it) {
        var el = self.make(d.key); el.style.position = "absolute"; el.style.left = "0"; el.style.top = "0"; el.style.whiteSpace = "nowrap"; el.style.opacity = "0";
        self.root.appendChild(el);
        it = { key: d.key, el: el, x: 0, y: 0, vx: 0, vy: 0, fs: d.size, vfs: 0, o: 0, vo: 0, fresh: true };
        self.items.set(d.key, it);
      }
      d.update(it.el);
    });
    this.last = list;
    var gx = this.opt.gapX || 32, gy = this.opt.gapY || 12, tot = 0;
    if (W < 40 || H < 40) { this.pending = true; return; }
    this.pending = false;
    list.forEach(function (d) { var m = self.measure(self.items.get(d.key), d.size); tot += (m.w + gx) * (m.h + gy); });
    var k = Math.min(1, Math.sqrt((W * H * (this.opt.fill || 0.5)) / Math.max(1, tot)));
    var live, before = list.map(function (d) { var it = self.items.get(d.key); return [it.tx, it.ty, it.placed]; });
    /* Nothing may overlap: if any item can't find free space, every size steps down and the plan is redone. */
    for (var attempt = 0; attempt < 10; attempt++) {
      live = list.map(function (d, i) {
        var it = self.items.get(d.key); it.tfs = Math.max(36, d.size * k);
        it.tx = before[i][0]; it.ty = before[i][1]; it.placed = before[i][2];
        var m = self.measure(it, it.tfs); it.tw = m.w; it.th = m.h; return it;
      });
      if (this.layout(live)) break;
      k *= 0.9;
    }
    live.forEach(function (it) {
      if (it.fresh) { it.fresh = false; it.x = it.tx; it.y = it.ty + (snap ? 0 : 8); it.fs = snap ? it.tfs : it.tfs * 0.92; it.o = snap ? 1 : 0; it.born = performance.now(); }
      if (snap) { it.x = it.tx; it.y = it.ty; it.fs = it.tfs; it.vx = it.vy = it.vfs = 0; if (instant) it.o = 1; }
    });
    this.step(0);
  };
  Field.prototype.step = function (dt) {
    var self = this, red = CL.reduced(this.root), now = performance.now();
    var wS = 6.6 / (ms("cwl-dur-regroup") / 1000), wO = 6.6 / (ms("cwl-dur-make-room") / 1000);
    this.items.forEach(function (it, key) {
      var r;
      if (red) {
        it.x = it.tx; it.y = it.ty; it.fs = it.tfs;
        it.o = it.going ? 0 : Math.min(1, (now - (it.born || 0)) / ms("cwl-dur-reduced"));
      } else if (dt > 0) {
        r = springStep(it.x, it.vx, it.tx, wS, dt); it.x = r[0]; it.vx = r[1];
        r = springStep(it.y, it.vy, it.ty, wS, dt); it.y = r[0]; it.vy = r[1];
        r = springStep(it.fs, it.vfs, it.going ? it.fs : it.tfs, wS, dt); it.fs = r[0]; it.vfs = r[1];
        r = springStep(it.o, it.vo, it.going ? 0 : 1, wO, dt); it.o = Math.max(0, Math.min(1, r[0])); it.vo = r[1];
      }
      if (it.going && it.o < 0.02) { it.el.remove(); self.items.delete(key); return; }
      var settled = Math.abs(it.x - it.tx) < 0.2 && Math.abs(it.y - it.ty) < 0.2 && Math.abs(it.fs - it.tfs) < 0.05 && it.o > 0.999 && !it.going;
      if (settled && it.rest) return;
      it.rest = settled;
      it.el.style.fontSize = it.fs.toFixed(2) + "px";
      var w = it.tw * (it.fs / it.tfs), hh = it.th * (it.fs / it.tfs);
      it.el.style.transform = "translate(" + (it.x - w / 2).toFixed(2) + "px," + (it.y - hh / 2).toFixed(2) + "px)";
      it.el.style.opacity = it.o >= 0.999 ? "" : it.o.toFixed(3);
    });
  };

  /* Single mentions: one row that slides as a unit. New chips join at the right; once the row is full it eases
     left so the newest stays in view, and the oldest fade off the left edge. */
  function Chips(row) {
    this.row = row; this.track = h("div", "p2-chips-track"); row.appendChild(this.track);
    this.off = 0; this.v = 0; var self = this, last = performance.now();
    (function tick(now) {
      var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      if (!row.isConnected) return;
      var target = self.target();
      if (CL.reduced(row)) { self.off = target; self.v = 0; }
      else { var r = springStep(self.off, self.v, target, 6.6 / (ms("cwl-dur-regroup") / 1000), dt); self.off = r[0]; self.v = r[1]; }
      self.track.style.transform = "translateX(" + (-self.off).toFixed(2) + "px)";
      /* retire chips that have slid fully past the left edge, keeping the picture still */
      var first = self.track.firstElementChild;
      if (first && first.offsetLeft + first.offsetWidth < self.off - 4 && self.track.children.length > 1) {
        var gap = parseFloat(getComputedStyle(self.track).columnGap) || 0, dw = first.offsetWidth + gap;
        first.remove(); self.off -= dw;
      }
      requestAnimationFrame(tick);
    })(last);
  }
  Chips.prototype.target = function () {
    var tw = this.track.scrollWidth, rw = this.row.clientWidth;
    return tw > rw ? tw - rw : -(rw - tw) / 2;
  };
  Chips.prototype.set = function (words, instant) {
    var t = this.track, keep = {}, self = this;
    words.forEach(function (w) { keep[w.text] = w; });
    Array.prototype.slice.call(t.children).forEach(function (el) {
      if (!keep[el.getAttribute("data-w")] && !el.classList.contains("p2-going")) {
        el.classList.add("p2-going");
        var red = CL.reduced(self.row);
        var a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: red ? ms("cwl-dur-reduced") : ms("cwl-dur-hide"), easing: CL.v("cwl-ease-exit"), fill: "forwards" });
        a.onfinish = function () {
          if (red) { el.remove(); return; }
          var w0 = el.offsetWidth, gap = parseFloat(getComputedStyle(t).columnGap) || 0;
          el.animate([{ width: w0 + "px", marginRight: "0px" }, { width: "0px", marginRight: -gap + "px" }], { duration: ms("cwl-dur-make-room"), easing: CL.v("cwl-ease-signature"), fill: "forwards" }).onfinish = function () { el.remove(); };
        };
      }
    });
    words.forEach(function (w) {
      var el = t.querySelector('.cwl-word[data-w="' + CSS.escape(w.text) + '"]:not(.p2-going)');
      if (!el) {
        el = h("span", "cwl-word is-single"); el.setAttribute("data-w", w.text); el.textContent = w.text; t.appendChild(el);
        if (!instant) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CL.reduced(self.row) ? ms("cwl-dur-reduced") : ms("cwl-dur-make-room"), easing: CL.v("cwl-ease-arrive"), fill: "backwards" });
      }
      el.className = "cwl-word is-single" + (w.isNew ? " is-new" : "");
    });
    if (instant) this.off = this.target();
  };

  var MIN_PX = 56, MAX_PX = 168;
  function cloudUpdate(cloud, list, o) {
    o = o || {};
    if (!cloud._field) {
      var fieldEl = h("div", "p2-field"), row = h("div", "cwl-cloud-stream p2-chips");
      cloud.appendChild(fieldEl); cloud.appendChild(row);
      cloud._field = new Field(fieldEl, function (key) { var e = h("span", "cwl-word"); e.setAttribute("data-w", key); e.textContent = key; return e; }, { gapX: 40, gapY: 6, fill: 0.55 });
      cloud._chips = new Chips(row);
    }
    var reps = list.filter(function (w) { return w.count > 1; }), singles = list.filter(function (w) { return w.count === 1; });
    var max = reps.reduce(function (m, w) { return Math.max(m, w.count); }, 1);
    var items = reps.slice().sort(function (x, y) { return y.count - x.count; }).map(function (w) {
      return { key: w.text, size: CL.wordSize(w.count, max, MIN_PX, MAX_PX), update: function (el) { el.className = "cwl-word " + (w.count === max ? "is-leader" : "is-repeated") + (w.isNew && w.count !== max ? " is-new" : ""); } };
    });
    cloud._chips.set(singles, o.instant);
    cloud._field.set(items, o.instant);
  }

  /* Answer column: the whole column slides down as one piece when answers arrive at the top, on the same spring,
     so rows never pass over each other; new rows fade in, hidden rows fade and their space closes smoothly. */
  function Feed(list) {
    this.list = list; this.track = h("div", "p2-feed-track"); list.appendChild(this.track);
    this.off = 0; this.v = 0; var self = this, last = performance.now();
    (function tick(now) {
      var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      if (!list.isConnected) return;
      if (CL.reduced(list)) { self.off = 0; self.v = 0; }
      else if (Math.abs(self.off) > 0.2 || Math.abs(self.v) > 0.2) { var r = springStep(self.off, self.v, 0, 6.6 / (ms("cwl-dur-regroup") / 1000), dt); self.off = r[0]; self.v = r[1]; }
      else { self.off = 0; self.v = 0; }
      self.track.style.transform = self.off ? "translateY(" + (-self.off).toFixed(2) + "px)" : "";
      requestAnimationFrame(tick);
    })(last);
  }
  Feed.prototype.prepend = function (rows, instant) {
    var t = this.track;
    rows.forEach(function (r) { t.insertBefore(r, t.firstChild); });
    if (instant || CL.reduced(this.list)) { rows.forEach(function (r) { if (!instant) r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("cwl-dur-reduced") }); }); return; }
    var hgt = rows.reduce(function (s, r) { return s + r.offsetHeight; }, 0);
    this.off += hgt;
    this.track.style.transform = "translateY(" + (-this.off).toFixed(2) + "px)";
    rows.forEach(function (r) { r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("cwl-dur-make-room"), easing: CL.v("cwl-ease-arrive"), fill: "backwards" }); });
    var all = t.children; for (var i = all.length - 1; i >= 40; i--) all[i].remove();
  };
  Feed.prototype.remove = function (row) {
    var red = CL.reduced(this.list);
    row.classList.add("p2-going");
    var fade = row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: red ? ms("cwl-dur-reduced") : ms("cwl-dur-hide"), easing: CL.v("cwl-ease-exit"), fill: "forwards" });
    fade.onfinish = function () {
      if (red) { row.remove(); return; }
      var hh = row.offsetHeight;
      var c = row.animate([{ height: hh + "px", paddingTop: getComputedStyle(row).paddingTop, paddingBottom: getComputedStyle(row).paddingBottom }, { height: "0px", paddingTop: "0px", paddingBottom: "0px" }],
        { duration: ms("cwl-dur-make-room"), easing: CL.v("cwl-ease-signature"), fill: "forwards" });
      c.onfinish = function () { row.remove(); };
    };
  };
  Feed.prototype.insertAt = function (row, idx) {
    var t = this.track, rows = t.querySelectorAll(".p2-feed-row:not(.p2-going)");
    t.insertBefore(row, rows[idx] || null);
    if (CL.reduced(this.list)) return;
    var hh = row.offsetHeight, cs = getComputedStyle(row);
    row.animate([{ height: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 }, { height: hh + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 }],
      { duration: ms("cwl-dur-make-room"), easing: CL.v("cwl-ease-signature") });
  };

  /* ---------- The TV: one stage, built once ---------- */
  function LiveRoom(tvBox, phone, opts) {
    opts = opts || {};
    this.opts = opts;
    this.phone = phone || null;
    this.tv = CL.stage(tvBox, opts.theme || "dark");
    if (opts.room) this.tv.setAttribute("data-room", opts.room);
    CL.screenTexture(this.tv, "input");
    var top = h("div", "cwl-tv-top");
    top.innerHTML = lockup() +
      '<span class="p2-right"><span class="cwl-tally"><span class="cwl-tally-n" data-n="0">0</span> <span class="p2-unit">answers</span></span>' +
      '<span class="p2-marker-slot"><span class="cwl-live-marker">Live</span><span class="cwl-state-pill is-off">' + L("smartphone") + ' Phones down</span></span></span>';
    this.tv.appendChild(top);
    var foot = h("div", "cwl-tv-foot");
    foot.innerHTML = '<span></span><span class="cwl-tv-upclose p2-reconnect is-off">' + L("refresh-cw") + ' Reconnecting</span>';
    this.tv.appendChild(foot);
    this.scrim = h("div", "cwl-scrim"); this.tv.appendChild(this.scrim);
    this.tally = top.querySelector(".cwl-tally-n");
    this.liveMarker = top.querySelector(".cwl-live-marker");
    this.downPill = top.querySelector(".cwl-state-pill");
    this.reconnectMark = foot.querySelector(".p2-reconnect");
    this.state = { phonesDown: false, offline: false, total: 0, retired: 0 };
    this.spot = null; this.hiddenStack = []; this.pendingTv = []; this.layer = null;
    var self = this;
    this.batch = null;
    /* Released answers are applied in batches no more often than cwl-delay-stagger (120ms):
       one reflow and one swell per batch, never one per answer at 30ms. */
    this.buf = []; this.lastFlush = 0; this.lastArrival = -1e9;
    this.flow = new CL.ArrivalFlow(function (item, hold) { self.buf.push({ item: item, received: performance.now() - hold }); });
    (function tick(now) {
      if (self.buf.length) {
        var oldest = now - self.buf[0].received;
        if (now - self.lastFlush >= ms("cwl-delay-stagger") || oldest >= ms("cwl-delay-max-hold") - 100) { self.lastFlush = now; self._flush(now); }
      }
      requestAnimationFrame(tick);
    })(performance.now());
    this.go(opts.session || "cloud", true);
    CL.icons();
  }

  LiveRoom.prototype.emit = function (name, data) { if (this.opts[name]) this.opts[name](data); };

  /* The count climbs smoothly toward the total on the same gentle spring, never restarting a tick. */
  LiveRoom.prototype._count = function (n) {
    var self = this; this._cTarget = n;
    if (this._cRun) return;
    if (this._cVal == null) this._cVal = 0;
    this._cVel = this._cVel || 0; this._cRun = true;
    var last = performance.now();
    (function tick(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (CL.reduced(self.tv)) { self._cVal = self._cTarget; self._cVel = 0; }
      else { var r = springStep(self._cVal, self._cVel, self._cTarget, 6.6 / (ms("cwl-dur-make-room") / 1000), dt); self._cVal = r[0]; self._cVel = r[1]; }
      var shown = Math.round(self._cVal);
      if (self.tally.textContent !== String(shown)) self.tally.textContent = shown;
      if (Math.abs(self._cVal - self._cTarget) < 0.3 && Math.abs(self._cVel) < 0.3) { self.tally.textContent = self._cTarget; self._cVal = self._cTarget; self._cRun = false; return; }
      requestAnimationFrame(tick);
    })(last);
  };

  /* Session change: the next session is prepared behind the current one and cross-faded in. */
  LiveRoom.prototype.go = function (kind, first) {
    var S = SESSIONS[kind], self = this;
    this.session = S; this.kind = kind;
    this.words = {}; this.order = []; this.hidden = {}; this.cards = []; this.hiddenStack = []; this.pendingTv = [];
    this.state.retired = 0; this.oneIdx = 0;
    this._clearSpot(true);
    var layer = h("div", "cwl-tv-content p2-layer" + (first ? "" : " is-entering"));
    layer.innerHTML = '<div class="cwl-tv-eyebrow">' + esc(S.eyebrow) + '</div><div class="cwl-tv-headline" style="margin-bottom:32px">' + S.headline + '</div><div class="p2-host"></div><div class="p2-note"></div>';
    this.tv.insertBefore(layer, this.tv.querySelector(".cwl-tv-top"));
    var host = layer.querySelector(".p2-host");
    this.note = layer.querySelector(".p2-note");
    var total = 0;
    if (kind === "cloud") {
      this.cloud = h("div", "cwl-cloud p2-cloud"); host.appendChild(this.cloud); this.wall = null;
      S.seed.forEach(function (w) { self.words[w[0]] = w[1]; self.order.push(w[0]); total += w[1]; });
      cloudUpdate(this.cloud, this._wordList(null), { instant: true });
    } else {
      /* Response wall (pass 2, Chris, Oct 30): individual answers scroll in a column on the right, newest first;
         the main area shows the AI's groups as short labels, all one color, sized by how many answers each holds. */
      host.innerHTML = '<div class="p2-wallsplit"><section class="p2-groups"><div class="p2-groups-head"><span class="cwl-marker">' + L("sparkles") + ' AI grouped</span><span class="p2-groups-hint">Themes from your answers</span></div><div class="p2-group-list"></div><div class="p2-groups-empty">Grouping as answers arrive</div></section>' +
        '<section class="p2-feed"><div class="p2-feed-head">Answers · newest first</div><div class="p2-feed-list"></div></section></div>';
      this.feed = new Feed(host.querySelector(".p2-feed-list")); this.wall = this.feed.track;
      this.groupList = host.querySelector(".p2-group-list"); this.groupEmpty = host.querySelector(".p2-groups-empty"); this.groupBox = host.querySelector(".p2-groups"); this.cloud = null;
      this.answers = []; this.groupField = null;
      this.feed.prepend(S.seed.map(function (t) { self.answers.push({ text: t, hidden: false }); total++; return self._row(t); }), true);
      this._regroup(true);
    }
    this.host = host;
    var old = this.layer; this.layer = layer;
    if (!first) {
      requestAnimationFrame(function () { requestAnimationFrame(function () { layer.classList.remove("is-entering"); }); });
      if (old) { old.classList.add("is-leaving"); setTimeout(function () { old.remove(); }, ms("cwl-dur-make-room") + 50); }
    }
    this.state.total = total;
    this._count(total);
    if (this.phone) this.phone.setSession(S);
    this.emit("onCaption", first ? "" : "Session change: the next session was prepared behind this one and cross-faded in over cwl-dur-make-room (700ms). The TV page never reloads, so nothing blanks.");
  };

  LiveRoom.prototype.reset = function () { this.setPhonesDown(false, true); this.setOffline(false, true); this.go(this.kind); };

  LiveRoom.prototype._wordList = function (newest) {
    var self = this;
    return this.order.filter(function (w) { return !self.hidden[w]; }).map(function (w) { return { text: w, count: self.words[w], isNew: w === newest }; });
  };
  LiveRoom.prototype._row = function (text) {
    var d = h("div", "p2-feed-row"); d.textContent = text; d.setAttribute("data-k", text);
    return d;
  };

  /* ---------- Input ---------- */
  LiveRoom.prototype.nextOne = function () { var p = this.session.one; return p[this.oneIdx++ % p.length]; };

  /* An answer reaching the server. Offline: it waits (phone queue or server queue). */
  LiveRoom.prototype.receive = function (text, meta) {
    meta = meta || {};
    if (this.state.phonesDown) return false;
    if (this.state.offline) { this.pendingTv.push(text); this.emit("onCaption", "The TV is holding its last state. " + this.pendingTv.length + " answer" + (this.pendingTv.length === 1 ? " is" : "s are") + " waiting for it."); return true; }
    this.flow.push({ text: text, batch: meta.batch || null });
    return true;
  };

  LiveRoom.prototype.addOne = function (fromPhone) {
    var t = this.nextOne(), self = this;
    if (this.state.phonesDown) { this.emit("onCaption", "Phones are down, so input is locked. Open phones first."); return; }
    if (fromPhone && this.phone) this.phone.typeAndSend(t, function () { if (!self.state.offline) self.receive(t); else self.emit("onCaption", "This phone is offline. '" + t + "' is saved on this phone and will send when the room reconnects."); });
    else this.receive(t);
  };

  /* 50 phones submit in the same instant. Holds are measured per answer. */
  LiveRoom.prototype.burst50 = function () {
    if (this.state.phonesDown || this.state.offline) { this.emit("onCaption", this.state.phonesDown ? "Phones are down. Open phones first." : "The room is reconnecting. Restore first."); return; }
    var self = this, pool = this.session.burst;
    var b = { n: pool.length, holds: [], t0: performance.now(), worst: 0, long: 0, last: performance.now(), running: true };
    this.batch = b;
    (function fr(t) { var d = t - b.last; b.last = t; if (d > b.worst) b.worst = d; if (d > 34) b.long++; if (b.running) requestAnimationFrame(fr); })(b.last);
    pool.forEach(function (t) { self.flow.push({ text: t, batch: b }); });
    this.emit("onBatchStart", b);
    this.emit("onCaption", "50 answers received in one instant. The TV shows them as a steady flow in small batches every 120ms, so none waits more than 1.5 seconds. While answers are flowing, none takes the Lime newest-arrival moment, so nothing flashes.");
  };

  /* A lone arrival (nothing else within cwl-dur-new-hold, nothing queued) takes the newest-arrival Lime moment.
     During a flow no answer takes it, so Lime never hops and the LIVE marker stays steady. */
  LiveRoom.prototype._flush = function (now) {
    var batch = this.buf; this.buf = [];
    var lone = batch.length === 1 && !this.flow.q.length && now - this.lastArrival > ms("cwl-dur-new-hold");
    this.lastArrival = now;
    this.state.total += batch.length;
    this._count(this.state.total);
    var texts = batch.map(function (x) { return x.item.text; });
    if (this.kind === "cloud") this._applyWords(texts, lone); else this._applyCards(texts, lone);
    var self = this;
    batch.forEach(function (x) {
      var hold = now - x.received, b = x.item.batch;
      self.emit("onHold", { hold: hold, text: x.item.text, batch: !!b });
      if (!b) return;
      b.holds.push(hold);
      if (b.holds.length === b.n) {
        setTimeout(function () {
          b.running = false;
          var s = b.holds.slice().sort(function (p, q) { return p - q; });
          var stats = {
            n: b.n, holds: b.holds, max: s[s.length - 1], median: s[Math.floor(s.length / 2)], p95: s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)],
            flowMs: performance.now() - b.t0 - ms("cwl-dur-arrive"), worstFrame: b.worst, longFrames: b.long, limit: ms("cwl-delay-max-hold")
          };
          stats.pass = stats.max < stats.limit && stats.longFrames === 0;
          self.emit("onBatchDone", stats);
        }, ms("cwl-dur-arrive") + 60);
      }
    });
  };

  LiveRoom.prototype._applyWords = function (ws, lone) {
    var self = this;
    ws.forEach(function (w) { if (self.words[w] == null) { self.words[w] = 0; self.order.push(w); } self.words[w]++; });
    var last = ws[ws.length - 1];
    cloudUpdate(this.cloud, this._wordList(lone && !this.hidden[last] ? last : null));
    if (lone) { var cloud = this.cloud; setTimeout(function () { cloud.querySelectorAll(".cwl-word.is-new").forEach(function (e) { e.classList.remove("is-new"); }); }, ms("cwl-dur-new-hold")); }
  };

  LiveRoom.prototype._applyCards = function (texts, lone) {
    var feed = this.wall, self = this;
    var made = texts.map(function (t) { self.answers.push({ text: t, hidden: false }); return self._row(t); });
    var prev = feed.querySelector(".p2-feed-row.is-newest"); if (prev) prev.classList.remove("is-newest");
    this.feed.prepend(made);
    if (lone) {
      made[0].classList.add("is-newest");
      this.liveMarker.classList.add("is-handed-off");
      var mk = this.liveMarker;
      setTimeout(function () { made[0].classList.remove("is-newest"); if (!feed.querySelector(".p2-feed-row.is-newest")) mk.classList.remove("is-handed-off"); }, ms("cwl-dur-new-hold"));
    }
    this._scheduleRegroup();
  };

  /* AI never sits between a phone and the screen: the answer lands in the column first; the AI's groups arrive as
     their own update a moment later and rework themselves while answers keep coming (at most every 800ms). */
  LiveRoom.prototype._scheduleRegroup = function () {
    var self = this; if (this._rgT) return;
    this._rgT = setTimeout(function () { self._rgT = null; self._regroup(); }, 800);
  };
  LiveRoom.prototype._scheduleSettle = function () {};
  LiveRoom.prototype._regroup = function (instant) {
    if (!this.groupList) return;
    var counts = {};
    this.answers.forEach(function (a) { if (a.hidden) return; var t = themeOf(a.text); if (t) counts[t] = (counts[t] || 0) + 1; });
    var shown = Object.keys(counts).filter(function (k) { return counts[k] > 1; }).sort(function (x, y) { return counts[y] - counts[x]; });
    var max = shown.reduce(function (m, k) { return Math.max(m, counts[k]); }, 2);
    if (!this.groupField) this.groupField = new Field(this.groupList, function (key) {
      var e = h("div", "p2-group"); e.setAttribute("data-g", key); e.innerHTML = '<span class="lbl"></span><span class="n"></span>'; return e;
    }, { gapX: 28, gapY: 22, fill: 0.5 });
    this.groupField.set(shown.map(function (k) {
      return { key: k, size: CL.wordSize(counts[k], max, 44, 72), update: function (el) { el.querySelector(".lbl").textContent = k; el.querySelector(".n").textContent = counts[k]; el.setAttribute("aria-label", k + ", " + counts[k] + " answers"); } };
    }), instant);
    this.groupEmpty.classList.toggle("is-off", shown.length > 0);
  };

  /* ---------- Repeat: the runner-up word swells, neighbours ease aside ---------- */
  LiveRoom.prototype.repeat = function () {
    if (this.kind !== "cloud") { this.emit("onCaption", "Repeat applies to the word cloud. Switch to Word cloud."); return; }
    if (this.state.phonesDown) { this.emit("onCaption", "Phones are down, so input is locked. Open phones first."); return; }
    var self = this;
    var reps = this.order.filter(function (w) { return !self.hidden[w] && self.words[w] > 1; }).sort(function (a, b) { return self.words[b] - self.words[a]; });
    var target = reps[1] || reps[0] || this.order[0];
    this.receive(target);
    this.emit("onCaption", "'" + target + "' was sent again. It grows while its neighbours ease aside, all on one gentle spring that settles over cwl-dur-regroup (1200ms). Size follows the square root of the count; the leader takes Sunrise.");
  };

  /* ---------- Spotlight and hide ---------- */
  LiveRoom.prototype._target = function (forHide) {
    var self = this;
    if (this.kind === "cloud") {
      var reps = this.order.filter(function (w) { return !self.hidden[w]; }).sort(function (a, b) { return self.words[b] - self.words[a]; });
      var w = forHide ? (reps[2] || reps[reps.length - 1]) : reps[0];
      return w ? { text: w, el: this.cloud.querySelector('[data-w="' + CSS.escape(w) + '"]'), meta: this.words[w] + " people gave this word" } : null;
    }
    if (forHide) {
      var rows = this.wall.querySelectorAll(".p2-feed-row:not(.p2-going)"), r = rows[Math.min(1, rows.length - 1)];
      return r ? { text: r.getAttribute("data-k"), el: r, meta: "" } : null;
    }
    var gs = Array.prototype.slice.call(this.groupList.querySelectorAll(".p2-group:not(.p2-going)"));
    gs.sort(function (a, b) { return +b.querySelector(".n").textContent - +a.querySelector(".n").textContent; });
    if (gs[0]) return { text: gs[0].getAttribute("data-g"), el: gs[0], meta: gs[0].querySelector(".n").textContent + " answers in this group · AI grouped" };
    var first = this.wall.querySelector(".p2-feed-row:not(.p2-going)");
    return first ? { text: first.getAttribute("data-k"), el: first, meta: "From the answers" } : null;
  };

  LiveRoom.prototype.toggleSpotlight = function () {
    if (this.spot) { this._clearSpot(); this.emit("onCaption", "Spotlight off over cwl-dur-spotlight-off (500ms). The leading answer takes Sunrise again."); return false; }
    var t = this._target(false); if (!t) return false;
    var red = CL.reduced(this.tv);
    var spot = h("div", "cwl-spot");
    spot.innerHTML = '<div class="cwl-spot-eyebrow">Spotlight</div>' + esc(t.text) + '<div class="cwl-spot-meta"><span>' + esc(t.meta) + '</span></div>';
    this.tv.appendChild(spot); this.tv.classList.add("has-spot");
    this.scrim.style.transitionDuration = red ? "0ms" : "";
    this.scrim.classList.add("is-on");
    if (!red) spot.animate([{ opacity: 0, transform: "translate(-50%,-46%) scale(0.94)" }, { opacity: 1, transform: "translate(-50%,-50%)" }], { duration: ms("cwl-dur-spotlight-on"), easing: CL.v("cwl-ease-calm"), fill: "backwards" });
    this.spot = spot;
    this.emit("onCaption", "Spotlight on over cwl-dur-spotlight-on (600ms) on cwl-ease-calm: the item lifts in Sunrise and the room recedes behind the Navy scrim. Sunrise priority: spotlight outranks the leading answer, which takes its normal color.");
    return true;
  };
  LiveRoom.prototype._clearSpot = function (instant) {
    var sp = this.spot, self = this; this.spot = null;
    this.scrim.classList.remove("is-on");
    if (!sp) { this.tv.classList.remove("has-spot"); return; }
    if (instant || CL.reduced(this.tv)) { sp.remove(); this.tv.classList.remove("has-spot"); return; }
    sp.animate([{ opacity: 1, transform: "translate(-50%,-50%)" }, { opacity: 0, transform: "translate(-50%,-46%) scale(0.94)" }], { duration: ms("cwl-dur-spotlight-off"), easing: CL.v("cwl-ease-calm"), fill: "forwards" }).onfinish = function () { sp.remove(); if (!self.spot) self.tv.classList.remove("has-spot"); };
  };

  LiveRoom.prototype.hide = function () {
    if (this.spot) this._clearSpot();
    var t = this._target(true); if (!t || !t.el) return;
    var el = t.el, self = this, container = this.kind === "cloud" ? this.cloud.querySelector(".cwl-cloud-anchors") : this.wall;
    if (this.kind === "cloud") { this.hidden[t.text] = true; if (el.parentNode !== container) container = el.parentNode; }
    var idx = Array.prototype.indexOf.call(container.children, el);
    this.hiddenStack.push({ text: t.text, idx: idx, kind: this.kind });
    if (this.kind === "wall") { var ans = this.answers.filter(function (a) { return a.text === t.text && !a.hidden; }).pop(); if (ans) ans.hidden = true; setTimeout(function () { self._regroup(); }, 800); }
    if (this.kind === "cloud") cloudUpdate(this.cloud, this._wordList(null)); else this.feed.remove(el);
    this.emit("onCaption", "Hide: '" + t.text + "' fades where it stands and its neighbours drift gently into the space. It stays in the record, marked hidden, and the count doesn't change." + (this.kind === "wall" ? " On the wall its group recounts a moment later." : ""));
    return t.text;
  };
  LiveRoom.prototype.unhide = function () {
    var x = this.hiddenStack.pop(); if (!x || x.kind !== this.kind) return;
    if (this.kind === "cloud") { delete this.hidden[x.text]; cloudUpdate(this.cloud, this._wordList(null)); }
    else {
      var feed = this.wall, row = this._row(x.text), self = this;
      var ans = this.answers.filter(function (a) { return a.text === x.text && a.hidden; }).pop(); if (ans) ans.hidden = false;
      this.feed.insertAt(row, x.idx);
      setTimeout(function () { self._regroup(); }, 800);
    }
    this.emit("onCaption", "Unhide: '" + x.text + "' arrives back where it was and the wall makes room.");
  };

  /* ---------- Phones down ---------- */
  LiveRoom.prototype.setPhonesDown = function (down, quiet) {
    this.state.phonesDown = down;
    this.liveMarker.classList.toggle("is-off", down);
    this.downPill.classList.toggle("is-off", !down);
    if (this.phone) this.phone.setDown(down);
    if (!quiet) this.emit("onCaption", down ? "Phones down: the TV holds still and keeps its last content; the LIVE marker cross-fades to a quiet Phones down pill. Phones dim to cwl-text-muted over cwl-dur-phones-dim (300ms) and take the offset pattern." : "Phones open: the LIVE marker returns and phones brighten. Nothing on the TV moved.");
  };

  /* ---------- Reconnecting: the TV keeps its last state, then animates to the current one ---------- */
  LiveRoom.prototype.setOffline = function (off, quiet) {
    var self = this;
    this.state.offline = off;
    this.reconnectMark.classList.toggle("is-off", !off);
    if (this.phone) this.phone.setOffline(off);
    clearInterval(this._others);
    if (off) {
      this._others = setInterval(function () { if (!self.state.phonesDown) self.receive(self.nextOne()); }, 1600);
      if (!quiet) this.emit("onCaption", "Venue wifi dropped. The TV keeps its last state with a small Reconnecting mark (24px, readable up close only). Phones keep taking answers and mark each one Saved on this phone.");
      return;
    }
    var saved = this.phone ? this.phone.flush() : [];
    var all = saved.concat(this.pendingTv); this.pendingTv = [];
    if (!all.length) { if (!quiet) this.emit("onCaption", "Reconnected. Nothing was missed, so nothing on the TV moved."); return; }
    /* Replay after a reconnect: exempt from the stagger. One pass, animated from the last state. */
    this.state.total += all.length;
    this._count(this.state.total);
    if (this.kind === "cloud") {
      all.forEach(function (w) { if (self.words[w] == null) { self.words[w] = 0; self.order.push(w); } self.words[w]++; });
      cloudUpdate(this.cloud, this._wordList(all.length === 1 ? all[0] : null));
    } else {
      this._applyCards(all, all.length === 1);
    }
    if (!quiet) this.emit("onCaption", "Reconnected. The " + all.length + " missed answer" + (all.length === 1 ? "" : "s") + " (this phone's saved ones first, in the order written) arrived in one pass from the TV's last state, exempt from the stagger. The Reconnecting mark faded out. Nothing redrew.");
  };

  LiveRoom.prototype.setReduced = function (on) {
    var v = on ? "reduced" : "full";
    this.tv.setAttribute("data-motion", v);
    if (this.phone) this.phone.el.setAttribute("data-motion", v);
  };

  /* ---------- The participant phone ---------- */
  function PhoneView(box, opts) {
    opts = opts || {};
    this.el = CL.phone(box, "dark");
    this.saved = [];
    var ph = this.el;
    CL.screenTexture(ph, "phone-answering");
    var head = h("div", "cwl-ph-head");
    head.innerHTML = '<span class="cwl-ph-church">' + esc(ROOM.church) + '</span><span class="p2-marker-slot"><span class="cwl-live-marker">Live</span><span class="cwl-marker is-off">' + L("smartphone") + ' Phones down</span><span class="cwl-marker is-off">' + L("wifi-off") + ' Offline</span></span>';
    ph.appendChild(head);
    var m = head.querySelectorAll(".p2-marker-slot > *");
    this.mLive = m[0]; this.mDown = m[1]; this.mOff = m[2];
    var body = h("div", "cwl-ph-body"); ph.appendChild(body);
    body.innerHTML = '<div class="cwl-ph-prompt cwl-dimmable"></div>' +
      '<div class="cwl-phones-down p2-ph-down is-off">' + L("smartphone") + ' Phones down</div>' +
      '<div><span class="cwl-marker">' + L("eye-off") + ' Anonymous on the screen</span></div>' +
      '<div class="p2-ph-list"></div>';
    var foot = h("div", "cwl-ph-foot"); ph.appendChild(foot);
    foot.innerHTML = '<div class="cwl-ph-input p2-ph-typing cwl-dimmable" aria-label="Your answer" role="textbox" aria-readonly="true"></div><div class="cwl-ph-count"><span class="p2-hint">Up to 3 words</span><span class="p2-cnt">0 / 28</span></div><button class="cwl-btn" type="button" tabindex="-1">' + L("send") + ' Send</button>';
    this.prompt = body.querySelector(".cwl-ph-prompt");
    this.down = body.querySelector(".p2-ph-down");
    this.list = body.querySelector(".p2-ph-list");
    this.input = foot.querySelector(".p2-ph-typing");
    this.cnt = foot.querySelector(".p2-cnt"); this.hint = foot.querySelector(".p2-hint");
    this.btn = foot.querySelector(".cwl-btn");
    this.body = body;
  }
  PhoneView.prototype.setSession = function (S) {
    this.prompt.textContent = S.prompt;
    this.list.innerHTML = ""; this.saved = [];
    this.limit = S.kind === "cloud" ? 28 : 280;
    this.hint.textContent = S.kind === "cloud" ? "Up to 3 words" : "A sentence or two";
    this.cnt.textContent = "0 / " + this.limit;
    CL.arrive(this.body);
  };
  PhoneView.prototype.typeAndSend = function (text, done) {
    var self = this, i = 0, step = Math.max(12, Math.min(28, 420 / text.length));
    clearInterval(this._typing);
    this.input.classList.add("is-typing");
    this._typing = setInterval(function () {
      i++; self.input.textContent = text.slice(0, i); self.cnt.textContent = i + " / " + self.limit;
      if (i >= text.length) {
        clearInterval(self._typing); self.input.classList.remove("is-typing");
        setTimeout(function () { self._sent(text); self.input.textContent = ""; self.cnt.textContent = "0 / " + self.limit; done(); }, 160);
      }
    }, step);
  };
  PhoneView.prototype._sent = function (text) {
    var offline = this.offline;
    var row = h("div", "cwl-ph-answer cwl-dimmable");
    row.innerHTML = "<span>" + esc(text) + '</span><span class="cwl-ph-status">' + (offline ? L("wifi-off") + " Saved on this phone" : L("check") + " Sent") + "</span>";
    var list = this.list;
    CL.flip(list, function () { list.appendChild(row); while (list.children.length > 4) list.removeChild(list.firstChild); });
    if (offline) this.saved.push({ text: text, row: row });
    CL.icons();
  };
  PhoneView.prototype.setDown = function (down) {
    this.el.classList.toggle("is-dimmed", down);
    CL.screenTexture(this.el, down ? "phone-waiting" : "phone-answering", { fade: true });
    this.down.classList.toggle("is-off", !down);
    this._markers();
    this.btn.disabled = down;
    this._isDown = down;
  };
  PhoneView.prototype.setOffline = function (off) { this.offline = off; this._markers(); };
  PhoneView.prototype._markers = function () {
    var d = this.el.classList.contains("is-dimmed");
    this.mLive.classList.toggle("is-off", d || !!this.offline);
    this.mDown.classList.toggle("is-off", !d);
    this.mOff.classList.toggle("is-off", d || !this.offline);
  };
  /* Unsent answers go out in the order they were written; each turns to Sent in place. */
  PhoneView.prototype.flush = function () {
    var out = this.saved.map(function (s) { return s.text; });
    this.saved.forEach(function (s) { var st = s.row.querySelector(".cwl-ph-status"); if (st) { st.innerHTML = L("check") + " Sent"; } });
    this.saved = []; CL.icons();
    return out;
  };

  window.ClearwayLivePass2 = { ROOM: ROOM, lockup: lockup, Field: Field, Feed: Feed, Chips: Chips, SESSIONS: SESSIONS, LiveRoom: LiveRoom, PhoneView: PhoneView };
})();
