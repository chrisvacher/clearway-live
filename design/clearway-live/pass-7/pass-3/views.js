/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 3 · views.js
   window.ClearwayLivePass3: the interaction library on the TV, built on
   pass 2's motion model. Every view is built once and only ever moves from
   its current state to the next: rows, bars, columns, dots and names are
   driven by one critically damped spring per value, retargeted without
   resetting its speed. Durations come from tokens (settle time T gives the
   spring rate 6.6 / T). Reduced motion: every value takes its target at once.
   Uses only ClearwayLive (bundle.js) and ClearwayLivePass2 (live-room.js).
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P2 = window.ClearwayLivePass2, h = CL.h, esc = CL.esc, L = CL.lucide;
  function ms(n) { return CL.ms(n); }
  function rate(tok) { return 6.6 / (ms(tok) / 1000); }
  function springStep(x, v, target, w, dt) {
    var d = x - target, e = Math.exp(-w * dt);
    return [target + (d + (v + w * d) * dt) * e, (v - w * (v + w * d) * dt) * e];
  }
  function sp(x) { return { x: x, v: 0, t: x }; }
  function run(s, w, dt, snap) {
    if (snap) { s.x = s.t; s.v = 0; return true; }
    if (Math.abs(s.x - s.t) < 0.05 && Math.abs(s.v) < 0.05) { s.x = s.t; s.v = 0; return true; }
    var r = springStep(s.x, s.v, s.t, w, dt); s.x = r[0]; s.v = r[1]; return false;
  }

  /* One frame loop for every view on the page. A ticker is dropped once its element has left the page. */
  var tickers = [], last = performance.now();
  function onTick(el, fn) { tickers.push({ el: el, fn: fn, seen: false }); }
  (function loop(now) {
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    tickers = tickers.filter(function (t) { if (t.el.isConnected) t.seen = true; return t.el.isConnected || !t.seen; });
    for (var i = 0; i < tickers.length; i++) if (tickers[i].el.isConnected) { try { tickers[i].fn(dt, now); } catch (e) { if (window.console) console.error(e); } }
    requestAnimationFrame(loop);
  })(last);

  function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function pct(n, of) { return of ? Math.round(n / of * 100) : 0; }

  /* ================================================================
     The TV shell: lockup, count, LIVE marker, phones down, reconnecting,
     the prompt and a host for the interaction. Built once per TV.
     ================================================================ */
  function Shell(box, o) {
    o = o || {};
    var tv = this.tv = CL.stage(box, o.theme || "dark");
    if (o.room) tv.setAttribute("data-room", o.room);
    if (o.motion) tv.setAttribute("data-motion", o.motion);
    CL.screenTexture(tv, "input");
    var top = h("div", "cwl-tv-top");
    top.innerHTML = P2.lockup() + '<span class="p2-right"><span class="p3-top-extra"></span>' +
      '<span class="p2-marker-slot">' + CL.liveMark("live", true) + '<span class="cwl-state-pill is-off" role="img" aria-label="Phones down">' + CL.quietMark() + '</span><span class="cwl-state-pill p3-closed is-off">' + CL.quietMark() + ' <span>Closed</span></span></span></span>';
    tv.appendChild(top);
    var foot = h("div", "cwl-tv-foot");
    foot.innerHTML = '<span class="p3-foot-left"></span><span class="cwl-tv-foot-right"><span class="p2-reconnect is-off" hidden></span><span class="cwl-tally"><span class="cwl-tally-n">0</span> <span class="p3-unit"></span></span></span>';
    tv.appendChild(foot);
    this.scrim = h("div", "cwl-scrim"); tv.appendChild(this.scrim);
    var c = this.content = h("div", "cwl-tv-content");
    c.innerHTML = '<div class="p3-head"><div class="cwl-tv-eyebrow"></div><div class="cwl-tv-headline"></div></div><div class="p3-host"></div>';
    tv.appendChild(c);
    this.host = c.querySelector(".p3-host");
    this.eyebrowEl = c.querySelector(".cwl-tv-eyebrow"); this.headEl = c.querySelector(".cwl-tv-headline");
    this.tallyN = foot.querySelector(".cwl-tally-n"); this.unitEl = foot.querySelector(".p3-unit"); this.extra = top.querySelector(".p3-top-extra");
    this.live = top.querySelector(".cwl-live-marker"); this.downPill = top.querySelector(".cwl-state-pill"); this.closedPill = top.querySelector(".p3-closed");
    this.reconnect = foot.querySelector(".p2-reconnect"); this.footLeft = foot.querySelector(".p3-foot-left");
    this.cnt = sp(0); this.shown = -1;
    var self = this;
    onTick(tv, function (dt) {
      var snap = CL.reduced(tv);
      run(self.cnt, rate("cwl-dur-make-room"), dt, snap);
      var n = Math.round(self.cnt.x);
      if (n !== self.shown) { self.shown = n; self.tallyN.textContent = n; }
    });
    this.prompt(o.eyebrow || "", o.headline || "");
    this.count(o.count || 0, o.unit || "answers", true);
    if (o.tally === false) foot.querySelector(".cwl-tally").style.display = "none";
  }
  Shell.prototype.prompt = function (eyebrow, headline) { this.eyebrowEl.textContent = eyebrow; this.headEl.innerHTML = headline; this.eyebrowEl.style.display = eyebrow ? "" : "none"; };
  Shell.prototype.count = function (n, unit, instant) { this.cnt.t = n; if (instant) { this.cnt.x = n; this.cnt.v = 0; } if (unit) this.unitEl.textContent = unit; };
  Shell.prototype.state = function (s) {
    s = s || {};
    this.live.classList.toggle("is-off", !!(s.down || s.closed));
    this.downPill.classList.toggle("is-off", !s.down || !!s.closed);
    this.closedPill.classList.toggle("is-off", !s.closed);
    if (s.closed) this.closedPill.querySelector("span").textContent = s.closedLabel || "Closed";
    this.reconnect.classList.toggle("is-off", !s.offline);
    this.live.classList.toggle("is-offline", !!s.offline); this.live.classList.toggle("is-reconnecting", !!s.offline);
    this.live.setAttribute("aria-label", s.offline ? "Reconnecting" : "Live");
    this.handoff(!!s.handoff);
  };
  Shell.prototype.handoff = function (on) { this.live.classList.toggle("is-handed-off", on); };
  /* A lone arrival takes the screen's Lime moment for cwl-dur-new-hold; the LIVE mark turns Off-White meanwhile. */
  Shell.prototype.moment = function (el, cls) {
    var self = this; cls = cls || "is-new";
    if (!el) return;
    el.classList.add(cls); this.handoff(true);
    clearTimeout(this._mt);
    this._mt = setTimeout(function () { el.classList.remove(cls); self.handoff(false); }, ms("cwl-dur-new-hold"));
  };
  Shell.prototype.foot = function (html) { this.footLeft.innerHTML = html || ""; CL.icons(); };
  Shell.prototype.spotlight = function (html, meta, eyebrow) {
    var tv = this.tv, red = CL.reduced(tv), self = this;
    if (this.spot) {
      var old = this.spot; this.spot = null; this.scrim.classList.remove("is-on");
      if (red) { old.remove(); tv.classList.remove("has-spot"); }
      else old.animate([{ opacity: 1, transform: "translate(-50%,-50%)" }, { opacity: 0, transform: "translate(-50%,-46%) scale(0.94)" }], { duration: ms("cwl-dur-spotlight-off"), easing: CL.v("cwl-ease-calm"), fill: "forwards" }).onfinish = function () { old.remove(); if (!self.spot) tv.classList.remove("has-spot"); };
    }
    if (html == null) return;
    var s = h("div", "cwl-spot");
    s.innerHTML = '<div class="cwl-spot-eyebrow">' + esc(eyebrow || "Spotlight") + "</div>" + html + (meta ? '<div class="cwl-spot-meta"><span>' + meta + "</span></div>" : "");
    tv.appendChild(s); tv.classList.add("has-spot"); this.scrim.classList.add("is-on");
    if (!red) s.animate([{ opacity: 0, transform: "translate(-50%,-46%) scale(0.94)" }, { opacity: 1, transform: "translate(-50%,-50%)" }], { duration: ms("cwl-dur-spotlight-on"), easing: CL.v("cwl-ease-calm"), fill: "backwards" });
    this.spot = s; CL.icons();
  };
  Shell.prototype.waiting = function (on, text) {
    if (!this.wait) { this.wait = h("div", "p3-waiting"); this.host.appendChild(this.wait); }
    this.wait.textContent = text || "Waiting for answers";
    this.wait.classList.toggle("is-off", !on);
  };

  /* ================================================================
     BARS · INT-04 multiple choice, INT-06 ranking, INT-07 100 points
     Rows hold their own place; each row's position and its bar's length
     are springs. Rows glide to their new rank on cwl-dur-bar-trade; bars
     grow from their previous value on cwl-dur-bar-grow; only a session's
     first appearance grows from zero. The cut line sits at the boundary
     after row N and moves only when the rows' layout changes, on
     cwl-dur-cut-line, so a bar crossing it and the line read as one motion.
     ================================================================ */
  function Bars(host, o) {
    this.o = o || {};
    var el = this.el = h("div", "p3-bars" + (this.o.place ? " has-place" : ""));
    host.appendChild(el);
    this.cut = h("div", "p3-cut", '<span class="p3-cut-label"></span>'); this.cut.style.display = "none"; el.appendChild(this.cut);
    this.cutY = sp(0); this.rows = {}; this.first = true;
    var self = this;
    onTick(el, function (dt) {
      var snap = CL.reduced(el), wT = rate("cwl-dur-bar-trade"), wG = rate("cwl-dur-bar-grow"), wC = rate("cwl-dur-cut-line");
      Object.keys(self.rows).forEach(function (id) {
        var r = self.rows[id];
        run(r.y, wT, dt, snap); run(r.w, wG, dt, snap);
        r.el.style.transform = "translateY(" + r.y.x.toFixed(2) + "px)";
        r.fill.style.width = Math.max(0, Math.min(100, r.w.x)).toFixed(3) + "%";
      });
      run(self.cutY, wC, dt, snap);
      self.cut.style.transform = "translateY(" + self.cutY.x.toFixed(2) + "px)";
    });
  }
  /* items: [{id, label, frac 0..1, value html, leader, place}] in display order. o: {cut, cutLabel, instant} */
  Bars.prototype.set = function (items, o) {
    o = o || {};
    var self = this, el = this.el, H = el.clientHeight || 640, n = Math.max(items.length, 1);
    var rowH = Math.min(this.o.maxRow || 104, H / n), barH = Math.max(36, Math.min(76, rowH - 22));
    el.style.setProperty("--p3-bar-h", barH + "px");
    el.style.setProperty("--p3-label-fs", rowH >= 92 && !this.o.floorLabels ? "var(--cwl-fs-tv-body)" : "var(--cwl-fs-tv-floor)");
    if (this.o.labelW) el.style.setProperty("--p3-label-w", this.o.labelW + "px");
    if (this.o.valueW) el.style.setProperty("--p3-value-w", this.o.valueW + "px");
    var keep = {};
    items.forEach(function (it, i) {
      keep[it.id] = true;
      var r = self.rows[it.id], fresh = !r;
      if (fresh) {
        var row = h("div", "p3-bar" + (self.o.place ? " has-place" : ""));
        row.innerHTML = (self.o.place ? '<span class="p3-place"></span>' : "") + '<div class="cwl-bar-label"></div><div class="cwl-bar-track"><div class="cwl-bar-fill"></div></div><div class="p3-val"></div>';
        el.insertBefore(row, self.cut);
        r = self.rows[it.id] = { el: row, fill: row.querySelector(".cwl-bar-fill"), y: sp(i * rowH), w: sp(0) };
        if (!self.first && !o.instant) CL.arrive(row);
      }
      r.el.style.height = rowH + "px";
      r.el.querySelector(".cwl-bar-label").textContent = it.label;
      if (self.o.place) r.el.querySelector(".p3-place").textContent = it.place != null ? it.place : i + 1;
      r.el.querySelector(".p3-val").innerHTML = it.value;
      r.el.classList.toggle("is-leader", !!it.leader);
      r.y.t = i * rowH; r.w.t = Math.max(0, Math.min(1, it.frac)) * 100;
      if (o.instant) { r.y.x = r.y.t; r.w.x = r.w.t; r.y.v = r.w.v = 0; }
      if (fresh && !o.instant && self.first) { r.y.x = r.y.t; }
    });
    Object.keys(this.rows).forEach(function (id) { if (!keep[id]) { var r = self.rows[id]; delete self.rows[id]; CL.leave(r.el, function () { r.el.remove(); }); } });
    var c = o.cut;
    el.style.setProperty("--p3-cut-w", c && c < items.length ? "240px" : "0px");
    if (c && c < items.length) {
      this.cut.style.display = "";
      this.cut.querySelector(".p3-cut-label").textContent = o.cutLabel || ("Top " + c);
      this.cutY.t = c * rowH - 2;
      if (this.cutFirst !== false || o.instant) { this.cutY.x = this.cutY.t; this.cutFirst = false; }
    } else { this.cut.style.display = "none"; this.cutFirst = true; }
    this.first = false;
  };
  Bars.prototype.rowEl = function (id) { return this.rows[id] && this.rows[id].el; };

  /* Choice results: "n · %", leader on top in Sunrise (ties share it). For pick any, % is of people answering. */
  function choiceItems(opts, counts, people) {
    var total = people != null ? people : counts.reduce(function (a, b) { return a + b; }, 0);
    var max = Math.max.apply(null, counts.concat([0]));
    var list = opts.map(function (lab, i) { return { id: "o" + i, label: lab, n: counts[i], i: i }; });
    list.sort(function (a, b) { return b.n - a.n || a.i - b.i; });
    return list.map(function (x) {
      return { id: x.id, label: x.label, frac: max ? x.n / max : 0, leader: max > 0 && x.n === max, value: x.n + " <small>·</small> " + pct(x.n, total) + "%" };
    });
  }
  /* Ranking results: ordered by average place; unranked options take the middle of the remaining places. */
  function rankItems(opts, rankings) {
    var n = opts.length, sums = opts.map(function () { return 0; }), people = rankings.length;
    rankings.forEach(function (r) {
      var rest = n - r.length, mid = r.length + (rest + 1) / 2;
      opts.forEach(function (o, i) { var p = r.indexOf(i); sums[i] += p >= 0 ? p + 1 : mid; });
    });
    var list = opts.map(function (lab, i) { return { id: "o" + i, label: lab, avg: people ? sums[i] / people : 0, i: i }; });
    list.sort(function (a, b) { return a.avg - b.avg || a.i - b.i; });
    var best = list.length ? list[0].avg : 0;
    return list.map(function (x, k) {
      return { id: x.id, label: x.label, place: k + 1, frac: people ? (n + 1 - x.avg) / n : 0, leader: people > 0 && x.avg === best, value: people ? "avg " + fmt1(x.avg) : "<small>No rankings yet</small>" };
    });
  }
  /* Statements: each statement's average agreement (1 to 5), highest first, leader in Sunrise (ties share it).
     counts: per statement, how many chose 1..5. The bar runs from 1 (empty) to 5 (full). */
  function statementItems(stmts, counts) {
    var list = stmts.map(function (lab, i) {
      var c = counts[i] || [0, 0, 0, 0, 0], n = c.reduce(function (a, b) { return a + b; }, 0);
      var avg = n ? c.reduce(function (a, b, k) { return a + b * (k + 1); }, 0) / n : 0;
      return { id: "s" + i, label: lab, n: n, avg: avg, agree: n ? (c[3] + c[4]) / n : 0, i: i };
    });
    list.sort(function (a, b) { return b.avg - a.avg || a.i - b.i; });
    var best = list.length ? list[0].avg : 0;
    return list.map(function (x) {
      return { id: x.id, label: x.label, n: x.n, avg: x.avg, frac: x.n ? (x.avg - 1) / 4 : 0, leader: x.n > 0 && x.avg === best,
        value: x.n ? fmt1(x.avg) + " <small>· " + Math.round(x.agree * 100) + "% agree</small>" : "<small>No answers yet</small>" };
    });
  }
  /* 100 points: each option's share of the room's points. Only complete budgets count. */
  function pointsItems(opts, alloc) {
    var tot = opts.map(function () { return 0; }), all = 0;
    alloc.forEach(function (a) { var s = a.reduce(function (x, y) { return x + y; }, 0); if (s !== 100) return; a.forEach(function (v, i) { tot[i] += v; all += v; }); });
    var list = opts.map(function (lab, i) { return { id: "o" + i, label: lab, pts: tot[i], i: i }; });
    list.sort(function (a, b) { return b.pts - a.pts || a.i - b.i; });
    var max = list.length ? list[0].pts : 0;
    return list.map(function (x) { return { id: x.id, label: x.label, frac: max ? x.pts / max : 0, leader: max > 0 && x.pts === max, value: (all ? Math.round(x.pts / all * 100) : 0) + "%" }; });
  }

  /* ================================================================
     SCALE · INT-05. The average large, the spread as live columns, and an
     average marker that slides along the axis. Columns grow from their
     previous height on cwl-dur-bar-grow; the marker rides the same spring.
     ================================================================ */
  function Scale(host, o) {
    o = o || {};
    this.max = o.max || 5; this.lo = o.lo || "Not at all"; this.hi = o.hi || "Completely";
    var el = this.el = h("div", "p3-scale"); host.appendChild(el);
    var cols = "", axis = "";
    for (var i = 1; i <= this.max; i++) { cols += '<div class="p3-col"><b>0</b><i></i></div>'; axis += "<span>" + i + "</span>"; }
    el.innerHTML = '<div class="p3-scale-avg"><div class="cwl-big-number is-callout">0.0</div><div class="p3-of"></div></div>' +
      '<div class="p3-chart"><div class="p3-cols">' + cols + '<div class="p3-marker is-off"><span>0.0</span></div></div><div class="p3-axis">' + axis + '</div><div class="p3-ends"><span>1 · ' + esc(this.lo) + '</span><span>' + this.max + " · " + esc(this.hi) + "</span></div></div>";
    this.big = el.querySelector(".cwl-big-number"); this.of = el.querySelector(".p3-of");
    this.colEls = Array.prototype.slice.call(el.querySelectorAll(".p3-col")); this.marker = el.querySelector(".p3-marker");
    this.h = this.colEls.map(function () { return sp(0); }); this.avg = sp(1); this.lastTxt = "";
    var self = this;
    onTick(el, function (dt) {
      var snap = CL.reduced(el), wG = rate("cwl-dur-bar-grow"), H = self.colEls[0].clientHeight - 128;
      self.h.forEach(function (s, i) {
        run(s, wG, dt, snap);
        var px = Math.max(0, s.x) * H;
        self.colEls[i].querySelector("i").style.height = px.toFixed(2) + "px";
        self.colEls[i].querySelector("b").style.transform = "translateY(" + (-px - 12).toFixed(2) + "px)";
      });
      run(self.avg, wG, dt, snap);
      var colsEl = el.querySelector(".p3-cols"), W = colsEl.clientWidth, gap = 20, cw = (W - gap * (self.max - 1)) / self.max;
      var x = (self.avg.x - 1) * (cw + gap) + cw / 2;
      self.marker.style.transform = "translateX(" + x.toFixed(2) + "px)";
      var t = fmt1(self.avg.x);
      if (self.n > 0 && t !== self.lastTxt) { self.lastTxt = t; self.big.textContent = t; self.marker.querySelector("span").textContent = t; }
    });
  }
  Scale.prototype.set = function (counts, people, o) {
    o = o || {};
    var n = counts.reduce(function (a, b) { return a + b; }, 0), sum = counts.reduce(function (a, c, i) { return a + c * (i + 1); }, 0);
    var mx = Math.max.apply(null, counts.concat([1])), self = this;
    this.n = n;
    counts.forEach(function (c, i) { self.h[i].t = c / mx; self.colEls[i].querySelector("b").textContent = c; if (o.instant) { self.h[i].x = self.h[i].t; } });
    if (n) {
      var a = sum / n; if (this.avg.x === 1 && this.avg.t === 1 && !o.instant && this.fresh !== false) this.avg.x = a;
      this.avg.t = a; if (o.instant) this.avg.x = a; this.fresh = false;
      this.big.style.display = ""; this.marker.classList.remove("is-off");
      this.of.textContent = "average of " + n;
      if (this.none) { this.none.remove(); this.none = null; }
    } else {
      this.big.style.display = "none"; this.marker.classList.add("is-off");
      this.of.textContent = "";
      if (!this.none) { this.none = h("div", "p3-none", "No average yet"); this.big.parentNode.insertBefore(this.none, this.big); }
    }
  };

  /* ================================================================
     Q&A · INT-03. The top three questions, ranked by people (each person
     who asked a folded question counts 2, each other voter 1, ties to the
     most recent activity). Rows glide on cwl-dur-bar-trade; a fold glides
     the folded question into its survivor and fades it; Answered fades the
     row on cwl-dur-hide and the rest rise into its place.
     ================================================================ */
  function QA(host, o) {
    this.o = o || {}; this.top = this.o.top || 3;
    var el = this.el = h("div", "p3-qa"); host.appendChild(el);
    this.more = h("div", "p3-qa-more"); el.appendChild(this.more);
    this.rows = {};
    var self = this;
    onTick(el, function (dt) {
      var snap = CL.reduced(el), w = rate("cwl-dur-bar-trade");
      Object.keys(self.rows).forEach(function (id) {
        var r = self.rows[id]; run(r.y, w, dt, snap); run(r.o, rate("cwl-dur-make-room"), dt, snap);
        r.el.style.transform = "translateY(" + r.y.x.toFixed(2) + "px)";
        r.el.style.opacity = r.o.x >= 0.999 ? "" : Math.max(0, r.o.x).toFixed(3);
        if (r.going && r.o.x < 0.02) { r.el.remove(); delete self.rows[id]; }
      });
    });
  }
  function qaScore(q) { return (q.askers || 1) * 2 + (q.votes || 0); }
  /* qs: [{id, text, askers, votes, ai, answered, t}] */
  QA.prototype.set = function (qs, o) {
    o = o || {};
    var self = this, el = this.el, H = el.clientHeight || 700;
    var live = qs.filter(function (q) { return !q.answered && !q.folded; }).slice().sort(function (a, b) { return qaScore(b) - qaScore(a) || (b.t || 0) - (a.t || 0); });
    var shown = live.slice(0, this.top), rest = live.length - shown.length, rowH = Math.floor((H - 64) / this.top);
    el.style.setProperty("--p3-q-fs", rowH < 200 ? "var(--cwl-fs-tv-body)" : "var(--cwl-fs-tv-main)");
    var keep = {};
    shown.forEach(function (q, i) {
      keep[q.id] = true;
      var r = self.rows[q.id];
      if (!r || r.going) {
        if (r) r.el.remove();
        var row = h("div", "p3-q"); row.innerHTML = '<div class="p3-q-votes">' + L("arrow-up") + '<b></b></div><div><div class="p3-q-text"></div><div class="p3-q-meta"></div></div>';
        el.insertBefore(row, self.more);
        r = self.rows[q.id] = { el: row, y: sp(o.from != null ? o.from : i * rowH), o: sp(o.instant ? 1 : 0) };
        if (o.instant) r.y.x = i * rowH;
      }
      r.el.style.height = rowH + "px";
      r.el.classList.toggle("is-first", i === 0);
      r.el.querySelector(".p3-q-votes b").textContent = (q.votes || 0) + (q.askers || 1);
      r.el.querySelector(".p3-q-text").textContent = q.text;
      var meta = [];
      if (q.askers > 1) meta.push((q.ai ? '<span class="p3-ai-line">' + CL.aiBadge() + " Combined</span> · " : "") + "asked by " + q.askers);
      r.el.querySelector(".p3-q-meta").innerHTML = meta.join("");
      r.y.t = i * rowH; r.o.t = 1; r.going = false;
      if (o.instant) { r.y.x = r.y.t; r.o.x = 1; }
    });
    Object.keys(this.rows).forEach(function (id) {
      if (keep[id]) return;
      var r = self.rows[id], q = qs.filter(function (x) { return x.id === id; })[0];
      r.going = true; r.o.t = 0;
      if (q && q.folded && self.rows[q.folded]) r.y.t = self.rows[q.folded].y.t; /* folds glide into their survivor */
      else if (q && !q.answered) r.y.t = H; /* pushed below the top three: slides down as it fades */
    });
    this.more.innerHTML = rest > 0 ? L("smartphone") + " + " + rest + " more on your phones" : "";
    this.more.style.opacity = rest > 0 ? "1" : "0";
    CL.icons();
    return shown;
  };

  /* ================================================================
     2x2 GRID · INT-08 (and the pre-mortem grid in milestone 4)
     Each item is a numbered dot at the room's average, sized by how many
     placed it. Faint individual placements sit behind once two people have
     placed an item. Overlapping dots ease apart: their drawn positions are
     relaxed away from each other and every dot glides on the regroup spring.
     A duplicate merges: its dot glides into the survivor and fades while the
     survivor grows. The legend beside the plot keeps labels off the plot.
     ================================================================ */
  /* Item colors for the 2x2 grid: the ten-color item palette (cwl-item-1 to -10) in number order, repeating past ten.
     It goes beyond the brand colors so participants can tell items apart at a glance; the number always rides on the color. */
  function gridColor(num) { return "cwl-i" + (((num - 1) % 10) + 1); }
  function Grid(host, o) {
    o = o || {};
    var el = this.el = h("div", "p3-grid"); host.appendChild(el);
    el.innerHTML = '<div class="p3-plotwrap"><div class="p3-yname"><span>' + esc(o.yLo || "Low") + '</span><span class="n">' + esc(o.y || "Impact") + '</span><span>' + esc(o.yHi || "High") + '</span></div>' +
      '<div class="p3-plot"><div class="p3-mid-x"></div><div class="p3-mid-y"></div></div>' +
      '<div class="p3-xname"><span>' + esc(o.xLo || "Low") + '</span><span class="n">' + esc(o.x || "Effort") + '</span><span>' + esc(o.xHi || "High") + "</span></div></div>" +
      '<div class="p3-legend"><div class="p3-legend-head">' + esc(o.legend || "Items") + "</div></div>";
    this.plot = el.querySelector(".p3-plot"); this.legend = el.querySelector(".p3-legend");
    this.dots = {}; this.faint = {}; this.legs = {};
    var self = this;
    onTick(el, function (dt) {
      var snap = CL.reduced(el), w = rate("cwl-dur-regroup"), wo = rate("cwl-dur-make-room");
      Object.keys(self.dots).forEach(function (id) {
        var d = self.dots[id]; run(d.x, w, dt, snap); run(d.y, w, dt, snap); run(d.r, w, dt, snap); run(d.o, wo, dt, snap);
        var r = d.r.x;
        d.el.style.width = d.el.style.height = (2 * r).toFixed(2) + "px";
        d.el.style.transform = "translate(" + (d.x.x - r).toFixed(2) + "px," + (d.y.x - r).toFixed(2) + "px)";
        d.el.style.opacity = d.o.x >= 0.999 ? "" : Math.max(0, d.o.x).toFixed(3);
        if (d.going && d.o.x < 0.02) { d.el.remove(); delete self.dots[id]; }
      });
      Object.keys(self.faint).forEach(function (k) {
        var f = self.faint[k]; run(f.x, w, dt, snap); run(f.y, w, dt, snap); run(f.o, wo, dt, snap);
        f.el.style.transform = "translate(" + f.x.x.toFixed(2) + "px," + f.y.x.toFixed(2) + "px)";
        f.el.style.opacity = (Math.max(0, f.o.x) * parseFloat(CL.v("cwl-faint") || 0.32)).toFixed(3);
        if (f.going && f.o.x < 0.02) { f.el.remove(); delete self.faint[k]; }
      });
    });
  }
  /* items: [{id, num, label, places:[[x,y] 0..1], into?}] */
  Grid.prototype.set = function (items, o) {
    o = o || {};
    var self = this, W = this.plot.clientWidth || 1000, H = this.plot.clientHeight || 640, keep = {}, keepF = {};
    var maxC = Math.max.apply(null, items.map(function (i) { return i.places.length; }).concat([1]));
    var live = items.filter(function (i) { return !i.into && i.places.length; });
    var pos = live.map(function (it) {
      var ax = 0, ay = 0; it.places.forEach(function (p) { ax += p[0]; ay += p[1]; });
      ax /= it.places.length; ay /= it.places.length;
      var r = 34 + 30 * (Math.sqrt(it.places.length) - 1) / Math.max(1, Math.sqrt(maxC) - 1);
      return { it: it, x: 8 + ax * (W - 16), y: H - 8 - ay * (H - 16), r: r };
    });
    /* Ease overlapping dots apart: a few relaxation passes push each overlapping pair apart along the line between them. */
    for (var pass = 0; pass < 40; pass++) {
      var moved = false;
      for (var a = 0; a < pos.length; a++) for (var b = a + 1; b < pos.length; b++) {
        var p = pos[a], q = pos[b], dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, need = p.r + q.r + 10;
        if (d < need) { var push = (need - d) / 2, ux = dx / d, uy = dy / d; if (d < 0.02) { ux = 1; uy = 0; } p.x -= ux * push; p.y -= uy * push; q.x += ux * push; q.y += uy * push; moved = true; }
      }
      pos.forEach(function (p) { p.x = Math.max(p.r, Math.min(W - p.r, p.x)); p.y = Math.max(p.r, Math.min(H - p.r, p.y)); });
      if (!moved) break;
    }
    pos.forEach(function (p) {
      var it = p.it; keep[it.id] = true;
      var d = self.dots[it.id];
      if (!d || d.going) {
        if (d) d.el.remove();
        var e = h("div", "p3-dot"); self.plot.appendChild(e);
        d = self.dots[it.id] = { el: e, x: sp(p.x), y: sp(p.y), r: sp(o.instant ? p.r : p.r * 0.6), o: sp(o.instant ? 1 : 0) };
        if (o.newest === it.id && o.shell) o.shell.moment(e);
      }
      d.el.textContent = it.num; d.el.setAttribute("aria-label", it.num + ". " + it.label + ", placed by " + it.places.length);
      /* Each item keeps its own color from the group palette, the same on the plot, its faint placements and its legend row (Chris, Nov 2). */
      var gc = gridColor(it.num); [].slice.call(d.el.classList).forEach(function (c) { if (/^cwl-[gi]\d+$/.test(c)) d.el.classList.remove(c); }); d.el.classList.add(gc);
      d.x.t = p.x; d.y.t = p.y; d.r.t = p.r; d.o.t = 1; d.going = false;
      if (o.instant) { d.x.x = p.x; d.y.x = p.y; d.r.x = p.r; d.o.x = 1; }
      if (it.places.length > 1) it.places.forEach(function (pl, k) {
        var key = it.id + ":" + k; keepF[key] = true;
        var fx = 8 + pl[0] * (W - 16) - 0, fy = H - 8 - pl[1] * (H - 16);
        var f = self.faint[key];
        if (!f) { var fe = h("div", "p3-faint " + gridColor(it.num)); self.plot.insertBefore(fe, self.plot.firstChild.nextSibling); f = self.faint[key] = { el: fe, x: sp(fx), y: sp(fy), o: sp(o.instant ? 1 : 0) }; }
        f.x.t = fx; f.y.t = fy; f.o.t = 1; f.going = false;
      });
    });
    Object.keys(this.dots).forEach(function (id) {
      if (keep[id]) return;
      var d = self.dots[id], it = items.filter(function (x) { return x.id === id; })[0];
      d.going = true; d.o.t = 0;
      if (it && it.into && self.dots[it.into]) { d.x.t = self.dots[it.into].x.t; d.y.t = self.dots[it.into].y.t; d.r.t = d.r.x * 0.5; }
    });
    Object.keys(this.faint).forEach(function (k) {
      if (keepF[k]) return; var f = self.faint[k], id = k.split(":")[0];
      var it = items.filter(function (x) { return x.id === id; })[0];
      if (it && it.into && self.dots[it.into]) { f.x.t = self.dots[it.into].x.t; f.y.t = self.dots[it.into].y.t; }
      f.going = true; f.o.t = 0;
    });
    /* Legend: one row per standing item, in number order. */
    var rows = live.slice().sort(function (a, b) { return a.num - b.num; });
    var cap = o.legendCap || 9;
    var legKeep = {};
    rows.slice(0, cap).forEach(function (it) {
      legKeep[it.id] = true;
      var r = self.legs[it.id];
      if (!r) { r = self.legs[it.id] = h("div", "p3-leg"); r.innerHTML = "<i></i><span></span><small></small>"; self.legend.appendChild(r); if (!o.instant) CL.arrive(r); }
      r.querySelector("i").textContent = it.num; r.querySelector("i").className = gridColor(it.num); r.querySelector("span").textContent = it.label; r.querySelector("small").textContent = "× " + it.places.length;
      r.classList.toggle("is-new", o.newest === it.id);
    });
    Object.keys(this.legs).forEach(function (id) { if (!legKeep[id]) { var r = self.legs[id]; delete self.legs[id]; if (CL.leave) CL.leave(r, function () { r.remove(); }); else r.remove(); } });
    var extra = rows.length - Math.min(rows.length, cap);
    if (!this.legMore) { this.legMore = h("div", "p3-more-groups"); this.legend.appendChild(this.legMore); }
    this.legend.appendChild(this.legMore);
    this.legMore.innerHTML = extra > 0 ? "+ " + extra + " more on your phones" : "";
    if (o.newest && this.legs[o.newest]) { var lg = this.legs[o.newest]; setTimeout(function () { lg.classList.remove("is-new"); }, ms("cwl-dur-new-hold")); }
  };

  /* ================================================================
     WORD CLOUD with AI combining · INT-01
     Built on pass 2's Field and Chips. When AI combines "young people"
     into "youth", the absorbed word glides into the survivor's place on the
     regroup spring while it fades, and the survivor grows on the same spring.
     Undo plays it backwards: the word leaves the survivor's place and finds
     its own. A combined word carries the AI badge.
     ================================================================ */
  function Cloud(host, o) {
    o = o || {};
    var cloud = this.el = h("div", "cwl-cloud p2-cloud"); host.appendChild(cloud);
    var fieldEl = h("div", "p2-field"), row = h("div", "cwl-cloud-stream p2-chips");
    cloud.appendChild(fieldEl); cloud.appendChild(row);
    this.field = new P2.Field(fieldEl, function (key) { var e = h("span", "cwl-word"); e.setAttribute("data-w", key); return e; }, { gapX: 40, gapY: 6, fill: 0.55 });
    this.chips = new P2.Chips(row);
    this.min = o.min || 56; this.max = o.max || 168;
  }
  /* words: [{text, count, ai (combined from), isNew}] ; o: {mergedFrom: {absorbed: survivor}, unmerged: {word: survivor}} */
  Cloud.prototype.set = function (words, o) {
    o = o || {};
    var self = this, reps = words.filter(function (w) { return w.count > 1; }), singles = words.filter(function (w) { return w.count === 1; });
    var max = reps.reduce(function (m, w) { return Math.max(m, w.count); }, 1);
    var before = {};
    this.field.items.forEach(function (it, k) { before[k] = { x: it.x, y: it.y, tx: it.tx, ty: it.ty }; });
    var items = reps.slice().sort(function (x, y) { return y.count - x.count; }).map(function (w) {
      return { key: w.text, size: CL.wordSize(w.count, max, self.min, self.max), update: function (el) {
        el.className = "cwl-word " + (w.count === max ? "is-leader" : "is-repeated") + (w.isNew && w.count !== max ? " is-new" : "");
        el.innerHTML = w.ai ? '<span class="p3-ai-word">' + esc(w.text) + CL.aiBadge(true) + "</span>" : esc(w.text); if (w.ai) CL.icons();
        el.setAttribute("aria-label", w.text + ", " + w.count + (w.ai ? ", AI combined" : ""));
      } };
    });
    this.chips.set(singles, o.instant);
    this.field.set(items, o.instant);
    /* The absorbed word glides into its survivor while it fades. */
    Object.keys(o.mergedFrom || {}).forEach(function (gone) {
      var it = self.field.items.get(gone), into = self.field.items.get(o.mergedFrom[gone]);
      if (it && into) { it.tx = into.tx; it.ty = into.ty; it.rest = false; }
      else if (!it && into && before[gone]) { /* a single mention: it left from the chip row; nothing to glide */ }
    });
    /* Undo: the word leaves its survivor's place and finds its own. */
    Object.keys(o.unmerged || {}).forEach(function (back) {
      var it = self.field.items.get(back), from = before[o.unmerged[back]];
      if (it && from && !CL.reduced(self.el)) { it.x = from.x; it.y = from.y; it.o = 0.4; it.rest = false; }
    });
    CL.icons();
  };

  /* ================================================================
     WALL · INT-02. AI groups in the main area with the answer column on the
     right (pass 2's layout), the AI grouped marker, pinned groups, the AI
     summary at the top of the groups column after Show summary, pushing the groups
     down while the answers column stays in view. With AI off the main area
     falls back to answer cards in arrival order; a crowded wall steps its
     older cards down to the type floor and then takes turns, only once
     nothing has arrived for cwl-delay-quiet.
     ================================================================ */
  function Wall(host, o) {
    o = o || {};
    this.themes = o.themes || [];
    var el = this.el = h("div", "p2-wallsplit"); host.appendChild(el);
    el.innerHTML = '<section class="p2-groups"><div class="p2-groups-head">' + CL.aiBadge() + '<span class="p2-groups-hint">Grouped from your answers</span></div><div class="p2-group-list"></div><div class="p2-groups-empty">Grouping as answers arrive</div></section>' +
      '<section class="p2-feed"><div class="p2-feed-head">Answers · newest first</div><div class="p2-feed-list"></div></section>';
    this.groupsEl = el.querySelector(".p2-groups"); this.groupList = el.querySelector(".p2-group-list"); this.empty = el.querySelector(".p2-groups-empty");
    /* The AI summary sits at the top of the groups column, under the question, and pushes the groups down as it opens.
       The answers column on the right stays in view (Chris, Nov 2). */
    var sum = this.summary = h("div", "p3-summary is-off"); sum.setAttribute("role", "region"); sum.setAttribute("aria-label", "AI summary");
    sum.innerHTML = '<div class="p3-summary-clip"><div class="p3-summary-box"><div class="p3-summary-head">' + L("sparkles") + ' AI summary</div><p></p></div></div>';
    this.groupsEl.insertBefore(sum, this.groupsEl.firstChild);
    this.feed = new P2.Feed(el.querySelector(".p2-feed-list"));
    this.groupField = new P2.Field(this.groupList, function (key) { var e = h("div", "p2-group"); e.setAttribute("data-g", key); e.innerHTML = '<span class="lbl"></span><span class="n"></span>'; return e; }, { gapX: 28, gapY: 22, fill: 0.5 });
    this.answers = [];
  }
  Wall.prototype.themeOf = function (t) { for (var i = 0; i < this.themes.length; i++) if (this.themes[i][1].test(t)) return this.themes[i][0]; return null; };
  Wall.prototype.row = function (text) { var d = h("div", "p2-feed-row"); d.textContent = text; d.setAttribute("data-k", text); return d; };
  Wall.prototype.add = function (texts, o) {
    o = o || {};
    var self = this, rows = texts.map(function (t) { self.answers.push(t); return self.row(t); });
    var prev = this.feed.track.querySelector(".is-newest"); if (prev) prev.classList.remove("is-newest");
    this.feed.prepend(rows, o.instant);
    if (o.lone && o.shell && rows[0]) { rows[0].classList.add("is-newest"); o.shell.handoff(true); setTimeout(function () { rows[0].classList.remove("is-newest"); o.shell.handoff(false); }, ms("cwl-dur-new-hold")); }
    return rows;
  };
  /* groups: {pinned: {name:true}, undone: {name:true}, cap} */
  Wall.prototype.regroup = function (o) {
    o = o || {};
    var self = this, counts = {};
    this.answers.forEach(function (a) { var t = self.themeOf(a); if (t && !(o.undone || {})[t]) counts[t] = (counts[t] || 0) + 1; });
    var names = Object.keys(counts).filter(function (k) { return counts[k] > 1; }).sort(function (a, b) { return counts[b] - counts[a]; });
    var cap = o.cap || (this.summaryOn ? 4 : 9), extra = names.slice(cap); names = names.slice(0, cap);
    var max = names.reduce(function (m, k) { return Math.max(m, counts[k]); }, 2), pinned = o.pinned || {};
    this.groupField.set(names.map(function (k) {
      return { key: k, size: CL.wordSize(counts[k], max, 44, o.maxPx || 72), update: function (el) {
        el.querySelector(".lbl").innerHTML = (pinned[k] ? L("pin", "p3-pin") + " " : "") + esc(k);
        el.querySelector(".n").textContent = counts[k];
        el.setAttribute("aria-label", k + ", " + counts[k] + " answers" + (pinned[k] ? ", pinned" : ""));
      } };
    }), o.instant);
    this.empty.classList.toggle("is-off", names.length > 0);
    if (!this.moreEl) { this.moreEl = h("div", "p3-more-groups"); this.groupsEl.appendChild(this.moreEl); }
    this.moreEl.textContent = extra.length && !this.summaryOn ? "+ " + extra.length + " smaller groups on the control surface" : "";
    CL.icons();
    return counts;
  };
  Wall.prototype.showSummary = function (text) {
    this.summary.querySelector("p").textContent = text || "";
    this.summaryOn = !!text;
    this.summary.classList.toggle("is-off", !text);
    CL.icons();
  };

  /* Arrival-order wall (AI off). Cards keep arrival order, oldest first, so every card keeps its place as new ones join at the end.
     Crowded: once nothing has arrived for cwl-delay-quiet, older cards step down to body then to the floor, and past that the
     oldest take turns in sets every cwl-dur-turn-hold. */
  function OrderWall(host) {
    var el = this.el = h("div", "p3-wall"); host.appendChild(el);
    this.turns = h("div", "p3-turns"); this.list = [];
  }
  OrderWall.prototype.set = function (texts, o) {
    o = o || {};
    var el = this.el, self = this;
    CL.flip(el, function () {
      var have = {}; Array.prototype.forEach.call(el.querySelectorAll(".cwl-card"), function (c) { have[c.getAttribute("data-k")] = c; });
      texts.forEach(function (t, i) {
        var c = have[t];
        if (!c) { c = h("div", "cwl-card"); c.setAttribute("data-k", t); c.textContent = t; }
        el.appendChild(c); delete have[t];
      });
      Object.keys(have).forEach(function (k) { have[k].remove(); });
      var cards = Array.prototype.slice.call(el.querySelectorAll(".cwl-card"));
      var step = o.step || 0;
      cards.forEach(function (c, i) {
        var older = i < cards.length - (o.fresh || 4);
        c.classList.toggle("is-body", step >= 1 && older && step < 2);
        c.classList.toggle("is-floor", step >= 2 && older);
        c.classList.toggle("is-compact", false);
      });
      if (o.newest) { var n = el.querySelector('.cwl-card[data-k="' + CSS.escape(o.newest) + '"]'); if (n) n.classList.add("is-newest"); }
    }, { selector: ".cwl-card" });
    if (o.turns) {
      /* Past the floor, the oldest cards step out and take turns, so nothing on screen is cut off. */
      var extra = o.turns, cards = el.querySelectorAll(".cwl-card"), k = 0;
      el.appendChild(this.turns); this.turns.innerHTML = L("refresh-cw") + " + " + extra + " more, taking turns";
      while (el.scrollHeight > el.clientHeight + 2 && k < cards.length - 2) { cards[k].remove(); k++; extra++; this.turns.innerHTML = L("refresh-cw") + " + " + extra + " more, taking turns"; }
    } else if (this.turns.parentNode) this.turns.remove();
    CL.icons();
  };

  /* ================================================================
     SIGN TOGETHER · INT-10. The text's title, signatures with names arriving one at a time
     with the count, and a slow roll once the wall is full (one row per
     cwl-dur-roll-row, only while no name is arriving). Hide fades a name and
     the rest close the gap.
     ================================================================ */
  function Sign(host, o) {
    o = o || {};
    var el = this.el = h("div", "p3-sign"); host.appendChild(el);
    el.innerHTML = '<div class="p3-names-box"><div class="p3-names"></div></div><div class="p3-sign-side"><div class="cwl-big-number">0</div><div class="p3-of"></div><div class="p3-any">' + L("pen-line") + " " + esc(o.how || "Sign on your phone") + "</div></div>";
    this.names = el.querySelector(".p3-names"); this.box = el.querySelector(".p3-names-box"); this.big = el.querySelector(".cwl-big-number"); this.of = el.querySelector(".p3-of");
    this.roll = 0; this.rollOn = false; this.lastArrive = 0; this.total = o.total || 8;
    var self = this;
    onTick(el, function (dt, now) {
      var over = self.names.scrollHeight - self.box.clientHeight;
      if (over > 8 && self.rollOn && !CL.reduced(el) && now - self.lastArrive > ms("cwl-delay-quiet")) {
        var first = self.names.firstElementChild, rowH = first ? first.offsetHeight + 28 : 120, speed = rowH / (ms("cwl-dur-roll-row") / 1000);
        self.roll += speed * dt; if (self.roll > over + rowH) self.roll = -rowH; /* loop back to the first rows */
      } else if (over <= 8) self.roll = 0;
      self.names.style.transform = "translateY(" + (-Math.max(0, self.roll)).toFixed(2) + "px)";
    });
  }
  /* list: [{id, name, sig(svg path) }]; o: {newest, instant, roll} */
  Sign.prototype.set = function (list, o) {
    o = o || {};
    var names = this.names, self = this;
    CL.flip(names, function () {
      var have = {}; Array.prototype.forEach.call(names.children, function (c) { have[c.getAttribute("data-id")] = c; });
      list.forEach(function (p) {
        var c = have[p.id];
        /* A signature arrives with the person's name under it (Chris, Nov 2). */
        if (!c) { c = h("div", "p3-name" + (p.sig ? " is-sig" : "")); c.setAttribute("data-id", p.id); c.innerHTML = p.sig ? '<svg viewBox="0 0 300 100" role="img" aria-label="' + esc(p.name) + ', signature"><path d="' + p.sig + '" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="nm">' + esc(p.name) + "</span>" : esc(p.name); }
        names.appendChild(c); delete have[p.id];
      });
      Object.keys(have).forEach(function (k) { have[k].remove(); });
    }, { selector: ".p3-name" });
    if (o.newest) { var n = names.querySelector('[data-id="' + o.newest + '"]'); if (n && o.shell) o.shell.moment(n); this.lastArrive = performance.now(); }
    CL.countTo(this.big, list.length);
    this.of.textContent = "of " + this.total + " signed";
    this.rollOn = !!o.roll;
    if (o.instant) this.roll = o.rollAt || 0;
  };

  /* ================================================================
     PRIVATE FORM · INT-09. The TV shows only the count.
     ================================================================ */
  function Form(host, o) {
    o = o || {};
    var el = this.el = h("div", "p3-form"); host.appendChild(el);
    el.innerHTML = '<div><span class="cwl-big-number">0</span></div><div class="p3-of"></div><div class="p3-lock">' + L("lock") + " Answers stay private. They never appear on this screen.</div>";
    this.big = el.querySelector(".cwl-big-number"); this.of = el.querySelector(".p3-of"); this.total = o.total || 8;
  }
  Form.prototype.set = function (n, o) { o = o || {}; if (o.instant) { this.big.textContent = n; this.big.setAttribute("data-n", n); } else CL.countTo(this.big, n); this.of.textContent = "of " + this.total + " have answered"; };

  window.ClearwayLivePass3 = {
    sp: sp, run: run, rate: rate, onTick: onTick, Shell: Shell,
    Bars: Bars, choiceItems: choiceItems, rankItems: rankItems, pointsItems: pointsItems, statementItems: statementItems,
    Scale: Scale, QA: QA, Grid: Grid, gridColor: gridColor, Cloud: Cloud, Wall: Wall, OrderWall: OrderWall, Sign: Sign, Form: Form
  };
})();
