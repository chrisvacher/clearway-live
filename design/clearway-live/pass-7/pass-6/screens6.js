/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 6 · screens6.js
   Boards for milestone 6: Discover (the survey read from Team Hub, the Four
   Helpful Lists, interviews and What We Heard) and the alignment signal. Each
   board keeps its screens in place and moves them between states without
   redrawing.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P3 = window.ClearwayLivePass3, P4 = window.ClearwayLivePass4, W = window.ClearwayLivePass4Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide, PH = P4.PH, B = P4.B, CHIP = P4.CHIP, BAN = P4.BAN, SYNC = P4.SYNC, PRIVATE = P4.PRIVATE, item = P4.item, IB = P4.IB, SB = P4.SB;
  var host = document.getElementById("boards");
  var Y = W.Y;
  function clone(a) { return JSON.parse(JSON.stringify(a)); }

  /* ---------- Scaffolding (matches the pass 3 and 4 review pages) ---------- */
  function board(id, title, ids, note) {
    var s = h("section", "sc-board"); s.id = id;
    s.innerHTML = '<header class="sc-head"><div><div class="sc-ids"></div><h2></h2></div></header><p class="sc-note"></p><div class="sc-body"></div>';
    s.querySelector("h2").textContent = title;
    s.querySelector(".sc-ids").innerHTML = ids.map(function (x) { return '<span class="sc-id">' + esc(x) + "</span>"; }).join("");
    s.querySelector(".sc-note").textContent = note || "";
    if (!note) s.querySelector(".sc-note").remove();
    host.appendChild(s);
    var nav = document.getElementById("toc");
    if (nav) { var a = h("a"); a.href = "#" + id; a.textContent = ids[0] && /^[A-Z0-9]+-\d/.test(ids[0]) ? ids[0] + " " + title : title; nav.appendChild(a); }
    return s.querySelector(".sc-body");
  }
  function part(id, title, note) {
    var s = h("div", "p4-part"); s.id = id; s.innerHTML = '<div class="sc-eyebrow">Part</div><h2></h2>' + (note ? "<p></p>" : "");
    s.querySelector("h2").textContent = title; if (note) s.querySelector("p").textContent = note;
    host.appendChild(s);
  }
  function row(parent, cls) { var r = h("div", "sc-row " + (cls || "")); parent.appendChild(r); return r; }
  function frame(parent, label, cls, caption) {
    var w = h("figure", "sc-frame " + (cls || ""));
    w.innerHTML = '<figcaption class="sc-label"></figcaption><div class="sc-box"></div>' + (caption ? '<p class="sc-cap"></p>' : "");
    w.querySelector(".sc-label").textContent = label;
    if (caption) w.querySelector(".sc-cap").textContent = caption;
    parent.appendChild(w);
    return w.querySelector(".sc-box");
  }
  function app(parent, label, w, hgt, surface, caption) { return CL.appFrame(frame(parent, label, "is-app", caption), w, hgt, surface || "control"); }
  function seg(names, on, cls) { return '<div class="p3-seg ' + (cls || "") + '" role="group">' + names.map(function (n, i) { return '<span role="button" tabindex="0" aria-pressed="' + (i === on) + '"' + (i === on ? ' class="is-on"' : "") + ">" + esc(n) + "</span>"; }).join("") + "</div>"; }
  function stat(st) { return { offline: /Offline/.test(st), down: st === "Phones down", reduced: st === "Reduced motion", ai: st !== "AI off", crowded: /Crowded/.test(st), long: st === "Very long text" }; }

  /* A board of states with buttons: tabs on top, a caption, then whatever spec.draw builds.
     Frames built once by spec.make stay in place; spec.draw moves them to the state. */
  function stateBoard(spec) {
    var b = board(spec.id, spec.title, spec.ids, spec.note);
    var bar = h("div", "cwl-a-row"); bar.style.cssText = "justify-content:space-between;align-items:flex-start;gap:12px";
    var tabs = h("div", "cwl-tabs sc-tabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", spec.title + " states");
    var right = h("div", "cwl-a-row"); right.setAttribute("data-surface", "setup"); right.setAttribute("data-theme", "light"); right.style.flexWrap = "nowrap";
    right.innerHTML = spec.theme ? seg(["Navy", "Off-White"], 0, "p3-theme") : "";
    bar.appendChild(tabs); bar.appendChild(right); b.appendChild(bar);
    var cap = h("p", "sc-note"); cap.setAttribute("aria-live", "polite"); b.appendChild(cap);
    var acts = h("div", "sc-actions"); acts.setAttribute("data-surface", "setup"); acts.setAttribute("data-theme", "light"); b.appendChild(acts);
    var stage = h("div", "sc-body"); b.appendChild(stage);
    var ctx = { theme: "dark", state: null, acts: acts, stage: stage };
    ctx.button = function (label, icon, fn) { var x = h("button", "cwl-a-btn is-secondary"); x.type = "button"; x.innerHTML = L(icon) + "<span>" + esc(label) + "</span>"; x.onclick = fn; acts.appendChild(x); CL.icons(); };
    function select(state, instant) {
      CL.clearTimers();
      ctx.state = state;
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.textContent === state ? "true" : "false"); });
      stage.querySelectorAll("[data-surface]").forEach(function (e) { if (!e.closest(".sc-actions")) e.setAttribute("data-motion", state === "Reduced motion" ? "reduced" : "full"); });
      acts.innerHTML = "";
      cap.textContent = spec.draw(ctx, state, !!instant) || "";
      CL.icons();
    }
    spec.states.forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.setAttribute("role", "tab"); t.textContent = s; t.onclick = function () { select(s); }; tabs.appendChild(t); });
    right.querySelectorAll(".p3-theme span").forEach(function (sp, i) {
      sp.onclick = function () { right.querySelectorAll(".p3-theme span").forEach(function (x, j) { x.classList.toggle("is-on", i === j); x.setAttribute("aria-pressed", i === j); }); ctx.theme = i ? "light" : "dark"; stage.innerHTML = ""; spec.make(ctx); select(ctx.state, true); };
    });
    spec.make(ctx);
    requestAnimationFrame(function () { requestAnimationFrame(function () { select(spec.start || spec.states[0], true); }); });
    return ctx;
  }


  function intBoard(spec) {
    var b = board(spec.id, spec.title, spec.ids, spec.note);
    var bar = h("div", "cwl-a-row"); bar.style.cssText = "justify-content:space-between;align-items:flex-start;gap:12px";
    var tabs = h("div", "cwl-tabs sc-tabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", spec.title + " states");
    var right = h("div", "cwl-a-row"); right.setAttribute("data-surface", "setup"); right.setAttribute("data-theme", "light"); right.style.flexWrap = "nowrap";
    right.innerHTML = seg(["Navy", "Off-White"], 0, "p3-theme");
    bar.appendChild(tabs); bar.appendChild(right); b.appendChild(bar);
    var cap = h("p", "sc-note"); cap.setAttribute("aria-live", "polite"); b.appendChild(cap);
    var acts = h("div", "sc-actions"); acts.setAttribute("data-surface", "setup"); acts.setAttribute("data-theme", "light"); b.appendChild(acts);
    var r1 = row(b, "is-tv1"); r1.style.gridTemplateColumns = "minmax(0, 1fr) " + (spec.phoneW || 440) + "px";
    var tvBox = frame(r1, spec.tvLabel || "TV · 1920 by 1080", "is-tv");
    var phWrap = h("div", "sc-row is-phones"); phWrap.style.gridTemplateColumns = "repeat(auto-fill, minmax(200px, 1fr))"; r1.appendChild(phWrap);
    var r2 = row(b, "is-1"); r2.style.gridTemplateColumns = spec.remote ? "minmax(0, 1fr) 220px" : "minmax(0, 1fr)";
    var r3 = spec.extra ? row(b, "is-1") : null;
    var ctx = { theme: "dark", state: null, spec: spec, acts: acts };
    function build() {
      tvBox.innerHTML = ""; tvBox.className = "sc-box";
      ctx.sh = P4.shell(tvBox, { theme: ctx.theme, eyebrow: spec.eyebrow || "", headline: spec.headline || "", unit: spec.unit || "answers", lens: spec.lens });
      ctx.view = spec.make ? spec.make(ctx) : null;
    }
    function select(state, instant) {
      CL.clearTimers();
      ctx.state = state;
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.textContent === state ? "true" : "false"); });
      var tv = ctx.sh.tv, s = stat(state);
      tv.setAttribute("data-motion", s.reduced ? "reduced" : "full");
      ctx.sh.state({ offline: s.offline, down: s.down });
      ctx.sh.foot("");
      acts.innerHTML = "";
      cap.textContent = spec.tv(ctx, state, !!instant) || "";
      phWrap.innerHTML = "";
      (spec.phones ? spec.phones(state, ctx) : []).forEach(function (p) {
        var box = frame(phWrap, p.label, "is-phone", p.cap);
        var ph = P4.phone(box, p.o || { head: s.offline ? "offline" : s.down ? "down" : "live", dim: s.down, motion: s.reduced ? "reduced" : null });
        p.render(ph);
      });
      r2.innerHTML = "";
      if (spec.control) { var a = app(r2, spec.ctlLabel || "Control surface · facilitator view", 1280, spec.ctlH || 600, "control"); a.setAttribute("data-motion", s.reduced ? "reduced" : "full"); spec.control(a, state, ctx); }
      if (spec.remote) { var rbox = frame(r2, (typeof spec.remoteLabel === "function" ? spec.remoteLabel(state) : spec.remoteLabel) || "Remote", "is-phone"); spec.remote(rbox, state, ctx); }
      if (r3) { r3.innerHTML = ""; spec.extra(r3, state, ctx); }
      CL.icons();
    }
    (spec.states).forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.setAttribute("role", "tab"); t.textContent = s; t.onclick = function () { select(s); }; tabs.appendChild(t); });
    right.querySelectorAll(".p3-theme span").forEach(function (sp, i) {
      sp.onclick = function () { right.querySelectorAll(".p3-theme span").forEach(function (x, j) { x.classList.toggle("is-on", i === j); x.setAttribute("aria-pressed", i === j); }); ctx.theme = i ? "light" : "dark"; build(); select(ctx.state, true); };
    });
    ctx.button = function (label, icon, fn) { var x = h("button", "cwl-a-btn is-secondary"); x.type = "button"; x.innerHTML = L(icon) + "<span>" + esc(label) + "</span>"; x.onclick = fn; acts.appendChild(x); CL.icons(); };
    build();
    requestAnimationFrame(function () { requestAnimationFrame(function () { select(spec.start || spec.states[2], true); }); });
    return ctx;
  }


  var P6 = window.ClearwayLivePass6, D = window.ClearwayLivePass6Data;
  var THEME_SRC = { q4: "Survey · what we do well", q6: "Survey · what could improve", q9: "Survey · what's unclear" };
  var N = D.survey.responses;

  /* ---------- The setup shell for Discover (data-surface="setup") ---------- */
  function setupShell(a, o) {
    o = o || {};
    var nav = [["Overview", "layout-dashboard"], ["Attendees", "users"], ["Discover", "compass"], ["Run of show", "list-ordered"], ["Overnight review", "moon"], ["Outputs", "file-text"], ["CORE", "send"]];
    var tabs = ["Survey", "Four Helpful Lists", "Interviews", "What We Heard"];
    a.innerHTML = '<div class="cwl-a-shell cwl-d6-shell"><aside class="cwl-a-side"><div class="cwl-a-brand"><span class="mk">' + CL.markSVG() + "</span>Clearway Live</div>" +
      nav.map(function (n) { return '<span class="cwl-a-nav"' + (n[0] === "Discover" ? ' aria-current="page"' : "") + ">" + L(n[1]) + "<span>" + esc(n[0]) + "</span></span>"; }).join("") + "</aside>" +
      '<div class="cwl-a-main"><header class="cwl-a-header"><div style="min-width:0"><div class="cwl-a-eyebrow">' + esc(D.church) + " · Wayfinding " + W.base + ' · Discover</div><div class="cwl-a-title">' + esc(o.title) + "</div></div>" + (o.right || "") + "</header>" +
      '<div class="cwl-a-content"><div class="cwl-a-tabs cwl-d6-tabs" role="tablist">' + tabs.map(function (t) { return '<span class="cwl-a-tab" role="tab" aria-selected="' + (t === o.tab) + '">' + esc(t) + "</span>"; }).join("") + '</div><div class="d6-body" style="display:flex;flex-direction:column;gap:var(--cwl-app-gap);min-height:0;flex:1"></div></div></div></div>';
    CL.icons();
    return a.querySelector(".d6-body");
  }
  function themeData(ids, o) {
    o = o || {};
    return ids.map(function (id, i) {
      var t = clone(D.theme(id)); t.of = o.of || N; t.order = i; t.src = THEME_SRC[t.q]; t.state = (o.accepted || []).indexOf(id) >= 0 ? "accepted" : "draft";
      if (o.counts && o.counts[id] != null) t.n = o.counts[id];
      if (t.rename && o.renamed) { t.renamedFrom = t.label; t.label = t.rename; t.state = "accepted"; }
      return t;
    });
  }

  /* ================================================================
     OPEN DECISIONS
     ================================================================ */
  (function () {
    var b = board("decisions", "Milestone 6 decisions", ["Defaults to confirm"], "The PRD and the November 3 Team Hub decision don't settle these four. Every screen below is designed to the Default. Each card says what the other option would change, so you can choose without a redesign. The thin data rule, segments hidden under 5 respondents, possible duplicates flagged and never blocked, and silent signals held until phones first go down stand as they are.");
    var DEC = [
      ["Where survey themes come from", "The app drafts themes from the open-text answers it reads from Team Hub, and the facilitator accepts, renames, merges or rejects each one (SET-04 results, DiscoverTheme, ThemeList).", "The app imports the themes from Team Hub's own analysis once its coding is done, with their counts. SET-04 results loses Accept, Rename, Merge and Reject and the AI drafted marker: each theme shows \"From Team Hub's codebook\" and an Open in Team Hub link, and themes wait until Team Hub's Report is approved. The counts, quotes, thin flag and everything downstream (What We Heard, the signal, the room) stay the same."],
      ["A linked survey that collects email", "Link it with a warning. The app never shows the email (SurveyLink, the Collects email state).", "Refuse to link until email collection is off in Team Hub. The warning becomes a blocking state on SET-04: \"Turn off email collection in Team Hub, then link it\", with Open in Team Hub and Check again. Nothing else changes."],
      ["Which questions make the segments", "The questions in the template's About you section: age band, years attending, involvement, and location for multisite churches (SegmentFilter).", "The facilitator picks the segment questions on SET-04: a short checklist of the survey's single and multiple choice questions above the segments. Small segments are still hidden under 5 and thin ones still flagged."],
      ["Where interview notes come from", "Paste, Word, PDF or text (NotesUpload).", "Also pick a Granola meeting's transcript. NotesUpload gains Pick from Granola beside Paste notes: a search of the facilitator's Granola meetings, then the transcript arrives as a file row marked Granola with the meeting's date. Themes, counts and the privacy line are unchanged."]
    ];
    var g = h("div", "p4-dec");
    g.innerHTML = DEC.map(function (d) { return "<article><h3>" + esc(d[0]) + '</h3><div class="lbl">Default, designed</div><p class="def">' + esc(d[1]) + '</p><div class="lbl">The other option</div><p>' + esc(d[2]) + "</p></article>"; }).join("");
    b.appendChild(g);
  })();

  /* ================================================================
     PART · THE SURVEY
     ================================================================ */
  part("part-survey", "The congregational survey, read from Team Hub", "Team Hub builds the survey, hosts the page the congregation answers on, and stores the responses. Clearway Live links the survey to the engagement, reads its questions and responses, never writes to it, and does the Discover work: results, segments, duplicates and themes in setup, and one result at a time in the room. Setup screens are data-surface=\"setup\": app tokens, Warning and Error allowed, never Sunrise.");

  /* SET-04 · link, status, share, count */
  stateBoard({ id: "set-04", title: "The congregational survey", ids: ["SET-04", "SurveyLink", "ResponseCount"],
    note: "Link a Team Hub survey to the engagement (only surveys linked to this engagement in Team Hub are offered), see its status and close date, copy the open link and QR code from Team Hub, and read the response count. The app counts responses itself each time it reads Team Hub: when this screen opens and when you press Refresh, and it says when it last read. There is no live count in the room.",
    states: ["No survey linked yet", "Linking a Team Hub survey", "A draft in Team Hub", "Open and collecting", "The first response", "87 responses", "360 responses", "Closed", "Collects email", "Imported from CSV", "Team Hub unreachable", "Reduced motion"],
    start: "Open and collecting",
    make: function (ctx) {
      var r = row(ctx.stage, "is-1");
      ctx.a = app(r, "Setup · laptop · data-surface=\"setup\"", 1280, 720, "setup");
      var body = setupShell(ctx.a, { title: "Congregational survey", tab: "Survey", right: P6.teamHubBtn("Surveys in Team Hub", "is-ghost") });
      body.innerHTML = '<div class="cwl-d6-grid" style="grid-template-columns:minmax(0,1fr) 340px"><div class="d6-link"></div><div style="display:flex;flex-direction:column;gap:var(--cwl-app-gap)"><div class="d6-count"></div><div class="d6-sum"></div></div></div>';
      ctx.rc = new P6.ResponseCount(body.querySelector(".d6-count"));
      ctx.body = body;
    },
    draw: function (ctx, st, inst) {
      var map = { "No survey linked yet": "none", "Linking a Team Hub survey": "pick", "A draft in Team Hub": "draft", "Closed": "closed", "Collects email": "email", "Imported from CSV": "csv", "Team Hub unreachable": "unreachable" };
      var ls = map[st] || "open";
      ctx.body.querySelector(".d6-link").innerHTML = P6.SurveyLink(ls);
      P6.drawQR(ctx.body);
      var n = st === "The first response" ? 1 : st === "360 responses" ? D.big.responses : st === "Open and collecting" ? 75 : /No survey|Linking|draft/.test(st) ? 0 : N;
      var cnt = ctx.body.querySelector(".d6-count"); cnt.style.display = /No survey|Linking/.test(st) ? "none" : "";
      ctx.rc.set(n, { instant: true, unreachable: ls === "unreachable", csv: ls === "csv", read: st === "The first response" ? "9:16 am" : st === "Open and collecting" ? "3:40 pm" : null });
      var sum = ctx.body.querySelector(".d6-sum");
      if (/No survey|Linking|draft/.test(st)) sum.innerHTML = '<div class="cwl-a-card" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px"><div class="cwl-a-label">' + L("info") + ' How the survey works</div><div class="cwl-d6-note" style="color:var(--cwl-app-text)"><span>Team Hub builds, publishes and closes the survey and hosts the page the congregation answers on. Clearway Live reads it: results, segments, themes, and the room.</span></div></div>';
      else sum.innerHTML = '<div class="cwl-a-card" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px"><div class="cwl-a-label">Results and themes</div>' +
        '<div class="cwl-d6-kv" style="grid-template-columns:minmax(0,1fr) auto"><span>Questions</span><b>' + D.questions.length + "</b><span>Themes drafted</span><b>" + (n > 1 ? 10 : 0) + "</b><span>Themes accepted</span><b>" + (n > 1 ? 6 : 0) + "</b><span>Possible duplicates</span><b>" + (n > 1 ? D.duplicates.length : 0) + "</b><span>Segments hidden, under 5</span><b>" + (n > 1 ? 2 : 0) + "</b></div>" +
        B("See the results", "is-primary", "chart-column") + "</div>";
      CL.icons();
      if (st === "Open and collecting" || st === "Reduced motion") ctx.button("Refresh: 12 new responses", "refresh-cw", function () {
        ctx.rc.set(75, { refreshing: true, instant: true });
        CL.later(function () { ctx.rc.set(N, { read: "4:12 pm" }); }, 900);
      });
      return {
        "No survey linked yet": "Nothing linked. Open in Team Hub to create it leaves the app for team.clearway.co, where the survey is built from the Wayfinding template and linked to this engagement. Import a CSV covers a survey run elsewhere.",
        "Linking a Team Hub survey": "Only surveys linked to this engagement in Team Hub are offered. Linking only lets the app read it.",
        "A draft in Team Hub": "The survey is still a draft in Team Hub. There's no link or QR code until it's published there, and the questions can still change.",
        "Open and collecting": "Published and collecting. The questions are locked because Team Hub locks them at the first response, so the app shows that instead of offering edits. The count was read at 3:40 pm. Press the button to refresh: the number rolls up and says how many are new.",
        "The first response": "One response, read at 9:16 am. Team Hub locked the questions when it arrived.",
        "87 responses": "Riverside's total, read at 4:12 pm.",
        "360 responses": "One past engagement's total. The count and the results scale. Nothing else changes.",
        "Closed": "Closed in Team Hub on its close date. The link still works but Team Hub shows its closed message. The results stay here.",
        "Collects email": "This survey collects email in Team Hub (the Wayfinding template doesn't). The app links it with a warning and never shows an email anywhere. The other option is on the decisions board.",
        "Imported from CSV": "A survey run outside Team Hub. Columns are matched to questions, About you columns become segments, and anything unmatched is kept out.",
        "Team Hub unreachable": "Team Hub can't be reached. The last results stay, with when they were read. Nothing is lost.",
        "Reduced motion": "The count changes in place, with no roll."
      }[st];
    }
  });

  /* SET-04 results · questions, segments, duplicates, themes */
  var Q_SCALE = D.q("q1"), Q_CHOICE = D.q("q2"), Q_MULTI = D.q("q17"), Q_IMPROVE = D.q("q6"), Q_UNCLEAR = D.q("q9");
  function questionList(cur) {
    return '<nav class="d6-qlist" aria-label="Questions">' + D.questions.map(function (q, i) {
      var answered = q.answered != null ? q.answered : q.type === "multi_choice" ? N : q.counts.reduce(function (a, b) { return a + b; }, 0);
      return '<div class="d6-qi' + (q.id === cur ? " is-current" : "") + '"><span class="n">' + (i + 1) + '</span><span class="t">' + esc(q.title) + '</span><span class="c">' + answered + "</span></div>";
    }).join("") + "</nav>";
  }
  stateBoard({ id: "set-04-results", title: "Survey results and themes", ids: ["SET-04", "QuestionResult", "DiscoverTheme", "ThemeList", "SegmentFilter", "DuplicateFlag", "ThinFlag"],
    note: "Results by question in the survey's own option order, so nothing jumps when a refresh brings new responses. Segments come from the About you section, with segments under 5 respondents hidden and the reason shown. Possible duplicates are flagged with what matched and are never blocked or removed. Open-text questions show AI drafted themes, each with what it rests on (27 of 87), example quotes with no names, and the thin flag. The facilitator accepts, renames, merges or rejects each one. Only accepted themes reach What We Heard and the signal.",
    states: ["A scale question", "A choice question", "Multiple choice", "Themes drafting as answers arrive", "A theme accepted", "A theme renamed", "Themes merged", "A theme rejected", "A thin theme", "A segment selected", "Possible duplicates", "AI off", "360 responses", "Very long text", "Reduced motion"],
    start: "A theme accepted",
    make: function (ctx) {
      var r = row(ctx.stage, "is-1");
      ctx.a = app(r, "Setup · laptop · results", 1280, 920, "setup");
      var body = setupShell(ctx.a, { title: "Congregational survey · results", tab: "Survey", right: '<span class="cwl-a-row" style="flex-wrap:nowrap">' + CHIP("Read from Team Hub at 4:12 pm", "is-outline", "refresh-cw") + SB("Refresh", "refresh-cw") + "</span>" });
      body.innerHTML = '<div class="cwl-d6-grid" style="grid-template-columns:232px minmax(0,1fr) 300px;min-height:0"><div class="d6-q" style="min-height:0;overflow:hidden"></div><div class="d6-res" style="min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:12px"><div class="d6-qr"></div><div class="d6-th"></div><div class="d6-manual"></div></div><div class="d6-side" style="display:flex;flex-direction:column;gap:var(--cwl-app-gap);min-height:0;overflow:hidden"></div></div>';
      ctx.qr = new P6.QuestionResult(body.querySelector(".d6-qr"));
      ctx.tl = new P6.ThemeList(body.querySelector(".d6-th"), { quoteMax: 1 });
      ctx.body = body;
    },
    draw: function (ctx, st, inst) {
      var body = ctx.body, q = Q_IMPROVE, d = { instant: inst }, list = null, foot = "", sel = null, checked = [], manual = "";
      var accepted = ["t1"];
      switch (st) {
        case "A scale question": q = Q_SCALE; break;
        case "A choice question": q = Q_CHOICE; break;
        case "Multiple choice": q = Q_MULTI; break;
        case "Themes drafting as answers arrive": list = themeData(["t1", "t2", "t3", "t4", "t5"], { of: D.draftAt.responses, counts: D.draftAt.counts }); d.answered = D.draftAt.responses; foot = L("loader-circle") + " Drafting as answers arrive · read at 2:05 pm"; break;
        case "A theme accepted": case "A thin theme": case "Reduced motion": list = themeData(["t1", "t2", "t3", "t4", "t5"], { accepted: accepted }); break;
        case "A theme renamed": list = themeData(["t1", "t2", "t3", "t4", "t5"], { accepted: accepted, renamed: true }); break;
        case "Themes merged": q = Q_UNCLEAR; list = (function () { var l = themeData(["t9"], { accepted: ["t9"] }); l[0].n = 33; l[0].merged = 2; return l; })(); break;
        case "A theme rejected": list = themeData(["t1", "t2", "t3", "t4"], { accepted: accepted }); foot = "1 rejected: The coffee. " + '<a href="#" tabindex="-1" class="cwl-a-link">Restore</a>'; break;
        case "A segment selected": q = Q_SCALE; sel = { g: "age", i: 4 }; d.counts = [0, 1, 3, 9, 14]; d.segment = "60 to 74 · 27 respondents"; break;
        case "Possible duplicates": q = Q_SCALE; checked = ["d1"]; break;
        case "AI off": list = []; break;
        case "360 responses": list = themeData(["t1", "t2", "t3", "t4", "t5"], { of: D.big.responses, counts: D.big.themes, accepted: accepted }); d.answered = D.big.responses; break;
        case "Very long text": list = themeData(["t1", "t2", "t3"], { accepted: accepted }); list[0].label = "A clear way into groups for newcomers, young families and anyone who has been here a year and still doesn't know where to start"; list[0].quotes = ["I've been coming for just over a year with my two kids, I've filled in the connect card twice, and nobody has followed up about a group, so I still sit in the same row every week and leave right after."]; break;
      }
      if (st === "360 responses" && q === Q_IMPROVE) d.answered = D.big.responses;
      body.querySelector(".d6-q").innerHTML = questionList(q.id);
      ctx.qr.set(q, d);
      var th = body.querySelector(".d6-th"), man = body.querySelector(".d6-manual");
      if (list) {
        th.style.display = "";
        ctx.tl.set(list, { instant: inst, foot: foot });
      } else { th.style.display = "none"; }
      if (st === "AI off") {
        th.style.display = "none";
        man.innerHTML = '<div class="cwl-a-banner is-info" role="status"><span class="ic">' + L("info") + "</span><div><strong>AI is off for this engagement.</strong> No themes are drafted. Group the answers by hand: add each to a theme, or start a new one.</div></div>" +
          '<div style="display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:12px"><div class="cwl-a-list">' + D.answers.q6.slice(0, 6).map(function (a, i) { return '<div class="cwl-a-li" style="min-height:44px"><span class="grow" style="font-size:var(--cwl-fs-app-table)">“' + esc(a) + '”</span><span class="actions">' + (i === 0 || i === 2 ? CHIP("A clear way into groups", "is-success", "check") : SB("Add to a theme", "plus")) + "</span></div>"; }).join("") + "</div>" +
          '<div style="display:flex;flex-direction:column;gap:8px"><div class="cwl-a-label">Your themes</div><div class="cwl-d6-theme"><b class="label" style="font-size:var(--cwl-fs-app-table)">A clear way into groups</b><div class="rest"><b class="tnum">2</b><span>of 87 so far</span></div></div>' + B("New theme", "is-secondary is-sm", "plus") + '<span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);font-weight:600">' + D.answers.q6.length + " answers to group · 78 more</span></div></div>";
      } else man.innerHTML = "";
      body.querySelector(".d6-side").innerHTML = st === "Possible duplicates" ? P6.DuplicateFlag(D.duplicates, { checked: checked }) + P6.SegmentFilter({ selected: sel }) : P6.SegmentFilter({ selected: sel }) + P6.DuplicateFlag(D.duplicates, { checked: checked });
      CL.icons();
      if (st === "Themes drafting as answers arrive") ctx.button("Refresh: answers 62 to 87 arrive", "refresh-cw", function () { ctx.qr.set(Q_IMPROVE, { answered: N }); ctx.tl.set(themeData(["t1", "t2", "t3", "t4", "t5"]), { foot: L("check") + " Read at 4:12 pm" }); });
      if (st === "A theme accepted" || st === "A thin theme") ctx.button("Accept Space and parking", "check", function () { ctx.tl.set(themeData(["t1", "t2", "t3", "t4", "t5"], { accepted: ["t1", "t2"] })); });
      if (st === "A theme renamed") ctx.button("Play the rename", "pencil", function () { ctx.tl.set(themeData(["t1", "t2", "t3", "t4", "t5"], { accepted: accepted }), { instant: true }); CL.later(function () { ctx.tl.set(themeData(["t1", "t2", "t3", "t4", "t5"], { accepted: accepted, renamed: true })); }, 500); });
      if (st === "Themes merged") ctx.button("Play the merge", "merge", function () {
        ctx.tl.set(themeData(["t9", "t10"]), { instant: true });
        CL.later(function () { var nx = themeData(["t9"], { accepted: ["t9"] }); nx[0].n = 33; nx[0].merged = 2; ctx.tl.merge("t10", "t9", nx); }, 700);
      });
      if (st === "A theme rejected") ctx.button("Play the reject", "x", function () { ctx.tl.set(themeData(["t1", "t2", "t3", "t4", "t5"], { accepted: accepted }), { instant: true }); CL.later(function () { ctx.tl.set(themeData(["t1", "t2", "t3", "t4"], { accepted: accepted }), { foot: "1 rejected: The coffee. " + '<a href="#" tabindex="-1" class="cwl-a-link">Restore</a>' }); }, 600); });
      return {
        "A scale question": "The 1 to 5 scale as a distribution with the average. A refresh grows the columns in place.",
        "A choice question": "Single choice as bars in the survey's own option order, each with its count and share.",
        "Multiple choice": "Pick all that apply: shares are of the people who answered, and the bars stay in option order.",
        "Themes drafting as answers arrive": "Read at 61 responses: themes are AI drafted and marked so. Refresh brings answers 62 to 87: counts roll up, bars grow, and the first two themes trade places as their order changes.",
        "A theme accepted": "A clear way into groups is accepted: it gains the accepted edge and can now reach What We Heard and the signal. The rest are still drafts. Accept another to watch it.",
        "A theme renamed": "Communication renamed to Hearing what's happening: the label crossfades in place and keeps a note of what the AI called it.",
        "Themes merged": "Who makes decisions and What elders and staff each do merged: one glides into the other, the counts add to 33 of 87, and the theme says it was merged from 2.",
        "A theme rejected": "The coffee is rejected: it leaves, the list closes up, and a Restore link stays at the foot.",
        "A thin theme": "Things for young adults rests on 6 of 87 answers, fewer than 10, so it carries the thin flag: a dashed outline, an icon and the reason, readable without color.",
        "A segment selected": "Age 60 to 74 (27 respondents) filters the results. Under 18 and 18 to 29 are hidden because each has fewer than 5 respondents. Less than 1 year (6) is shown but flagged thin.",
        "Possible duplicates": "Two pairs from the same network minutes apart with near-identical answers. One is marked checked. Both stay in the results: a congregation shares church wifi.",
        "AI off": "AI is off, so no themes are drafted. The open-text answers are listed for the facilitator to group by hand.",
        "360 responses": "One past engagement's total. Counts and bars scale, and nothing else changes.",
        "Very long text": "A long theme label and a long quote wrap in full. The count and actions keep their place.",
        "Reduced motion": "Counts and bars change in place. Merges and rejects happen without the glide."
      }[st];
    }
  });

  /* SET-10 · survey results in the room */
  var RESULTS = [
    { id: "r1", kind: "choice", q: Q_CHOICE },
    { id: "r2", kind: "scale", q: Q_SCALE },
    { id: "r3", kind: "theme", theme: D.theme("t1"), lead: "" },
    { id: "r4", kind: "theme", theme: D.theme("t7") },
    { id: "r5", kind: "theme", theme: D.theme("t4") }
  ];
  function resultFor(st) {
    if (st === "Nothing up yet") return { kind: "none" };
    if (st === "A scale question") return RESULTS[1];
    if (/theme with its quotes|Phones down/.test(st)) return RESULTS[2];
    if (st === "A thin result") return RESULTS[4];
    if (st === "360 responses") return { id: "r1b", kind: "choice", q: Q_CHOICE, counts: D.big.choice, n: D.big.responses };
    if (st === "Very long text") return { id: "rl", kind: "theme", theme: { id: "tl", q: "q6", label: "A clear way into groups for newcomers, young families and anyone still looking for where to start", n: 27, quotes: D.theme("t1").quotes } };
    return RESULTS[0];
  }
  intBoard({ id: "set-10", title: "Survey results in the room", ids: ["SET-10", "SurveyResultScreen", "ThinFlag"], unit: "responses",
    note: "Sourced from Team Hub: one question or one accepted theme at a time on the TV, chosen from the control surface. Bars for choices (the pass 3 bars), a distribution for a scale, a theme with its count as a headline with depth. Phones carry the detail: the full question, the count it rests on and example quotes. Thin flags show. Segments under 5, names and emails never do. Moving to the next result is the same crossfade as a session change.",
    states: ["Nothing up yet", "A choice question", "A scale question", "A theme with its quotes", "A thin result", "360 responses", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"],
    start: "A choice question",
    make: function (ctx) {
      ctx.sh.tv.querySelector(".cwl-tally").style.display = "none";
      ctx.sh.tv.querySelector(".p2-marker-slot").style.visibility = "hidden";
      return new P6.SurveyResultScreen(ctx.sh);
    },
    tv: function (ctx, st, inst) {
      var it = resultFor(st);
      ctx.sh.tv.querySelector(".p2-marker-slot").style.visibility = st === "Offline and queued" ? "" : "hidden";
      ctx.view.show(it, { instant: inst });
      ctx.cur = it;
      ctx.button("Show the next result", "skip-forward", function () { var i = RESULTS.indexOf(ctx.cur), nx = RESULTS[(i + 1) % RESULTS.length]; ctx.cur = nx; ctx.view.show(nx); });
      return {
        "Nothing up yet": "The survey session is live but nothing is up yet. The TV says what will appear. Phones are never empty.",
        "A choice question": "One question: the pass 3 bars, leader on top in Sunrise, each with its count and share. The source line says how many responses and when the survey closed.",
        "A scale question": "The 1 to 5 scale: the average large, the spread as columns. Use Show the next result to watch the crossfade between results.",
        "A theme with its quotes": "An accepted theme as a headline with depth: 27 of 87 large, the theme in light type with its bold phrase. Phones carry the example quotes, no names.",
        "A thin result": "Things for young adults rests on 6 of 87, so the TV and phones show the thin flag, and the number drops its Sunrise: thin data is never the screen's look-here moment.",
        "360 responses": "One past engagement's total: the bars and shares scale.",
        "Offline and queued": "The TV holds the result it has, with the gray breathing mark. Results are already on the device, so nothing blanks.",
        "Phones down": "Results have no input, so phones down only dims the phones. The detail stays readable.",
        "AI off": "Results don't use AI in the room. Only accepted themes appear, so with AI off the facilitator's own themes show the same way.",
        "Reduced motion": "Results swap with the 150ms fade. Bars and columns appear at their values.",
        "Very long text": "A long theme steps down to the headline size and wraps. The full quotes stay on phones."
      }[st];
    },
    phones: function (st, ctx) { var it = resultFor(st), s = stat(st); return [{ label: "Phone · the detail", render: function (p) { P6.SurveyResultPhone(p, it); } }, { label: "Phone · " + (s.down ? "phones down" : "another theme"), cap: "Every phone gets the same detail.", render: function (p) { P6.SurveyResultPhone(p, s.down ? it : RESULTS[3]); } }]; },
    control: function (a, st, ctx) {
      var it = resultFor(st), s = stat(st);
      var items = RESULTS.map(function (r, i) {
        var title = r.kind === "theme" ? esc(r.theme.label) : esc(r.q.title), sub = r.kind === "theme" ? r.theme.n + " of " + N + " · accepted theme · " + esc(THEME_SRC[r.theme.q]) : (r.kind === "scale" ? "1 to 5 scale" : "Single choice") + " · " + N + " answers";
        var thin = r.kind === "theme" && D.isThin(r.theme.n, N);
        return item(i + 1, title, sub + (thin ? " · " + P6.ThinFlag(r.theme.n + " of " + N) : ""), [it && it.id === r.id ? CHIP("On the TV", "run-live", "radio") : SB("Show", "play")]);
      });
      P4.ctl(a, { part: "Pre-call", title: "What we heard · congregational survey", chips: [CHIP("Live", "run-live", "radio"), CHIP("Read from Team Hub at 4:12 pm", "is-outline", "refresh-cw")], sync: s.offline ? SYNC("", "monitor-off", "TV reconnecting") : SYNC("", "check", "On the TV now"),
        banner: s.offline ? BAN("warning", "triangle-alert", "<strong>TV reconnecting.</strong> It's holding the result it has.") : "", tools: [SB("Hide from the TV", "eye-off"), SB("Phones down", "smartphone")], listTitle: "Results to show", listNote: "Accepted themes and closed questions only",
        items: items, side: P4.notes("One result at a time. Name thin data out loud. Segments under 5 never show.") + P4.roomPanel([[8, "signed in"], [N, "responses"]]) });
    },
    remote: function (box, st) { P4.remote(box, { title: "What we heard", buttons: '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next result", "chevron-right", "is-primary") + "</div>" + P4.rbtn("Phones down", "smartphone") }); }
  });

  /* ================================================================
     PART · THE FOUR HELPFUL LISTS
     ================================================================ */
  part("part-lists", "The Four Helpful Lists", "The team's read in four columns: What's right? What's wrong? What's missing? What's confused? Riverside runs it with its elders, 7 people, as a session in the engagement. The cards land in What We Heard and Strategic Tensions. Columns are told apart by their headings and position, never by color.");

  function reviewCards(o) {
    o = o || {};
    return '<div class="cwl-fl-review">' + D.cols.map(function (c) {
      var mine = D.listCards.filter(function (x) { return x.col === c.key; });
      if (o.merging && c.key === "missing") mine = mine.concat([D.similar]);
      return '<div class="cwl-fl-rcol"><h4><span>' + esc(c.q) + '</span><span class="cwl-a-muted">' + mine.length + "</span></h4>" + mine.map(function (x) {
        var to = o.accepted ? D.listAccept[x.id] : null, selected = o.merging && (x.id === "c7" || x.id === "c11");
        return '<div class="cwl-fl-rcard' + (selected ? " is-selected" : "") + '"><div class="top"><label class="cwl-a-check"><input type="checkbox" tabindex="-1"' + (selected ? " checked" : "") + "></label><b>" + esc(x.text) + '</b><span class="ag">' + L("arrow-up") + x.agree + "</span></div>" +
          '<div class="to"><button type="button" class="cwl-a-tag" tabindex="-1" aria-pressed="' + (to === "heard") + '">' + L("message-square-quote") + "What We Heard</button>" + (c.key === "wrong" || c.key === "confused" ? '<button type="button" class="cwl-a-tag" tabindex="-1" aria-pressed="' + (to === "tension") + '">' + L("zap") + "Strategic Tensions</button>" : "") + "</div></div>";
      }).join("") + "</div>";
    }).join("") + "</div>";
  }
  stateBoard({ id: "set-05", title: "The Four Helpful Lists in setup", ids: ["SET-05", "FourListsCard"],
    note: "Add the session to the run of show for the elders, then review the cards afterwards: merge similar cards and accept each into What We Heard or Strategic Tensions. Cards keep their agreement counts. Accepted cards become Discover themes like any other, with what they rest on (4 of 7 agree).",
    states: ["Add to the run of show", "Ready for the elders", "Review after the session", "Merging similar cards", "Accepted", "AI off"],
    start: "Review after the session",
    make: function (ctx) { var r = row(ctx.stage, "is-1"); ctx.a = app(r, "Setup · laptop · Four Helpful Lists", 1280, 720, "setup"); },
    draw: function (ctx, st) {
      var body = setupShell(ctx.a, { title: "Four Helpful Lists", tab: "Four Helpful Lists" });
      if (st === "Add to the run of show" || st === "Ready for the elders") {
        var ready = st === "Ready for the elders";
        body.innerHTML = '<div class="cwl-a-card" style="padding:18px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:14px;align-items:end"><div class="cwl-a-field"><label class="cwl-a-flabel">Who it\'s for</label><span class="cwl-a-select"><select tabindex="-1"><option>Elders · 7 people</option></select>' + L("chevron-down") + '</span></div><div class="cwl-a-field"><label class="cwl-a-flabel">When</label><input class="cwl-a-input" tabindex="-1" value="Tuesday, October 20, 7:00 pm"></div><div class="cwl-a-field"><label class="cwl-a-flabel">Where</label><span class="cwl-a-select"><select tabindex="-1"><option>In person, TV and phones</option></select>' + L("chevron-down") + "</span></div>" + (ready ? CHIP("Added", "is-success", "check") : B("Add to the run of show", "is-primary", "plus")) + "</div>" +
          '<div class="cwl-a-label">Discover sessions</div><div class="cwl-a-list">' +
          '<div class="cwl-a-li"><span class="time">Oct 5</span><span class="grow"><b>Congregational survey</b><br><span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);font-weight:600">Team Hub · open until Nov 14</span></span>' + CHIP("Open", "run-ready", "circle-dot") + "</div>" +
          (ready ? '<div class="cwl-a-li is-current"><span class="time">Oct 20</span><span class="grow"><b>Four Helpful Lists</b><br><span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);font-weight:600">Elders · 7 people · about 45 minutes · INT-11</span></span>' + CHIP("Ready", "run-ready", "circle-check") + SB("Preview", "eye") + "</div>" : "") +
          '<div class="cwl-a-li"><span class="time">Nov 24</span><span class="grow"><b>Pre-call</b><br><span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);font-weight:600">90 minutes on video · What we heard</span></span>' + CHIP("Draft", "run-draft", "pencil-line") + "</div></div>" +
          '<div class="cwl-d6-note">' + L("info") + "<span>The session runs live on the TV and phones like any other. The elders sign in with the room link.</span></div>";
      } else {
        var merging = st === "Merging similar cards", accepted = st === "Accepted";
        body.innerHTML = '<div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-label">Elders · October 20 · 7 of 7 took part · ' + (D.listCards.length + (merging ? 1 : 0)) + " cards</span>" +
          '<span class="cwl-a-row">' + (merging ? B("Merge 2 cards", "is-primary is-sm", "merge") : "") + (accepted ? CHIP((function () { var hN = 0, tN = 0; for (var k in D.listAccept) { if (D.listAccept[k] === "heard") hN++; else tN++; } return hN + " to What We Heard · " + tN + " to Strategic Tensions"; })(), "is-success", "check") : SB("Accept the selected", "check")) + "</span></div>" +
          (st === "AI off" ? BAN("info", "info", "<strong>AI is off.</strong> In the room only cards with the same words folded. Merge any others here.") : "") + reviewCards({ merging: merging, accepted: accepted });
      }
      CL.icons();
      return {
        "Add to the run of show": "Add the session for the elders. It joins the run of show beside the survey and the pre-call.",
        "Ready for the elders": "On the run of show and ready. Preview shows the TV and phones without going live.",
        "Review after the session": "Every card from the session with its agreement count. Tick cards to merge them, and send each to What We Heard, or to Strategic Tensions from What's wrong and What's confused.",
        "Merging similar cards": "A clear way to join a group arrived late and didn't fold in the room. Ticking it with A path into groups offers Merge: the counts add.",
        "Accepted": "Accepted cards are marked. They reach What We Heard and Strategic Tensions, and the signal.",
        "AI off": "With AI off only identical words folded live, so there's more to merge here."
      }[st];
    }
  });

  /* INT-11 · the Four Helpful Lists live */
  function listState(st) {
    var cards = clone(D.listCards), s = stat(st);
    cards.forEach(function (c, i) { c.t = i; });
    if (st === "Empty columns") cards = [];
    if (st === "First card") cards = [{ id: "c7", col: "missing", text: "A path into groups", agree: 0, t: 0 }];
    if (st === "Agreement counts ticking up") cards.forEach(function (c) { c.agree = Math.max(0, c.agree - 2); });
    if (st === "Similar cards sliding together") { cards.forEach(function (c) { if (c.id === "c7") { c.agree = 5; c.folded = 1; } }); }
    if (s.crowded) { cards = cards.filter(function (c) { return c.col !== "missing"; }); D.crowdMissing.forEach(function (t, i) { cards.push({ id: "m" + i, col: "missing", text: t, agree: Math.max(0, 31 - i * 3), t: 20 + i }); }); cards.forEach(function (c) { if (c.col !== "missing") c.agree = c.agree * 6; }); }
    if (s.long) cards.push(clone(D.longCard));
    if (st === "AI off") cards.push(clone(D.similar));
    return cards;
  }
  intBoard({ id: "int-11", title: "The Four Helpful Lists, live", ids: ["INT-11", "FourListsBoard", "FourListsCard", "FourListsComposer"], unit: "cards", phoneW: 460,
    note: "Phones add cards to any column and agree with others' cards with one tap. The TV fills four columns: each card slides into its column the moment it's sent, similar cards slide together and become one (marked as AI, with undo on the control surface), and agreement counts tick up. Cards order by agreement within a column and glide when they trade places. The control surface and the remote run it.",
    states: ["Empty columns", "First card", "Typical", "Similar cards sliding together", "Agreement counts ticking up", "Crowded column, 50 phones", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"],
    start: "Typical",
    make: function (ctx) { ctx.sh.prompt("Four Helpful Lists · Elders", ""); ctx.sh.headEl.style.display = "none"; return new P6.FourListsBoard(ctx.sh.host, { shell: ctx.sh, max: 4 }); },
    tv: function (ctx, st, inst) {
      var s = stat(st), cards = listState(st), total = cards.length;
      ctx.cards = cards;
      ctx.view.set(cards, { instant: inst, newest: st === "First card" ? "c7" : null, max: s.long ? 3 : 4 });
      ctx.sh.count(s.crowded ? 214 : total, "cards", inst);
      if (s.ai && total) ctx.sh.foot('<span class="p3-ai-line">' + CL.aiBadge() + " Combines similar cards</span>"); else if (!s.ai) ctx.sh.foot('<span class="p3-ai-line">Only cards with the same words combine</span>');
      ctx.button("A card arrives", "plus", function () { var nc = { id: "n" + Date.now(), col: "right", text: "Kids love Sunday", agree: 0, t: 99 }; ctx.cards = ctx.cards.concat([nc]); ctx.view.set(ctx.cards, { newest: nc.id }); ctx.sh.count(ctx.cards.length, "cards"); });
      ctx.button("A similar card folds in", "merge", function () {
        var sim = clone(D.similar); sim.t = 98; var withSim = ctx.cards.filter(function (c) { return c.id !== sim.id; }).concat([sim]);
        ctx.view.set(withSim, { newest: sim.id });
        CL.later(function () { var nx = withSim.filter(function (c) { return c.id !== sim.id; }).map(function (c) { if (c.id === "c7") { c = clone(c); c.agree += 1; c.folded = 1; } return c; }); ctx.cards = nx; ctx.view.fold(sim.id, "c7", nx); }, 1500);
      });
      ctx.button("Phones agree", "arrow-up", function () { var seq = ["c5", "c7", "c9", "c5", "c2", "c7", "c3"]; seq.forEach(function (id, i) { CL.later(function () { ctx.cards = ctx.cards.map(function (c) { if (c.id === id) { c = clone(c); c.agree += 1; } return c; }); ctx.view.set(ctx.cards); }, 300 + i * 420); }); });
      return {
        "Empty columns": "The session is live and the four columns wait, each with its heading and number. Nothing else on screen.",
        "First card": "The first card slides into What's missing and takes the screen's Lime moment for a beat.",
        "Typical": "Ten cards from the elders. Each column orders by agreement. Use the buttons to send a card, fold a similar one, or let phones agree.",
        "Similar cards sliding together": "A clear way to join a group slid into A path into groups and became one card. It's marked as AI with the number of cards it holds, its agreement count added, and undo waits on the control surface.",
        "Agreement counts ticking up": "Counts tick up as phones tap Agree, and a card that passes another glides up its column.",
        "Crowded column, 50 phones": "Fifty phones: What's missing holds 16 cards. The four with the most agreement show, with the rest counted on phones.",
        "Offline and queued": "The TV holds its last state with the gray breathing mark. Phones keep their cards and agreements and send them in order.",
        "Phones down": "Phones down for the conversation: the board holds still and phones dim.",
        "AI off": "Only cards with the same words combine. A clear way to join a group stays its own card until the facilitator merges it in setup.",
        "Reduced motion": "Cards appear in place with a short fade. Folds and trades happen without the glide.",
        "Very long text": "A long card wraps in full in its column. The agreement count stays at its foot."
      }[st];
    },
    phones: function (st, ctx) {
      var s = stat(st), cards = listState(st);
      if (st === "Empty columns") return [{ label: "Phone · add a card", render: function (p) { P6.FourListsComposer(p, { col: "right", cards: [] }); } }];
      return [
        { label: "Phone · writing a card", render: function (p) { P6.FourListsComposer(p, { col: "missing", text: s.long ? D.longCard.text : "A clear way to join a group", cards: cards, down: s.down, offline: s.offline, max: 2 }); } },
        { label: "Phone · agreeing", cap: "One tap to agree. A second tap takes it back.", render: function (p) { P6.FourListsComposer(p, { col: "wrong", sent: "Staff stretched thin", cards: cards, agreed: ["c5"], down: s.down, offline: s.offline, max: 3 }); } }
      ];
    },
    control: function (a, st, ctx) {
      var s = stat(st), cards = listState(st);
      P4.ctl(a, { part: "Discover", title: "Four Helpful Lists · Elders", chips: [s.down ? CHIP("Phones down", "", "smartphone") : CHIP("Live", "run-live", "radio"), CHIP("Burst 2:40 left", "is-outline", "timer")], sync: s.offline ? SYNC("", "monitor-off", "TV reconnecting") : SYNC("", "check", "On the TV now"),
        banner: s.offline ? BAN("warning", "triangle-alert", "<strong>TV reconnecting.</strong> It's holding the last screen and will catch up in one pass.") : "",
        tools: [SB("Start burst", "timer", "is-primary"), SB("Spotlight", "sun"), SB("Hide", "eye-off")], listTitle: "Columns", listNote: s.ai ? "AI combines similar cards" : "AI off · only the same words combine",
        items: D.cols.map(function (c, i) { var mine = cards.filter(function (x) { return x.col === c.key; }); var top = mine.slice().sort(function (a, b) { return b.agree - a.agree; })[0]; return item(i + 1, esc(c.q), mine.length + (mine.length === 1 ? " card" : " cards") + (top ? " · most agreed: " + esc(top.text) + " (" + top.agree + ")" : ""), c.key === "missing" && st === "Similar cards sliding together" ? [CL.aiBadge(), IB("undo-2", "Undo the combine"), IB("eye-off", "Hide a card")] : [IB("eye-off", "Hide a card")]); }),
        side: P4.aiState(s.ai, "Combines similar cards") + P4.roomPanel([[s.crowded ? 50 : 7, "signed in"], [s.crowded ? 214 : cards.length, "cards"]]) + P4.notes("After the burst, phones down. Read each column top to bottom. Ask what surprised them.") });
    },
    remote: function (box, st) { P4.remote(box, { title: "Four Helpful Lists", buttons: '<div class="cwl-r-grid">' + P4.rbtn("Burst", "timer", "is-primary") + P4.rbtn("Phones down", "smartphone") + "</div>" + '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" + P4.rbtn("Undo the combine", "undo-2") }); }
  });

  /* ================================================================
     PART · INTERVIEWS AND INPUT CONVERSATIONS
     ================================================================ */
  part("part-interviews", "Leadership interviews and input conversations", "The facilitator adds notes or transcripts from leadership interviews and from the elders and staff input conversations. AI drafts themes across them with no names, showing how many conversations each rests on. Notes stay with Clearway. Only themes without names reach the report or the room.");

  function ithemes(of, o) {
    o = o || {};
    return D.interviewThemes.map(function (t, i) {
      var x = clone(t); x.kind = "interviews"; x.of = of; x.order = i; x.state = (o.accepted || []).indexOf(t.id) >= 0 ? "accepted" : "draft";
      if (o.counts && o.counts[t.id] != null) x.n = o.counts[t.id];
      return x;
    }).filter(function (x) { return x.n > 0; });
  }
  stateBoard({ id: "set-06", title: "Interviews and input conversations", ids: ["SET-06", "NotesUpload", "DiscoverTheme"],
    note: "Add notes by pasting, or as Word, PDF or text files, and say which conversation each is: a leadership interview, the elders conversation or the staff conversation. Themes draft across them with no names: 4 of 5 interviews, with the input conversations as extra sources. A theme that rests on one interview is thin. Edit, merge, accept or reject each one.",
    states: ["No notes yet", "A file uploading", "A file the app couldn't read", "Themes drafting", "Themes updating as notes arrive", "Typical", "One interview only", "AI off", "Very long text", "Reduced motion"],
    start: "Typical",
    make: function (ctx) {
      var r = row(ctx.stage, "is-1");
      ctx.a = app(r, "Setup · laptop · interviews", 1280, 820, "setup");
      var body = setupShell(ctx.a, { title: "Interviews and input conversations", tab: "Interviews" });
      body.innerHTML = '<div class="cwl-d6-grid" style="grid-template-columns:400px minmax(0,1fr);min-height:0"><div class="d6-up" style="min-height:0;overflow:hidden"></div><div style="min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:10px"><div class="cwl-a-row d6-thh" style="justify-content:space-between"></div><div class="d6-th"></div></div></div>';
      ctx.tl = new P6.ThemeList(body.querySelector(".d6-th"), { quoteMax: 1 });
      ctx.body = body;
    },
    draw: function (ctx, st, inst) {
      var files = clone(D.files), list = ithemes(5, { accepted: ["i1", "i2"] }), head = "Themes across 5 interviews and 2 input conversations", note = "";
      if (st === "No notes yet") { files = []; list = []; head = "Themes appear as notes arrive"; }
      if (st === "A file uploading") { files = files.slice(0, 4).concat([{ id: "f5", name: "Interview 5 notes.docx", kind: "interview", state: "uploading", progress: 55 }]); list = ithemes(4, { counts: { i1: 3, i2: 3, i3: 3, i4: 2, i5: 0 }, accepted: ["i1"] }); head = "Themes across 4 interviews"; }
      if (st === "A file the app couldn't read") { files = files.slice(0, 3).concat([clone(D.badFile)]).concat(files.slice(4)); }
      if (st === "Themes drafting") { files = files.slice(0, 3).concat([{ id: "f4", name: "Interview 4 notes.pdf", kind: "interview", state: "reading" }]); list = ithemes(3, { counts: { i1: 2, i2: 3, i3: 2, i4: 1, i5: 0 } }); head = "Drafting across 3 interviews"; note = L("loader-circle") + " Drafting as notes are read"; }
      if (st === "Themes updating as notes arrive") { files = files.slice(0, 4); list = ithemes(4, { counts: { i1: 3, i2: 4, i3: 2, i4: 1, i5: 1 }, accepted: ["i2"] }); head = "Themes across 4 interviews"; }
      if (st === "One interview only") { files = files.slice(0, 1); list = ithemes(1, { counts: { i1: 1, i2: 1, i3: 1, i4: 0, i5: 0 } }); head = "Themes across 1 interview"; note = "Every theme rests on one interview, so every theme is thin."; }
      if (st === "AI off") list = [];
      if (st === "Very long text") { files[2] = { id: "f3", name: "Interview 3 transcript, full recording with the associate pastor and two ministry leads, cleaned up.txt", kind: "interview", state: "read", words: 6420 }; list[0].label = "Small groups are hard to find, and the leaders we have are full, so nobody new can start one without a clear path to apprentice first"; }
      ctx.body.querySelector(".d6-up").innerHTML = P6.NotesUpload(files);
      ctx.body.querySelector(".d6-thh").innerHTML = '<span class="cwl-a-label">' + esc(head) + '</span><span class="cwl-a-row">' + (st === "AI off" ? B("New theme", "is-secondary is-sm", "plus") : SB("Accept all drafts", "check-check")) + "</span>";
      if (st === "AI off") { ctx.body.querySelector(".d6-th").style.display = "none"; if (!ctx.body.querySelector(".d6-man")) { var m = h("div", "d6-man"); ctx.body.querySelector(".d6-th").parentNode.appendChild(m); } ctx.body.querySelector(".d6-man").innerHTML = BAN("info", "info", "<strong>AI is off.</strong> No themes are drafted from the notes. Write each theme by hand and say how many conversations it rests on. Names are never added.") + '<div class="cwl-a-card" style="padding:14px;display:grid;grid-template-columns:minmax(0,1fr) 160px auto;gap:12px;align-items:end"><div class="cwl-a-field"><label class="cwl-a-flabel">Theme</label><input class="cwl-a-input" tabindex="-1" value="Small groups are hard to find"></div><div class="cwl-a-field"><label class="cwl-a-flabel">Rests on</label><span class="cwl-a-select"><select tabindex="-1"><option>4 of 5 interviews</option></select>' + L("chevron-down") + "</span></div>" + B("Add the theme", "is-primary", "plus") + "</div>"; }
      else { ctx.body.querySelector(".d6-th").style.display = ""; var mm = ctx.body.querySelector(".d6-man"); if (mm) mm.remove(); ctx.tl.set(list, { instant: inst, foot: note }); }
      CL.icons();
      if (st === "Themes updating as notes arrive") ctx.button("Interview 5 notes arrive", "upload", function () {
        ctx.body.querySelector(".d6-up").innerHTML = P6.NotesUpload(clone(D.files).slice(0, 4).concat([{ id: "f5", name: "Interview 5, pasted notes", kind: "interview", state: "reading" }])); CL.icons();
        CL.later(function () { ctx.body.querySelector(".d6-up").innerHTML = P6.NotesUpload(clone(D.files).slice(0, 5)); ctx.body.querySelector(".d6-thh .cwl-a-label").textContent = "Themes across 5 interviews"; ctx.tl.set(ithemes(5, { counts: { i1: 4, i2: 4, i3: 3, i4: 2, i5: 1 }, accepted: ["i2"] })); CL.icons(); }, 1200);
      });
      return {
        "No notes yet": "Nothing added. Drop files, or paste notes. Each file is marked as an interview or an input conversation.",
        "A file uploading": "Interview 5 is uploading. Themes rest on the 4 already read.",
        "A file the app couldn't read": "A scanned PDF has no text to read. The row says why in plain words and what to do. Error is allowed in setup.",
        "Themes drafting": "Interview 4 is being read. Themes draft across the 3 read so far and are marked as AI drafted.",
        "Themes updating as notes arrive": "Four interviews read. Press the button: Interview 5 arrives, counts move to of 5, Small groups are hard to find rises to 4 of 5 and trades places.",
        "Typical": "Five interviews and two input conversations. Each theme shows how many interviews it rests on, plus the conversations as extra sources. Succession rests on one interview, so it's thin.",
        "One interview only": "With one interview, every theme rests on one conversation, so every theme is thin.",
        "AI off": "With AI off the facilitator writes each theme and how many conversations it rests on.",
        "Very long text": "A long file name truncates with the full name on hover. A long theme wraps in full.",
        "Reduced motion": "Counts and order change in place."
      }[st];
    }
  });

  /* ================================================================
     PART · WHAT WE HEARD
     ================================================================ */
  part("part-heard", "What We Heard", "Headlines with depth built from accepted themes, ready for the pre-call (PRE-08) and as the report section. Each headline keeps its sources and counts and the thin flag. Headlines typed by hand, as in pass 4, still work.");
  stateBoard({ id: "wwh", title: "What We Heard from accepted themes", ids: ["PRE-08", "SET-04", "WhatWeHeardHeadline", "HeadlineDepth"], theme: true,
    note: "Setup assembles headlines from accepted survey, interview and Four Helpful Lists themes. The facilitator reorders, edits or writes one by hand. On the pre-call each headline goes to the TV one at a time, with the detail, sources and counts on phones (the pass 4 HeadlineDepth).",
    states: ["No accepted themes yet", "Headlines built from themes", "A thin headline", "On the pre-call"],
    start: "Headlines built from themes",
    make: function (ctx) {
      var r = row(ctx.stage, "is-1"); ctx.a = app(r, "Setup · laptop · What We Heard", 1280, 640, "setup");
      var r2 = row(ctx.stage, "is-tv1"); r2.style.gridTemplateColumns = "minmax(0, 1fr) 240px";
      ctx.tvBox = frame(r2, "TV · PRE-08 · headline with depth", "is-tv"); ctx.phBox = frame(r2, "Phone · the depth", "is-phone");
      ctx.tv = CL.stage(ctx.tvBox, ctx.theme); CL.screenTexture(ctx.tv, "content");
      var top = h("div", "cwl-tv-top"); top.innerHTML = window.ClearwayLivePass2.lockup() + "<span></span>"; ctx.tv.appendChild(top);
      ctx.tvc = h("div", "cwl-tv-content"); ctx.tv.appendChild(ctx.tvc);
      ctx.ph = P4.phone(ctx.phBox, { theme: ctx.theme, head: "live" });
    },
    draw: function (ctx, st) {
      var body = setupShell(ctx.a, { title: "What We Heard", tab: "What We Heard", right: B("Write a headline by hand", "is-secondary", "keyboard") });
      var heard = D.heard, hd = st === "A thin headline" ? heard[3] : heard[0];
      if (st === "No accepted themes yet") {
        body.innerHTML = BAN("info", "info", "<strong>No accepted themes yet.</strong> Accept themes in Survey, Four Helpful Lists and Interviews and headlines are drafted from them. Until then, type headlines by hand.") +
          '<div class="cwl-a-list">' + W.headlines.slice(0, 2).map(function (x, i) { return '<div class="cwl-a-li"><span class="time">' + (i + 1) + '</span><span class="grow">' + P6.WhatWeHeardHeadline({ n: x.n, text: x.text, src: [], typed: true, thin: x.thin ? "6 of 87 respondents" : null }, { actions: false }) + "</span></div>"; }).join("") + "</div>";
        hd = { n: W.headlines[0].n, text: W.headlines[0].text, plain: W.headlines[0].text.replace(/<[^>]+>/g, ""), detail: "Typed by hand from the survey export.", src: [{ k: "survey", t: "Survey", c: "87 answers" }] };
      } else {
        body.innerHTML = '<div class="cwl-d6-grid" style="grid-template-columns:300px minmax(0,1fr)"><div class="cwl-a-card" style="padding:14px;display:flex;flex-direction:column;gap:8px"><div class="cwl-a-label">Accepted themes · 9</div>' +
          [["survey", "A clear way into groups", "27 of 87"], ["survey", "Who makes decisions", "33 of 87"], ["survey", "A welcome that feels real", "33 of 87"], ["survey", "Things for young adults", "6 of 87"], ["interviews", "Small groups are hard to find", "4 of 5"], ["interviews", "Staff capacity is stretched", "4 of 5"], ["lists", "A path into groups", "4 of 7 agree"], ["lists", "Who approves the budget?", "3 of 7 agree"], ["lists", "Two-room Sundays feel split", "4 of 7 agree"]].map(function (t) { return '<div style="display:flex;justify-content:space-between;gap:8px;font-size:var(--cwl-fs-app-table)"><span>' + P6.srcChip(t[0], t[1]) + '</span><b class="tnum" style="font-size:var(--cwl-fs-app-micro)">' + t[2] + "</b></div>"; }).join("") + "</div>" +
          '<div style="display:flex;flex-direction:column;gap:10px;min-width:0"><div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-label">Headlines for the pre-call · ' + heard.length + "</span>" + P6.AIDrafted() + "</div>" + heard.map(function (x, i) { return P6.WhatWeHeardHeadline(x, { live: st === "On the pre-call" && i === 0 }); }).join("") + "</div></div>";
      }
      ctx.tvc.innerHTML = '<div class="cwl-tv-eyebrow">What we heard · ' + (st === "A thin headline" ? "4" : "1") + " of " + heard.length + "</div>" + P6.WhatWeHeardHeadline(hd, { surface: "tv", callout: !hd.thin });
      ctx.ph.body.innerHTML = '<div class="cwl-ph-muted">What we heard · ' + (st === "A thin headline" ? "4" : "1") + " of " + heard.length + "</div>" + P6.WhatWeHeardHeadline(hd, { surface: "phone" });
      CL.icons();
      return {
        "No accepted themes yet": "Nothing accepted, so the headlines are typed by hand as in pass 4, marked Typed by hand. The TV and phones work the same way.",
        "Headlines built from themes": "Four headlines drafted from accepted themes, each with its sources and counts. A clear way into groups rests on the survey, the interviews and the elders' Four Helpful Lists, and the phone shows each source.",
        "A thin headline": "6 of 87 rests on thin data: the headline carries the thin flag in setup, on the TV and on phones, and its number drops the Sunrise look-here.",
        "On the pre-call": "The first headline is on the TV in the pre-call. The rest wait in order."
      }[st];
    }
  });

  /* ================================================================
     PART · THE ALIGNMENT SIGNAL
     ================================================================ */
  part("part-signal", "The alignment signal", "Private to the facilitator: the control surface's private panel (FAC-02) and a short list on the facilitator's own remote (FAC-03). Never on the TV, a participant's phone, or a team facilitator's remote. A signal suggests and never corrects: it notices the discussion going a different direction. From any card the facilitator can put a neutral question on the TV that carries no data and doesn't name the signal.");

  var LW = W.congregation;
  function wallList(st) {
    var all = LW.seeded.map(function (x) { var y = clone(x); y.seeded = true; return y; }).concat(LW.live.slice(0, 7)).concat(clone(D.serviceSentences));
    if (/Crowded/.test(st)) all = all.concat(LW.burst);
    return all;
  }
  function sigState(st) {
    var all = D.signals, o = { cards: [], state: "list", held: 0, saved: [], open: null, onTV: false };
    var nonSilent = all.filter(function (x) { return x.kind !== "silent"; });
    switch (st) {
      case "No accepted themes yet": o.state = "none"; break;
      case "First signal": o.cards = [D.signal("g3")]; o.held = 1; break;
      case "Typical": case "Offline and queued": case "Reduced motion": case "Crowded, 50 phones": o.cards = nonSilent; o.held = 1; break;
      case "Silent held until phones go down": o.cards = nonSilent; o.held = 1; break;
      case "Phones down: silent arrives": o.cards = [D.signal("g1")].concat(nonSilent); break;
      case "A card opened": o.cards = all; o.state = "detail"; o.open = "g1"; break;
      case "Divergent opened": o.cards = all; o.state = "detail"; o.open = "g2"; break;
      case "Thin data opened": o.cards = all; o.state = "detail"; o.open = "g4"; break;
      case "Saved as a citation": o.cards = all; o.saved = ["g3"]; o.state = "detail"; o.open = "g3"; break;
      case "A card dismissed": o.cards = all.filter(function (x) { return x.id !== "g4"; }); break;
      case "The neutral question on the TV": o.cards = all; o.state = "detail"; o.open = "g1"; o.onTV = true; break;
      case "Laptop closed: the remote": o.cards = all; break;
      case "A team facilitator has the remote": o.cards = all; break;
      case "AI off": o.state = "aiOff"; break;
      case "Very long text": o.cards = [D.longSignal].concat(nonSilent.slice(0, 2)); o.state = "detail"; o.open = "g5"; o.openSignal = D.longSignal; break;
    }
    return o;
  }
  intBoard({ id: "fac-02", title: "The alignment signal", ids: ["FAC-02", "FAC-03", "SignalCard", "SignalDetail", "SignalList"], lens: "congregation", headline: W.lensPrompt(W.lenses[0]), unit: "sentences", ctlH: 940,
    note: "Five Lenses: Congregation on Day 1, with Discover themes accepted. Signal cards come into the private panel quietly as the room writes: aligned, divergent, silent and thin data, each with its own icon and label. Silent cards wait until phones first go down in the session. Open a card for its evidence: each source with its count, and what the room has said today. Put the neutral question on the TV, save an aligned card as a citation for the report, or dismiss it. The TV mirror on the control surface keeps its own theme with the panel open.",
    states: ["No accepted themes yet", "First signal", "Typical", "Silent held until phones go down", "Phones down: silent arrives", "A card opened", "Divergent opened", "Thin data opened", "Saved as a citation", "A card dismissed", "The neutral question on the TV", "Laptop closed: the remote", "A team facilitator has the remote", "Crowded, 50 phones", "Offline and queued", "AI off", "Reduced motion", "Very long text"],
    start: "Typical",
    make: function (ctx) { ctx.layer = new P6.TVLayer(ctx.sh); return new P4.LensWall(ctx.sh.host, { labels: D.wallLabels }); },
    tv: function (ctx, st, inst) {
      var s = stat(st), list = wallList(st), o = sigState(st), down = s.down || st === "Phones down: silent arrives";
      P4.setLens(ctx.sh, "congregation"); ctx.sh.prompt("", W.lensPrompt(W.lenses[0])); P4.setLens(ctx.sh, "congregation");
      ctx.view.set(list, { instant: inst, ai: s.ai, grouped: list.map(function (x) { return x.id; }), seedNote: "9 from the pre-call" });
      ctx.sh.count(list.length, "sentences", inst);
      ctx.sh.state({ down: down, offline: s.offline });
      if (s.ai) ctx.sh.foot('<span class="p3-ai-line">' + CL.aiBadge() + " Grouped similar sentences</span>");
      var q = (D.signal(o.open || "g1") || D.signal("g1")).ask;
      if (o.onTV) ctx.layer.show(P6.neutralHTML(q), { over: true, ask: true, instant: inst }); else ctx.layer.clear({ instant: true });
      ctx.sigOpts = o;
      ctx.button("A signal arrives", "bell-off", function () { ctx.panel.set([D.signal("g4")].concat(ctx.sigOpts.cards.filter(function (x) { return x.id !== "g4"; })), { held: ctx.sigOpts.held }); ctx.remoteList([D.signal("g4")].concat(ctx.sigOpts.cards.filter(function (x) { return x.id !== "g4"; }))); });
      ctx.button("Put the question on the TV", "tv", function () { ctx.layer.show(P6.neutralHTML(D.signal("g1").ask), { over: true, ask: true }); if (ctx.mirrorLayer) ctx.mirrorLayer.show(P6.neutralHTML(D.signal("g1").ask), { over: true, ask: true }); });
      ctx.button("Back to the wall", "undo-2", function () { ctx.layer.clear(); if (ctx.mirrorLayer) ctx.mirrorLayer.clear(); });
      ctx.button("Dismiss a card", "x", function () { var c = ctx.panel.list.querySelector("[data-k]"); if (!c) return; var id = c.getAttribute("data-k"); var nx = ctx.sigOpts.cards.filter(function (x) { return x.id !== id; }); ctx.sigOpts.cards = nx; ctx.panel.dismiss(id, nx, { held: ctx.sigOpts.held }); ctx.remoteList(nx); });
      return {
        "No accepted themes yet": "Nothing in Discover is accepted yet, so the panel says the signal starts once themes are accepted. The room runs as normal.",
        "First signal": "One card has come in quietly: Aligned, A welcome that feels real. A silent theme waits for phones down.",
        "Typical": "Three cards: divergent, aligned and thin data, each with its icon, label and one line of evidence. Use A signal arrives to watch one come in quietly, and Dismiss a card to watch one leave.",
        "Silent held until phones go down": "A strong Discover theme nobody has raised yet is held: the panel says one silent theme waits until phones first go down in this session, so it doesn't fire before the room has had its say.",
        "Phones down: silent arrives": "Phones went down for the first time in the session, so the held silent card comes in: A clear way into groups.",
        "A card opened": "Silent, opened: why it's showing (the survey 27 of 87, 4 of 5 interviews, the elders' What's missing card), what the room has said today (nothing yet), and a neutral question to put on the TV.",
        "Divergent opened": "Divergent: the room leans toward a third service. The evidence shows the survey naming connection beyond Sunday and no survey answers asking for another service, beside the room's three sentences.",
        "Thin data opened": "Thin data: the room leans on young adults, who are 6 of 87 respondents. A thin theme is flagged, never hidden.",
        "Saved as a citation": "An aligned card saved as a citation for the report. The card says so in the list.",
        "A card dismissed": "Thin data dismissed: it left and the list closed up.",
        "The neutral question on the TV": "The TV and its mirror crossfaded to the question, the same transition as a session change. The question carries no data and doesn't name the signal. Back to the wall returns the lens wall as it was.",
        "Laptop closed: the remote": "The laptop is closed. The facilitator's own remote carries the short list, and a card opens to its line of evidence.",
        "A team facilitator has the remote": "Priya holds the remote for the team-led block. Her remote has no signal at all. The facilitator's own remote and private panel keep it.",
        "Crowded, 50 phones": "Fifty phones add sentences. Signals still arrive one at a time and quietly. The panel shows them all and never floods.",
        "Offline and queued": "The TV is reconnecting. Signals on the control surface hold what they have and catch up when sentences arrive.",
        "AI off": "AI is off for this engagement and the signal is AI, so the panel says it's off. Nothing else changes.",
        "Reduced motion": "Cards appear and leave in place, and the question swaps with the 150ms fade.",
        "Very long text": "A long theme and evidence line wrap in full inside the panel."
      }[st];
    },
    phones: function (st, ctx) {
      var s = stat(st), o = sigState(st), down = s.down || st === "Phones down: silent arrives";
      return [{ label: "Phone · participant", cap: "Phones never show a signal.", render: function (p) {
        if (o.onTV) { p.body.innerHTML = '<div class="cwl-wf-ph-lens">' + P4.lensChip("congregation") + '</div><div class="cwl-ph-prompt">' + esc(D.signal("g1").ask) + '</div><div class="cwl-ph-muted">Talk it over together.</div>'; p.foot.innerHTML = ""; return; }
        p.body.innerHTML = '<div class="cwl-wf-ph-lens">' + P4.lensChip("congregation") + '</div><div class="cwl-ph-prompt">It\'s ' + Y.future + ". Describe our Congregation.</div>" + (down ? PH.down() : PH.tense() + PH.input("", "Write a sentence", 2)) + PH.sent("Nobody sits alone on a Sunday.", s.offline ? "saved" : "sent"); p.foot.innerHTML = down ? "" : PH.btn("Send");
      } }];
    },
    control: function (a, st, ctx) {
      var s = stat(st), o = sigState(st), down = s.down || st === "Phones down: silent arrives";
      if (st === "Laptop closed: the remote") { a.innerHTML = '<div class="cwl-a-pad" style="height:100%;align-items:center;justify-content:center;text-align:center;background:var(--cwl-app-sunken)"><div class="cwl-d6-ic" style="width:56px;height:56px">' + L("laptop") + '</div><div class="cwl-a-section">The laptop is closed</div><div class="cwl-a-muted" style="max-width:420px">The room keeps running. The signal is on your own remote.</div></div>'; CL.icons(); ctx.panel = { set: function () {}, dismiss: function () {}, list: h("div") }; ctx.mirrorLayer = null; return; }
      var team = st === "A team facilitator has the remote";
      P4.ctl(a, { title: P4.ctlLens("congregation") + " &nbsp;Five Lenses: Congregation", chips: [down ? CHIP("Phones down", "", "smartphone") : CHIP("Live", "run-live", "radio"), team ? CHIP("Priya has the remote", "is-outline", "hand-helping") : CHIP("Burst 2:10 left", "is-outline", "timer")],
        sync: s.offline ? SYNC("", "monitor-off", "TV reconnecting") : SYNC("", "check", "On the TV now"), banner: s.offline ? BAN("warning", "triangle-alert", "<strong>TV reconnecting.</strong> It's holding the last screen.") : "",
        tools: [SB("Start burst", "timer", "is-primary"), SB("Phones down", "smartphone"), SB("Spotlight", "sun")], listTitle: "On the TV now", listNote: o.onTV ? "The neutral question" : "The lens wall",
        main: '<div class="cwl-d6-mirror"><div class="box d6-mir"></div></div>',
        side: P4.PRIVATE("Alignment signal", '<div class="d6-sig"></div>') + (o.state === "detail" ? "" : P4.roomPanel([[/Crowded/.test(st) ? 50 : 8, "signed in"], [wallList(st).length, "sentences"]])) });
      /* The TV mirror inside the control surface: the nesting guard keeps its own theme */
      var mb = a.querySelector(".d6-mir"), msh = P4.shell(mb, { theme: ctx.theme, lens: "congregation", headline: W.lensPrompt(W.lenses[0]), unit: "sentences" });
      var mw = new P4.LensWall(msh.host, { labels: D.wallLabels }), wl = wallList(st);
      mw.set(wl, { instant: true, ai: s.ai, grouped: wl.map(function (x) { return x.id; }), seedNote: "9 from the pre-call" }); msh.count(wl.length, "sentences", true); msh.state({ down: down, offline: s.offline });
      msh.tv.setAttribute("data-motion", s.reduced ? "reduced" : "full");
      ctx.mirrorLayer = new P6.TVLayer(msh);
      if (o.onTV) ctx.mirrorLayer.show(P6.neutralHTML(D.signal("g1").ask), { over: true, ask: true, instant: true });
      ctx.panel = new P6.SignalPanel(a.querySelector(".d6-sig"));
      ctx.panel.set(o.cards, { state: team ? "list" : o.state, held: o.held, saved: o.saved, open: o.open, openSignal: o.openSignal, onTV: o.onTV, instant: true });
      CL.icons();
    },
    remote: function (box, st, ctx) {
      var o = sigState(st), team = st === "A team facilitator has the remote";
      var draw = function (cards, open) {
        box.innerHTML = "";
        P4.remote(box, { title: o.onTV ? "The neutral question" : "Five Lenses: Congregation",
          banner: team ? '<div class="cwl-a-banner is-info" role="status"><span class="ic">' + L("hand-helping") + "</span><div><strong>You have the remote.</strong> Priya · team-led block</div></div>" : "",
          top: team ? "" : P6.SignalList(cards, { state: o.state === "none" || o.state === "aiOff" ? "none" : "list", open: open, held: o.held }),
          buttons: '<div class="cwl-r-grid">' + P4.rbtn("Burst", "timer", "is-primary") + P4.rbtn("Phones down", "smartphone") + "</div>" + '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" });
      };
      ctx.remoteList = function (cards) { draw(cards, null); };
      draw(o.cards, st === "Laptop closed: the remote" ? "g1" : null);
    },
    remoteLabel: function (st) { return st === "A team facilitator has the remote" ? "Remote · Priya's phone, team facilitator" : "Remote · the facilitator's own phone"; }
  });

  CL.icons();
})();
