/* Clearway Live · design pass 4 · cards4.js
   Live previews for the Wayfinding components in the design system. Each card is one TV
   built with ClearwayLivePass4: pick a state, switch the theme or reduced motion, or play
   the component's movement. The same code drives the milestone 4 screens. */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P3 = window.ClearwayLivePass3, P4 = window.ClearwayLivePass4, W = window.ClearwayLivePass4Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide;
  function clone(a) { return JSON.parse(JSON.stringify(a)); }
  var LW = W.congregation, all = LW.seeded.map(function (x) { var y = clone(x); y.seeded = true; return y; }).concat(LW.live);
  function ids(l) { return l.map(function (x) { return x.id; }); }
  function confirmRows(dec) { return W.outcomes.map(function (o) { var c = W.confirm[o.id]; var r = { id: o.id, name: o.name, c: c.c, r: c.r, x: c.x, challenged: o.id === "o4" }; if (dec && o.id !== "o4") r.decision = { kind: c.decision, to: c.to }; return r; }); }

  var CARDS = {
    LensWall: { id: "INT-12", title: "Lens wall", lens: "congregation", headline: W.lensPrompt(W.lenses[0]), unit: "sentences",
      make: function (sh) { return new P4.LensWall(sh.host, { labels: LW.clusters }); },
      states: {
        "Typical": function (v, sh) { v.set(all, { instant: true, grouped: ids(all), seedNote: "9 from the pre-call" }); sh.count(all.length, "sentences", true); },
        "Hidden seeds": function (v, sh) { v.set([], { instant: true }); sh.waiting(true, "Sentences from the pre-call appear first when this lens opens"); sh.count(0, "sentences", true); },
        "Crowded": function (v, sh) { var l = all.concat(LW.burst); v.set(l, { instant: true, grouped: ids(l) }); sh.count(l.length, "sentences", true); },
        "AI off": function (v, sh) { v.set(all, { instant: true, ai: false }); sh.count(all.length, "sentences", true); },
        "Very long text": function (v, sh) { var l = all.slice(0, 6).concat([{ id: "long", text: LW.long, c: "belong" }]); v.set(l, { instant: true, grouped: ids(l) }); sh.count(l.length, "sentences", true); } },
      play: function (v, sh) { var base = LW.seeded.slice(0, 4), list = base.slice(), grp = ids(base); v.cOrder = []; v.grouped = {}; v.set(list, { instant: true, grouped: grp }); LW.live.slice(0, 5).forEach(function (x, i) { CL.later(function () { list.push(x); v.set(list.slice(), { grouped: grp.slice(), newest: x.id }); sh.count(list.length, "sentences"); }, 300 + i * 900); CL.later(function () { grp.push(x.id); v.set(list.slice(), { grouped: grp.slice() }); }, 1600 + i * 900); }); } },
    CandidatePriorities: { id: "INT-13", title: "Candidate priorities", eyebrow: "Provisional Vision Outcomes", headline: "Which of these are <strong>our priorities?</strong>", unit: "people",
      make: function (sh) { return new P4.CandidateList(sh.host); },
      states: {
        "Sent to the TV": function (v) { v.set(W.candidates.map(function (c) { var x = clone(c); x.ai = true; return x; }), { instant: true }); },
        "Waiting for the facilitator": function (v) { v.set([], { instant: true, waitText: "The facilitator is reviewing the candidates. They come up here when Chris sends them." }); },
        "Provisional": function (v) { v.set(W.confirmedOutcomes.map(function (o, i) { return { id: o.id, name: W.outcomes[i].name, from: 0, lenses: [], provisional: true }; }), { instant: true }); } },
      play: function (v) { var c = W.candidates.map(function (c) { var x = clone(c); x.ai = true; return x; }); v.set(c, { instant: true }); CL.later(function () { v.set(c.filter(function (x) { return x.id !== W.merge.from; }).map(function (x) { if (W.renames[x.id]) x.name = W.renames[x.id]; if (x.id === W.merge.into) x.name = W.merge.name; return x; }), { merge: W.merge }); }, 600); } },
    OutcomeBullets: { id: "D1-11", title: "Outcome bullets", eyebrow: "3-year Vision · " + W.Y.vision, headline: "In " + W.Y.vision + ", <strong>what's true?</strong>", unit: "bullets",
      make: function (sh) { return new P4.OutcomeBullets(sh.host); },
      states: {
        "Typical": function (v, sh) { v.set(clone(W.outcomes), 0, { instant: true }); sh.count(3, "bullets", true); },
        "Empty outcome": function (v, sh) { v.set(clone(W.outcomes), 3, { instant: true }); sh.count(0, "bullets", true); },
        "Very long text": function (v, sh) { var o = clone(W.outcomes); o[0].bullets.push(W.longOutcome); v.set(o, 0, { instant: true }); sh.count(4, "bullets", true); } },
      play: function (v, sh) { var o = clone(W.outcomes); v.set(o, 3, { instant: true }); ["Every family with kids under 12 is in a group", "Parents of toddlers meet weekly"].forEach(function (b, i) { CL.later(function () { o[3].bullets.push(b); v.set(o, 3, { newest: b }); sh.count(o[3].bullets.length, "bullets"); }, 500 + i * 1300); }); } },
    OutcomeConfirmRow: { id: "D2-05", title: "Outcome confirm", eyebrow: "3-year Vision · " + W.Y.vision, headline: "Confirm, rename or <strong>challenge each outcome</strong>", unit: "answering",
      make: function (sh) { return new P4.OutcomeConfirm(sh.host); },
      states: {
        "Challenged": function (v, sh) { v.set(confirmRows(false), { instant: true }); sh.count(8, "answering", true); },
        "Decided": function (v, sh) { v.set(confirmRows(true), { instant: true }); sh.count(8, "answering", true); } },
      play: function (v, sh) { var r = confirmRows(false); v.decided = {}; v.set(r, { instant: true }); ["o1", "o2", "o3"].forEach(function (id, i) { CL.later(function () { var x = r.filter(function (y) { return y.id === id; })[0], c = W.confirm[id]; x.decision = { kind: c.decision, to: c.to }; v.set(r, { shell: sh }); }, 400 + i * 1600); }); } },
    PremortemGrid: { id: "D2-07", title: "Pre-mortem grid", eyebrow: "Pre-mortem", headline: "It's " + W.Y.vision + " and this plan failed. <strong>Why?</strong>", unit: "placements",
      make: function (sh) { return new P4.PremortemGrid(sh.host); },
      states: {
        "Typical": function (v, sh) { v.set(clone(W.premortem), { instant: true }); sh.count(15, "placements", true); },
        "Duplicate before merging": function (v, sh) { v.set(clone(W.premortem).concat([clone(W.premortemDupe)]), { instant: true }); sh.count(16, "placements", true); } },
      play: function (v) { var d = clone(W.premortemDupe); v.set(clone(W.premortem).concat([d]), { instant: true }); CL.later(function () { v.set(clone(W.premortem).concat([{ id: "r7", num: 7, label: d.label, places: [], into: "r1" }])); }, 700); } },
    CoreGoalBuilder: { id: "INT-15", title: "CORE goal builder", eyebrow: "1-year Outlook · " + W.Y.outlook, headline: "Leaders raised from within: <strong>what happens in " + W.Y.outlook + "?</strong>", unit: "goals",
      make: function (sh) { return new P4.CoreGoalBuilder(sh.host); },
      states: {
        "Letters missing": function (v, sh) { v.set(W.outcomes[0], clone(W.goals), { instant: true }); sh.count(3, "goals", true); },
        "All four met": function (v, sh) { var g = clone(W.goals); g[1].result = "A residency plan the elders approve"; g[1].owner = "Mark Ellison"; g[2].end = "Apr 30, 2027"; v.set(W.outcomes[0], g, { instant: true }); sh.count(3, "goals", true); },
        "Empty": function (v, sh) { v.set(W.outcomes[0], [], { instant: true }); sh.count(0, "goals", true); } },
      play: function (v) { var g = clone(W.goals); v.set(W.outcomes[0], g, { instant: true }); CL.later(function () { g[1].owner = "Mark Ellison"; v.set(W.outcomes[0], g); }, 700); CL.later(function () { g[1].result = "A residency plan the elders approve"; v.set(W.outcomes[0], g); }, 1900); } },
    IntentCard: { id: "INT-16", title: "Commander's intent card", eyebrow: "Commander's intent · team-led", headline: "One card for <strong>each Vision Outcome</strong>", unit: "cards",
      make: function (sh) { return new P4.IntentBoard(sh.host); },
      states: {
        "Drafting": function (v, sh) { sh.headEl.style.display = ""; v.set(clone(W.intent), { instant: true }); sh.count(5, "cards", true); },
        "Presenting": function (v, sh) { sh.headEl.style.display = "none"; v.set(clone(W.intent), { instant: true, present: 0 }); sh.count(5, "cards", true); },
        "First step flagged": function (v, sh) { sh.headEl.style.display = "none"; v.set(clone(W.intent), { instant: true, present: 1 }); sh.count(5, "cards", true); } },
      play: function (v, sh) { sh.headEl.style.display = "none"; var c = clone(W.intent); c[0].intent = ""; v.set(c, { present: 0, instant: true }); var w = "Every ministry is growing its own next leader.".split(" "); w.forEach(function (x, k) { CL.later(function () { c[0].intent = w.slice(0, k + 1).join(" "); v.set(c, { present: 0, typing: { field: "intent" } }); }, 300 + k * 260); }); CL.later(function () { c[0].must = "Put an apprentice beside every ministry lead."; v.set(c, { present: 0, typing: { field: "must" } }); }, 300 + w.length * 260 + 800); } },
    ClearwayMapDraft: { id: "D2-15", title: "Draft Clearway Map", eyebrow: "Draft Clearway Map · page 1 · Identity and Direction", headline: "", unit: "", tally: false,
      make: function (sh) { sh.headEl.style.display = "none"; return new P4.MapDraft(sh.host); },
      states: {
        "Page 1": function (v, sh) { sh.prompt("Draft Clearway Map · page 1 · Identity and Direction", ""); sh.headEl.style.display = "none"; v.set({ page: 1, instant: true }); },
        "Page 2": function (v, sh) { sh.prompt("Draft Clearway Map · page 2 · Action", ""); sh.headEl.style.display = "none"; v.set({ page: 2, instant: true }); },
        "Empty fields": function (v, sh) { sh.prompt("Draft Clearway Map · page 1 · Identity and Direction", ""); sh.headEl.style.display = "none"; v.set({ page: 1, instant: true, data: { outcomes: [] } }); } },
      play: function (v, sh) { sh.prompt("Draft Clearway Map · page 1 · Identity and Direction", ""); sh.headEl.style.display = "none"; v.page = null; v.set({ page: 1, upTo: 0, instant: true }); v.set({ page: 1 }); } }
  };

  function card(name, note) {
    var root = document.getElementById("root"); root.className = "cwl-doc";
    if (name === "LensIcon") return lensIcons(root, note);
    if (name === "RemoteHandover") return handover(root, note);
    var c = CARDS[name];
    root.innerHTML = '<div class="cwl-doc-eyebrow">Component · ' + esc(c.id) + '</div><div class="cwl-doc-title">' + esc(c.title) + '</div><div class="cwl-tabs" role="tablist"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0"><button type="button" class="cwl-tab" data-t="theme">Off-White TV</button><button type="button" class="cwl-tab" data-t="motion">Reduced motion</button><button type="button" class="cwl-tab" data-t="play">Play the movement</button></div><div class="tvbox"></div><div class="cwl-doc-note" aria-live="polite"></div>';
    var theme = "dark", motion = "full", cur = Object.keys(c.states)[0], sh, view;
    function build() {
      CL.clearTimers();
      var box = root.querySelector(".tvbox"); box.innerHTML = "";
      sh = P4.shell(box, { theme: theme, eyebrow: c.eyebrow, headline: c.headline, unit: c.unit, tally: c.tally, lens: c.lens });
      sh.tv.setAttribute("data-motion", motion);
      view = c.make(sh);
      requestAnimationFrame(function () { requestAnimationFrame(function () { c.states[cur](view, sh); CL.icons(); }); });
      root.querySelectorAll(".cwl-tabs .cwl-tab").forEach(function (b) { b.setAttribute("aria-selected", b.textContent === cur ? "true" : "false"); });
      root.querySelector('[data-t="theme"]').setAttribute("aria-selected", theme === "light"); root.querySelector('[data-t="motion"]').setAttribute("aria-selected", motion === "reduced");
      root.querySelector(".cwl-doc-note").textContent = note || "";
    }
    Object.keys(c.states).forEach(function (s) { var b = h("button", "cwl-tab"); b.type = "button"; b.setAttribute("role", "tab"); b.textContent = s; b.onclick = function () { cur = s; build(); }; root.querySelector(".cwl-tabs").appendChild(b); });
    root.querySelector('[data-t="theme"]').onclick = function () { theme = theme === "dark" ? "light" : "dark"; build(); };
    root.querySelector('[data-t="motion"]').onclick = function () { motion = motion === "full" ? "reduced" : "full"; build(); };
    root.querySelector('[data-t="play"]').onclick = function () { CL.clearTimers(); c.play(view, sh); };
    build();
  }

  function lensIcons(root, note) {
    root.innerHTML = '<div class="cwl-doc-eyebrow">Component · Lens identity</div><div class="cwl-doc-title">Lens icons</div><div class="cwl-wf-iconsheet"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;padding:16px;border-radius:12px;background:var(--cwl-surface)" data-surface="phone" data-theme="dark"></div><div class="cwl-doc-note"></div>';
    var notes = { congregation: "People gathered", community: "Two houses on one street", leadership: "A flag on the summit", operations: "Connected parts of one system", learning: "An open book with a new shoot" };
    root.querySelector(".cwl-wf-iconsheet").innerHTML = W.lenses.map(function (l) { return '<figure><span class="grid24">' + P4.lensIcon(l.key) + "</span><figcaption>" + esc(l.name) + "<small>" + esc(notes[l.key]) + '</small></figcaption><div class="cwl-wf-iconsizes">' + [16, 20, 24, 32].map(function (s) { return '<span style="font-size:' + s + 'px;display:inline-flex">' + P4.lensIcon(l.key) + "</span>"; }).join("") + "</div></figure>"; }).join("");
    root.querySelectorAll(".grid24 svg").forEach(function (s) { s.style.width = "96px"; s.style.height = "96px"; });
    root.querySelector('[data-surface="phone"]').innerHTML = W.lenses.map(function (l) { return P4.lensHeading(l.key).replace('class="cwl-lens"', 'class="cwl-lens" style="font-size:22px"'); }).join("") + W.lenses.map(function (l) { return '<span style="font-size:14px">' + P4.lensChip(l.key) + "</span>"; }).join("");
    root.querySelector(".cwl-doc-note").textContent = note || "";
  }

  function handover(root, note) {
    root.innerHTML = '<div class="cwl-doc-eyebrow">Component · D2-11</div><div class="cwl-doc-title">Remote handover</div><div class="cwl-tabs" role="tablist"></div><div class="row" style="display:grid;grid-template-columns:repeat(3,220px);gap:16px"></div><div class="cwl-doc-note"></div>';
    var row = root.querySelector(".row"), tabs = root.querySelector(".cwl-tabs");
    function draw(held, motion) {
      row.innerHTML = "";
      var a = h("div"); row.appendChild(a); var b = h("div"); row.appendChild(b); var c = h("div"); row.appendChild(c);
      P4.remote(a, { held: held, title: "Commander's intent", banner: held ? '<div class="cwl-wf-holder">' + L("hand-helping") + '<span class="grow">Priya has the remote</span><button type="button" class="cwl-a-btn is-sm">Take back</button></div>' : "", buttons: '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" + P4.rbtn("Phones down", "smartphone") });
      if (held) { var el = CL.appPhone(b, "control"); el.innerHTML = '<div class="cwl-ph-head" style="border-color:var(--cwl-app-border)"><span class="cwl-a-label">' + esc(W.church) + '</span></div><div class="cwl-r-body"><div class="cwl-wf-holder">' + L("hand-helping") + '<span class="grow">You have the remote</span></div><div class="cwl-r-grid">' + P4.rbtn("Assign pairs", "users") + P4.rbtn("Clock", "timer") + "</div>" + P4.rbtn("Next: present", "chevron-right", "is-primary") + "</div>"; }
      else { var ph = P4.phone(b, {}); ph.body.innerHTML = '<div class="cwl-wf-ph-banner">' + L("hand-helping") + '<span style="flex:1">Chris has the remote</span></div><div class="cwl-ph-muted">Your card · with Sam</div>'; }
      var tv = CL.stage(c, "dark"); CL.screenTexture(tv, "input"); var ct = h("div", "cwl-tv-content"); tv.appendChild(ct); ct.innerHTML = '<div class="cwl-tv-headline">One card for <strong>each outcome</strong></div>';
      row.querySelectorAll(".cwl-app,.cwl-phone,.cwl-tv").forEach(function (e) { e.setAttribute("data-motion", motion); });
      CL.icons();
      if (window.ClearwayLivePass4Motion && motion !== "reduced") window.ClearwayLivePass4Motion.handIn(row);
    }
    [["Priya has the remote", true, "full"], ["Chris takes it back", false, "full"], ["Reduced motion", true, "reduced"]].forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.textContent = s[0]; t.onclick = function () { tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x === t ? "true" : "false"); }); draw(s[1], s[2]); }; tabs.appendChild(t); });
    tabs.firstChild.click();
    root.querySelector(".cwl-doc-note").textContent = note || "";
  }
  window.ClearwayLivePass4Card = card;
})();
