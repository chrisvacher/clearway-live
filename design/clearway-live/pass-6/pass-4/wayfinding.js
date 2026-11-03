/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 4 · wayfinding.js
   window.ClearwayLivePass4: the Wayfinding session tools (milestone 4).
   Built on ClearwayLive (bundle.js), ClearwayLivePass2 (live-room.js) and
   ClearwayLivePass3 (views.js). Every TV view is built once and only moves
   from its current state to the next: keyed items glide (FLIP), arrive and
   leave, and nothing redraws. Components carry the names they'll have in code.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P3 = window.ClearwayLivePass3, W = window.ClearwayLivePass4Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide;
  function ms(n) { return CL.ms(n); }
  function tvScale(el) { var tv = el.closest(".cwl-tv,.cwl-phone"); if (!tv) return 1; var r = tv.getBoundingClientRect(); return r.width / (tv.offsetWidth || 1) || 1; }

  /* ================================================================
     LensIcon · the five lens icons, drawn for Clearway Live on a 24px grid,
     2px round strokes in currentColor, so they sit beside Lucide icons.
     The same five on the TV, phones, the remote, the control surface and the report.
     ================================================================ */
  var LENS_ICON = {
    /* Congregation: people gathered, three figures in an arc. */
    congregation: '<circle cx="12" cy="7" r="3"/><path d="M6.5 20v-1.5a5.5 5.5 0 0 1 11 0V20"/><circle cx="4.5" cy="10" r="2"/><path d="M1.5 19v-.75A3.25 3.25 0 0 1 4.75 15"/><circle cx="19.5" cy="10" r="2"/><path d="M22.5 19v-.75A3.25 3.25 0 0 0 19.25 15"/>',
    /* Community: the neighbourhood, two houses on one street. */
    community: '<path d="M2 21h20"/><path d="M4 21V11.5L9.5 7l5.5 4.5V21"/><path d="M8 21v-4.5h3V21"/><path d="M15 21v-6.5l3-2.5 3 2.5V21"/>',
    /* Leadership: taking the team somewhere, a flag on the summit. */
    leadership: '<path d="M2.5 21 9 11l3.5 4.5L15 12l6.5 9Z"/><path d="M9 11V3"/><path d="M9 3.5h6l-1.75 2.25L15 8H9"/>',
    /* Operations: how it runs, connected parts of one system. */
    operations: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><circle cx="17.5" cy="6.5" r="3.5"/><path d="M10 6.5h4"/><path d="M6.5 10v4a3.5 3.5 0 0 0 3.5 3.5h4"/>',
    /* Learning: what we will know, an open book with a new shoot. */
    learning: '<path d="M2 8.5c3.2-1.2 6.6-.9 10 1.2 3.4-2.1 6.8-2.4 10-1.2v11c-3.2-1.2-6.6-.9-10 1.2-3.4-2.1-6.8-2.4-10-1.2Z"/><path d="M12 9.7v11"/><path d="M12 7.5c0-2.6 1.6-4.5 4.5-4.5 0 2.6-1.7 4.5-4.5 4.5Z"/><path d="M12 7.5C12 5.6 10.8 4.2 8.6 4.2c0 1.9 1.3 3.3 3.4 3.3Z"/>'
  };
  function lensIcon(key, cls) {
    return '<svg class="cwl-lens-icon ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (LENS_ICON[key] || "") + "</svg>";
  }
  function lensByKey(k) { for (var i = 0; i < W.lenses.length; i++) if (W.lenses[i].key === k) return W.lenses[i]; return W.lenses[0]; }
  /* LensHeading: the Royal block, icon before the name. TV text is always 20px bold or larger (Off-White on Royal is 4.3:1). */
  function lensHeading(key, name) { var l = lensByKey(key); return '<span class="cwl-lens">' + lensIcon(l.key) + " " + esc(name || l.name) + "</span>"; }
  /* LensChip: below 20px the chip uses cwl-lens-small (Deeper Royal), 5.0:1 with Off-White. */
  function lensChip(key, name) { var l = lensByKey(key); return '<span class="cwl-wf-lens-chip">' + lensIcon(l.key) + "<span>" + esc(name || l.name) + "</span></span>"; }
  function lensDot(key) { var l = lensByKey(key); return '<span class="cwl-wf-lens-dot" role="img" aria-label="' + esc(l.name) + '">' + lensIcon(l.key) + "</span>"; }
  function ctlLens(key) { var l = lensByKey(key); return '<span class="cwl-wf-ctl-lens">' + lensIcon(l.key) + esc(l.name) + "</span>"; }

  /* ---------- Keyed lists that glide: FLIP for moves, arrive for new items, leave then close the gap ---------- */
  function keyed(container, list, make, update, o) {
    o = o || {};
    var have = {}, kids = container.querySelectorAll(":scope > [data-k]");
    for (var i = 0; i < kids.length; i++) if (!kids[i].classList.contains("is-leaving")) have[kids[i].getAttribute("data-k")] = kids[i];
    var want = {}; list.forEach(function (it) { want[it.k] = true; });
    var leavers = Object.keys(have).filter(function (k) { return !want[k]; });
    var mutate = function () {
      var before = o.anchor ? o.anchor : null;
      list.forEach(function (it) {
        var el = have[it.k];
        if (!el) { el = make(it); el.setAttribute("data-k", it.k); }
        update(el, it);
        if (before) container.insertBefore(el, before); else container.appendChild(el);
      });
    };
    if (o.instant || CL.reduced(container)) { leavers.forEach(function (k) { have[k].remove(); }); mutate(); return; }
    leavers.forEach(function (k) {
      var el = have[k]; el.classList.add("is-leaving");
      CL.leave(el, function () { CL.flip(container, function () { el.remove(); }, { selector: ":scope > [data-k]:not(.is-leaving)" }); });
    });
    CL.flip(container, mutate, { selector: ":scope > [data-k]:not(.is-leaving)", stagger: o.stagger });
  }

  /* The quiet replace: a line that changes as a whole crossfades in place; a line being typed simply grows. */
  function replaceText(el, text, o) {
    o = o || {};
    var old = el.getAttribute("data-text") || "";
    if (old === text) return;
    el.setAttribute("data-text", text);
    var typing = text.indexOf(old) === 0 || old.indexOf(text) === 0;
    if (typing || !old || CL.reduced(el) || o.instant) { el.textContent = text; return; }
    var dur = ms("cwl-dur-line-replace"), ease = CL.v("cwl-ease-signature");
    var a = h("span", "old"); a.textContent = old; var b = h("span", "new"); b.textContent = text;
    el.innerHTML = ""; el.appendChild(b); el.appendChild(a);
    a.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-0.35em)" }], { duration: dur, easing: CL.v("cwl-ease-exit"), fill: "forwards" }).onfinish = function () { a.remove(); };
    b.animate([{ opacity: 0, transform: "translateY(0.35em)" }, { opacity: 1, transform: "none" }], { duration: dur, easing: ease, fill: "backwards" });
  }

  /* ================================================================
     The TV shell for Wayfinding screens: pass 3's Shell with a lens heading
     in place of the eyebrow when a lens is live.
     ================================================================ */
  function shell(box, o) {
    o = o || {};
    var sh = new P3.Shell(box, { theme: o.theme || "dark", eyebrow: o.eyebrow || "", headline: o.headline || "", unit: o.unit || "answers", tally: o.tally });
    if (o.lens) setLens(sh, o.lens);
    sh.host.classList.add("cwl-wf-host");
    return sh;
  }
  function setLens(sh, key, extra) {
    var e = sh.eyebrowEl; e.style.display = ""; e.style.textTransform = "none"; e.style.letterSpacing = "0";
    e.innerHTML = '<span class="cwl-wf-head">' + lensHeading(key).replace('class="cwl-lens"', 'class="cwl-lens" style="font-size:var(--cwl-fs-tv-floor)"') + (extra ? '<span class="cwl-wf-sub">' + extra + "</span>" : "") + "</span>";
  }

  /* ================================================================
     LensWall · INT-12. Every sentence lands in the column on the right the
     moment it is sent; clustering never holds it. Once grouped, the
     sentence drifts into its cluster in the main area (cwl-dur-cluster-drift,
     cwl-ease-calm, cwl-delay-regroup-step apart, 12 at most), takes the
     cluster's number in the column, and the cluster's label grows
     (cwl-dur-cluster-label, from cwl-delay-label-after-drift). Seeded
     sentences arrive first, in a steady flow, when the lens opens.
     AI off: no clusters, every sentence in arrival order across the screen.
     ================================================================ */
  function LensWall(host, o) {
    o = o || {};
    var el = this.el = h("div", "cwl-wf-lenswall"); host.appendChild(el);
    el.innerHTML = '<section class="cwl-wf-clusters" aria-label="Clusters"></section>' +
      '<section class="cwl-wf-feed" aria-label="Sentences"><div class="cwl-wf-feed-head"><span class="fh">Newest first</span><span class="fs"></span></div><div class="cwl-wf-feed-list"></div><div class="cwl-wf-more"></div></section>';
    this.cl = el.querySelector(".cwl-wf-clusters"); this.list = el.querySelector(".cwl-wf-feed-list"); this.more = el.querySelector(".cwl-wf-more"); this.fs = el.querySelector(".fs");
    this.order = []; this.grouped = {}; this.labels = o.labels || {}; this.shell = o.shell;
  }
  LensWall.prototype.set = function (sentences, o) {
    o = o || {};
    var self = this, ai = o.ai !== false, instant = !!o.instant, red = CL.reduced(this.el);
    this.el.classList.toggle("is-noai", !ai);
    this.cl.classList.toggle("is-ai-off", !ai);
    var grouped = {}; (o.grouped || []).forEach(function (id) { grouped[id] = true; });
    if (!ai) grouped = {};
    /* cluster order: by first grouped member, so a cluster keeps its place once it exists */
    var cOrder = this.cOrder || (this.cOrder = []);
    sentences.forEach(function (s) { if (grouped[s.id] && s.c && cOrder.indexOf(s.c) < 0) cOrder.push(s.c); });
    var idx = {}; cOrder.forEach(function (c, i) { idx[c] = i + 1; });
    /* --- the column: newest first, every sentence the moment it arrives --- */
    var rows = sentences.slice().reverse().map(function (s) { return { k: s.id, s: s }; });
    var cap = o.cap || (ai ? 9 : 12);
    var shown = rows.slice(0, cap), extra = rows.length - shown.length;
    var prevGrouped = this.grouped;
    keyed(this.list, shown, function () { var r = h("div", "cwl-wf-row"); r.innerHTML = '<span class="tx"></span><span class="tag"></span>'; return r; }, function (r, it) {
      var s = it.s; r.querySelector(".tx").innerHTML = (s.seeded ? '<span class="seed" title="Written since the pre-call">' + L("sprout") + "</span>" : "") + esc(s.text);
      var g = !!grouped[s.id];
      r.classList.toggle("is-grouped", g);
      if (g) r.querySelector(".tag").textContent = idx[s.c];
      r.classList.toggle("is-newest", o.newest === s.id);
    }, { instant: instant });
    var listEl = this.list, moreEl = this.more;
    var fitRows = function () {
      var H = listEl.clientHeight, over = 0;
      Array.prototype.forEach.call(listEl.querySelectorAll(":scope > .cwl-wf-row:not(.is-leaving)"), function (r) { var o = r.offsetTop + r.offsetHeight > H + 1; r.classList.toggle("is-over", o); if (o) over++; });
      var n = extra + over; moreEl.textContent = n > 0 ? "+ " + n + " more on your phones" : "";
    };
    var fitClusters = function () { clEl.classList.remove("is-many"); if (clEl.scrollHeight > clEl.clientHeight + 2) clEl.classList.add("is-many"); };
    fitRows(); requestAnimationFrame(function () { fitRows(); fitClusters(); });
    clearTimeout(this._fitT); this._fitT = setTimeout(function () { fitRows(); fitClusters(); }, ms("cwl-dur-hide") + ms("cwl-dur-make-room") + 60);
    this.fs.innerHTML = o.seedNote ? L("sprout") + " " + esc(o.seedNote) : "";
    /* --- clusters --- */
    var counts = {}, latest = {};
    sentences.forEach(function (s) { if (grouped[s.id] && s.c) { counts[s.c] = (counts[s.c] || 0) + 1; latest[s.c] = s.text; } });
    var max = 1; Object.keys(counts).forEach(function (c) { max = Math.max(max, counts[c]); });
    var clist = cOrder.filter(function (c) { return counts[c]; }).map(function (c) { return { k: c, c: c, n: counts[c] }; });
    var clEl = this.cl;
    var newly = sentences.filter(function (s) { return grouped[s.id] && !prevGrouped[s.id]; });
    var ghostsFor = {}; if (!instant && !red) newly.slice(-12).forEach(function (s) { ghostsFor[s.c] = (ghostsFor[s.c] || 0) + 1; });
    var labels = this.labels, pinned = o.pinned || {};
    keyed(this.cl, clist, function () {
      var b = h("div", "cwl-wf-cluster"); b.innerHTML = '<div class="cwl-wf-cluster-head"><span class="cwl-wf-num"></span><span class="lbl"></span><span class="cnt"></span></div><div class="cwl-wf-cluster-latest"></div>'; return b;
    }, function (b, it) {
      b.querySelector(".cwl-wf-num").textContent = idx[it.c];
      b.querySelector(".lbl").innerHTML = (pinned[it.c] ? L("pin") + " " : "") + esc(labels[it.c] || it.c);
      var f = Math.min(1, (it.n - 1) / 5);
      var setSize = function () { b.style.setProperty("--cwl-wf-label-fs", "calc(var(--cwl-fs-tv-floor) + (var(--cwl-fs-tv-main) - var(--cwl-fs-tv-floor)) * " + f.toFixed(3) + ")"); b.querySelector(".cnt").textContent = it.n; };
      var lat = b.querySelector(".cwl-wf-cluster-latest");
      if (ghostsFor[it.c]) { var d = ms("cwl-dur-cluster-drift") * 0.8; setTimeout(function () { replaceText(lat, latest[it.c]); }, d); setTimeout(setSize, ms("cwl-delay-label-after-drift")); }
      else { replaceText(lat, latest[it.c], { instant: true }); setSize(); }
      b.setAttribute("aria-label", (labels[it.c] || it.c) + ", " + it.n + " sentences");
    }, { instant: instant });
    if (!this.emptyEl) { this.emptyEl = h("div", "cwl-wf-cluster-empty"); }
    if (ai && !clist.length && sentences.length) { this.emptyEl.textContent = "Grouping as sentences arrive"; this.cl.appendChild(this.emptyEl); } else if (this.emptyEl.parentNode) this.emptyEl.remove();
    /* --- the drift: each newly grouped sentence travels from its row into its cluster --- */
    if (!instant && !red && newly.length) {
      var tv = this.el.closest(".cwl-tv"), k = 0;
      requestAnimationFrame(function () {
        if (!tv) return;
        var sc = tvScale(tv), tr = tv.getBoundingClientRect();
        newly.slice(-12).forEach(function (s) {
          var row = self.list.querySelector('[data-k="' + s.id + '"]'), blk = self.cl.querySelector('[data-k="' + s.c + '"]');
          if (!row || !blk) return;
          var tgt = blk.querySelector(".cwl-wf-cluster-latest"); if (!tgt || !tgt.offsetHeight) tgt = blk;
          var a = row.getBoundingClientRect(), b2 = tgt.getBoundingClientRect();
          var g = h("div", "cwl-wf-ghost"); g.textContent = s.text;
          g.style.left = ((a.left - tr.left) / sc) + "px"; g.style.top = ((a.top - tr.top) / sc) + "px"; g.style.width = Math.min(600, a.width / sc) + "px";
          tv.appendChild(g);
          var dx = (b2.left - a.left) / sc, dy = (b2.top - a.top) / sc;
          var delay = k++ * ms("cwl-delay-regroup-step");
          g.animate([{ transform: "translate(0,0) scale(1)", opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.78 }, { transform: "translate(" + dx + "px," + dy + "px) scale(0.86)", opacity: 0 }],
            { duration: ms("cwl-dur-cluster-drift"), easing: CL.v("cwl-ease-calm"), delay: delay, fill: "both" }).onfinish = function () { g.remove(); };
        });
      });
    }
    this.grouped = grouped;
    CL.icons();
  };

  /* ================================================================
     CandidatePriorities · INT-13. Candidates reach the TV only when the
     facilitator sends them. Renames replace the name in place; a merge
     glides the merged candidate into the one it joins, which takes the new name.
     ================================================================ */
  function CandidateList(host) { this.el = h("div", "cwl-wf-cands"); host.appendChild(this.el); }
  CandidateList.prototype.set = function (cands, o) {
    o = o || {};
    var self = this, el = this.el;
    if (!this.waitEl) this.waitEl = h("div", "cwl-wf-cand-wait");
    if (!cands.length) { this.waitEl.innerHTML = '<div class="cwl-wf-empty-note">' + esc(o.waitText || "Candidates come up here when Chris sends them.") + "</div>"; el.appendChild(this.waitEl); }
    else if (this.waitEl.parentNode) this.waitEl.remove();
    /* merge: the leaving card glides onto its target before it fades */
    if (o.merge && !CL.reduced(el) && !o.instant) {
      var from = el.querySelector('[data-k="' + o.merge.from + '"]'), to = el.querySelector('[data-k="' + o.merge.into + '"]');
      if (from && to) {
        var sc = tvScale(el), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
        from.classList.add("is-leaving");
        from.animate([{ transform: "none", opacity: 1 }, { transform: "translate(" + ((b.left - a.left) / sc) + "px," + ((b.top - a.top) / sc) + "px) scale(0.9)", opacity: 0 }], { duration: ms("cwl-dur-regroup"), easing: CL.v("cwl-ease-calm"), fill: "forwards" }).onfinish = function () {
          CL.flip(el, function () { from.remove(); }, { selector: ":scope > [data-k]:not(.is-leaving)" });
        };
      }
    }
    keyed(el, cands.map(function (c, i) { return { k: c.id, c: c, i: i }; }), function () {
      var d = h("div", "cwl-wf-cand"); d.innerHTML = '<span class="cwl-wf-num"></span><div class="nm"></div>'; return d;
    }, function (d, it) {
      var c = it.c;
      d.querySelector(".cwl-wf-num").textContent = it.i + 1;
      replaceText(d.querySelector(".nm"), c.name, { instant: o.instant });
      d.classList.toggle("is-provisional", !!c.provisional);
    }, { instant: o.instant });
    CL.icons();
  };

  /* ================================================================
     OutcomeBullets · "In 2029, what's true?" One Vision Outcome at a time.
     Bullets land under the heading as people send them. The rail lists every
     outcome; one with no bullets stays flagged in Sunrise until it has one.
     ================================================================ */
  function OutcomeBullets(host) {
    var el = this.el = h("div", "cwl-wf-bullets"); host.appendChild(el);
    el.innerHTML = '<div class="cwl-wf-bullets-main"><div class="cwl-wf-outcome-title"><span class="cwl-wf-num"></span><span class="t"></span></div><div class="cwl-wf-blist"></div></div><aside class="cwl-wf-orail"><div class="cwl-wf-orail-head">Vision Outcomes</div><div class="rl" style="display:flex;flex-direction:column;gap:8px"></div></aside>';
    this.title = el.querySelector(".cwl-wf-outcome-title"); this.blist = el.querySelector(".cwl-wf-blist"); this.rail = el.querySelector(".rl");
  }
  OutcomeBullets.prototype.set = function (outcomes, cur, o) {
    o = o || {};
    var oc = outcomes[cur] || outcomes[0];
    this.title.querySelector(".cwl-wf-num").textContent = cur + 1;
    replaceText(this.title.querySelector(".t"), oc.name, { instant: o.instant });
    var bl = oc.bullets || [], floor = bl.length > 4;
    if (!this.emptyEl) { this.emptyEl = h("div", "cwl-wf-empty-outcome is-flagged"); }
    if (!bl.length) {
      this.emptyEl.innerHTML = '<span class="cwl-wf-flag-tag">' + L("circle-alert") + ' Needs a bullet</span><div class="cwl-wf-empty-note">No one has said what\'s true in ' + W.Y.vision + " yet.</div>";
      this.blist.appendChild(this.emptyEl);
    } else if (this.emptyEl.parentNode) this.emptyEl.remove();
    var cap = o.cap || 6, shown = bl.slice(-cap), extra = bl.length - shown.length;
    keyed(this.blist, shown.map(function (b, i) { return { k: oc.id + ":" + (bl.length - shown.length + i), b: b }; }), function () { return h("div", "cwl-wf-bullet"); }, function (e, it) {
      e.innerHTML = "<span>" + esc(it.b) + "</span>"; e.classList.toggle("is-floor", floor); e.classList.toggle("is-newest", o.newest === it.b);
    }, { instant: o.instant, anchor: this.emptyEl.parentNode ? this.emptyEl : null });
    if (!this.moreEl) { this.moreEl = h("div", "cwl-wf-more"); this.blist.parentNode.appendChild(this.moreEl); }
    this.moreEl.textContent = extra > 0 ? "+ " + extra + " earlier bullets on your phones" : "";
    CL.icons();
    keyed(this.rail, outcomes.map(function (x, i) { return { k: x.id, x: x, i: i }; }), function () { var r = h("div", "cwl-wf-orow"); r.innerHTML = '<span class="cwl-wf-num"></span><span class="t"></span><span class="k"></span>'; return r; }, function (r, it) {
      var n = (it.x.bullets || []).length;
      r.querySelector(".cwl-wf-num").textContent = it.i + 1;
      replaceText(r.querySelector(".t"), it.x.name, { instant: o.instant });
      r.querySelector(".k").innerHTML = n ? L("list") + " " + n : '<span class="cwl-wf-flag-tag">' + L("circle-alert") + " Empty</span>";
      r.setAttribute("aria-label", it.x.name + ", " + (n ? n + (n === 1 ? " bullet" : " bullets") : "no bullets yet"));
      r.classList.toggle("is-current", it.i === cur);
      r.classList.toggle("is-flagged", !n);
    }, { instant: o.instant });
  };

  /* ================================================================
     OutcomeConfirm · Day 2. Confirm, rename or challenge each provisional
     outcome. The TV shows where the room is (counts, no bars, no winner).
     A challenged outcome gets a soft highlight until decided. The
     facilitator records the consensus decision; the row then confirms:
     Lime sweeps across it once (cwl-dur-outcome-confirm) and settles to a
     quiet "Confirmed" mark, so the screen keeps one Lime moment.
     ================================================================ */
  function OutcomeConfirm(host) {
    var el = this.el = h("div", "cwl-wf-confirm"); el.style.display = "flex"; el.style.flexDirection = "column"; el.style.gap = "16px"; host.appendChild(el);
    this.decided = {};
  }
  OutcomeConfirm.prototype.set = function (rows, o) {
    o = o || {};
    var self = this, el = this.el, crowd = rows.length > 6;
    keyed(el, rows.map(function (r, i) { return { k: r.id, r: r, i: i }; }), function () {
      var d = h("div", "cwl-wf-crow"); d.innerHTML = '<span class="cwl-wf-num"></span><div class="nm"></div><div class="tail"><span class="chal">' + L("hand") + ' Challenged</span><span class="cnts"></span><span class="dec"></span></div>'; return d;
    }, function (d, it) {
      var r = it.r, dec = r.decision;
      d.style.padding = crowd ? "10px 24px" : "18px 28px";
      d.querySelector(".cwl-wf-num").textContent = it.i + 1;
      var nm = d.querySelector(".nm");
      var nameHtml = dec && dec.kind === "Renamed" ? esc(dec.to) + "<s>" + esc(r.name) + "</s>" : esc(r.name);
      if (nm.getAttribute("data-h") !== nameHtml) { nm.setAttribute("data-h", nameHtml); nm.innerHTML = nameHtml; }
      nm.style.fontSize = crowd || (r.name.length > 60) ? "var(--cwl-fs-tv-body)" : "";
      d.querySelector(".cnts").innerHTML = '<span title="Confirm">' + L("check") + " " + r.c + '</span><span title="Rename">' + L("pencil-line") + " " + r.r + '</span><span title="Challenge">' + L("hand") + " " + r.x + "</span>";
      d.querySelector(".dec").innerHTML = dec ? L(dec.kind === "Renamed" ? "pencil-line" : "check") + " " + (dec.kind === "Renamed" ? "Renamed" : "Confirmed") : "";
      d.classList.toggle("is-challenged", !!r.challenged && !dec);
      var was = self.decided[r.id];
      d.classList.toggle("is-decided", !!dec);
      if (dec && !was && !o.instant && !CL.reduced(d)) {
        d.classList.add("is-confirming");
        if (o.shell) o.shell.handoff(true);
        setTimeout(function () { d.classList.add("is-settling"); d.classList.remove("is-confirming"); if (o.shell) o.shell.handoff(false); }, ms("cwl-dur-outcome-confirm") + ms("cwl-dur-new-hold") * 0.4);
        setTimeout(function () { d.classList.remove("is-settling"); }, ms("cwl-dur-outcome-confirm") + ms("cwl-dur-new-hold") * 0.4 + ms("cwl-dur-settle-color"));
      }
      self.decided[r.id] = !!dec;
    }, { instant: o.instant });
    CL.icons();
  };

  /* ================================================================
     PremortemGrid · INT-08 in its Wayfinding form: "It's 2029 and this plan
     failed. Why?" Reasons as numbered dots on likelihood and impact.
     Duplicate reasons merge (the dot glides into the survivor). Mitigations
     the team names sit under each reason in the legend.
     ================================================================ */
  function PremortemGrid(host) {
    var g = this.g = new P3.Grid(host, { x: "Likelihood", y: "Impact", legend: "Reasons" });
    g.el.classList.add("cwl-wf-premortem");
  }
  PremortemGrid.prototype.set = function (items, o) {
    o = o || {};
    this.g.set(items, o);
    var legs = this.g.legs;
    CL.icons && setTimeout(CL.icons, 0);
    items.forEach(function (it) {
      var r = legs[it.id]; if (!r) return;
      var m = r.querySelector(".mit");
      if (it.mit) { if (!m) { m = h("div", "mit"); r.appendChild(m); } m.innerHTML = L("shield-check") + "<b>" + esc(it.mit) + "</b>"; m.setAttribute("aria-label", "Mitigation: " + it.mit); }
      else if (m) m.remove();
    });
  };

  /* ================================================================
     CoreGoalBuilder · INT-15. The 3-year Vision on the left, 1-year goals on
     the right. Each goal shows the four CORE letters met or missing (checked
     in code), its owner, end date and the risk it answers. A goal missing a
     letter is outlined in Sunrise with what's missing, and turns solid when
     all four are met.
     ================================================================ */
  var LETTERS = [["C", "Connected"], ["O", "Owned"], ["R", "Result"], ["E", "End date"]];
  function coreCheck(g) {
    var miss = [];
    if (!g.outcome && g.outcome !== undefined) miss.push("C");
    if (!g.owner) miss.push("O");
    if (!g.result || g.resultUnclear) miss.push("R");
    if (!g.end) miss.push("E");
    return miss;
  }
  var NEEDS = { C: "Needs an outcome", O: "Needs an owner", R: "Needs a clear result", E: "Needs an end date" };
  function CoreGoalBuilder(host) {
    var el = this.el = h("div", "cwl-wf-goals"); host.appendChild(el);
    el.innerHTML = '<section class="cwl-wf-vision"><div class="ey">3-year Vision · ' + W.Y.vision + '</div><div class="nm"></div><ul></ul></section><section class="cwl-wf-glist"></section>';
    this.vis = el.querySelector(".cwl-wf-vision"); this.gl = el.querySelector(".cwl-wf-glist");
  }
  CoreGoalBuilder.prototype.set = function (outcome, goals, o) {
    o = o || {};
    replaceText(this.vis.querySelector(".nm"), outcome.name, { instant: o.instant });
    this.vis.querySelector("ul").innerHTML = (outcome.bullets || []).map(function (b) { return "<li><span>" + esc(b) + "</span></li>"; }).join("");
    var floor = goals.length > 2;
    if (!this.emptyEl) this.emptyEl = h("div", "cwl-wf-goals-empty");
    if (!goals.length) { this.emptyEl.innerHTML = '<div class="cwl-wf-empty-note">No goals for ' + W.Y.outlook + " yet. Propose one on your phone.</div>"; this.gl.appendChild(this.emptyEl); } else if (this.emptyEl.parentNode) this.emptyEl.remove();
    var cap = o.cap || 4, shown = goals.slice(0, cap), extra = goals.length - shown.length;
    keyed(this.gl, shown.map(function (g) { return { k: g.id, g: g }; }), function () {
      var d = h("div", "cwl-wf-goal");
      d.innerHTML = '<div class="t"></div><div class="cwl-wf-letters">' + LETTERS.map(function (l) { return '<span class="cwl-wf-letter" data-l="' + l[0] + '" title="' + l[1] + '">' + l[0] + "</span>"; }).join("") + '</div><div class="r"></div><div class="meta"></div>';
      return d;
    }, function (d, it) {
      var g = it.g, miss = coreCheck(g);
      replaceText(d.querySelector(".t"), g.title, { instant: o.instant });
      var tag = function (m) { return '<span class="cwl-wf-flag-tag">' + L("circle-alert") + " " + NEEDS[m] + "</span>"; };
      var r = d.querySelector(".r"); r.innerHTML = miss.indexOf("R") < 0 ? "Result: " + esc(g.result) : tag("R") + (g.result ? " " + esc(g.result) : "");
      d.querySelector(".meta").innerHTML = (miss.indexOf("O") < 0 ? '<span>' + L("user") + " " + esc(g.owner) + "</span>" : tag("O")) + (miss.indexOf("E") < 0 ? "<span>" + L("calendar") + " " + esc(g.end) + "</span>" : tag("E")) + (g.risk ? '<span class="risk" aria-label="Answers risk ' + g.risk + '">' + L("shield") + " Risk " + g.risk + "</span>" : "");
      LETTERS.forEach(function (l) { var x = d.querySelector('[data-l="' + l[0] + '"]'); x.classList.toggle("is-missing", miss.indexOf(l[0]) >= 0); x.setAttribute("aria-label", l[1] + (miss.indexOf(l[0]) >= 0 ? ", missing" : ", met")); });
      d.classList.toggle("is-flagged", miss.length > 0);
      d.classList.toggle("is-floor", floor);
    }, { instant: o.instant });
    if (!this.moreEl) { this.moreEl = h("div", "cwl-wf-more"); }
    this.gl.appendChild(this.moreEl);
    this.moreEl.textContent = extra > 0 ? "+ " + extra + " more goals on your phones" : "";
    CL.icons();
  };

  /* ================================================================
     IntentCard · INT-16, team-led. Drafting: every card filling in at once,
     the intent line written live on each. Presenting: one card at full size;
     an edit replaces its line on the TV as it's typed (typing grows the line
     in place; a rewrite crossfades over cwl-dur-line-replace). The field
     someone is typing in carries a quiet Royal underline for
     cwl-dur-field-lock. A first step without an owner or date is flagged.
     ================================================================ */
  function stepMissing(s) { var m = []; if (!s.owner) m.push("owner"); if (!s.date) m.push("date"); return m; }
  function IntentBoard(host) { this.host = host; this.grid = h("div", "cwl-wf-intents"); this.pres = h("div", "cwl-wf-ipresent"); host.appendChild(this.grid); }
  IntentBoard.prototype.set = function (cards, o) {
    o = o || {};
    var self = this;
    if (o.present != null) { if (this.grid.parentNode) this.grid.remove(); if (!this.pres.parentNode) { this.host.appendChild(this.pres); if (!o.instant) CL.arrive(this.pres); } return this.present(cards[o.present], o); }
    if (this.pres.parentNode) this.pres.remove(); if (!this.grid.parentNode) this.host.appendChild(this.grid);
    this.grid.classList.toggle("is-6", cards.length > 3);
    keyed(this.grid, cards.map(function (c, i) { return { k: c.o, c: c, i: i }; }), function () {
      var d = h("div", "cwl-wf-icard"); d.innerHTML = '<div class="hd"><span class="cwl-wf-num"></span><span class="t"></span></div><div class="line"></div><div class="prog"></div>'; return d;
    }, function (d, it) {
      var c = it.c, oc = outcomeById(c.o);
      d.querySelector(".cwl-wf-num").textContent = it.i + 1;
      d.querySelector(".t").textContent = c.title || oc.name;
      var ln = d.querySelector(".line"), txt = c.intent || "";
      ln.classList.toggle("is-blank", !txt);
      if (!txt) { ln.removeAttribute("data-text"); ln.textContent = "Intent not drafted yet"; } else replaceText(ln, txt, { instant: o.instant });
      ln.classList.toggle("cwl-wf-typing", !!(o.typing && o.typing.card === c.o && o.typing.field === "intent"));
      var filled = [c.intent, c.must, c.stop, (c.steps || []).length].filter(Boolean).length;
      var badSteps = (c.steps || []).filter(function (s) { return stepMissing(s).length; }), bad = badSteps.length;
      var need = bad > 1 ? "Steps need owners or dates" : bad ? (stepMissing(badSteps[0]).length === 2 ? "Needs owner and date" : stepMissing(badSteps[0])[0] === "owner" ? "Step needs an owner" : "Step needs a date") : "";
      d.querySelector(".prog").innerHTML = [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < filled ? "is-on" : "") + '"></i>'; }).join("") + (bad ? '<span class="cwl-wf-flag-tag">' + L("circle-alert") + " " + need + "</span>" : "<span>" + filled + " of 4</span>");
      d.classList.toggle("is-flagged", bad > 0);
    }, { instant: o.instant });
  };
  IntentBoard.prototype.present = function (c, o) {
    var p = this.pres, oc = outcomeById(c.o);
    if (!p.firstChild) {
      p.innerHTML = '<div class="hd"><span class="cwl-wf-num"></span><span class="t"></span></div>' + W.intentFields.map(function (f) { return '<div class="cwl-wf-ifield" data-f="' + f.key + '"><div class="lb">' + esc(f.label) + '</div><div class="tx"></div></div>'; }).join("");
    }
    p.querySelector(".cwl-wf-num").textContent = (W.outcomes.indexOf(oc) + 1) || 1;
    p.querySelector(".hd .t").textContent = c.title || oc.name;
    ["intent", "must", "stop"].forEach(function (k) {
      var tx = p.querySelector('[data-f="' + k + '"] .tx');
      if (!c[k]) { tx.removeAttribute("data-text"); tx.textContent = "Not drafted yet"; tx.style.fontStyle = "italic"; } else { tx.style.fontStyle = ""; replaceText(tx, c[k], { instant: o.instant }); }
      tx.classList.toggle("cwl-wf-typing", !!(o.typing && o.typing.field === k));
    });
    var st = p.querySelector('[data-f="steps"] .tx');
    if (!st.classList.contains("cwl-wf-steps")) { st.className = "tx cwl-wf-steps"; }
    keyed(st, (c.steps || []).map(function (s, i) { return { k: "s" + i, s: s }; }), function () { var d = h("div", "cwl-wf-step"); d.innerHTML = '<span class="s"></span><span class="w"></span>'; return d; }, function (d, it) {
      var s = it.s, m = stepMissing(s);
      replaceText(d.querySelector(".s"), s.text, { instant: o.instant });
      d.querySelector(".w").innerHTML = "<span>" + L("user") + " " + esc(s.owner || "No owner") + "</span><span>" + L("calendar") + " " + esc(s.date || "No date") + "</span>" + (m.length ? '<span class="cwl-wf-flag-tag">' + L("circle-alert") + " Needs " + (m.length === 2 ? "an owner and a date" : m[0] === "owner" ? "an owner" : "a date") + "</span>" : "");
      d.classList.toggle("is-flagged", m.length > 0);
    }, { instant: o.instant });
    if (!(c.steps || []).length) st.innerHTML = '<span style="font-style:italic">No steps yet</span>';
    CL.icons();
  };
  function outcomeById(id) { for (var i = 0; i < W.outcomes.length; i++) if (W.outcomes[i].id === id) return W.outcomes[i]; return W.outcomes[0]; }

  /* ================================================================
     ClearwayMapDraft · D2-15. Assembles at the close of Day 2 from the
     engagement: each field arrives in reading order (cwl-dur-map-field,
     cwl-delay-map-step apart). An empty field shows as empty, never filled in.
     ================================================================ */
  function mapFields(page, data) {
    data = data || {};
    var M = W.map, oc = data.outcomes || W.confirmedOutcomes, goals = data.goals || W.goals;
    var lensLine = W.lensLines;
    if (page === 1) return [
      { k: "mission", col: 0, lb: "Mission", tx: esc(M.mission) },
      { k: "purpose", col: 0, lb: "Purpose", tx: data.purpose || "", emptyText: "Empty until Kingdom Assignment" },
      { k: "values", col: 0, lb: "Values", tx: M.values.map(esc).join(" · ") },
      { k: "strategy", col: 0, lb: "Strategy", tx: esc(M.strategy) },
      { k: "future", col: 1, lb: "10-year Future · " + W.Y.future, tx: "<ul>" + W.lenses.map(function (l) { return "<li>" + lensDot(l.key) + "<span>" + esc(lensLine[l.key]) + "</span></li>"; }).join("") + "</ul>" },
      { k: "vision", col: 1, lb: "3-year Vision Outcomes · " + W.Y.vision, tx: oc.length ? "<ul>" + oc.map(function (x, i) { return "<li><b>" + (i + 1) + "</b><span>" + esc(x.name) + "</span></li>"; }).join("") + "</ul>" : "" }
    ];
    return [
      { k: "priorities", col: 0, lb: "This Year's Priorities", tx: data.priorities || "", emptyText: "Left for Annual Planning" },
      { k: "goals", col: 0, lb: "This Season's Goals · Jan to Apr " + W.Y.outlook, tx: "<ul>" + goals.filter(function (g) { return /Apr/.test(g.end || ""); }).map(function (g) { return "<li><span>" + esc(g.title) + " · " + esc((g.owner || "").split(" ")[0] || "No owner") + "</span></li>"; }).join("") + "</ul>" },
      { k: "rhythms", col: 1, lb: "Leadership Rhythms", tx: "<ul>" + M.rhythms.map(function (r) { return "<li><span>" + esc(r) + "</span></li>"; }).join("") + "</ul>" },
      { k: "issues", col: 1, lb: "Key Issues", tx: "<ul>" + M.keyIssues.map(function (r) { return "<li><span>" + esc(r) + "</span></li>"; }).join("") + "</ul>" }
    ];
  }
  function MapDraft(host) {
    var el = this.el = h("div", "cwl-wf-map"); host.appendChild(el);
    el.innerHTML = '<div class="cwl-wf-mcol"></div><div class="cwl-wf-mcol"></div>';
    this.cols = el.querySelectorAll(".cwl-wf-mcol");
  }
  /* o: {page, upTo (number of fields shown, for assembling), instant, data} */
  MapDraft.prototype.set = function (o) {
    o = o || {};
    var fields = mapFields(o.page || 1, o.data), upTo = o.upTo == null ? fields.length : o.upTo, self = this;
    if (this.page !== o.page) { this.cols[0].innerHTML = ""; this.cols[1].innerHTML = ""; this.page = o.page; }
    var red = CL.reduced(this.el), step = ms("cwl-delay-map-step"), n = 0;
    fields.forEach(function (f, i) {
      var col = self.cols[f.col], el = col.querySelector('[data-k="' + f.k + '"]');
      var show = i < upTo;
      if (!show) { if (el) el.remove(); return; }
      var fresh = !el;
      if (fresh) { el = h("div", "cwl-wf-mfield"); el.setAttribute("data-k", f.k); el.innerHTML = '<div class="lb"></div><div class="tx"></div>'; col.appendChild(el); }
      el.querySelector(".lb").textContent = f.lb;
      var empty = !f.tx;
      el.classList.toggle("is-empty", empty);
      el.querySelector(".tx").innerHTML = empty ? L("circle-dashed") + " " + esc(f.emptyText || "Empty") : f.tx;
      if (fresh && !o.instant && !red) el.animate([{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], { duration: ms("cwl-dur-map-field"), easing: CL.v("cwl-ease-calm"), delay: (n++) * step, fill: "backwards" });
    });
    CL.icons();
  };

  /* ================================================================
     Phones, the remote and the control surface: shared builders
     ================================================================ */
  function phone(box, o) {
    o = o || {};
    var p = CL.phone(box, o.theme || "dark");
    if (o.motion) p.setAttribute("data-motion", o.motion);
    CL.screenTexture(p, o.waiting || o.dim ? "phone-waiting" : "phone-answering");
    if (o.dim) p.classList.add("is-dimmed");
    var right = o.head === "down" ? '<span class="cwl-state-pill" role="img" aria-label="Phones down">' + CL.quietMark() + "</span>" :
      o.head === "offline" ? CL.liveMark("offline") : o.head === "closed" ? '<span class="cwl-state-pill">' + CL.quietMark() + " Closed</span>" :
      o.head === "none" ? "<span></span>" : o.head === "handed" ? CL.liveMark("handed") : CL.liveMark();
    var hd = h("div", "cwl-ph-head"); hd.innerHTML = '<span class="cwl-ph-church">' + esc(W.church) + "</span>" + right; p.appendChild(hd);
    var body = h("div", "cwl-ph-body"); p.appendChild(body);
    var foot = h("div", "cwl-ph-foot"); p.appendChild(foot);
    return { el: p, body: body, foot: foot };
  }
  var PH = {
    sent: function (text, status) { var st = status === "saved" ? L("wifi-off") + " Saved on this phone" : status === "draft" ? L("pencil-line") + " Draft kept" : L("check") + " Sent"; return '<div class="cwl-ph-answer cwl-dimmable"><span>' + esc(text) + '</span><span class="cwl-ph-status">' + st + "</span></div>"; },
    btn: function (label, o) { o = o || {}; return '<button class="cwl-btn' + (o.cls ? " " + o.cls : "") + '" type="button" tabindex="-1"' + (o.disabled ? " disabled" : "") + ">" + L(o.icon || "send") + " " + esc(label || "Send") + "</button>"; },
    down: function () { return '<div class="cwl-phones-down">' + L("smartphone") + " Phones down</div>"; },
    burst: function (t, p) { return '<div class="cwl-burst"><div class="cwl-burst-ring is-quiet" style="--p:' + (p || 0.6) + '"></div><span class="cwl-ph-muted"><span class="cwl-burst-time" style="color:var(--cwl-text)">' + (t || "2:41") + "</span> left to answer</span></div>"; },
    anon: function () { return '<div><span class="cwl-marker">' + L("eye-off") + " Anonymous on the screen</span></div>"; },
    named: function () { return '<div><span class="cwl-marker">' + L("user") + " Your name shows on the screen</span></div>"; },
    input: function (val, ph, rows) { return '<textarea class="cwl-ph-input" rows="' + (rows || 3) + '" placeholder="' + esc(ph || "") + '" tabindex="-1">' + esc(val || "") + "</textarea>"; },
    tense: function () { return '<div class="cwl-wf-ph-tense">' + L("clock") + "<span>Write as if it's already true: \"We are\", \"Our church has\".</span></div>"; }
  };

  /* App helpers (control surface, remote, setup) */
  var B = function (label, cls, icon, extra) { return '<button type="button" class="cwl-a-btn ' + (cls || "is-secondary") + '"' + (extra || "") + ">" + (icon ? L(icon) : "") + (label ? "<span>" + esc(label) + "</span>" : "") + "</button>"; };
  var CHIP = function (label, cls, icon) { return '<span class="cwl-a-chip ' + (cls || "") + '">' + (icon ? L(icon) : "") + "<span>" + esc(label) + "</span></span>"; };
  var BAN = function (kind, icon, html) { return '<div class="cwl-a-banner is-' + kind + '" role="' + (kind === "error" ? "alert" : "status") + '"><span class="ic">' + L(icon) + "</span><div>" + html + "</div></div>"; };
  var SYNC = function (cls, icon, t) { return '<span class="cwl-a-sync ' + cls + '">' + L(icon) + "<span>" + t + "</span></span>"; };
  var FLAG = function (t) { return '<span class="cwl-a-flag"><span class="d">' + L("triangle-alert") + "</span>" + esc(t) + "</span>"; };
  var PRIVATE = function (title, body) { return '<div class="cwl-private"><div class="cwl-private-band">' + L("eye-off") + " Only you see this" + (title ? '<span style="margin-left:auto;font-weight:600">' + esc(title) + "</span>" : "") + '</div><div class="cwl-private-body">' + body + "</div></div>"; };
  var SIGNAL_SLOT = PRIVATE("Alignment signal", '<div class="cwl-wf-signal-slot"><b>Arrives in milestone 6</b>Aligned, divergent, silent and thin data will show here for this session.</div>');
  var IB = function (icon, label) { return B("", "is-ghost is-icon is-sm", icon, ' aria-label="' + esc(label) + '" title="' + esc(label) + '"'); };
  var SB = function (label, icon, cls) { return B(label, (cls || "is-secondary") + " is-sm", icon); };
  function item(n, title, sub, actions, cls) { return '<div class="p3-item ' + (cls || "") + '"><span class="n">' + esc(n) + '</span><div class="t"><b>' + title + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + '</div><div class="a">' + (actions || []).join("") + "</div></div>"; }
  function notes(text) { return PRIVATE("Presenter notes", '<div class="p2-notes">' + esc(text) + "</div>"); }
  function roomPanel(stats) { return PRIVATE("Room", '<div class="p2-stat">' + stats.map(function (s) { return "<div><b>" + s[0] + '</b><span class="cwl-a-muted">' + esc(s[1]) + "</span></div>"; }).join("") + "</div>"); }
  function aiState(on, text) { return '<div class="p3-aistate"><span>' + CL.aiBadge() + " <b>" + (on ? "On" : "Off") + "</b> · " + esc(text) + '</span><button type="button" class="cwl-a-toggle" role="switch" aria-checked="' + on + '" aria-label="AI for this session"></button></div>'; }
  function ctl(el, o) {
    var tools = (o.tools || []).join("");
    el.innerHTML = '<div class="p3-ctl"><div class="p3-ctl-main">' +
      '<div class="p3-ctl-head"><div style="min-width:0"><div class="cwl-a-eyebrow">' + esc(W.church) + " · " + esc(o.part || "Day 1") + '</div><div class="cwl-a-section">' + o.title + '</div><div class="cwl-a-row" style="margin-top:6px">' + (o.chips || []).join("") + "</div></div>" + '<div class="cwl-a-row" style="flex-wrap:nowrap">' + (o.sync || SYNC("", "check", "On the TV now")) + "</div></div>" +
      (o.banner || "") + (tools ? '<div class="p3-ctl-tools">' + tools + "</div>" : "") +
      (o.meter ? '<div class="p3-meter">' + o.meter.map(function (m) { return "<div><b>" + m[0] + "</b><span>" + esc(m[1]) + "</span></div>"; }).join("") + "</div>" : "") +
      (o.listTitle !== false ? '<div class="cwl-a-row" style="justify-content:space-between"><div class="cwl-a-label">' + esc(o.listTitle || "Answers") + '</div><span class="cwl-a-muted">' + esc(o.listNote || "") + "</span></div>" : "") +
      (o.main || '<div class="p3-items">' + (o.items || []).join("") + "</div>") + "</div>" +
      '<div class="p3-ctl-side">' + (o.side || "") + "</div></div>";
    CL.icons();
    return el;
  }
  function rbtn(label, icon, cls) { return '<button type="button" class="cwl-r-btn ' + (cls || "") + '">' + L(icon) + esc(label) + "</button>"; }
  function remote(box, o) {
    var el = CL.appPhone(box, "control");
    el.innerHTML = '<div class="cwl-ph-head" style="border-color:var(--cwl-app-border)"><span class="cwl-a-label">' + esc(W.church) + "</span>" + (o.sync || SYNC("", "check", "On the TV")) + "</div>" +
      '<div class="cwl-r-body' + (o.held ? " cwl-wf-held" : "") + '">' + (o.banner || "") + '<div class="cwl-a-row" style="justify-content:space-between;flex-wrap:nowrap"><div style="min-width:0"><div class="cwl-a-eyebrow">On the TV now</div><div class="cwl-a-label cwl-a-trunc">' + esc(o.title) + "</div></div>" + CL.liveMark("handed") + "</div>" +
      (o.top || "") + (o.buttons || "") + "</div>";
    CL.icons();
    return el;
  }

  window.ClearwayLivePass4 = {
    LENS_ICON: LENS_ICON, lensIcon: lensIcon, lensHeading: lensHeading, lensChip: lensChip, lensDot: lensDot, ctlLens: ctlLens, lensByKey: lensByKey,
    keyed: keyed, replaceText: replaceText, shell: shell, setLens: setLens,
    LensWall: LensWall, CandidateList: CandidateList, OutcomeBullets: OutcomeBullets, OutcomeConfirm: OutcomeConfirm, PremortemGrid: PremortemGrid,
    CoreGoalBuilder: CoreGoalBuilder, coreCheck: coreCheck, LETTERS: LETTERS, NEEDS: NEEDS, IntentBoard: IntentBoard, stepMissing: stepMissing, MapDraft: MapDraft, mapFields: mapFields, outcomeById: outcomeById,
    phone: phone, PH: PH, B: B, CHIP: CHIP, BAN: BAN, SYNC: SYNC, FLAG: FLAG, PRIVATE: PRIVATE, SIGNAL_SLOT: SIGNAL_SLOT, IB: IB, SB: SB, item: item, notes: notes, roomPanel: roomPanel, aiState: aiState, ctl: ctl, rbtn: rbtn, remote: remote
  };
})();
