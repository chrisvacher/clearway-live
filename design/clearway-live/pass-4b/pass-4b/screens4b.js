/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 4b · screens4b.js
   Boards for: the decisions, the live lens summaries and sign-off (Day 1), the team facilitator's
   follow-up access, and the pass 5 revisions (the Day 2 confirm and the overnight review).
   Each board keeps its screens in place and moves them between states without redrawing.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P4 = window.ClearwayLivePass4, P5 = window.ClearwayLivePass5, P4b = window.ClearwayLivePass4b, W = window.ClearwayLivePass4Data, S = window.ClearwayLivePass5Data, D = window.ClearwayLivePass4bData;
  var h = CL.h, esc = CL.esc, L = CL.lucide, PH = P4.PH, B = P4.B, CHIP = P4.CHIP, BAN = P4.BAN, SYNC = P4.SYNC, PRIVATE = P4.PRIVATE, IB = P4.IB, SB = P4.SB;
  var host = document.getElementById("boards"), Y = D.Y, F = D.followup;
  function clone(a) { return JSON.parse(JSON.stringify(a)); }

  /* ---------- Scaffolding (matches the pass 3, 4 and 5 review pages) ---------- */
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

  /* A board of states with buttons: tabs on top, a caption, then whatever spec.draw builds. */
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
      CL.clearTimers(); ctx.state = state;
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.textContent === state ? "true" : "false"); });
      stage.querySelectorAll("[data-surface]").forEach(function (e) { if (!e.closest(".sc-actions")) e.setAttribute("data-motion", state === "Reduced motion" ? "reduced" : "full"); });
      acts.innerHTML = ""; cap.textContent = spec.draw(ctx, state, !!instant) || ""; CL.icons();
    }
    spec.states.forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.setAttribute("role", "tab"); t.textContent = s; t.onclick = function () { select(s); }; tabs.appendChild(t); });
    right.querySelectorAll(".p3-theme span").forEach(function (sp, i) {
      sp.onclick = function () { right.querySelectorAll(".p3-theme span").forEach(function (x, j) { x.classList.toggle("is-on", i === j); x.setAttribute("aria-pressed", i === j); }); ctx.theme = i ? "light" : "dark"; stage.innerHTML = ""; spec.make(ctx); select(ctx.state, true); };
    });
    spec.make(ctx);
    requestAnimationFrame(function () { requestAnimationFrame(function () { select(spec.start || spec.states[0], true); }); });
    return ctx;
  }

  /* A persistent TV with its phones, control surface, remote and an optional extra frame. The TV, the
     phones and the panels are redrawn per state; spec.panels(state) can be re-run by a button. */
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
    function build() { tvBox.innerHTML = ""; tvBox.className = "sc-box"; ctx.sh = P4.shell(tvBox, { theme: ctx.theme, eyebrow: spec.eyebrow || "", headline: spec.headline || "", unit: spec.unit || "answers", lens: spec.lens }); ctx.view = spec.make ? spec.make(ctx) : null; }
    function panels(state) {
      var s = stat(ctx.state);
      r2.innerHTML = "";
      if (spec.control) { var a = app(r2, spec.ctlLabel || "Control surface · facilitator view", 1280, spec.ctlH || 600, "control"); a.setAttribute("data-motion", s.reduced ? "reduced" : "full"); spec.control(a, state, ctx); }
      if (spec.remote) { var rbox = frame(r2, spec.remoteLabel || "Remote", "is-phone"); spec.remote(rbox, state, ctx); }
      CL.icons();
    }
    ctx.panels = panels;
    function select(state, instant) {
      CL.clearTimers(); ctx.state = state;
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.textContent === state ? "true" : "false"); });
      var tv = ctx.sh.tv, s = stat(state);
      tv.setAttribute("data-motion", s.reduced ? "reduced" : "full");
      ctx.sh.state({ offline: s.offline, down: s.down }); ctx.sh.foot("");
      acts.innerHTML = ""; cap.textContent = spec.tv(ctx, state, !!instant) || "";
      phWrap.innerHTML = "";
      (spec.phones ? spec.phones(state, ctx) : []).forEach(function (p) {
        var box = frame(phWrap, p.label, "is-phone", p.cap);
        var ph = P4.phone(box, p.o || { head: s.offline ? "offline" : s.down ? "down" : "live", dim: s.down, motion: s.reduced ? "reduced" : null });
        p.render(ph);
      });
      panels(state);
      if (r3) { r3.innerHTML = ""; spec.extra(r3, state, ctx); }
      CL.icons();
    }
    spec.states.forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.setAttribute("role", "tab"); t.textContent = s; t.onclick = function () { select(s); }; tabs.appendChild(t); });
    right.querySelectorAll(".p3-theme span").forEach(function (sp, i) {
      sp.onclick = function () { right.querySelectorAll(".p3-theme span").forEach(function (x, j) { x.classList.toggle("is-on", i === j); x.setAttribute("aria-pressed", i === j); }); ctx.theme = i ? "light" : "dark"; build(); select(ctx.state, true); };
    });
    ctx.button = function (label, icon, fn) { var x = h("button", "cwl-a-btn is-secondary"); x.type = "button"; x.innerHTML = L(icon) + "<span>" + esc(label) + "</span>"; x.onclick = fn; acts.appendChild(x); CL.icons(); };
    build();
    requestAnimationFrame(function () { requestAnimationFrame(function () { select(spec.start || spec.states[2], true); }); });
    return ctx;
  }

  /* ================================================================
     DECISIONS: the Defaults chosen in this pass, and pass 5's approved Defaults as applied
     ================================================================ */
  (function () {
    var b = board("decisions", "Decisions and Defaults", ["Defaults to confirm"], "Chris's November 3 decisions are designed as decided. Where they leave a choice open, this pass chose a Default and every screen below is designed to it. Each card says what the other option would change, so you can choose without a redesign.");
    var DEC = [
      ["Where the five summaries sit on Day 1", "A \"Sign off the 10-year Future\" session straight after the Learning lens, about 25 minutes (5 per lens). The provisional Vision Outcomes follow it, so the afternoon template times move later or lunch is trimmed (SET-08, editable per engagement).", "Draft the summaries during the afternoon break and show them straight after it. The TV waits on the Learning wall until the first one is ready, the same as here, but the facilitator spends the break reading them."],
      ["What happens to the tally when a new version folds in", "It starts again at zero. Each person approves what is on the screen now, so an approval never covers words the person hasn't seen. Their earlier suggestion shows as folded in.", "Approvals carry over unless the sentence a person approved changed. The tally keeps its counts and only the people whose sentence changed are asked again. It's quieter, but the count then describes two versions."],
      ["Suggested changes on the TV", "Anonymous cards beside the tally as they arrive (two shown, then \"+ n more on phones\"). They leave as the new version folds in, so every input appears at once.", "The count only, with the text on the control surface. The TV stays calmer, but a suggestion is then not visible to the room until the fold."],
      ["When AI folds suggestions into a new version", "Automatically, in one batch, once suggestions have stopped arriving for 3 seconds (cwl-delay-quiet). The facilitator can fold now, hold, or undo the version. It waits while the facilitator is editing.", "Only when the facilitator taps Fold in now. Nothing changes on the TV unasked, at the cost of one more tap per lens."],
      ["How long a summary may be", "One screen: up to 420 characters, checked in code. The AI is told to write to fit. If a facilitator's edit goes past it, the TV shows the sentences that fit and says \"+ n more on phones\"; phones always show the whole summary.", "Let a summary run to two TV pages. The room reads more, but a lens then takes twice as long to settle."],
      ["How the facilitator's own edits reach the TV", "In small batches as they type (cwl-delay-type-batch), replacing the line in place with a quiet underline on the sentence being typed, as the intent cards do. The AI mark stays and says \"edited\". No tracked change.", "Tracked changes for the facilitator's edits too. The room sees every change as strike and underline, but a typing pass makes the paragraph jump about."],
      ["How the team facilitator's access works", "A link emailed to the team facilitator and a 9-character code the lead facilitator tells them in the call. It works for the follow-up block only, from an hour before the first session to two hours after the last, then ends by itself. One TV view and one remote at a time. The lead facilitator can reissue, extend or revoke.", "A link alone with no code (simpler, but anyone who gets the email can pair), or access that lasts 24 hours (fewer reissues, longer exposure). Both change the FAC-05 and FAC-06 screens by one field."],
      ["The Day 2 confirm", "Lens by lens: five short confirms of the signed-off text, with the pass 5 tally, \"What's missing?\" and corrections. Phones show the signed-off paragraph only, without the team's sentences underneath, because the room already saw them on Day 1.", "One screen with all five lenses at once and a single \"Does the 10-year Future still say it?\". Quicker, but a correction then has no lens to attach to and the tally can't show where the room stands for each."]
    ];
    var g = h("div", "p4-dec");
    g.innerHTML = DEC.map(function (d) { return "<article><h3>" + esc(d[0]) + '</h3><div class="lbl">Default, designed</div><p class="def">' + esc(d[1]) + '</p><div class="lbl">The other option</div><p>' + esc(d[2]) + "</p></article>"; }).join("");
    b.appendChild(g);
    var ap = h("div"); ap.className = "sc-note"; ap.style.cssText = "max-width:100ch;margin-top:8px";
    ap.innerHTML = "<strong>Pass 5's five Defaults are approved and applied</strong> where the read-back and the review still exist. \"What's missing?\" answers appear under the paragraph as they arrive, anonymous (D2-03). \"It needs a change\" sends a short box, the scribe records the agreed wording and reason, and the facilitator accepts it (D2-04). \"Drafts ready\" shows on the review screen and the remote (OVN-01). Review is laptop only (OVN-01 to OVN-03). Phones see the current lens and settled lenses to look back at, never ahead (D1-15, D2-04).";
    b.appendChild(ap);
  })();

  /* ================================================================
     PART · DAY 1: THE 10-YEAR FUTURE, DRAFTED LIVE AND SIGNED OFF
     ================================================================ */
  part("part-day1", "Day 1: the 10-year Future, drafted live and signed off", "After the Learning lens, AI drafts a one-screen summary of each lens in the present tense from that lens's sentences and clusters, each sentence linked to its sources. It goes straight to the TV as drafted. Phones tap Approve or Suggest a change, AI folds suggestions into a new version live as tracked changes, and the facilitator marks the room's decision for each lens. The tally shows where the room is and never decides. Seed data is Riverside Church (fictional), base year 2026.");

  var LS_STATES = ["Drafting", "First version", "Suggestions arriving", "New version", "Undo an AI version", "The facilitator edits", "Locked by Jaisy", "Mark a decision", "Decided", "Next lens", "All five signed off", "Crowded, 50 phones", "AI off", "Offline and queued", "Phones down", "Reduced motion", "Very long text"];
  var C = D.lens.community, SUG = C.suggestions, FOLDED = { mf1: "folded", mf2: "folded" };
  var EDIT_TEXT = D.final("community").replace("woven into the life of the north end", "woven into the life of the whole north end");
  var CROWD_SUG = SUG.concat(["Please add the arts night.", "Our youth camp belongs here.", "Say the library tutoring.", "Add the Friday drop-in.", "Mention the warming centre.", "The refugee families we sponsor.", "Prayer on the street.", "Our choir is part of this."]);
  function lsData(st) {
    var s = stat(st), d = { lens: "community", settled: ["congregation"], states: {}, yes: 0, change: 0, of: 8, sugg: [], version: 1, mode: "ai", ctl: "view", phone: {} };
    switch (st) {
      case "Drafting": d.lens = "congregation"; d.settled = []; d.mode = "drafting"; d.ctl = "drafting"; break;
      case "First version": d.yes = 3; break;
      case "Suggestions arriving": d.yes = 4; d.change = 3; d.sugg = SUG.slice(0, 4); d.phone = { answer: "suggest", text: "Make it all four schools.", sent: true }; break;
      case "New version": d.states = FOLDED; d.version = 2; d.folded = 2; d.yes = 3; d.change = 0; d.phone = { folded: true }; d.ctl = "v2"; break;
      case "Undo an AI version": d.states = FOLDED; d.version = 2; d.folded = 2; d.yes = 5; d.change = 1; d.ctl = "v2"; break;
      case "The facilitator edits": d.states = FOLDED; d.version = 2; d.folded = 2; d.yes = 5; d.change = 1; d.edited = true; d.ctl = "editing"; d.custom = { text: EDIT_TEXT, typing: [0, 56] }; break;
      case "Locked by Jaisy": d.states = FOLDED; d.version = 2; d.folded = 2; d.yes = 5; d.change = 1; d.ctl = "locked"; break;
      case "Mark a decision": d.states = FOLDED; d.version = 2; d.folded = 2; d.yes = 7; d.change = 1; d.ctl = "deciding"; d.phone = { folded: true, answer: "approve", sent: true }; break;
      case "Decided": d.states = { mf1: "settled", mf2: "settled" }; d.version = 2; d.folded = 2; d.yes = 7; d.change = 1; d.settled = ["congregation", "community"]; d.ctl = "decided"; d.phone = { decided: true }; break;
      case "Next lens": d.lens = "leadership"; d.settled = ["congregation", "community"]; d.ctl = "view"; d.phone = {}; break;
      case "All five signed off": d.done = true; d.settled = D.order.slice(); d.ctl = "all"; break;
      case "Crowded, 50 phones": d.of = 50; d.yes = 41; d.change = 9; d.sugg = CROWD_SUG; d.ctl = "crowded"; d.phone = { answer: "approve", sent: true }; break;
      case "AI off": d.mode = "off"; d.sugg = SUG.slice(0, 2); d.yes = 4; d.change = 2; d.ctl = "aioff"; d.phone = { ai: false }; break;
      case "Offline and queued": d.yes = 4; d.change = 2; d.sugg = SUG.slice(0, 2); d.phone = { answer: "suggest", text: "Make it all four schools.", sent: true }; break;
      case "Phones down": d.yes = 6; d.change = 2; d.sugg = SUG.slice(0, 2); break;
      case "Reduced motion": d.states = FOLDED; d.version = 2; d.folded = 2; d.yes = 5; d.change = 1; d.ctl = "v2"; break;
      case "Very long text": d.long = true; d.yes = 2; d.change = 1; d.ctl = "long"; break;
    }
    return d;
  }
  function ctlTitle(d) { return P4.ctlLens(d.lens || "community") + " &nbsp;Summary: " + esc(P4.lensByKey(d.lens || "community").name) + ", " + Y.future; }
  function sentTexts(d) { return P4b.sentencesOf(d.lens, d.long).map(function (x) { return x.t; }); }
  var FINAL_SENTS = (function () { var t = D.final("community"); return t.match(/[^.]+\./g).map(function (x) { return x.trim(); }); })();

  intBoard({ id: "int-18", ctlH: 860, title: "The 10-year Future, drafted live and signed off", ids: ["D1-14", "D1-15", "INT-18", "LensSummaryTV", "SummaryPhone", "SummaryEditor", "SuggestionList", "VersionList", "DecisionPanel", "LensSignoff"], unit: "answered", phoneW: 500, remote: true,
    note: "One lens at a time. The TV shows the lens heading with its icon, the present-tense summary, the AI icon with \"Drafted from your sentences\", the live Approve and Suggest a change tally (no leader color: it shows where the room is and never decides), and the suggested changes as they arrive. Phones show the summary with each sentence's source sentences underneath. AI folds the suggestions into a new version on the TV with pass 5's tracked changes; the facilitator edits while it's live, undoes an AI version, and marks the room's decision. Community is shown because it has both a change and an addition; the other four lenses run the same way. Pick a state, then use the buttons.",
    states: LS_STATES, start: "Suggestions arriving", lens: null,
    make: function (ctx) { return new P4b.LensSummaryTV(ctx.sh); },
    tv: function (ctx, st, inst) {
      var s = stat(st), d = lsData(st), v = ctx.view; ctx.d = d;
      v.o.long = !!d.long; v.drawn = null; v.states = {};
      var tvs = { lens: d.lens, settled: d.settled, states: d.states, yes: d.yes, change: d.change, of: d.of, suggestions: d.sugg, mode: d.mode, version: d.version, folded: d.folded, edited: d.edited, custom: d.custom, done: d.done, instant: inst };
      v.set(tvs); ctx.sh.count(d.done ? 8 : d.yes + d.change, "answered", inst);
      if (d.mode === "drafting") ctx.button("The summary arrives", "play", function () { v.arrive({ lens: "congregation", settled: [] }); v.set; ctx.sh.count(0, "answered", true); });
      if (st === "First version" || st === "Next lens") ctx.button("Approvals arrive", "hand", function () { var y = 0, seq = [1, 1, 1, 1, 1, 1, 1, 1]; v.tallyTo(0, 0, { of: 8, instant: true }); ctx.sh.count(0, "answered", true); seq.forEach(function (k, i) { CL.later(function () { y += k; v.tallyTo(y, 0, { of: 8 }); ctx.sh.count(y, "answered"); }, 300 + i * 380); }); });
      if (st === "Suggestions arriving" || st === "Offline and queued" || st === "Crowded, 50 phones") ctx.button("A suggestion arrives", "message-square-plus", function () { var list = d.sugg.slice(), add = CROWD_SUG.filter(function (x) { return list.indexOf(x) < 0; })[0] || "Add the arts night."; list.unshift(add); d.sugg = list; v.ml.set(list, { newest: add, max: 2, always: true }); });
      if (st === "Suggestions arriving") ctx.button("Fold the suggestions in", "git-merge", function () { v.foldIn(["mf1", "mf2"], { remaining: [] }, function () { v.tallyTo(0, 0, { of: 8 }); ctx.sh.count(0, "answered"); ctx.panels("New version"); }); });
      if (st === "Undo an AI version") ctx.button("Undo this version", "undo-2", function () { v.undoVersion({ suggestions: SUG.slice(0, 4) }); v.tallyTo(0, 0, { of: 8 }); ctx.sh.count(0, "answered"); ctx.panels("Suggestions arriving"); });
      if (st === "Mark a decision") ctx.button("Record the decision", "check", function () { v.settle(); ctx.panels("Decided"); });
      if (st === "Decided") ctx.button("Next lens", "skip-forward", function () { v.next("leadership", function () { ctx.sh.count(0, "answered"); }); ctx.panels("Next lens"); });
      return {
        "Drafting": "Congregation is being drafted from 36 sentences. The TV keeps the Learning wall until the first summary is ready; this is what the TV shows if the facilitator has already moved on: the lens heading and the AI icon with what it is doing, never a blank. Play the arrival.",
        "First version": "Version 1 of Community: six sentences in the present tense, the AI icon with \"Drafted from your sentences\", and the tally waiting. Approvals arrive as the room taps; the bars carry no leader color.",
        "Suggestions arriving": "Five approve, three suggest. The suggested changes land beside the tally as they arrive, anonymous (two shown, the rest counted on phones). Fold the suggestions in to watch version 2 arrive.",
        "New version": "Version 2: \"Two\" was struck and left, \"All four\" arrived underlined, and a new sentence about seniors arrived at the end. The tally starts again at zero and the AI line says \"Version 2 · Folded in from 2 suggestions\".",
        "Undo an AI version": "The facilitator can undo an AI version at any time. The changes go back out in one movement, the TV shows version 1, and the suggestions return to the list to fold in again or write by hand. Try the button.",
        "The facilitator edits": "The facilitator is editing the first sentence on the control surface. The TV follows in small batches with a quiet underline on the sentence being typed. The field is locked to the editor, the AI mark says \"edited\", and any AI fold waits.",
        "Locked by Jaisy": "The co-facilitator is editing, so the summary is read only here for Chris, with her name and a lock. The field is released a few seconds after she stops typing.",
        "Mark a decision": "Chris opens Mark a decision. The counts are shown, and they never decide: he records what the room agreed and why. Record the decision to watch the lens settle.",
        "Decided": "The decision is recorded: Lime sweeps once across Community in the progress, then it takes its check. The changes become plain words and the TV says \"Signed off by the room\". Phones show it signed off.",
        "Next lens": "Leadership is on. The signed-off lenses keep their checks, the bars start again from zero and Leadership's summary is already drafted.",
        "All five signed off": "All five lenses are signed off. The TV closes the session with the five lenses and one line each, then moves to the provisional Vision Outcomes. The draft Clearway Map takes its 10-year Future from these.",
        "Crowded, 50 phones": "Fifty phones: 41 approve, 9 suggest. Twelve suggestions arrived; two show on the TV and the rest are counted on phones. AI folds the ones that say the same into a single change.",
        "AI off": "AI is off for this lens, so the facilitator writes the summary from the room's sentences. There is no AI mark: the TV says \"Written from your sentences\". Suggestions are applied as written, as tracked changes.",
        "Offline and queued": "The TV holds its last state with the gray breathing mark. Phones keep Approve and Suggest a change and send them in order when it reconnects.",
        "Phones down": "Phones down for the conversation: the tally holds still and phones dim with their answer.",
        "Reduced motion": "Version 2 appears at once with its changes underlined, the tally and the settle mark change in place, and the AI icon doesn't sweep.",
        "Very long text": "A summary of nine sentences is more than one screen at the floor size. The TV shows the sentences that fit and says how many more are on phones; the control surface warns, and phones show the whole summary."
      }[st];
    },
    phones: function (st, ctx) {
      var s = stat(st), d = lsData(st), p = d.phone || {}, k = d.lens;
      if (d.done) return [{ label: "Phone · all signed off", render: function (ph) { ph.body.innerHTML = '<div class="cwl-lsp">' + P5.LensProgress(null, D.order) + '<div class="cwl-lsp-h">The 10-year Future, signed off</div><div class="cwl-lsp-banner">' + L("check") + "<span>The room decided each lens together. Next: the provisional Vision Outcomes.</span></div>" + D.order.map(function (x) { return '<div class="cwl-lsp-s"><div class="cwl-lsp-t"><strong>' + esc(P4.lensByKey(x).name) + "</strong>: " + esc(W.lensLines[x]) + "</div></div>"; }).join("") + "</div>"; ph.foot.innerHTML = ""; } }];
      if (d.mode === "drafting") return [{ label: "Phone · waiting", o: { head: "live", waiting: true }, render: function (ph) { ph.body.innerHTML = '<div class="cwl-lsp">' + P5.LensProgress(k, []) + '<div class="cwl-lsp-h">Congregation, ' + Y.future + '</div><div class="cwl-lsp-ai">' + P4b.AIMark() + "<span>Drafting from 36 sentences</span></div><div class=\"cwl-ph-muted\">Your summary appears here as soon as it's on the TV.</div></div>"; ph.foot.innerHTML = ""; } }];
      var opts = function (extra) { var o = { lens: k, version: d.version, states: d.states, settled: d.settled, long: d.long, down: s.down, offline: s.offline, ai: d.mode !== "off", compact: true }; for (var x in extra) o[x] = extra[x]; return o; };
      var list = [];
      if (st === "Suggestions arriving" || st === "Offline and queued") {
        list.push({ label: "Phone · suggesting", cap: "A short box. A few words is enough, 140 characters at most.", render: function (ph) { P4b.SummaryPhone(ph, opts({ answer: "suggest", text: "Make it all four schools.", sent: false })); } });
        list.push({ label: "Phone · what they sent", cap: s.offline ? "Saved on this phone. It sends when the wifi is back." : "What they sent stays on screen.", render: function (ph) { P4b.SummaryPhone(ph, opts({ answer: "suggest", text: "Not two schools. It should be every school in the north end by then.", sent: true })); } });
        return list;
      }
      if (st === "New version" || st === "Reduced motion" || st === "Undo an AI version" || st === "The facilitator edits" || st === "Locked by Jaisy" || st === "Mark a decision") {
        list.push({ label: "Phone · version 2", cap: "Changes stay underlined until the lens is signed off. Their own suggestion is in it.", render: function (ph) { P4b.SummaryPhone(ph, opts({ folded: true, answer: p.answer, sent: p.sent, text: "" })); } });
        list.push({ label: "Phone · someone who approved", cap: "A new version asks again: approve what's on the screen now.", render: function (ph) { P4b.SummaryPhone(ph, opts({ folded: false })); } });
        return list;
      }
      if (st === "Decided") {
        list.push({ label: "Phone · signed off", render: function (ph) { P4b.SummaryPhone(ph, opts({ decided: true })); } });
        list.push({ label: "Phone · looking back", cap: "Signed-off lenses can be read again. Never ahead of the TV.", render: function (ph) { P4b.SummaryPhone(ph, { lens: "congregation", look: true, current: "community", settled: d.settled, compact: true }); } });
        return list;
      }
      list.push({ label: "Phone · " + (p.sent ? "answered" : "reading"), render: function (ph) { P4b.SummaryPhone(ph, opts({ answer: p.answer, sent: p.sent, text: p.text })); } });
      list.push({ label: "Phone · looking back", cap: "Signed-off lenses can be read again. Never ahead of the TV.", render: function (ph) { P4b.SummaryPhone(ph, { lens: "congregation", look: true, current: k, settled: d.settled.indexOf("congregation") >= 0 ? d.settled : ["congregation"], compact: true }); } });
      if (st === "Very long text") list.shift(), list.unshift({ label: "Phone · the whole summary", cap: "Phones always show every sentence.", render: function (ph) { P4b.SummaryPhone(ph, opts({})); } });
      return list;
    },
    control: function (a, st, ctx) {
      var d = lsData(st), cs = d.ctl, s = stat(ctx.state), dec = false;
      if (st !== ctx.state) { var o2 = lsData(st); d = o2; cs = o2.ctl; }
      var nSigned = d.settled.length, sents = d.long ? sentTexts(d) : (d.states && d.states.mf1 ? FINAL_SENTS : sentTexts(d));
      var lensStates = {}; D.order.forEach(function (k) { lensStates[k] = d.settled.indexOf(k) >= 0 ? "signed" : k === d.lens ? "now" : "ready"; });
      if (cs === "drafting") { lensStates.congregation = "drafting"; D.order.slice(1).forEach(function (k) { lensStates[k] = "drafting"; }); }
      var tools = [], main = "", banner = "";
      var tallyMeter = [[d.yes, "Approve"], [d.change, "Suggest a change"], [d.of - d.yes - d.change, "Not yet"]];
      var suggList = d.sugg.map(function (t, i) { return { t: t, state: "new", same: i === 0 && d.sugg.length > 2 ? 2 : 0 }; });
      if (cs === "drafting") {
        banner = BAN("info", "info", "<strong>Drafting all five lenses.</strong> Congregation is ready first. It goes to the TV when you send it, and the others follow while the room reads.");
        main = '<div class="cwl-ovn-progress"><div class="row"><span><b>Drafting</b> · started when the Learning lens ended</span><span class="cwl-a-muted">Usually under a minute</span></div><div class="cwl-ovn-bar"><i style="width:34%"></i></div></div>' + P4b.LensSignoff(lensStates);
        tools = [B("Send to the TV", "is-primary is-sm", "tv", " disabled")];
      } else if (cs === "all") {
        main = '<div class="cwl-lsc-done">' + L("badge-check") + "<div><strong>The 10-year Future is signed off.</strong> The draft Clearway Map takes it from these five summaries. Next: the provisional Vision Outcomes.</div></div>" + P4b.LensSignoff(lensStates);
        tools = [SB("Go to Provisional Vision Outcomes", "skip-forward", "is-primary")];
      } else {
        var edState = cs === "editing" ? "editing" : cs === "locked" ? "locked" : d.mode === "off" ? "empty" : "view";
        var ver = d.version, held = cs === "editing" && d.sugg.length;
        var ed = P4b.SummaryEditor({ sentences: edState === "empty" ? [] : sents, version: ver, state: edState, by: "jt", on: cs === "editing" ? 0 : -1, ai: d.mode !== "off", edited: d.edited });
        if (d.long) ed = P4b.SummaryEditor({ sentences: sents, version: 1, state: "view" });
        var sugg = '<div class="cwl-a-row" style="justify-content:space-between"><div class="cwl-a-label">Suggested changes</div><span class="cwl-a-muted">' + (d.mode === "off" ? "Applied as written" : cs === "v2" || cs === "deciding" || cs === "decided" ? "Folded into version 2" : "AI folds them into a new version") + "</span></div>";
        if (cs === "v2" || cs === "editing" || cs === "locked" || cs === "deciding" || cs === "decided") sugg += P4b.SuggestionList([{ t: SUG[0], state: "folded", same: 2 }, { t: SUG[1], state: "folded", same: 2 }], {});
        else sugg += P4b.SuggestionList(suggList, { ai: d.mode !== "off", newest: suggList[0] && suggList[0].t });
        if (d.mode === "off") { suggList.forEach(function (x) { x.state = "new"; }); sugg = '<div class="cwl-a-row" style="justify-content:space-between"><div class="cwl-a-label">Suggested changes</div><span class="cwl-a-muted">Applied as written</span></div>' + P4b.SuggestionList(suggList, { ai: false }); }
        var heldNote = held ? '<div class="cwl-lsc-held">' + L("lock") + "<span>You're editing, so " + d.sugg.length + " suggestions are held. They fold in when you stop typing, or you can apply them yourself.</span></div>" : "";
        var warn = d.long ? BAN("warning", "triangle-alert", "<strong>This summary is longer than one screen.</strong> The TV shows the first 6 sentences and says 3 more are on phones. Shorten it, or leave it: phones show every sentence.") : "";
        var decision = P4b.DecisionPanel({ state: cs === "deciding" ? "open" : cs === "decided" ? "recorded" : "closed", yes: d.yes, change: d.change, of: d.of, lens: d.lens, reason: cs === "decided" ? "The room agreed it says what we mean, with all four schools and the seniors." : "The room agreed it says what we mean, with all four schools and the seniors." });
        var vers = ver > 1 ? '<div class="cwl-a-label" style="margin-top:6px">Versions</div>' + P4b.VersionList([{ n: 2, who: "ai", time: "Folded in from 2 suggestions · now", what: "Version 2" + (d.edited ? ", edited by you" : ""), current: true }, { n: 1, who: "ai", time: "Drafted from 31 sentences", what: "Version 1" }], { noUndo: cs === "decided" }) : "";
        main = warn + ed + heldNote + sugg + '<div class="cwl-a-label" style="margin-top:6px">Where the room is</div>' + decision + vers;
        tools = cs === "decided" ? [SB("Next lens", "chevron-right", "is-primary"), B("Undo the decision", "is-secondary is-sm", "undo-2")] :
          [B("Mark a decision", "is-confirm is-sm", "gavel", cs === "deciding" ? " disabled" : ""), SB(cs === "editing" ? "Done editing" : "Edit the summary", cs === "editing" ? "check" : "pencil", ""), SB("Fold in now", "git-merge", ""), SB(d.version > 1 ? "Undo AI version" : "Undo", "undo-2"), SB("Phones down", "smartphone")];
        if (d.mode === "off") tools = [B("Mark a decision", "is-confirm is-sm", "gavel"), SB("Turn AI on for this lens", "toggle-right")];
        if (cs === "locked") tools = [B("Mark a decision", "is-confirm is-sm", "gavel", " disabled"), SB("Edit the summary", "pencil", "")];
        if (cs === "locked") tools[1] = B("Edit the summary", "is-secondary is-sm", "pencil", " disabled");
      }
      var sideWrite = d.mode === "off" ? PRIVATE("The room's sentences", '<div class="cwl-lsc-writeside"><div class="cwl-ovn-scard is-lit"><div class="meta">' + L("smartphone") + "Phone · anonymous</div><div>" + esc(S.phone.p8) + '</div><div class="cwl-a-row">' + SB("Add to the summary", "plus") + '</div></div><div class="cwl-ovn-scard is-lit"><div class="meta">' + L("smartphone") + "Phone · anonymous</div><div>" + esc(S.phone.p5) + '</div><div class="cwl-a-row">' + SB("Added", "check") + "</div></div></div>") : "";
      P4.ctl(a, { part: "Day 1", title: cs === "all" ? "The 10-year Future, signed off" : ctlTitle(d), chips: [s.down ? CHIP("Phones down", "", "smartphone") : CHIP("Live", "run-live", "radio"), CHIP(nSigned + " of 5 signed off", "is-outline", "check")].concat(cs === "drafting" || cs === "all" ? [] : [CHIP(d.mode === "off" ? "Written by you" : "Version " + d.version, "is-outline", d.mode === "off" ? "pencil-line" : "file-text")]),
        sync: s.offline ? SYNC("", "monitor-off", "TV reconnecting") : cs === "editing" ? SYNC("is-syncing", "pencil", "TV follows as you type") : SYNC("", "check", "On the TV now"), banner: s.offline ? BAN("warning", "triangle-alert", "<strong>TV reconnecting.</strong> It's holding the last screen and will catch up in one pass.") : banner,
        tools: tools, meter: cs === "drafting" || cs === "all" ? null : null, listTitle: false, main: '<div class="p3-items" style="padding:0;background:none;border:0;display:flex;flex-direction:column;gap:8px">' + main + "</div>",
        side: sideWrite + PRIVATE("Five lenses", P4b.LensSignoff(lensStates)) + PRIVATE("AI", P4.aiState(d.mode !== "off", d.mode === "off" ? "Writing it yourself for this lens" : "Folding suggestions into new versions")) + P4.notes("Read the summary aloud. Ask what's missing or wrong, not whether anyone objects. Mark the decision when the room agrees. The counts are a guide, not the decision.") });
      CL.icons();
    },
    remote: function (box, st, ctx) {
      var d = lsData(st), cs = d.ctl, l = P4.lensByKey(d.lens || "community");
      if (d.done) { P4.remote(box, { title: "10-year Future signed off", buttons: P4.rbtn("Next session", "chevron-right", "is-primary") + '<div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">5 of 5 signed off</div>' }); return; }
      var top = '<div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-label">' + d.yes + " approve · " + d.change + " suggest</span></div>" + (d.sugg.length && cs !== "v2" ? '<div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">' + d.sugg.length + " suggestions waiting</div>" : "") + P5.LensProgress(d.lens, d.settled);
      var btns = cs === "drafting" ? P4.rbtn("Send to the TV", "tv", "is-primary") : cs === "decided" ? P4.rbtn("Next lens", "chevron-right", "is-live") : P4.rbtn("Mark a decision", "gavel", "is-live") + '<div class="cwl-r-grid">' + P4.rbtn("Fold in now", "git-merge") + P4.rbtn(d.version > 1 ? "Undo version" : "Undo", "undo-2") + '</div><div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next lens", "chevron-right") + "</div>" + P4.rbtn("Phones down", "smartphone");
      P4.remote(box, { title: "Summary: " + l.name, top: top, buttons: btns });
    }
  });

  /* ---------- The five summaries, each on its own screen ---------- */
  (function () {
    var b = board("d1-14-five", "Five lenses, five screens", ["D1-14", "LensSummaryTV"], "Every lens's signed-off summary on its own TV screen, to check that each fits one screen at the room's type size. Community is the longest at 396 characters and steps down to the floor size; the other four run at the body size. Past 420 characters the TV shows the sentences that fit and says how many more are on phones.");
    var r = row(b, "is-2"), all = [];
    D.order.forEach(function (k, i) {
      var box = frame(r, P4.lensByKey(k).name + " · " + D.final(k).length + " characters", "is-tv");
      var sh = P4.shell(box, { theme: "dark", unit: "answered" }), v = new P4b.LensSummaryTV(sh);
      var st = {}; D.lens[k].folds.forEach(function (f) { st[f.id] = "settled"; });
      v.set({ lens: k, settled: D.order.slice(0, i + 1), states: st, yes: 8, change: 0, of: 8, suggestions: [], mode: "ai", version: D.lens[k].folds.length ? 2 : 1, folded: D.lens[k].folds.length, instant: true });
      sh.count(8, "answered", true); sh.state({}); all.push(sh);
    });
    CL.icons();
  })();

  /* ================================================================
     PART · THE TEAM FACILITATOR'S FOLLOW-UP ACCESS
     ================================================================ */
  part("part-followup", "The team facilitator's follow-up, without a Clearway sign-in", "In the day-and-a-half template the pre-mortem, commander's intent and affirming the cards move to a video session within two weeks. The team's own facilitator pairs the shared TV view (a screen share in the call) and takes the remote, with no Clearway account. The lead facilitator issues scoped access for that block only. App surfaces: light, app tokens, no texture, never Sunrise.");

  function setupShell(a, active, head, body) {
    a.innerHTML = '<div class="cwl-ovn-shell"><nav class="cwl-ovn-nav" aria-label="Engagement"><div class="brand">' + L("compass") + esc(D.church) + "</div>" +
      [["Overview", "layout-dashboard"], ["Attendees", "users"], ["Run of show", "list-ordered"], ["Follow-up access", "key-round"], ["Outputs", "file-text"]].map(function (n) { return '<a href="#" tabindex="-1"' + (n[0] === active ? ' class="is-on"' : "") + ">" + L(n[1]) + esc(n[0]) + "</a>"; }).join("") + '</nav><div class="cwl-ovn"><header class="cwl-ovn-head"><div class="grow">' + head + '</div></header><div class="cwl-ovn-body">' + body + "</div></div></div>";
    CL.icons();
  }
  stateBoard({ id: "fac-05", title: "Issue follow-up access", ids: ["FAC-05", "FollowUpIssue"],
    note: "The lead facilitator issues the access in setup, for the follow-up block only: who (from the attendee list), what it covers, when it works, the link and the code. The link goes to the team facilitator's email; the code is told to them in the call and is never in the email. Below it, the control surface during the follow-up shows who has the remote and when the access ends.",
    states: ["Not issued", "Issued and emailed", "Code shown", "Email didn't send", "Priya has the remote", "Ending soon", "Ended", "Revoked", "Reduced motion"], start: "Issued and emailed",
    make: function (ctx) {
      ctx.a = app(row(ctx.stage, "is-1"), "Setup · Follow-up access · laptop · data-surface=\"setup\"", 1280, 820, "setup");
      ctx.c = app(row(ctx.stage, "is-1"), "Control surface during the follow-up · the lead facilitator's laptop", 1280, 360, "control");
    },
    draw: function (ctx, st) {
      var map = { "Not issued": "none", "Issued and emailed": "issued", "Code shown": "issued", "Email didn't send": "bounced", "Priya has the remote": "paired", "Ending soon": "expiring", "Ended": "expired", "Revoked": "revoked", "Reduced motion": "paired" }, k = map[st];
      setupShell(ctx.a, "Follow-up access", '<div class="cwl-a-eyebrow">' + esc(D.church) + " · Day-and-a-half template · Follow-up session</div><div class=\"cwl-a-title\" style=\"font-size:var(--cwl-fs-app-page-title);font-weight:700\">Follow-up access</div>", P4b.FollowUpIssue(k, { showCode: st === "Code shown" }));
      var live = k === "paired" || k === "expiring", ended = k === "expired" || k === "revoked";
      P4.ctl(ctx.c, { part: "Follow-up · " + F.date, title: "Commander's intent", chips: [CHIP("Team-led", "run-team-led", "users"), live ? CHIP("Priya has the remote", "is-outline", "hand-helping") : CHIP("You have the remote", "is-outline", "hand")], sync: SYNC("", "check", "On the TV now"),
        banner: k === "expiring" ? BAN("warning", "clock", "<strong>Priya's access ends at " + F.closes + " pm.</strong> The remote comes back to you then, and the TV doesn't change.") : ended ? BAN("info", "info", "<strong>" + (k === "revoked" ? "You revoked Priya's access." : "Priya's access ended.") + "</strong> The remote is back with you and the TV didn't change.") : "",
        tools: live ? [B("Take back", "is-primary is-sm", "hand"), SB("Extend by an hour", "clock"), SB("Revoke access", "ban", "is-ghost")] : [SB("Hand over", "hand-helping")], listTitle: "Follow-up block", listNote: "Scribe console off for the team-led block",
        items: F.sessions.map(function (x, i) { return P4.item(x.t, esc(x.n), i === 1 ? "Live now" : "", i === 1 ? [CHIP("Live", "run-live", "radio")] : []); }),
        side: PRIVATE("Follow-up access", '<div class="cwl-a-li"><span class="cwl-a-avatar">P</span><span class="grow">' + (live ? "Priya Shah holds the remote" : ended ? "Priya's access " + (k === "revoked" ? "was revoked" : "ended") : "Not started") + '</span></div><div class="cwl-a-muted">' + (live ? "TV view paired from her laptop. Remote on her phone. Access ends at " + F.closes + " pm." : "Link and code issued for this block only.") + "</div>") + P4.SIGNAL_SLOT });
      return {
        "Not issued": "Nothing is issued yet. Who and what it covers are filled from the engagement; the code is empty. Only the lead facilitator can issue access.",
        "Issued and emailed": "The link went to Priya's email from live.clearway.co. The code is hidden: Chris tells her in the call or by text. Neither TV view nor remote is paired yet.",
        "Code shown": "Show the code to read it out. It is hidden again when the page closes. The email never carries it.",
        "Email didn't send": "The email didn't reach Priya. Said plainly, with the way out: copy the link. The link alone does nothing without the code.",
        "Priya has the remote": "Priya paired the TV view from her laptop (shared in the call) and took the remote on her phone. The control surface says so, and Take back never changes the TV.",
        "Ending soon": "Fifteen minutes before the access ends, the lead facilitator's screen and Priya's remote both say so, with Extend by an hour.",
        "Ended": "The access ended by itself. The remote came back to the lead facilitator, the TV didn't change, and the link and code no longer work.",
        "Revoked": "The lead facilitator revoked the access. It stops at once; the remote comes back and the TV doesn't change.",
        "Reduced motion": "Status changes in place; nothing moves."
      }[st];
    }
  });

  stateBoard({ id: "fac-06", title: "The team facilitator pairs the TV view and takes the remote", ids: ["FAC-06", "FollowUpPair", "TeamRemote"],
    note: "No Clearway sign-in. The team facilitator opens the emailed link on the laptop that will share the TV view, enters the code, opens the TV view in its own tab, shares that tab in the video call, then opens the same link on a phone to take the remote. The access works for the follow-up block only and ends by itself; the lead facilitator can take the remote back at any time without the TV changing.",
    states: ["Before the window", "Enter the code", "Wrong code", "Too many tries", "Pair the TV view", "Waiting for the tab", "TV view paired", "The remote", "Chris took it back", "Ending soon", "Ended", "Revoked", "Offline and queued", "Reduced motion"], start: "TV view paired",
    make: function (ctx) {
      var r = row(ctx.stage, "is-1"); r.style.gridTemplateColumns = "minmax(0, 1fr) 240px 240px";
      ctx.a = app(r, "Priya's laptop · the link page · data-surface=\"setup\"", 1000, 780, "setup");
      ctx.p1 = frame(r, "Priya's phone · the link", "is-phone");
      ctx.p2 = frame(r, "Priya's phone · the remote", "is-phone");
    },
    draw: function (ctx, st) {
      var lp = { "Before the window": "before", "Enter the code": "enter", "Wrong code": "wrong", "Too many tries": "locked", "Pair the TV view": "pair", "Waiting for the tab": "waiting", "TV view paired": "paired", "The remote": "paired", "Chris took it back": "paired", "Ending soon": "paired", "Ended": "ended", "Revoked": "revoked", "Offline and queued": "paired", "Reduced motion": "paired" }[st];
      ctx.a.innerHTML = '<div class="cwl-a-body" style="padding:8px 0">' + P4b.FollowUpPair(lp) + "</div>";
      /* the phone's link page */
      ctx.p1.innerHTML = ""; var ph1 = CL.appPhone(ctx.p1, "setup");
      var pg = { "Before the window": '<div class="cwl-fu-page is-phone"><div class="cwl-a-eyebrow">Follow-up</div><h2>Opens at ' + F.opens + " am</h2><p>Come back to this link then.</p></div>",
        "Ended": '<div class="cwl-fu-page is-phone"><h2>This follow-up has ended</h2><p>The remote is back with Chris.</p></div>', "Revoked": '<div class="cwl-fu-page is-phone"><h2>This access was turned off</h2><p>Ask Chris for new access.</p></div>' }[st];
      if (!pg) {
        var entering = /Enter|Wrong|Too many|Pair the TV|Waiting/.test(st);
        pg = entering ? '<div class="cwl-fu-page is-phone"><div class="cwl-a-eyebrow">' + esc(D.church) + "</div><h2>Enter the code Chris gave you</h2>" + P4b.codeBoxes(9, st === "Enter the code" ? "MAPLE" : "MAPLE4812") + (st === "Wrong code" ? '<div class="cwl-a-banner is-error" role="alert"><span class="ic">' + L("circle-alert") + "</span><div>That code doesn't match. 2 tries left.</div></div>" : st === "Too many tries" ? '<div class="cwl-a-banner is-info" role="status"><span class="ic">' + L("info") + "</span><div>Too many tries. Try again in 10 minutes.</div></div>" : "") + B("Continue", "is-primary", "arrow-right") + "</div>" :
          '<div class="cwl-fu-page is-phone"><div class="cwl-a-eyebrow">' + esc(D.church) + " · Follow-up</div><h2>Take the remote</h2><p>You'll run the pre-mortem to affirming the cards. Chris can take it back at any time.</p>" + B("Take the remote", "is-primary", "hand") + "</div>";
      }
      ph1.innerHTML = pg;
      ctx.p2.innerHTML = "";
      var rm = { held: st === "Chris took it back" ? "chris" : "you", ending: st === "Ending soon", offline: st === "Offline and queued", ended: st === "Ended" || st === "Revoked" };
      if (/Before|Enter|Wrong|Too many|Pair the TV|Waiting/.test(st)) { var e = CL.appPhone(ctx.p2, "control"); e.innerHTML = '<div class="cwl-r-body"><div class="cwl-a-muted" style="padding:24px 8px;font-size:var(--cwl-fs-app-table)">The remote appears here once you take it.</div></div>'; }
      else if (st === "TV view paired") { var e2 = CL.appPhone(ctx.p2, "control"); e2.innerHTML = '<div class="cwl-r-body"><div class="cwl-a-muted" style="padding:24px 8px;font-size:var(--cwl-fs-app-table)">Open the link on this phone and take the remote when the TV view is shared.</div></div>'; }
      else P4b.TeamRemote(ctx.p2, rm);
      CL.icons();
      return {
        "Before the window": "Before the access opens, the link says when to come back. No account, no error, no alarm.",
        "Enter the code": "The code is nine letters and numbers, told to Priya in the call. The link alone does nothing.",
        "Wrong code": "A wrong code says so quietly and counts the tries left.",
        "Too many tries": "After three wrong tries the page waits 10 minutes, and says so. Chris can reissue.",
        "Pair the TV view": "Four short steps. The TV view opens in its own tab, so the call can share just that tab.",
        "Waiting for the tab": "The tab is opening. It connects the way the pre-call's shared TV view does.",
        "TV view paired": "The TV view is paired and waiting to be shared. Priya's phone opens the same link to take the remote.",
        "The remote": "Priya's phone is the remote for the block: Go live, Back, Next, Phones down, Spotlight, Hide, Undo AI merge, and when the access ends. No notes, no signal, no other sessions.",
        "Chris took it back": "Chris took the remote for a moment. Priya's phone says so and offers Ask for the remote. The TV didn't change.",
        "Ending soon": "Fifteen minutes before the access ends the remote says so. Ask Chris to extend it if the session runs long.",
        "Ended": "The access ended. The remote shows it quietly and the link page says what happened. The TV keeps its last screen.",
        "Revoked": "Chris turned the access off. Same screens as ended, with the reason said.",
        "Offline and queued": "Priya's phone reconnects with a quiet \"Reconnecting\". Presses wait and send in order.",
        "Reduced motion": "Nothing moves."
      }[st];
    }
  });

  (function () {
    var b = board("fac-06-scope", "What the team remote shows and hides, and when it ends", ["FAC-06", "FollowUpScope"], "The team facilitator's remote is scoped to the follow-up block. It never shows the alignment signal, presenter notes, Discover data or other blocks, and it can't change who has access. Expiry never interrupts what the team sees: the remote returns to the lead facilitator and the TV keeps its last screen.");
    var r = row(b, "is-1"); r.innerHTML = P4b.FollowUpScope();
    var r2 = row(b, "is-2"); r2.style.gridTemplateColumns = "240px 240px minmax(0, 1fr)";
    var f1 = frame(r2, "The lead facilitator's remote", "is-phone");
    P4.remote(f1, { title: "Commander's intent", banner: '<div class="cwl-wf-holder">' + L("hand-helping") + '<span class="grow">Priya has the remote</span><button type="button" class="cwl-a-btn is-sm">Take back</button></div>', top: '<div class="cwl-a-eyebrow">Alignment signal</div><div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">2 divergent · 1 silent</div>', buttons: '<div class="cwl-r-grid">' + P4.rbtn("Presenter notes", "notebook-pen") + P4.rbtn("Revoke access", "ban") + '</div><div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" });
    var f2 = frame(r2, "The team facilitator's remote", "is-phone");
    P4b.TeamRemote(f2, { held: "you" });
    var ex = h("div", "cwl-fu-card"); ex.setAttribute("data-surface", "setup"); ex.setAttribute("data-theme", "light");
    ex.innerHTML = '<h4>When the access ends</h4>' + P4b.rail({ from: 17, span: 40 }) + '<p>The access works from ' + F.opens + ' am, an hour before the first session, until ' + F.closes + ' pm, two hours after the last. Fifteen minutes before the end, both remotes say so. At the end, or when the lead facilitator revokes it, the remote returns to the lead facilitator, the link and code stop working, and the TV doesn\'t change. The lead facilitator can extend by an hour, reissue a new code, or revoke at any time. One TV view and one remote are paired at once: a second remote asks the first to hand over.</p>';
    r2.appendChild(ex);
    CL.icons();
  })();

  /* ================================================================
     PART · PASS 5, REVISED
     ================================================================ */
  part("part-rev", "Pass 5, revised: the Day 2 confirm and the overnight review", "The 10-year Future is decided live on Day 1, so Day 2 at 9:00 becomes a short confirm of the signed-off text after prayer. Overnight, AI tidies the provisional Vision Outcomes and the 3-year Vision first pass from the room's bullets, scribe cards and easel photos, and Chris and the co-facilitator review those, not lens drafts. Pass 5's approved Defaults are applied.");

  var MISS_CROWD = S.missing.concat(["The Friday youth drop-in.", "Our English classes for newcomers.", "The community choir.", "Hosting the city's warming centre.", "The north end clean-up day.", "Tutoring at the library."]);
  var RB_STATES = ["After prayer", "Empty", "First tap", "Nothing to change", "A split room", "A correction waiting", "A correction folded in", "Lens confirmed", "Next lens", "The close", "Crowded, 50 phones", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"];
  function rbData(st) {
    var s = stat(st), d = { lens: "community", settled: ["congregation"], states: {}, yes: 0, change: 0, of: 8, missing: [], queue: [], phone: { answer: null } };
    switch (st) {
      case "After prayer": d.open = true; d.settled = []; break;
      case "First tap": d.yes = 1; d.phone = { answer: "yes", sent: true }; break;
      case "Nothing to change": d.yes = 8; d.phone = { answer: "yes", sent: true }; break;
      case "A split room": d.yes = 5; d.change = 3; d.missing = S.missing.slice(0, 2); d.phone = { answer: "change", change: S.corrections[0].phone }; break;
      case "A correction waiting": d.yes = 5; d.change = 3; d.missing = S.missing.slice(0, 3); d.queue = [{ c: S.corrections[0], state: "waiting" }]; d.phone = { answer: "change", change: S.corrections[0].phone, sent: true }; break;
      case "A correction folded in": case "AI off": case "Reduced motion": case "Offline and queued": case "Phones down":
        d.yes = 6; d.change = 2; d.missing = S.missing.slice(0, 3); d.states = { x1: "folded" }; d.queue = [{ c: S.corrections[0], state: "accepted" }, { c: S.corrections[1], state: "waiting" }]; d.phone = { answer: "change", change: S.corrections[0].phone, sent: true }; break;
      case "Lens confirmed": d.yes = 8; d.states = { x1: "settled", x2: "settled" }; d.settled = ["congregation", "community"]; d.queue = [{ c: S.corrections[0], state: "accepted" }, { c: S.corrections[1], state: "accepted" }]; d.missing = S.missing.slice(0, 3); d.phone = { answer: "yes", sent: true }; break;
      case "Next lens": d.lens = "leadership"; d.settled = ["congregation", "community"]; break;
      case "The close": d.close = true; d.missing = S.missing.slice(1); d.settled = D.order.slice(); break;
      case "Crowded, 50 phones": d.of = 50; d.yes = 41; d.change = 9; d.missing = MISS_CROWD; d.queue = [{ c: S.corrections[0], state: "waiting" }]; d.phone = { answer: "yes", sent: true }; break;
      case "Very long text": d.yes = 5; d.change = 3; d.missing = [S.missingLong].concat(S.missing.slice(0, 1)); d.long = true; break;
    }
    return d;
  }
  intBoard({ id: "d2-03", title: "The Day 2 confirm of the 10-year Future", ids: ["D2-03", "D2-04", "INT-14", "ConfirmLens", "ReadBackPhone", "ReadBackTally", "MissingList", "TrackedChange", "CorrectionQueue", "LensProgress"], unit: "answered", phoneW: 500, remote: true, ctlH: 640,
    note: "Revised from pass 5. After prayer, the TV shows each signed-off lens once more, lens by lens, with \"Signed off on Day 1\" beside it: a short confirm, not a read-back of a draft. Phones see the signed-off paragraph and answer \"Yes, that's us\" or \"It needs a change\" (a short box), and \"What's missing?\". The scribe records the wording the room agrees and why, the facilitator accepts it, and it folds in as a tracked change. The tally shows where the room is and never settles a lens. It closes by asking \"Did we hear you right?\" and \"What's missing?\". Pass 5's approved Defaults are applied.",
    states: RB_STATES, start: "A correction waiting",
    make: function (ctx) { return new P4b.ConfirmLens(ctx.sh); },
    tv: function (ctx, st, inst) {
      var d = rbData(st), rb = ctx.view; rb.o.long = !!d.long; if (d.long) rb.drawn = null;
      if (d.open) { rb.set({ open: true, instant: inst }); ctx.sh.count(0, "answered", true); }
      else if (d.close) rb.set({ close: true, missing: d.missing, instant: inst });
      else { rb.set({ lens: d.lens, settled: d.settled, states: d.states, yes: d.yes, change: d.change, of: d.of, missing: d.missing, instant: inst }); rb.tallyTo(d.yes, d.change, { of: d.of, instant: true }); }
      if (!d.open) ctx.sh.count(d.close ? 8 : d.yes + d.change, "answered", inst);
      if (d.open) ctx.button("Confirm the first lens", "play", function () { rb.set({ lens: "congregation", settled: [], states: {}, yes: 0, change: 0, of: 8, missing: [] }); ctx.sh.count(0, "answered", true); });
      if (!d.close && !d.open && d.lens === "community" && !d.states.x1) ctx.button("Taps arrive", "hand", function () { var y = 0, c = 0, seq = ["y", "y", "c", "y", "y", "c", "y", "c"]; rb.tallyTo(0, 0, { of: 8, instant: true }); ctx.sh.count(0, "answered", true); seq.forEach(function (k, i) { CL.later(function () { if (k === "y") y++; else c++; rb.tallyTo(y, c, { of: 8 }); ctx.sh.count(y + c, "answered"); }, 300 + i * 420); }); });
      if (st === "A correction waiting" || st === "A split room") ctx.button("Accept and fold in the correction", "check", function () { rb.fold("x1"); ctx.queue([{ c: S.corrections[0], state: "accepted" }]); });
      if (/folded|AI off|Reduced/.test(st)) ctx.button("Accept the second correction", "check", function () { rb.fold("x2"); ctx.queue([{ c: S.corrections[0], state: "accepted" }, { c: S.corrections[1], state: "accepted" }]); });
      if (st === "Lens confirmed" || /folded/.test(st)) ctx.button("Confirm the lens, then the next lens", "skip-forward", function () { if (rb.settled.indexOf("community") < 0) { rb.settle(); CL.later(function () { rb.next("leadership"); ctx.sh.count(0, "answered"); }, 2400); } else { rb.next("leadership"); ctx.sh.count(0, "answered"); } });
      if (st === "Nothing to change") ctx.button("Confirm the lens, then the next lens", "skip-forward", function () { rb.settle(); CL.later(function () { rb.next("leadership"); ctx.sh.count(0, "answered"); }, 2400); });
      if (!d.close && !d.open) ctx.button("What's missing arrives", "message-square-plus", function () { var list = (d.missing || []).slice(); var add = S.missing.filter(function (m) { return list.indexOf(m) < 0; })[0] || "The Friday youth drop-in."; list.unshift(add); d.missing = list; rb.ml.set(list, { newest: add, max: 2, always: true }); });
      return {
        "After prayer": "Day 2, 9:00, straight after prayer. The TV says yesterday's work is signed off and asks if it still says it. Five short confirms follow, one lens at a time.",
        "Empty": "Community is on the TV, \"Signed off on Day 1\" beside the heading, with Congregation already confirmed. No taps yet: the bars wait at zero and \"What's missing?\" says answers appear as they're sent.",
        "First tap": "The first \"Yes, that's us\" grows its bar from zero and the count ticks. Use Taps arrive to watch eight land.",
        "Nothing to change": "All eight say \"Yes, that's us\". The usual lens takes about a minute: the facilitator confirms it and moves on. The tally shows where the room is; the facilitator still decides.",
        "A split room": "Five and three. The bars carry no leader color: the tally never decides. Chris draws the conversation out.",
        "A correction waiting": "The scribe has sent the wording the room agreed (\"six\" for \"five\" days) with the reason. It waits on the control surface and the remote. Accept it to watch it fold in.",
        "A correction folded in": "Accepted: \"five\" was struck and left, \"six\" arrived underlined, and the paragraph reflowed around it. The second correction, a sentence from What's missing, waits.",
        "Lens confirmed": "Chris confirmed Community: a Lime sweep crossed the lens in the progress once, then it took its check. The changes are now part of the signed-off text.",
        "Next lens": "Leadership is on: the confirmed lenses keep their checks and the bars start again from zero.",
        "The close": "All five confirmed. The TV asks \"Did we hear you right?\" with \"What's missing?\" answers arriving underneath, then moves to Confirm the Vision Outcomes.",
        "Crowded, 50 phones": "Fifty phones: 41 and 9. The two newest missing answers show, with the rest counted on phones.",
        "Offline and queued": "The TV holds its last state with the gray breathing mark. Phones keep their answers and send them in order when it reconnects.",
        "Phones down": "Phones down for the conversation: the tally holds still and phones dim with their answer.",
        "AI off": "With AI off, an accepted correction goes in exactly as the scribe wrote it. Folding, the tally and confirming are unchanged.",
        "Reduced motion": "The struck words leave and the new ones appear at once, underlined. The bars and the confirm mark change in place.",
        "Very long text": "A long lens paragraph steps down to the TV floor size so it still fits; a long missing answer wraps on its card."
      }[st];
    },
    phones: function (st, ctx) {
      var s = stat(st), d = rbData(st), ph = d.phone || {};
      if (d.open) return [{ label: "Phone · after prayer", render: function (p) { p.body.innerHTML = '<div class="cwl-rb-ph">' + P5.LensProgress(null, []) + '<div class="cwl-rb-ph-h">Does the 10-year Future still say it?</div><div class="cwl-ph-muted">Yesterday the room signed off each lens. Your phone moves with the TV, one lens at a time.</div></div>'; p.foot.innerHTML = ""; } }];
      if (d.close) return [{ label: "Phone · the close", render: function (p) { P5.ReadBackPhone(p, { close: true, missing: "Prayer walks on the street.", settled: S.lensOrder }); } }];
      return [
        { label: "Phone · " + (ph.answer === "change" ? "it needs a change" : ph.sent ? "answered" : "reading"), cap: "The signed-off paragraph only. The team's sentences were on Day 1.", render: function (p) { P5.ReadBackPhone(p, { lens: d.lens, states: d.states, settled: d.settled, answer: ph.answer, change: ph.change, sent: ph.sent, down: s.down, offline: s.offline, long: d.long, showTeam: false, showMissing: !ph.answer }); } },
        { label: "Phone · looking back", cap: "Confirmed lenses can be read again. Never ahead of the TV.", render: function (p) { P5.ReadBackPhone(p, { lens: "congregation", look: true, current: d.lens, settled: d.settled, showTeam: false }); } }
      ];
    },
    control: function (a, st, ctx) {
      var s = stat(st), d = rbData(st), l = P4.lensByKey(d.lens || "community");
      var tally = d.close || d.open ? "" : '<div class="p3-meter"><div><b>' + d.yes + "</b><span>Yes, that's us</span></div><div><b>" + d.change + "</b><span>It needs a change</span></div><div><b>" + (d.of - d.yes - d.change) + "</b><span>Not yet</span></div></div>";
      P4.ctl(a, { part: "Day 2", title: d.open ? "Confirm the 10-year Future" : d.close ? "Confirm: the close" : P4.ctlLens(d.lens) + " &nbsp;Confirm: " + esc(l.name) + ", " + Y.future, chips: [s.down ? CHIP("Phones down", "", "smartphone") : CHIP("Live", "run-live", "radio"), CHIP((d.settled || []).length + " of 5 confirmed", "is-outline", "check")],
        sync: s.offline ? SYNC("", "monitor-off", "TV reconnecting") : SYNC("", "check", "On the TV now"), banner: s.offline ? BAN("warning", "triangle-alert", "<strong>TV reconnecting.</strong> It's holding the last screen and will catch up in one pass.") : "",
        tools: d.open ? [SB("Confirm the first lens", "play", "is-primary")] : d.close ? [SB("Go to Confirm the Vision Outcomes", "skip-forward", "is-primary")] : [B("Confirm the lens", "is-confirm is-sm", "check", (d.settled || []).indexOf(d.lens) >= 0 ? " disabled" : ""), SB("Next lens", "chevron-right"), SB("Phones down", "smartphone")], meter: null,
        listTitle: d.close ? "What's missing" : "Corrections from the scribe", listNote: d.close ? "Anonymous" : (s.ai ? "Folded in as tracked changes once you accept" : "AI off · goes in as written"),
        main: '<div class="p3-items" style="padding:0;background:none;border:0"><div class="s5-queue"></div></div>' + (tally ? '<div class="cwl-a-label" style="margin-top:12px">Where the room is</div>' + tally : "") + '<div class="cwl-a-label" style="margin-top:12px">Lens progress</div><div style="margin-top:6px">' + P5.LensProgress(d.close ? null : d.lens, d.close ? S.lensOrder : d.settled) + "</div>",
        side: PRIVATE("What's missing", '<div class="s5-ml"></div>') + P4.notes("Read the lens aloud. It was signed off yesterday, so ask what has changed overnight. Let the room talk. Confirm only when the room agrees. The tally is a guide, not the decision.") });
      var qh = a.querySelector(".s5-queue");
      ctx.queue = function (list) { qh.innerHTML = d.close || d.open ? '<div class="cwl-a-muted">' + (d.open ? "No corrections yet." : "All five lenses confirmed.") + "</div>" : P5.CorrectionQueue(list, { ai: s.ai }); CL.icons(); };
      ctx.queue(d.queue);
      var ml = new P5.MissingList(a.querySelector(".s5-ml")); ml.set(d.missing, { max: 6, always: true, sub: d.missing.length ? "" : "None yet" });
      CL.icons();
    },
    remote: function (box, st) {
      var d = rbData(st), l = P4.lensByKey(d.lens || "community");
      P4.remote(box, { title: d.open ? "Confirm the 10-year Future" : d.close ? "Confirm: the close" : "Confirm: " + l.name, top: d.close || d.open ? "" : '<div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-label">' + d.yes + " yes · " + d.change + " change</span></div>" + P5.CorrectionQueue(d.queue.filter(function (x) { return x.state === "waiting"; }), {}),
        buttons: d.open ? P4.rbtn("Confirm the first lens", "play", "is-live") : d.close ? P4.rbtn("Next session", "chevron-right", "is-primary") : P4.rbtn("Confirm the lens", "check", "is-live") + '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next lens", "chevron-right") + "</div>" });
    },
    extra: function (r, st) {
      var d = rbData(st);
      var a = app(r, "Scribe console · Day 2 confirm · the correction composer", 1280, 520, "scribe");
      var con = new P5.ScribeConsole(a, { day: "Day 2" });
      con.header({ session: "Confirm the 10-year Future" });
      con.composer({ correction: { lens: P4.lensByKey(d.lens || "community").name + ", " + Y.future, wording: st === "A split room" ? "The food bank runs six days a week." : "", why: st === "A split room" ? S.corrections[0].reason : "" } });
      var cards = d.queue.map(function (q, i) { return { id: "cx" + i, kind: "correction", time: "9:0" + (4 + i), text: q.c.del ? "The food bank runs six days a week." : q.c.ins.trim(), why: q.c.reason }; }).reverse();
      con.cards(cards, { instant: true, note: "Sent to Chris" });
      con.photos([], { instant: true });
    }
  });

  /* ---------- Overnight ---------- */
  part("part-overnight", "Overnight: tidy, review, publish for Day 2", "When Day 1 closes, AI tidies the provisional Vision Outcomes and the 3-year Vision first pass, drawing on the room's bullets, the scribe's cards and the easel photos. The 10-year Future is not redrafted: the room signed it off on Day 1. Chris and Jaisy review side by side. Nothing reaches the TV or phones until Chris publishes for Day 2. data-surface=\"review\": app tokens, Warning and Error allowed, never Sunrise.");

  function reviewShell(a, active, head, body) {
    a.innerHTML = '<div class="cwl-ovn-shell"><nav class="cwl-ovn-nav" aria-label="Engagement"><div class="brand">' + L("compass") + esc(D.church) + "</div>" +
      [["Overview", "layout-dashboard"], ["Run of show", "list-ordered"], ["Overnight review", "moon"], ["Publish for Day 2", "send"], ["Outputs", "file-text"]].map(function (n) { return '<a href="#" tabindex="-1"' + (n[0] === active ? ' class="is-on"' : "") + ">" + L(n[1]) + esc(n[0]) + "</a>"; }).join("") +
      '<div class="sec">Day 2</div><a href="#" tabindex="-1">' + L("calendar") + "Confirm at 9:00</a></nav>" +
      '<div class="cwl-ovn"><header class="cwl-ovn-head"><div class="grow">' + head.left + "</div>" + (head.right || "") + '</header><div class="cwl-ovn-body">' + body + "</div></div></div>";
    CL.icons();
  }
  stateBoard({ id: "ovn-01", title: "Overnight review", ids: ["OVN-01", "OutcomeStatusList", "ReviewPresence"],
    note: "Revised from pass 5. From the moment Day 1 closes: drafting progress, then the five provisional Vision Outcomes with their 3-year Vision bullets and their review state, who is where, the lock on a section the other facilitator is editing, and flags. The 10-year Future shows as signed off on Day 1 and isn't redrafted. Thin outcomes are flagged for the morning, not hidden. \"Drafts ready\" shows on this screen and on the remote.",
    states: ["Drafting", "Drafts ready", "Both reviewing", "Section locked", "Thin outcome flagged", "Outcome reviewed", "Easel photo unreadable", "AI off", "Very long text", "Reduced motion"], start: "Both reviewing",
    make: function (ctx) { var r = row(ctx.stage, "is-1"); r.style.gridTemplateColumns = "minmax(0, 1fr) 220px"; ctx.a = app(r, "Overnight review · laptop · data-surface=\"review\"", 1280, 760, "review"); ctx.rb = frame(r, "Remote · after Day 1", "is-phone"); },
    draw: function (ctx, st, inst) {
      var key = st === "Drafting" ? "drafting" : st === "Drafts ready" || st === "AI off" ? "ready" : "both", states = clone(D.ovnStates[key]);
      if (st === "Outcome reviewed") states.o2 = "reviewed:cv";
      if (st === "Easel photo unreadable") states.o2 = "flagged";
      var pres = key === "drafting" ? [] : key === "ready" ? [{ id: "cv", where: "the overview", you: true }] : [{ id: "cv", where: "New faith stories", editing: st !== "Outcome reviewed", you: true }, { id: "jt", where: "Homes and every generation", editing: true }];
      var reviewed = Object.keys(states).filter(function (k) { return states[k].indexOf("reviewed") === 0; }).length, ready = Object.keys(states).filter(function (k) { return states[k] !== "drafting"; }).length;
      var prog = key === "drafting" ?
        '<div class="cwl-ovn-progress"><div class="row"><span><b>Tidying</b> · started when Day 1 closed at ' + D.dayClosed + '</span><span class="cwl-a-muted">14 minutes so far · usually under 30</span></div><div class="cwl-ovn-bar"><i style="width:' + Math.round(ready / 5 * 100) + '%"></i></div><div class="row"><span class="cwl-a-muted">' + ready + " of 5 outcomes tidied. Working from 14 bullets, 12 scribe cards and 3 easel photos.</span></div></div>" :
        '<div class="cwl-ovn-progress"><div class="row"><span><b>' + reviewed + ' of 5 reviewed</b> · drafts ready at ' + D.draftsReady + ', 26 minutes after Day 1 closed</span><span class="cwl-a-muted">About 45 minutes to review</span></div><div class="cwl-ovn-bar"><i style="width:' + Math.round(reviewed / 5 * 100) + '%"></i></div></div>';
      var flags = st === "AI off" ? BAN("info", "info", "<strong>AI is off for this engagement.</strong> No tidy drafts tonight. Each outcome opens with the room's own bullets and the scribe's numbers beside an empty list, so you write it from their words.") :
        (states.o4 === "flagged" ? '<div class="cwl-a-banner is-warning"><span class="ic">' + L("triangle-alert") + "</span><div><strong>Thin outcome: Families find a home here has no bullets.</strong> It stays on the list and shows as thin in the morning, so the room can fill it or rethink it. Acknowledge it before publishing.</div></div>" : "") +
        (states.o2 === "flagged" ? '<div class="cwl-a-banner is-warning"><span class="ic">' + L("triangle-alert") + "</span><div><strong>The draft couldn't read one easel photo</strong> (New faith stories, page 2). Type what it says in that outcome to count it as a source.</div></div>" : "");
      var list = P4b.OutcomeStatusList(states, { current: key === "both" ? "o2" : null, ai: st !== "AI off", unreadable: st === "Easel photo unreadable", long: st === "Very long text", right: key === "drafting" ? "Started " + D.dayClosed : "Private until published" });
      var pub = '<div class="cwl-a-row" style="margin-top:auto">' + B("Review and publish for Day 2", "is-secondary", "send", " disabled") + '<span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">' + (key === "drafting" ? "Drafts are still being written." : "Every outcome reviewed and every flag acknowledged first.") + "</span></div>";
      reviewShell(ctx.a, "Overnight review", { left: '<div class="cwl-a-eyebrow">' + esc(D.church) + " · after Day 1 · confirm Day 2 at 9:00</div><div class=\"cwl-a-title\" style=\"font-size:var(--cwl-fs-app-page-title);font-weight:700\">Overnight review</div>", right: (pres.length ? P5.ReviewPresence(pres) : "") + '<span class="cwl-ovn-private">' + L("eye-off") + "Private until published</span>" }, prog + flags + list + pub);
      if (st === "Section locked") { var rowL = ctx.a.querySelectorAll(".cwl-ovn-row")[4]; if (rowL) { rowL.classList.add("is-current"); rowL.insertAdjacentHTML("beforeend", P5.lockChip("jt")); } }
      ctx.rb.innerHTML = ""; var rem = CL.appPhone(ctx.rb, "control");
      rem.innerHTML = '<div class="cwl-ph-head" style="border-color:var(--cwl-app-border)"><span class="cwl-a-label">' + esc(D.church) + '</span><span class="cwl-a-sync">' + L("moon") + "<span>After Day 1</span></span></div>" +
        '<div class="cwl-r-body">' + (key === "drafting" ? '<div class="cwl-scr-queue">' + L("loader-circle") + "<span>Tidying · " + ready + " of 5</span></div>" : '<div class="cwl-ovn-remote-ready">' + L("bell") + "Drafts ready</div>") + P4b.OutcomeStatusList(states, { compact: true, ai: st !== "AI off" }) + '<div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">Review on the laptop. The confirm opens on Day 2 at 9:00.</div></div>';
      CL.icons();
      ctx.button("Play tidying", "play", function () {
        var seq = ["o1", "o2", "o3", "o4", "o5"], cur = clone(D.ovnStates.drafting); seq.forEach(function (k) { cur[k] = "drafting"; });
        seq.forEach(function (k, i) { CL.later(function () { cur[k] = k === "o4" ? "flagged" : "ready"; var n = seq.filter(function (x) { return cur[x] !== "drafting"; }).length; var lst = ctx.a.querySelector(".cwl-ovn-list"); if (lst) lst.outerHTML = P4b.OutcomeStatusList(cur, { right: "Started " + D.dayClosed }); var bi = ctx.a.querySelector(".cwl-ovn-bar i"); if (bi) bi.style.width = Math.round(n / 5 * 100) + "%"; CL.icons(); }, 500 + i * 800); });
      });
      return {
        "Drafting": "Day 1 has closed. The bar fills as each outcome is tidied and every row turns from Drafting to Ready to review in place. The 10-year Future row is already signed off. Nothing here reaches the TV or phones.",
        "Drafts ready": "All five tidied 26 minutes after Day 1 closed. The review screen and the remote both say Drafts ready. Families find a home here is flagged thin.",
        "Both reviewing": "Chris is in New faith stories and Jaisy is in Homes and every generation. Each sees where the other is. Leaders raised from within and A church that shows up for the city are reviewed.",
        "Section locked": "Homes and every generation is locked for Chris while Jaisy edits it: her name and a lock sit on the row, and opening it is read only until she leaves it.",
        "Thin outcome flagged": "Families find a home here has no bullets. It's flagged in Warning and stays on the list, so the room sees it in the morning. The draft never invents bullets.",
        "Outcome reviewed": "Chris accepted New faith stories: the row turns Reviewed by Chris and the count moves to 3 of 5.",
        "Easel photo unreadable": "One easel page was too hard to read. New faith stories is flagged until a facilitator types what the page says.",
        "AI off": "With AI off there are no tidy drafts: every outcome says to write it from the room's bullets and the scribe's numbers, and nothing else changes.",
        "Very long text": "A long outcome name wraps in the row title without pushing the state chip.",
        "Reduced motion": "The bar and the rows change in place. The tidying icon stops spinning."
      }[st];
    }
  });

  stateBoard({ id: "ovn-02", title: "An outcome with its source words", ids: ["OVN-02", "OutcomeDraft", "OutcomeSources", "VersionHistory"],
    note: "Revised from pass 5. New faith stories, tidied from the room's bullets with the scribe's cards and the easel photo as sources: not a lens draft. Every bullet ends with a source marker: how many sources it has, a quote mark when it's the room's own words, and a Warning marker when it has none. Select a bullet and its sources come forward on the right with the words they came from highlighted. A number in a bullet always comes from a scribe card or an easel photo. Restore the room's words swaps the AI wording in one action. Every version is kept.",
    states: ["Bullet selected", "Restore the room's words", "A bullet with no source", "Editing", "Locked by Jaisy", "Outcome reviewed", "Version history", "A thin outcome", "Easel photo unreadable", "AI off", "Very long text", "Reduced motion"], start: "Bullet selected",
    make: function (ctx) { ctx.a = app(row(ctx.stage, "is-1"), "Overnight review · New faith stories · data-surface=\"review\"", 1280, 820, "review"); },
    draw: function (ctx, st) {
      var a = ctx.a, right = st === "Version history" ? "versions" : "sources";
      reviewShell(a, "Overnight review", { left: '<div class="cwl-a-eyebrow">Overnight review · Provisional Vision Outcomes and the 3-year Vision · private until published</div><div class="cwl-a-title" style="font-size:var(--cwl-fs-app-section-title);font-weight:600">' + (st === "A thin outcome" ? "Families find a home here" : "New faith stories") + "</div>", right: P5.ReviewPresence([{ id: "cv", where: "New faith stories", editing: st !== "Locked by Jaisy", you: true }, { id: "jt", where: st === "Locked by Jaisy" ? "New faith stories" : "Homes and every generation", editing: true }]) },
        '<div class="cwl-a-panes" style="flex:1;min-height:0;margin:-18px calc(var(--cwl-app-gutter) * -1)"><section class="cwl-a-pane s5-left" aria-label="Draft"></section><aside class="cwl-a-pane s5-right" aria-label="' + (right === "versions" ? "Version history" : "Sources") + '"><div class="cwl-a-tabs" role="tablist" style="display:flex;gap:6px"><button type="button" class="cwl-a-tag" aria-pressed="' + (right === "sources") + '">' + L("link") + 'Sources</button><button type="button" class="cwl-a-tag" aria-pressed="' + (right === "versions") + '">' + L("history") + 'Version history</button></div><div class="s5-rbody"></div></aside></div>');
      var left = a.querySelector(".s5-left"), rbody = a.querySelector(".s5-rbody"), sp, dp;
      var o = { sel: "b1", restored: {}, removed: {}, locked: null, editing: false, reviewed: null, ai0: false, long: false, thin: false, extra: false, written: null };
      if (st === "Restore the room's words") o.sel = "b3";
      if (st === "A bullet with no source") { o.extra = true; o.sel = "b4"; }
      if (st === "Editing") { o.editing = true; o.sel = "b1"; }
      if (st === "Locked by Jaisy") o.locked = "jt";
      if (st === "Outcome reviewed" || st === "Version history") { o.reviewed = "cv"; o.restored = { b3: true }; }
      if (st === "A thin outcome") { o.thin = true; o.sel = null; }
      if (st === "AI off") { o.ai0 = true; o.written = ["b2"]; }
      if (st === "Very long text") { o.long = true; o.sel = "b1"; }
      if (st === "Easel photo unreadable") o.sel = "b1";
      dp = new P4b.OutcomeDraft(left, { onSelect: function (id) { if (sp) sp.set(id, {}); } });
      dp.set(o);
      if (right === "versions") rbody.innerHTML = '<div class="cwl-ovn-src-h" style="margin:12px 0 4px">Every version of New faith stories</div>' + P5.VersionHistory(D.versions);
      else if (st === "A thin outcome") rbody.innerHTML = '<div class="cwl-ovn-src-h">Sources</div><div class="cwl-a-muted" style="padding:6px 0">Two scribe cards and an easel photo mention families, but none says what is true in 2029. They stay beside the outcome as notes for the room, not as bullets.</div>' + [{ t: "card", id: "k23", hl: "Is a family a group of people or an outcome?" }, { t: "photo", id: "easel-v2", hl: "belong not demo" }].map(function (r) { return '<div style="margin-top:8px">' + (r.t === "card" ? '<div class="cwl-ovn-scard is-lit"><div class="meta">' + L("circle-help") + "Scribe · Question · 4:03</div><div>" + esc(D.ovnCards.k23.text) + "</div></div>" : '<div class="cwl-ovn-scard"><div class="meta">' + L("camera") + "Easel photo · " + esc(S.photos["easel-v2"].label) + "</div>" + P5.photoSVG("easel-v2", { hi: [2] }) + "</div>") + "</div>"; }).join("");
      else { sp = new P4b.OutcomeSources(rbody); sp.set(o.sel || "b1", { instant: true, ai0: o.ai0, written: ["b2"], unreadable: st === "Easel photo unreadable" }); }
      CL.icons();
      if (!o.ai0 && !o.locked && !o.long && !o.thin && right === "sources") ctx.button("Select the next bullet", "mouse-pointer-click", function () { var ids = o.extra ? ["b1", "b2", "b3", "b4"] : ["b1", "b2", "b3"], i = ids.indexOf(dp.state.sel); dp.select(ids[(i + 1) % ids.length]); });
      if (st === "Restore the room's words") ctx.button("Restore the room's words", "quote", function () { dp.restore("b3"); });
      return {
        "Bullet selected": "Bullet 1 is selected: its three sources come forward on the right (the room's own bullet, a scribe quote and the easel photo) with the words it came from highlighted. The outcome's other sources wait below, quieter. Click any bullet, or use the button.",
        "Restore the room's words": "Bullet 3 is in AI wording. Restore the room's words swaps it for what the room typed, in place, and its marker gains the quote mark. Try the button.",
        "A bullet with no source": "Bullet 4 says 120 people but nothing the room typed, the scribe captured or the easel shows supports it. It's tinted Warning, the panel says so, and Accept the outcome waits until it's sourced, rewritten from the room's words or removed.",
        "Editing": "Edit makes the list a text box with the focus ring. Markers stay attached to their bullets, and the other facilitator sees the lock.",
        "Locked by Jaisy": "Jaisy is editing New faith stories, so it's read only here: her name and a lock in the head, a sunken list, and every action waits.",
        "Outcome reviewed": "Chris accepted the outcome after restoring bullet 3's words. It's marked Reviewed by Chris.",
        "Version history": "Every version is kept: the AI tidy, each change with who made it and when, and Restore on any earlier one.",
        "A thin outcome": "Families find a home here has no bullets. The draft says so and doesn't invent any. It's flagged for the morning and can't be accepted until a facilitator acknowledges it on the overview.",
        "Easel photo unreadable": "One easel page was too hard to read. It shows blurred in the sources with Type what it says, so the draft can use it.",
        "AI off": "No tidy draft. The room's bullets sit on the right with Add to the outcome; one has been added in the room's exact words.",
        "Very long text": "A long outcome bullet wraps in full with its marker at the end.",
        "Reduced motion": "Selecting a bullet lights its sources at once, with no slide or sweep."
      }[st];
    }
  });

  stateBoard({ id: "ovn-03", title: "Publish for Day 2", ids: ["OVN-03", "PublishDay2"], theme: true,
    note: "Revised from pass 5. A TV preview and a phone preview of how Day 2 opens (the confirm of the signed-off 10-year Future), the checklist of outcomes, 3-year Vision bullets and acknowledged flags, and Publish. Publishing makes the tidied outcomes the lists the room confirms at 9:30. The 10-year Future needs no publishing: it's the room's signed-off text. Nothing shows on the TV or phones until Chris goes live in the morning. The previews keep their own theme inside the review page through the nesting guard.",
    states: ["Not ready", "Ready", "Published"], start: "Ready",
    make: function (ctx) { ctx.a = app(row(ctx.stage, "is-1"), "Overnight review · publish · data-surface=\"review\"", 1280, 800, "review"); },
    draw: function (ctx, st) {
      var stt = st === "Not ready" ? "not-ready" : st === "Ready" ? "ready" : "published";
      reviewShell(ctx.a, "Publish for Day 2", { left: '<div class="cwl-a-eyebrow">Day 2 · confirm at 9:00, outcomes at 9:30</div><div class="cwl-a-title" style="font-size:var(--cwl-fs-app-page-title);font-weight:700">Publish for Day 2</div>', right: P5.ReviewPresence([{ id: "cv", where: "Publish", you: true }, { id: "jt", where: stt === "not-ready" ? "Homes and every generation" : "the overview", editing: stt === "not-ready" }]) },
        '<div class="s5-pub"></div><div class="s5-foot cwl-a-row" style="margin-top:auto"></div>');
      P4b.PublishDay2(ctx.a.querySelector(".s5-pub"), { state: stt, theme: ctx.theme });
      var foot = ctx.a.querySelector(".s5-foot");
      foot.innerHTML = stt === "published" ? '<div class="cwl-ovn-published">' + L("badge-check") + "Published at 8:42 pm by Chris. The confirm opens when Chris goes live on Day 2 at 9:00, and the outcomes at 9:30. Until then the TV and phones show nothing from it.</div>" + SB("Unpublish", "undo-2") :
        B("Publish for Day 2", "is-confirm", "send", stt === "not-ready" ? " disabled" : "") + '<span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-table)">' + (stt === "not-ready" ? "Two outcomes to review and one flag to acknowledge." : "Every version stays. Day 2 changes are tracked against this one.") + "</span>";
      CL.icons();
      return {
        "Not ready": "Publish waits: two outcomes unreviewed, Jaisy is still in Homes and every generation, and the thin-outcome flag hasn't been acknowledged.",
        "Ready": "Everything reviewed, the flag acknowledged. The previews show how Day 2 opens: the confirm of the signed-off 10-year Future. Publish is the page's one Lime moment.",
        "Published": "Published. Nothing reaches the TV or phones until the session goes live."
      }[st];
    }
  });


  /* ================================================================
     MOTION: the summary arriving, a version folding in, a lens settling
     ================================================================ */
  part("part-motion", "Motion: three movements", "The screen is alive: every input appears at once and existing items move, regroup and resize with no refresh and no reveal step. These three reuse pass 5's tracked change and settle, so the room learns one language. Each has its tokens in docs/motion-spec.md and a reduced-motion equivalent.");
  (function () {
    var b = board("motion", "The summary arriving, a version folding in, a lens settling", ["Motion"], "Press Play on each. Reduced motion shows the same end state with no movement: the summary appears at once, the changes are underlined at once, the settle mark changes in place.");
    var bar = h("div", "sc-actions"); bar.setAttribute("data-surface", "setup"); bar.setAttribute("data-theme", "light"); b.appendChild(bar);
    var r = row(b, "is-3");
    function mk(label, cap, setup, play) {
      var box = frame(r, label, "is-tv", cap), sh = P4.shell(box, { theme: "dark", unit: "answered" }), v = new P4b.LensSummaryTV(sh);
      var m = { sh: sh, v: v, reset: function () { CL.clearTimers(); setup(m); }, play: function () { m.reset(); CL.later(function () { play(m); }, 300); } };
      var x = h("button", "cwl-a-btn is-secondary"); x.type = "button"; x.innerHTML = L("play") + "<span>Play " + esc(label.toLowerCase()) + "</span>"; x.onclick = m.play; bar.appendChild(x);
      requestAnimationFrame(function () { requestAnimationFrame(function () { m.reset(); }); });
      return m;
    }
    mk("The summary arriving", "The lens heading is already up. The AI icon sweeps once, the sentences arrive in order, and the tally appears at zero.",
      function (m) { m.v.set({ lens: "congregation", settled: [], mode: "drafting", instant: true }); },
      function (m) { m.v.arrive({ lens: "congregation", settled: [] }); });
    mk("A version folding in", "Struck words stay for a moment, then leave. The paragraph reflows, the new words arrive underlined, and the suggestions leave the list.",
      function (m) { m.v.set({ lens: "community", settled: ["congregation"], states: {}, yes: 4, change: 3, of: 8, suggestions: SUG.slice(0, 4), mode: "ai", version: 1, instant: true }); },
      function (m) { m.v.foldIn(["mf1", "mf2"], { remaining: [] }, function () { m.v.tallyTo(0, 0, { of: 8 }); }); });
    mk("A lens settling", "A single Lime sweep crosses the lens in the progress, then it takes its check. The underlines go and the next lens takes over.",
      function (m) { m.v.set({ lens: "community", settled: ["congregation"], states: FOLDED, yes: 7, change: 1, of: 8, suggestions: [], mode: "ai", version: 2, folded: 2, instant: true }); },
      function (m) { m.v.settle(); });
    var t = h("div", "cwl-a-muted"); t.style.cssText = "font-size:14px;max-width:100ch"; t.textContent = "Tokens: cwl-dur-ai-sweep 900ms (AI icon), cwl-delay-quiet 3s (before an automatic fold), cwl-dur-tc-strike 400ms, cwl-delay-tc-leave 900ms, cwl-dur-hide, cwl-dur-make-room (reflow), cwl-tc-line and cwl-tc-offset (underline), cwl-dur-outcome-confirm (Lime sweep), cwl-dur-map-field and cwl-ease-calm (next lens), cwl-delay-type-batch (facilitator typing)."; b.appendChild(t);
    CL.icons();
  })();
  CL.icons();
})();
