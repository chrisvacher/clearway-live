/* Clearway Live · design pass 6 · cards6.js
   Live previews for the Discover and alignment signal components in the design system.
   Each card runs the same code as the milestone 6 screens: pick a state, switch the TV or
   phone theme and reduced motion, or play the component's movement. */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P4 = window.ClearwayLivePass4, P6 = window.ClearwayLivePass6, D = window.ClearwayLivePass6Data, W = window.ClearwayLivePass4Data;
  var h = CL.h, esc = CL.esc;
  function clone(a) { return JSON.parse(JSON.stringify(a)); }
  function pad(el, html, bg) { el.innerHTML = '<div style="padding:16px;height:100%;overflow:hidden;display:flex;flex-direction:column;gap:12px;background:var(--cwl-app-' + (bg || "page") + ')">' + (html || "") + "</div>"; return el.firstChild; }
  function themes(ids, o) { o = o || {}; return ids.map(function (id, i) { var t = clone(D.theme(id)); t.of = o.of || D.survey.responses; t.order = i; t.src = "Survey · what could improve"; t.state = (o.accepted || []).indexOf(id) >= 0 ? "accepted" : "draft"; if (o.counts && o.counts[id] != null) t.n = o.counts[id]; return t; }); }
  function cards() { return clone(D.listCards).map(function (c, i) { c.t = i; return c; }); }
  function listShell(box, ctx) { var sh = P4.shell(box, { theme: ctx.theme, unit: "cards" }); sh.prompt("Four Helpful Lists · Elders", ""); sh.headEl.style.display = "none"; return sh; }

  var CARDS = {
    SurveyLink: { id: "SET-04", title: "Survey link", kind: "app", surface: "setup", w: 760, h: 520,
      states: {
        "Open": function (el) { pad(el, P6.SurveyLink("open")); P6.drawQR(el); },
        "No survey linked": function (el) { pad(el, P6.SurveyLink("none")); },
        "Linking": function (el) { pad(el, P6.SurveyLink("pick")); },
        "Draft in Team Hub": function (el) { pad(el, P6.SurveyLink("draft")); },
        "Closed": function (el) { pad(el, P6.SurveyLink("closed")); P6.drawQR(el); },
        "Collects email": function (el) { pad(el, P6.SurveyLink("email")); P6.drawQR(el); },
        "Imported from CSV": function (el) { pad(el, P6.SurveyLink("csv")); },
        "Team Hub unreachable": function (el) { pad(el, P6.SurveyLink("unreachable")); P6.drawQR(el); }
      } },
    ResponseCount: { id: "SET-04", title: "Response count", kind: "app", surface: "setup", w: 380, h: 200, play: true,
      states: {
        "87 responses": function (el, ctx) { ctx.rc = new P6.ResponseCount(pad(el)); ctx.rc.set(87, { instant: true }); },
        "Reading Team Hub": function (el, ctx) { ctx.rc = new P6.ResponseCount(pad(el)); ctx.rc.set(75, { instant: true, refreshing: true }); },
        "First response": function (el, ctx) { ctx.rc = new P6.ResponseCount(pad(el)); ctx.rc.set(1, { instant: true, read: "9:16 am" }); },
        "Unreachable": function (el, ctx) { ctx.rc = new P6.ResponseCount(pad(el)); ctx.rc.set(87, { instant: true, unreachable: true }); },
        "From a CSV": function (el, ctx) { ctx.rc = new P6.ResponseCount(pad(el)); ctx.rc.set(87, { instant: true, csv: true }); }
      },
      playFn: function (ctx) { ctx.rc.set(75, { instant: true, read: "3:40 pm" }); CL.later(function () { ctx.rc.set(75, { refreshing: true, instant: true }); }, 300); CL.later(function () { ctx.rc.set(87); }, 1100); } },
    QuestionResult: { id: "SET-04", title: "Question result", kind: "app", surface: "setup", w: 720, h: 400, play: true,
      states: {
        "Scale": function (el, ctx) { ctx.q = new P6.QuestionResult(pad(el, "", "card")); ctx.q.set(D.q("q1"), { instant: true }); ctx.cur = "q1"; },
        "Single choice": function (el, ctx) { ctx.q = new P6.QuestionResult(pad(el, "", "card")); ctx.q.set(D.q("q2"), { instant: true }); ctx.cur = "q2"; },
        "Multiple choice": function (el, ctx) { ctx.q = new P6.QuestionResult(pad(el, "", "card")); ctx.q.set(D.q("q17"), { instant: true }); ctx.cur = "q17"; },
        "eNPS": function (el, ctx) { ctx.q = new P6.QuestionResult(pad(el, "", "card")); ctx.q.set(D.extraTypes[0], { instant: true }); },
        "Slider": function (el, ctx) { ctx.q = new P6.QuestionResult(pad(el, "", "card")); ctx.q.set(D.extraTypes[1], { instant: true }); },
        "Dropdown": function (el, ctx) { ctx.q = new P6.QuestionResult(pad(el, "", "card")); ctx.q.set(D.extraTypes[4], { instant: true }); },
        "Date and PDF upload": function (el, ctx) { var p = pad(el, "", "card"); new P6.QuestionResult(p).set(D.extraTypes[2], {}); new P6.QuestionResult(p).set(D.extraTypes[3], {}); },
        "Segment, 60 to 74": function (el, ctx) { ctx.q = new P6.QuestionResult(pad(el, "", "card")); ctx.q.set(D.q("q1"), { instant: true, counts: [0, 1, 3, 9, 14], segment: "60 to 74 · 27 respondents" }); }
      },
      playFn: function (ctx) { if (!ctx.cur) return; var q = D.q(ctx.cur); ctx.q.set(q, { counts: q.counts.map(function (c) { return Math.round(c * 0.8); }), answered: 70, instant: true }); CL.later(function () { ctx.q.set(q, {}); }, 400); } },
    SurveyResultScreen: { id: "SET-10", title: "Survey result screen", kind: "tvphone", play: true,
      states: {
        "A choice question": function (box, ctx, ph) { ctx.sr = srTV(box, ctx); ctx.sr.show({ kind: "choice", q: D.q("q2") }, { instant: true }); P6.SurveyResultPhone(ph, { kind: "choice", q: D.q("q2") }); },
        "A scale question": function (box, ctx, ph) { ctx.sr = srTV(box, ctx); ctx.sr.show({ kind: "scale", q: D.q("q1") }, { instant: true }); P6.SurveyResultPhone(ph, { kind: "scale", q: D.q("q1") }); },
        "A theme": function (box, ctx, ph) { ctx.sr = srTV(box, ctx); ctx.sr.show({ kind: "theme", theme: D.theme("t1") }, { instant: true }); P6.SurveyResultPhone(ph, { kind: "theme", theme: D.theme("t1") }); },
        "A thin result": function (box, ctx, ph) { ctx.sr = srTV(box, ctx); ctx.sr.show({ kind: "theme", theme: D.theme("t4") }, { instant: true }); P6.SurveyResultPhone(ph, { kind: "theme", theme: D.theme("t4") }); },
        "Nothing up yet": function (box, ctx, ph) { ctx.sr = srTV(box, ctx); ctx.sr.show({ kind: "none" }, { instant: true }); P6.SurveyResultPhone(ph, { kind: "none" }); }
      },
      playFn: function (ctx) { var seq = [{ kind: "scale", q: D.q("q1") }, { kind: "theme", theme: D.theme("t1") }, { kind: "choice", q: D.q("q2") }]; seq.forEach(function (it, i) { CL.later(function () { ctx.sr.show(it); }, 200 + i * 2200); }); } },
    SegmentFilter: { id: "SET-04", title: "Segment filter", kind: "app", surface: "setup", w: 340, h: 600,
      states: { "Everyone": function (el) { pad(el, P6.SegmentFilter({})); }, "60 to 74 selected": function (el) { pad(el, P6.SegmentFilter({ selected: { g: "age", i: 4 } })); } } },
    DuplicateFlag: { id: "SET-04", title: "Duplicate flag", kind: "app", surface: "setup", w: 380, h: 300,
      states: { "Two flagged": function (el) { pad(el, P6.DuplicateFlag(D.duplicates)); }, "One checked": function (el) { pad(el, P6.DuplicateFlag(D.duplicates, { checked: ["d1"] })); }, "None": function (el) { pad(el, P6.DuplicateFlag([])); } } },
    DiscoverTheme: { id: "SET-04, SET-06", title: "Discover theme", kind: "app", surface: "setup", w: 640, h: 560, play: true,
      states: {
        "Drafts and accepted": function (el, ctx) { ctx.tl = new P6.ThemeList(pad(el)); ctx.tl.set(themes(["t1", "t2", "t4"], { accepted: ["t1"] }), { instant: true }); ctx.mode = "grow"; },
        "Renamed and merged": function (el, ctx) { ctx.tl = new P6.ThemeList(pad(el)); var l = themes(["t3", "t9"], { accepted: ["t3", "t9"] }); l[0].renamedFrom = l[0].label; l[0].label = l[0].rename; l[1].n = 33; l[1].merged = 2; ctx.tl.set(l, { instant: true }); ctx.mode = "merge"; },
        "Interviews": function (el, ctx) { ctx.tl = new P6.ThemeList(pad(el), { quoteMax: 1 }); ctx.tl.set(D.interviewThemes.slice(0, 2).concat([D.interviewThemes[4]]).map(function (t, i) { var x = clone(t); x.kind = "interviews"; x.order = i; return x; }), { instant: true }); ctx.mode = null; },
        "Very long text": function (el, ctx) { ctx.tl = new P6.ThemeList(pad(el)); var l = themes(["t1"]); l[0].label = "A clear way into groups for newcomers, young families and anyone still looking for where to start"; ctx.tl.set(l, { instant: true }); ctx.mode = null; }
      },
      playFn: function (ctx) {
        if (ctx.mode === "merge") { ctx.tl.set(themes(["t9", "t10"]), { instant: true }); CL.later(function () { var nx = themes(["t9"], { accepted: ["t9"] }); nx[0].n = 33; nx[0].merged = 2; ctx.tl.merge("t10", "t9", nx); }, 500); return; }
        ctx.tl.set(themes(["t1", "t2", "t4"], { of: 61, counts: D.draftAt.counts }), { instant: true }); CL.later(function () { ctx.tl.set(themes(["t1", "t2", "t4"], { accepted: ["t1"] })); }, 500);
      } },
    ThinFlag: { id: "Every surface", title: "Thin flag", kind: "tvphone",
      states: { "Every surface": function (box, ctx, ph) {
        var tv = CL.stage(box, ctx.theme); CL.screenTexture(tv, "content"); var c = h("div", "cwl-tv-content"); tv.appendChild(c);
        c.innerHTML = '<div class="cwl-tv-eyebrow">On the TV</div><div style="margin:auto 0;display:flex;flex-direction:column;gap:32px"><div class="cwl-tv-headline-xl"><strong>Things for young adults</strong></div><div>' + P6.ThinFlag("6 of 87 respondents", { surface: "tv" }) + "</div></div>";
        var ab = h("div"); ab.style.cssText = "grid-column:1 / -1;max-width:520px"; box.parentNode.appendChild(ab);
        pad(CL.appFrame(ab, 520, 90, "setup"), '<div class="cwl-a-row">' + P6.ThinFlag("6 of 87 respondents") + P6.ThinFlag("one interview") + "</div>", "card");
        ph.body.innerHTML = '<div class="cwl-ph-headline">Things for young adults</div><div>' + P6.ThinFlag("6 of 87", { surface: "phone" }) + '</div><div class="cwl-ph-text">Six answers can\'t speak for every young adult at Riverside.</div>';
      } } },
    NotesUpload: { id: "SET-06", title: "Notes upload", kind: "app", surface: "setup", w: 420, h: 640,
      states: {
        "Typical": function (el) { pad(el, P6.NotesUpload(clone(D.files))); },
        "Uploading": function (el) { pad(el, P6.NotesUpload(clone(D.files).slice(0, 4).concat([{ id: "u", name: "Interview 5 notes.docx", kind: "interview", state: "uploading", progress: 55 }]))); },
        "Couldn't read": function (el) { pad(el, P6.NotesUpload(clone(D.files).slice(0, 3).concat([clone(D.badFile)]))); },
        "Empty": function (el) { pad(el, P6.NotesUpload([])); }
      } },
    FourListsBoard: { id: "INT-11", title: "Four Lists board", kind: "tv", play: true,
      states: {
        "Typical": function (box, ctx) { ctx.sh = listShell(box, ctx); ctx.b = new P6.FourListsBoard(ctx.sh.host, { shell: ctx.sh, max: 4 }); requestAnimationFrame(function () { ctx.cards = cards(); ctx.b.set(ctx.cards, { instant: true }); ctx.sh.count(ctx.cards.length, "cards", true); }); },
        "Empty": function (box, ctx) { ctx.sh = listShell(box, ctx); ctx.b = new P6.FourListsBoard(ctx.sh.host, { shell: ctx.sh, max: 4 }); requestAnimationFrame(function () { ctx.cards = []; ctx.b.set([], { instant: true }); }); },
        "Very long text": function (box, ctx) { ctx.sh = listShell(box, ctx); ctx.b = new P6.FourListsBoard(ctx.sh.host, { shell: ctx.sh, max: 3 }); requestAnimationFrame(function () { ctx.cards = cards().concat([clone(D.longCard)]); ctx.b.set(ctx.cards, { instant: true }); }); }
      },
      playFn: function (ctx) {
        var sim = clone(D.similar); sim.t = 50; ctx.cards = ctx.cards.concat([sim]); ctx.b.set(ctx.cards, { newest: sim.id });
        CL.later(function () { var nx = ctx.cards.filter(function (c) { return c.id !== sim.id; }).map(function (c) { if (c.id === "c7") { c = clone(c); c.agree += 1; c.folded = 1; } return c; }); ctx.cards = nx; ctx.b.fold(sim.id, "c7", nx); }, 1700);
      } },
    FourListsCard: { id: "INT-11, SET-05", title: "Four Lists card", kind: "tv",
      states: { "Every state": function (box, ctx) {
        var tv = CL.stage(box, ctx.theme); CL.screenTexture(tv, "input"); var c = h("div", "cwl-tv-content"); tv.appendChild(c);
        c.innerHTML = '<div class="cwl-tv-eyebrow">FourListsCard</div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:24px">' + [{ text: "A path into groups", agree: 4 }, { text: "A path into groups", agree: 5, folded: 1 }, { text: "Young adults", agree: 0 }, { text: "Who approves the budget?", agree: 3 }, D.longCard].map(function (x) { return P6.FourListsCard(x); }).join("") + P6.FourListsCard({ text: "Kids love Sunday", agree: 0 }, { newest: true }) + "</div>";
      } } },
    FourListsComposer: { id: "INT-11", title: "Four Lists composer", kind: "phones", theme: true,
      states: {
        "Writing and agreeing": function (row, ctx) { var c = cards(); [{ col: "missing", text: "A clear way to join a group", cards: c, max: 2 }, { col: "wrong", sent: "Staff stretched thin", cards: c, agreed: ["c5"], max: 3 }, { col: "right", cards: [] }].forEach(function (o) { var b = h("div"); row.appendChild(b); P6.FourListsComposer(P4.phone(b, { theme: ctx.theme, head: "live" }), o); }); },
        "Phones down and offline": function (row, ctx) { var c = cards(); var b = h("div"); row.appendChild(b); P6.FourListsComposer(P4.phone(b, { theme: ctx.theme, head: "down", dim: true }), { down: true, sent: "A path into groups" }); var d = h("div"); row.appendChild(d); P6.FourListsComposer(P4.phone(d, { theme: ctx.theme, head: "offline" }), { col: "missing", sent: "Young adults", offline: true, cards: c, max: 2 }); }
      } },
    WhatWeHeardHeadline: { id: "PRE-08", title: "What We Heard headline", kind: "tvphone",
      states: {
        "Built from themes": function (box, ctx, ph) { wwhTV(box, ctx, D.heard[0]); ph.body.innerHTML = P6.WhatWeHeardHeadline(D.heard[0], { surface: "phone" }); },
        "A thin headline": function (box, ctx, ph) { wwhTV(box, ctx, D.heard[3]); ph.body.innerHTML = P6.WhatWeHeardHeadline(D.heard[3], { surface: "phone" }); },
        "In setup": function (box, ctx, ph) { var a = CL.appFrame(box, 860, 420, "setup"); pad(a, D.heard.map(function (x) { return P6.WhatWeHeardHeadline(x); }).join("")); ph.body.innerHTML = P6.WhatWeHeardHeadline(D.heard[2], { surface: "phone" }); }
      } },
    SignalCard: { id: "FAC-02", title: "Signal card", kind: "app", surface: "control", w: 420, h: 760, play: true,
      states: {
        "The four kinds": function (el, ctx) { var p = pad(el, P4.PRIVATE("Alignment signal", '<div class="x"></div>')); ctx.p = new P6.SignalPanel(p.querySelector(".x")); ctx.p.set(D.signals, { instant: true }); },
        "Silent held": function (el, ctx) { var p = pad(el, P4.PRIVATE("Alignment signal", '<div class="x"></div>')); ctx.p = new P6.SignalPanel(p.querySelector(".x")); ctx.p.set(D.signals.filter(function (s) { return s.kind !== "silent"; }), { instant: true, held: 1 }); },
        "Saved as a citation": function (el, ctx) { var p = pad(el, P4.PRIVATE("Alignment signal", '<div class="x"></div>')); ctx.p = new P6.SignalPanel(p.querySelector(".x")); ctx.p.set([D.signal("g3")], { instant: true, saved: ["g3"] }); },
        "No accepted themes": function (el, ctx) { var p = pad(el, P4.PRIVATE("Alignment signal", '<div class="x"></div>')); ctx.p = new P6.SignalPanel(p.querySelector(".x")); ctx.p.set([], { state: "none" }); },
        "AI off": function (el, ctx) { var p = pad(el, P4.PRIVATE("Alignment signal", '<div class="x"></div>')); ctx.p = new P6.SignalPanel(p.querySelector(".x")); ctx.p.set([], { state: "aiOff" }); }
      },
      playFn: function (ctx) { var l = [D.signal("g3")]; ctx.p.set(l, { instant: true }); CL.later(function () { l = [D.signal("g2")].concat(l); ctx.p.set(l, {}); }, 300); CL.later(function () { var nx = l.filter(function (x) { return x.id !== "g2"; }); ctx.p.dismiss("g2", nx, {}); }, 2400); } },
    SignalDetail: { id: "FAC-02", title: "Signal detail", kind: "app", surface: "control", w: 420, h: 820,
      states: {
        "Silent": function (el) { var p = pad(el, P4.PRIVATE("Alignment signal", '<div class="x"></div>')); new P6.SignalPanel(p.querySelector(".x")).set(D.signals, { state: "detail", open: "g1" }); },
        "Divergent": function (el) { var p = pad(el, P4.PRIVATE("Alignment signal", '<div class="x"></div>')); new P6.SignalPanel(p.querySelector(".x")).set(D.signals, { state: "detail", open: "g2" }); },
        "Aligned, saved": function (el) { var p = pad(el, P4.PRIVATE("Alignment signal", '<div class="x"></div>')); new P6.SignalPanel(p.querySelector(".x")).set(D.signals, { state: "detail", open: "g3", saved: ["g3"] }); },
        "Question on the TV": function (el) { var p = pad(el, P4.PRIVATE("Alignment signal", '<div class="x"></div>')); new P6.SignalPanel(p.querySelector(".x")).set(D.signals, { state: "detail", open: "g1", onTV: true }); },
        "Very long text": function (el) { var p = pad(el, P4.PRIVATE("Alignment signal", '<div class="x"></div>')); new P6.SignalPanel(p.querySelector(".x")).set([D.longSignal], { state: "detail", open: "g5", openSignal: D.longSignal }); }
      } },
    SignalList: { id: "FAC-03", title: "Signal list on the remote", kind: "remotes",
      states: {
        "Laptop closed": function (row) { [[null, "Closed"], ["g1", "A card opened"]].forEach(function (x) { var b = h("div"); row.appendChild(b); P4.remote(b, { title: "Five Lenses: Congregation", top: P6.SignalList(D.signals, { open: x[0] }), buttons: P4.rbtn("Phones down", "smartphone") }); }); },
        "Held and empty": function (row) { var b = h("div"); row.appendChild(b); P4.remote(b, { title: "Five Lenses: Congregation", top: P6.SignalList(D.signals.slice(1), { held: 1 }), buttons: "" }); var c = h("div"); row.appendChild(c); P4.remote(c, { title: "Welcome and prayer", top: P6.SignalList([], { state: "none" }), buttons: "" }); },
        "A team facilitator's remote": function (row) { var b = h("div"); row.appendChild(b); P4.remote(b, { title: "Commander's intent", banner: '<div class="cwl-a-banner is-info" role="status"><span class="ic">' + CL.lucide("hand-helping") + "</span><div><strong>You have the remote.</strong> Priya · team-led block</div></div>", top: P6.SignalList(D.signals, { team: true }), buttons: P4.rbtn("Next", "chevron-right", "is-primary") }); }
      } }
  };
  function srTV(box, ctx) { var sh = P4.shell(box, { theme: ctx.theme, unit: "responses" }); sh.tv.querySelector(".cwl-tally").style.display = "none"; sh.tv.querySelector(".p2-marker-slot").style.visibility = "hidden"; return new P6.SurveyResultScreen(sh); }
  function wwhTV(box, ctx, hd) { var tv = CL.stage(box, ctx.theme); CL.screenTexture(tv, "content"); var top = h("div", "cwl-tv-top"); top.innerHTML = window.ClearwayLivePass2.lockup() + "<span></span>"; tv.appendChild(top); var c = h("div", "cwl-tv-content"); tv.appendChild(c); c.innerHTML = '<div class="cwl-tv-eyebrow">What we heard</div>' + P6.WhatWeHeardHeadline(hd, { surface: "tv", callout: !hd.thin }); CL.icons(); }

  function card(name, note) {
    var c = CARDS[name], root = document.getElementById("root"); root.className = "cwl-doc";
    root.innerHTML = '<div class="cwl-doc-eyebrow">Component · ' + esc(c.id) + '</div><div class="cwl-doc-title">' + esc(c.title) + '</div><div class="cwl-tabs" role="tablist"></div>' +
      '<div class="xtra" style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0"></div><div class="box"></div><div class="cwl-doc-note" aria-live="polite"></div>';
    var ctx = { theme: "dark", motion: "full" }, cur = Object.keys(c.states)[0];
    var tabs = root.querySelector(".cwl-tabs"), xtra = root.querySelector(".xtra"), box = root.querySelector(".box");
    function build() {
      CL.clearTimers(); box.innerHTML = "";
      tabs.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", b.textContent === cur ? "true" : "false"); });
      if (c.kind === "tv") { var el = h("div"); box.appendChild(el); c.states[cur](el, ctx); }
      else if (c.kind === "tvphone") { var g = h("div"); g.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) 200px;gap:14px;align-items:start"; box.appendChild(g); var t = h("div"); g.appendChild(t); var pb = h("div"); g.appendChild(pb); var ph = P4.phone(pb, { theme: ctx.theme, head: "live" }); c.states[cur](t, ctx, ph); }
      else if (c.kind === "phones" || c.kind === "remotes") { var r = h("div"); r.style.cssText = "display:grid;grid-template-columns:repeat(3,200px);gap:14px"; box.appendChild(r); c.states[cur](r, ctx); }
      else { var b = h("div"); b.style.maxWidth = c.w + "px"; box.appendChild(b); c.states[cur](CL.appFrame(b, c.w, c.h, c.surface), ctx); }
      box.querySelectorAll("[data-surface]").forEach(function (e) { e.setAttribute("data-motion", ctx.motion); });
      root.querySelector(".cwl-doc-note").textContent = note || "";
      CL.icons();
    }
    Object.keys(c.states).forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.textContent = s; t.onclick = function () { cur = s; build(); }; tabs.appendChild(t); });
    function x(label, fn) { var b = h("button", "cwl-tab"); b.type = "button"; b.textContent = label; b.onclick = function () { fn(b); }; xtra.appendChild(b); return b; }
    if (c.kind === "tv" || c.kind === "tvphone" || c.theme) x("Off-White", function (b) { ctx.theme = ctx.theme === "dark" ? "light" : "dark"; b.setAttribute("aria-selected", ctx.theme === "light"); build(); });
    x("Reduced motion", function (b) { ctx.motion = ctx.motion === "full" ? "reduced" : "full"; b.setAttribute("aria-selected", ctx.motion === "reduced"); build(); });
    if (c.play) x("Play the movement", function () { CL.clearTimers(); c.playFn(ctx); });
    build();
  }
  window.ClearwayLivePass6Card = card;
  window.ClearwayLivePass6Cards = CARDS;
})();
