/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 5 · screens5.js
   Boards for milestone 5: the scribe console, the overnight review and the
   Day 2 read-back. Each board keeps its screens in place and moves them
   between states without redrawing; the read-back keeps one persistent TV.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P3 = window.ClearwayLivePass3, P4 = window.ClearwayLivePass4, P5 = window.ClearwayLivePass5, W = window.ClearwayLivePass4Data, S = window.ClearwayLivePass5Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide, PH = P4.PH, B = P4.B, CHIP = P4.CHIP, BAN = P4.BAN, SYNC = P4.SYNC, PRIVATE = P4.PRIVATE, item = P4.item, IB = P4.IB, SB = P4.SB;
  var host = document.getElementById("boards");
  var Y = S.Y;
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

  /* ================================================================
     OPEN DECISIONS: the Defaults designed in this pass
     ================================================================ */
  (function () {
    var b = board("decisions", "Milestone 5 decisions", ["Defaults to confirm"], "The PRD doesn't settle these five. Every screen below is designed to the Default. Each card says what the other option would change, so you can choose without a redesign. Drafts ready within 30 minutes of Day 1 closing, and promoted quotes shown on the TV anonymously, stand as they are.");
    var DEC = [
      ["\"What's missing?\" on the TV", "Answers appear under the paragraph as they arrive, anonymous (D2-03, MissingList on the TV and the control surface).", "The control surface only, and the facilitator reads them out. The TV loses its MissingList (the paragraph gets that space and can stay at tv-body for longer drafts), the control surface keeps it, and the close screen shows only \"Did we hear you right?\" with the lens progress. Phones are unchanged."],
      ["What a phone sends with \"It needs a change\"", "A short box for what should change. The scribe records the wording the room agrees and the reason, and the facilitator accepts it (D2-04, the scribe's correction composer, CorrectionQueue).", "A tap only, and the scribe types every correction. Phones lose the \"What should change?\" box (the tally still counts the tap). The scribe's composer and the CorrectionQueue are unchanged; the control surface loses the phone suggestions list."],
      ["How the facilitators learn the drafts are ready", "The review screen and the remote show \"Drafts ready\" (OVN-01, DraftStatusList on the remote).", "An email to both facilitators as well, sent once when every section is ready, with a link to OVN-01. Nothing on screen changes; the email is plain text from live.clearway.co."],
      ["Reviewing on a phone", "Laptop only. The remote shows the drafts' state, read only (OVN-01).", "A read-and-accept phone view for the co-facilitator: one lens at a time with its paragraph, a source count per sentence, Restore the room's words and Accept the lens. Editing and the sources panel stay on the laptop. Locks work the same way."],
      ["Phones during the read-back", "Phones show the current lens and can look back at settled ones, never ahead (D2-04).", "Phones can read all five lenses ahead of the TV. The phone gains a lens list at the top, the tally counts only answers for the lens on the TV, and answers sent ahead are held until that lens is on the TV."]
    ];
    var g = h("div", "p4-dec");
    g.innerHTML = DEC.map(function (d) { return "<article><h3>" + esc(d[0]) + '</h3><div class="lbl">Default, designed</div><p class="def">' + esc(d[1]) + '</p><div class="lbl">The other option</div><p>' + esc(d[2]) + "</p></article>"; }).join("");
    b.appendChild(g);
  })();

  /* ================================================================
     PART · THE SCRIBE
     ================================================================ */
  part("part-scribe", "The scribe", "The scribe's laptop and phone, and the scribe's cards arriving on the control surface. App surfaces: light, app tokens, no texture, never Sunrise. Speaker names are kept for the record and appear only on the facilitators' review screens.");

  var C = S.cards, LIVE = "Five Lenses: Community";
  var photosTypical = [{ id: "easel-1", status: "11:50" }, { id: "easel-0", status: "10:22" }];

  /* SCR-01 · the scribe console */
  stateBoard({ id: "scr-01", title: "The scribe console", ids: ["SCR-01", "ScribeCard", "CaptureComposer"],
    note: "Keyboard-first capture: pick a kind with 1 to 6, type, add who said it for the record, Enter. The card attaches to whatever session is live, because the console follows the run of show. This session's cards stack newest first, each told apart by icon and word. Photos from the scribe's phone and uploaded files land in the strip on the right.",
    states: ["Empty", "First card", "Typical", "Crowded, 50 cards", "Very long text", "A card re-filed", "Queued offline", "Syncing in order", "Synced", "A photo failed to upload", "The team has the room", "Reduced motion"],
    start: "Typical",
    make: function (ctx) {
      var r = row(ctx.stage, "is-1");
      var a = app(r, "Scribe console · laptop · data-surface=\"scribe\"", 1280, 800, "scribe");
      ctx.con = new P5.ScribeConsole(a);
      var r2 = row(ctx.stage, "is-1");
      var sheet = app(r2, "ScribeCard · every kind", 1280, 560, "scribe", "Kinds are told apart by icon and word, never by color. Mitigation is captured on Day 2 in the pre-mortem and links to its risk. Correction is captured in the read-back.");
      sheet.innerHTML = '<div class="cwl-s5-sheet">' + [C[0], C[1], C[2], C[3], C[4], S.mitigation, C[5], C[6], { id: "kc", kind: "correction", time: "9:14", text: "All four north end schools count us as partners.", why: S.corrections[0].reason }].map(function (c) { return P5.ScribeCard(c, { recordNote: true, session: c.kind === "mitigation" ? "Day 2 · Pre-mortem" : c.kind === "correction" ? "Day 2 · Read-back" : "Community" }); }).join("") + "</div>";
    },
    draw: function (ctx, st, inst) {
      var con = ctx.con, cards = C.slice().reverse(), comp = { kind: "quote", text: S.typing.text, who: S.typing.who, session: LIVE }, head = { session: LIVE };
      var o = { instant: inst }, photos = photosTypical.slice();
      if (st === "Empty") { cards = []; comp = { kind: "quote", session: LIVE }; photos = []; }
      if (st === "First card") { cards = [C[0]]; o.newest = "k1"; comp = { kind: "quote", session: LIVE }; photos = []; }
      if (st === "Crowded, 50 cards") { cards = S.burst.slice().reverse().slice(0, 5); o.count = "This session · 57 cards"; o.more = "+ 52 older cards. Scroll for more."; }
      if (st === "Very long text") { cards = [S.longCard].concat(cards); comp = { kind: "decision", text: S.longCard.text, session: "Five Lenses: Community, including the north end association's food bank proposal" }; }
      if (st === "A card re-filed") { o.refiled = { k5: "Five Lenses: Operations" }; o.note = "Re-filed cards move to their session"; }
      if (st === "Queued offline") { cards = [{ id: "q3", kind: "action", time: "11:57", text: "Ask the north end association to co-lead the food bank.", owner: "Ben Carter" }, { id: "q2", kind: "quote", time: "11:55", text: "Our building is the north end's living room.", who: "Grace Lindqvist" }, { id: "q1", kind: "decision", time: "11:54", text: "Grow the food bank only with the association.", why: "Capacity, not willingness, holds us back." }].concat(cards); o.states = { q1: "queued", q2: "queued", q3: "queued" }; o.orders = { q1: 1, q2: 2, q3: 3 }; o.banner = '<div class="cwl-scr-queue">' + L("wifi-off") + '<span>Offline. Cards are saved on this laptop and send in order.</span><span class="n" style="margin-left:auto">3</span></div>'; head.sync = CHIP("Offline", "is-outline", "wifi-off"); photos = [{ id: "easel-2", status: "Saved on the phone", cls: "is-arriving" }].concat(photos); }
      if (st === "Syncing in order") { cards = [{ id: "q3", kind: "action", time: "11:57", text: "Ask the north end association to co-lead the food bank.", owner: "Ben Carter" }, { id: "q2", kind: "quote", time: "11:55", text: "Our building is the north end's living room.", who: "Grace Lindqvist" }, { id: "q1", kind: "decision", time: "11:54", text: "Grow the food bank only with the association.", why: "Capacity, not willingness, holds us back." }].concat(cards); o.states = { q1: "synced", q2: "syncing", q3: "queued" }; o.orders = { q2: 2, q3: 3 }; o.banner = '<div class="cwl-scr-queue">' + L("refresh-cw") + '<span>Back online. Sending in the order they were captured.</span><span class="n" style="margin-left:auto">2</span></div>'; head.sync = SYNC("is-syncing", "refresh-cw", "Syncing 2 of 3"); }
      if (st === "Synced") { cards = [{ id: "q3", kind: "action", time: "11:57", text: "Ask the north end association to co-lead the food bank.", owner: "Ben Carter" }, { id: "q2", kind: "quote", time: "11:55", text: "Our building is the north end's living room.", who: "Grace Lindqvist" }, { id: "q1", kind: "decision", time: "11:54", text: "Grow the food bank only with the association.", why: "Capacity, not willingness, holds us back." }].concat(cards); o.states = { q1: "synced", q2: "synced", q3: "synced" }; head.sync = SYNC("", "check", "Synced · 3 sent once each"); }
      if (st === "A photo failed to upload") { photos = [{ id: "easel-2", status: "Didn't upload", cls: "is-failed", extra: '<div class="cwl-a-row" style="gap:6px">' + SB("Try again", "refresh-cw") + "</div>" }].concat(photos); head.sync = CHIP("1 photo didn't upload", "is-error", "x"); }
      if (st === "The team has the room") { head.off = true; head.session = "Commander's intent"; head.chip = CHIP("Team-led", "run-team-led", "users"); comp.off = true; }
      con.header(head); con.composer(comp); con.cards(cards, o); con.photos(photos, { instant: inst });
      ctx.button("Capture the quote", "corner-down-left", function () {
        var nc = { id: "kn" + Date.now(), kind: "quote", time: "11:59", text: S.typing.text, who: S.typing.who };
        con.composer({ kind: "quote", session: LIVE });
        cards = [nc].concat(cards.filter(function (x) { return x.id.indexOf("kn") !== 0; }));
        con.cards(cards, { newest: nc.id, states: o.states, orders: o.orders });
      });
      ctx.button("The run of show moves on", "skip-forward", function () {
        con.header({ session: "Lunch", chip: CHIP("Nothing live", "", "pause") }); con.composer({ kind: "quote", session: "Nothing live. Cards wait for the next session." });
        con.cards([], { note: "Nothing live" });
        CL.later(function () { con.header({ session: "Five Lenses: Leadership" }); con.composer({ kind: "quote", session: "Five Lenses: Leadership" }); con.cards([], { count: "This session · 0 cards" }); }, 1800);
      });
      return {
        "Empty": "The session has just started: the composer is ready and the list says nothing has been captured yet.",
        "First card": "The first quote lands at the top of the list with a focus ring for cwl-dur-new-hold, then settles.",
        "Typical": "Seven captures in Five Lenses: Community: quote, decision, tension with both views, action with its owner and date, question, an easel photo and a file. The speaker is typed for the record and the card only says it was kept. Use the buttons to capture a card or move the run of show on.",
        "Crowded, 50 cards": "57 cards: the newest five show, the rest scroll. The count stays in the column head.",
        "Very long text": "A 300-character decision wraps in full on its card, and a long session name truncates in the attach row with the full name on hover.",
        "A card re-filed": "The question was re-filed to Five Lenses: Operations. It shows where it went, then leaves this session's list.",
        "Queued offline": "Wifi is off. The scribe keeps capturing: three cards are numbered in capture order and saved on this laptop, and the phone's photo waits on the phone.",
        "Syncing in order": "Back online: the first card has sent, the second is sending, the third waits its turn. Nothing jumps; each card changes its state in place.",
        "Synced": "Every queued card sent once, in order. Each send carries its own key, so a retry never makes a duplicate.",
        "A photo failed to upload": "A photo that didn't upload stays on the phone and in the strip with an Error edge and Try again. Error is allowed on the scribe console.",
        "The team has the room": "From the moment the team takes the remote, the console is off and says so. It turns back on for the recap.",
        "Reduced motion": "Cards appear in place with a short fade, and nothing slides."
      }[st];
    }
  });

  /* SCR-02 · the scribe's phone */
  (function () {
    var b = board("scr-02", "The scribe's phone", ["SCR-02", "EaselCapture"], "One tap photographs the easel page, then Retake or Attach. The photo attaches to the live session and lands on the scribe console within seconds, or waits on the phone if the venue wifi is down. Files can be uploaded from the phone too.");
    var acts = h("div", "sc-actions"); acts.setAttribute("data-surface", "setup"); acts.setAttribute("data-theme", "light"); b.appendChild(acts);
    var r = row(b, "is-phones");
    [["Camera", "camera"], ["Retake or attach", "review"], ["Uploading", "uploading"], ["Attached", "attached"], ["Saved on this phone", "queued"], ["Didn't upload", "failed"], ["Nothing live", "nothing"], ["The team has the room", "off"]].forEach(function (s) { P5.EaselCapture(frame(r, s[0], "is-phone"), { step: s[1] }); });
    var r2 = row(b, "is-1"); r2.style.gridTemplateColumns = "240px minmax(0, 1fr)";
    var pb = frame(r2, "Live: the phone", "is-phone");
    var a = app(r2, "Live: the console's photo strip", 1280, 360, "scribe");
    a.innerHTML = '<div class="cwl-scr" style="height:100%"><div class="cwl-scr-col is-photos" style="height:100%"><div class="cwl-scr-colhead"><span class="cwl-a-label">Photos and files · Five Lenses: Community</span></div><div class="cwl-scr-strip" style="flex-direction:row;gap:14px"></div></div></div>';
    var strip = a.querySelector(".cwl-scr-strip");
    function drawStrip(list, inst) {
      P4.keyed(strip, list.map(function (p) { return { k: p.id, p: p }; }), function () { var d = h("div"); d.style.width = "220px"; return d; }, function (el, it) { var sig = it.p.status + it.p.cls; if (el.getAttribute("data-sig") === sig) return; el.setAttribute("data-sig", sig); el.innerHTML = P5.photoFigure(it.p.id, { status: it.p.status, cls: it.p.cls, extra: it.p.extra }); }, { instant: inst });
      CL.icons();
    }
    function reset() { P5.EaselCapture(pb.firstChild ? (pb.innerHTML = "", pb) : pb, { step: "camera" }); drawStrip([{ id: "easel-0", status: "10:22" }], true); }
    reset();
    var btn = h("button", "cwl-a-btn is-secondary"); btn.type = "button"; btn.innerHTML = L("camera") + "<span>Photograph and attach</span>"; acts.appendChild(btn);
    btn.onclick = function () {
      CL.clearTimers(); reset();
      CL.later(function () { pb.innerHTML = ""; P5.EaselCapture(pb, { step: "review" }); }, 600);
      CL.later(function () { pb.innerHTML = ""; P5.EaselCapture(pb, { step: "uploading" }); drawStrip([{ id: "easel-1", status: "Arriving from the phone", cls: "is-arriving" }, { id: "easel-0", status: "10:22" }]); }, 1700);
      CL.later(function () { pb.innerHTML = ""; P5.EaselCapture(pb, { step: "attached" }); drawStrip([{ id: "easel-1", status: "11:50" }, { id: "easel-0", status: "10:22" }]); }, 3200);
    };
    CL.icons();
  })();

  /* FAIL-03 · the scribe goes offline */
  var Q = [
    { id: "q1", kind: "decision", time: "11:54", text: "Grow the food bank only with the association.", why: "Capacity, not willingness, holds us back." },
    { id: "q2", kind: "quote", time: "11:55", text: "Our building is the north end's living room.", who: "Grace Lindqvist" },
    { id: "q3", kind: "action", time: "11:57", text: "Ask the north end association to co-lead the food bank.", owner: "Ben Carter" }
  ];
  stateBoard({ id: "fail-03", title: "The scribe goes offline", ids: ["FAIL-03"],
    note: "With wifi off the scribe keeps capturing. Cards and photos are numbered in the order they were captured and saved on the device. When the connection returns they send one at a time in that order, and each send carries its own key, so a retry never makes a duplicate. The easel stays the primary record either way.",
    states: ["Online", "Offline, 3 cards and a photo queued", "Back online, syncing in order", "Synced, no duplicates", "A photo failed to upload", "Reduced motion"],
    start: "Offline, 3 cards and a photo queued",
    make: function (ctx) {
      var r = row(ctx.stage, "is-1"); r.style.gridTemplateColumns = "minmax(0, 1fr) 240px";
      var a = app(r, "Scribe console · laptop", 1280, 800, "scribe");
      ctx.con = new P5.ScribeConsole(a);
      ctx.pb = frame(r, "Scribe's phone", "is-phone");
    },
    draw: function (ctx, st, inst) {
      var con = ctx.con, base = C.slice(0, 4).reverse();
      var states = {}, orders = {}, banner = "", sync, step = "attached", photos = photosTypical.slice();
      if (st === "Online") { sync = SYNC("", "check", "Synced"); }
      else if (/Offline/.test(st)) { Q.forEach(function (q, i) { states[q.id] = "queued"; orders[q.id] = i + 1; }); banner = '<div class="cwl-scr-queue">' + L("wifi-off") + '<span>Offline. 3 cards on this laptop and 1 photo on the phone, in order.</span><span class="n" style="margin-left:auto">4</span></div>'; sync = CHIP("Offline", "is-outline", "wifi-off"); step = "queued"; photos = [{ id: "easel-2", status: "Waiting on the phone", cls: "is-arriving" }].concat(photos); }
      else if (/syncing/.test(st)) { states = { q1: "synced", q2: "syncing", q3: "queued" }; orders = { q2: 2, q3: 3 }; banner = '<div class="cwl-scr-queue">' + L("refresh-cw") + '<span>Back online. Sending in capture order.</span><span class="n" style="margin-left:auto">3</span></div>'; sync = SYNC("is-syncing", "refresh-cw", "Syncing 2 of 4"); step = "uploading"; photos = [{ id: "easel-2", status: "Waiting its turn", cls: "is-arriving" }].concat(photos); }
      else if (/Synced/.test(st) || st === "Reduced motion") { Q.forEach(function (q) { states[q.id] = "synced"; }); sync = SYNC("", "check", "Synced · 4 sent once each"); step = "attached"; photos = [{ id: "easel-2", status: "11:56" }].concat(photos); }
      else if (/failed/.test(st)) { Q.forEach(function (q) { states[q.id] = "synced"; }); sync = CHIP("1 photo didn't upload", "is-error", "x"); step = "failed"; photos = [{ id: "easel-2", status: "Didn't upload", cls: "is-failed", extra: '<div class="cwl-a-row">' + SB("Try again", "refresh-cw") + "</div>" }].concat(photos); }
      var list = st === "Online" ? base : Q.slice().reverse().concat(base);
      con.header({ session: LIVE, sync: sync }); con.composer({ kind: "quote", session: LIVE }); con.cards(list, { states: states, orders: orders, banner: banner, instant: inst }); con.photos(photos, { instant: inst });
      ctx.pb.innerHTML = ""; P5.EaselCapture(ctx.pb, { step: st === "Online" ? "camera" : step, photo: "easel-2" });
      ctx.button("Play: wifi comes back", "wifi", function () {
        var s2 = {}, o2 = {}; Q.forEach(function (q, i) { s2[q.id] = "queued"; o2[q.id] = i + 1; });
        con.header({ session: LIVE, sync: SYNC("is-syncing", "refresh-cw", "Syncing") });
        con.cards(Q.slice().reverse().concat(base), { states: clone(s2), orders: clone(o2), instant: true });
        Q.forEach(function (q, i) {
          CL.later(function () { s2[q.id] = "syncing"; con.cards(Q.slice().reverse().concat(base), { states: clone(s2), orders: clone(o2) }); }, 400 + i * 900);
          CL.later(function () { s2[q.id] = "synced"; delete o2[q.id]; con.cards(Q.slice().reverse().concat(base), { states: clone(s2), orders: clone(o2) }); if (i === Q.length - 1) { con.header({ session: LIVE, sync: SYNC("", "check", "Synced · 4 sent once each") }); con.photos([{ id: "easel-2", status: "11:56" }].concat(photosTypical)); ctx.pb.innerHTML = ""; P5.EaselCapture(ctx.pb, { step: "attached", photo: "easel-2" }); } }, 400 + i * 900 + 600);
        });
      });
      return {
        "Online": "Connected: every card shows Synced and the header says so.",
        "Offline, 3 cards and a photo queued": "Cards keep landing on the console with a dashed edge and their number in capture order. The phone keeps its photo and says it will send in order.",
        "Back online, syncing in order": "One at a time, in capture order: 1 has sent, 2 is sending, 3 and the photo wait. The numbers disappear as each one sends. Use the button to play it.",
        "Synced, no duplicates": "All four sent once. A card that was retried after a dropped connection is matched by its key and never shows twice.",
        "A photo failed to upload": "Cards are fine; the photo didn't upload. It stays on the phone with Try again, and the strip shows it with an Error edge.",
        "Reduced motion": "States change in place with no slide."
      }[st];
    }
  });

  /* Control surface feed (FAC-01) and the promoted quote on the TV */
  var COMMUNITY_WALL = [
    { id: "w1", text: S.phone.p1, c: "neighbours" }, { id: "w2", text: S.phone.p2, c: "foodbank" }, { id: "w3", text: S.phone.p3, c: "schools" },
    { id: "w4", text: S.phone.p4, c: "neighbours" }, { id: "w5", text: S.phone.p5, c: "foodbank" }, { id: "w6", text: S.phone.p6, c: "partners" },
    { id: "w7", text: S.phone.p7, c: "partners" }, { id: "w8", text: S.phone.p8, c: "neighbours" }, { id: "w9", text: S.phone.p9, c: "neighbours" }
  ];
  var COMMUNITY_LABELS = { neighbours: "Known by our neighbours", foodbank: "Food bank with neighbours", schools: "School partners", partners: "A few deep partners" };
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
      if (spec.remote) { var rbox = frame(r2, spec.remoteLabel || "Remote", "is-phone"); spec.remote(rbox, state, ctx); }
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

  intBoard({ id: "fac-01-scribe", ctlH: 700, title: "Scribe cards on the control surface, and a quote promoted to the TV", ids: ["FAC-01", "ScribeFeed", "PromotedQuote"], lens: "community", headline: W.lensPrompt(W.lenses[1]), unit: "sentences",
    note: "The pass 2 control surface gains the scribe's cards in its private panel, arriving as they're captured, with no speaker names. A quote can be promoted to the TV with one tap: it arrives anonymously in the spotlight over the live wall, with only the session named. Taking it off returns the wall exactly as it was.",
    states: ["Empty", "First card", "Typical", "Quote promoted", "Crowded, 50 cards", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text", "The team has the room"],
    start: "Typical",
    make: function (ctx) { return new P4.LensWall(ctx.sh.host, { labels: COMMUNITY_LABELS }); },
    tv: function (ctx, st, inst) {
      var s = stat(st), list = COMMUNITY_WALL, grouped = list.map(function (x) { return x.id; });
      if (st === "The team has the room") { ctx.sh.prompt("Commander's intent · team-led", "One card for <strong>each Vision Outcome</strong>"); ctx.view.set([], { instant: true }); ctx.sh.count(5, "cards", true); P5.PromotedQuote(ctx.sh, null); return "The team-led block: the scribe console is off, so no cards arrive and nothing can be promoted. The TV runs the team's own session."; }
      ctx.sh.prompt("", W.lensPrompt(W.lenses[1])); P4.setLens(ctx.sh, "community");
      ctx.view.set(list, { instant: inst, ai: s.ai, grouped: grouped, seedNote: "7 from the pre-call" });
      ctx.sh.count(list.length, "sentences", inst);
      if (s.ai) ctx.sh.foot('<span class="p3-ai-line">' + CL.aiBadge() + " Grouped similar sentences</span>");
      P5.PromotedQuote(ctx.sh, st === "Quote promoted" || (s.long && false) ? C[0].text : null, { session: LIVE });
      if (s.long) P5.PromotedQuote(ctx.sh, "Every Sunday the room holds people who found Riverside through a friend, a neighbour or the food bank, and if we weren't here the city would notice.", { session: LIVE });
      ctx.button("Promote the quote", "tv", function () { P5.PromotedQuote(ctx.sh, C[0].text, { session: LIVE }); ctx.redrawCtl("promoted"); });
      ctx.button("Take it off the TV", "monitor-off", function () { P5.PromotedQuote(ctx.sh, null); ctx.redrawCtl(null); });
      ctx.button("The scribe captures a card", "corner-down-left", function () { ctx.addCard(); });
      return {
        "Empty": "Nothing captured yet in this session. The panel says where cards will appear.",
        "First card": "The first card lands at the top of the scribe panel with a focus ring for a moment.",
        "Typical": "Cards arrive newest first in the private panel, four at a time, with a count of the rest. A quote carries Promote to TV. Use the buttons to promote it, take it off, or capture a new card.",
        "Quote promoted": "The quote arrives in the pass 3 spotlight over the wall: Navy scrim, Sunrise card, light text with one bold phrase, \"From the room\" and the session. No name, ever. The card on the control surface shows On the TV and Take off the TV.",
        "Crowded, 50 cards": "Four newest cards show, with \"+ 46 more cards on the scribe console\".",
        "Offline and queued": "The control surface keeps the last cards it received. When the scribe reconnects, the queued cards arrive in capture order, a stagger apart.",
        "Phones down": "Phones down doesn't affect the scribe: cards keep arriving, and a quote can still be promoted while the room talks.",
        "AI off": "The feed has no AI in it, so nothing changes. The wall shows arrival order.",
        "Reduced motion": "The spotlight and cards appear in place with a short fade.",
        "Very long text": "A long quote stays in the spotlight at headline size and wraps; the card on the control surface wraps in full.",
        "The team has the room": ""
      }[st];
    },
    phones: function (st) {
      var s = stat(st);
      return [{ label: "Phone · writing", cap: "Phones never show a promoted quote or scribe cards.", render: function (p) { p.body.innerHTML = '<div class="cwl-wf-ph-lens">' + P4.lensChip("community") + '</div><div class="cwl-ph-prompt">It\'s ' + Y.future + ". Describe our Community.</div>" + (s.down ? PH.down() : PH.tense() + PH.input("Our seniors visit their neighbours every week.", "", 3) + PH.burst("1:58", 0.4)) + PH.sent(S.phone.p8, s.offline ? "saved" : "sent"); p.foot.innerHTML = s.down ? "" : PH.btn("Send"); } }];
    },
    control: function (a, st, ctx) {
      var s = stat(st), cards = C.slice(0, 4).reverse(), promoted = st === "Quote promoted" || s.long ? "k1" : null, newest = null, states = {};
      if (st === "Empty") cards = [];
      if (st === "First card") { cards = [C[0]]; newest = "k1"; }
      if (s.crowded) cards = S.burst.slice().reverse();
      if (s.offline) states = {};
      if (s.long) cards = [{ id: "k1", kind: "quote", time: "11:24", text: "Every Sunday the room holds people who found Riverside through a friend, a neighbour or the food bank, and if we weren't here the city would notice." }].concat(C.slice(1).reverse());
      var team = st === "The team has the room";
      function draw(pr, nw, list) {
        P4.ctl(a, { title: team ? "Commander's intent" : P4.ctlLens("community") + " &nbsp;Five Lenses: Community", chips: team ? [CHIP("Team-led", "run-team-led", "users"), CHIP("Priya has the remote", "is-outline", "hand-helping")] : [s.down ? CHIP("Phones down", "", "smartphone") : CHIP("Live", "run-live", "radio"), pr ? CHIP("Quote on the TV", "is-outline", "tv") : CHIP("Burst 1:58 left", "is-outline", "timer")],
          sync: s.offline ? SYNC("", "monitor-off", "TV reconnecting") : SYNC("", "check", "On the TV now"), banner: s.offline ? BAN("warning", "triangle-alert", "<strong>Scribe offline.</strong> Their cards are saved on their laptop and arrive here in order when they reconnect.") : "",
          tools: team ? [B("Take back", "is-primary is-sm", "hand")] : [SB("Start burst", "timer", "is-primary"), SB("Spotlight", "sun"), SB("Hide", "eye-off")], listTitle: team ? "Team-led block" : "Clusters", listNote: team ? "Scribe console off for the block" : s.ai ? "AI groups as sentences arrive" : "AI off · arrival order",
          items: team ? [item("1:10", "Commander's intent", "Pairs draft one card per Vision Outcome", [CHIP("Live", "run-live", "radio")])] : Object.keys(COMMUNITY_LABELS).map(function (k, i) { var n = COMMUNITY_WALL.filter(function (x) { return x.c === k; }).length; return item(i + 1, esc(COMMUNITY_LABELS[k]), n + (n === 1 ? " sentence" : " sentences"), [CL.aiBadge(), IB("pin", "Pin"), IB("undo-2", "Undo grouping"), IB("pencil", "Rename")]); }),
          side: PRIVATE("Scribe", '<div class="s5-feed"></div>') + P4.roomPanel([[s.crowded ? 59 : 9, "sentences"], [8, "signed in"]]) });
        var fh = a.querySelector(".s5-feed");
        if (team) { fh.innerHTML = '<div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">The scribe console is off for the team-led block.</div>'; return null; }
        var feed = new P5.ScribeFeed(fh);
        feed.set(list, { promoted: pr, newest: nw, instant: true, max: 4 });
        if (!list.length) fh.firstChild.innerHTML = '<div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">The scribe\'s cards for this session appear here as they\'re captured.</div>';
        return feed;
      }
      var feed = draw(promoted, newest, cards);
      ctx.redrawCtl = function (pr) { if (feed) feed.set(cards, { promoted: pr, max: 4 }); var chips = a.querySelectorAll(".p3-ctl-head .cwl-a-chip"); if (chips[1]) chips[1].outerHTML = pr ? CHIP("Quote on the TV", "is-outline", "tv") : CHIP("Burst 1:58 left", "is-outline", "timer"); CL.icons(); };
      ctx.addCard = function () { var nc = { id: "kn" + Date.now(), kind: ["decision", "action", "quote"][cards.length % 3], time: "11:59", text: ["Open the building to the association on weekdays.", "Ben to ask the association about co-leading the food bank.", "Our building is the north end's living room."][cards.length % 3], owner: "Ben Carter" }; cards = [nc].concat(cards); if (feed) feed.set(cards, { newest: nc.id, max: 4 }); };
    },
    remote: function (box, st) { P4.remote(box, { title: st === "The team has the room" ? "Commander's intent" : "Five Lenses: Community", buttons: '<div class="cwl-r-grid">' + P4.rbtn("Burst", "timer", "is-primary") + P4.rbtn("Phones down", "smartphone") + "</div>" + '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" }); }
  });

  /* ================================================================
     PART · OVERNIGHT
     ================================================================ */
  part("part-overnight", "Overnight: draft, review, publish", "When Day 1 closes, AI drafts each lens of the 10-year Future in the present tense and tidies the provisional Vision Outcomes and the first-pass 3-year Vision. Chris and Jaisy review side by side. Nothing reaches the TV or phones until Chris publishes the read-back. data-surface=\"review\": app tokens, Warning and Error allowed, never Sunrise.");

  function reviewShell(a, active, head, body) {
    a.innerHTML = '<div class="cwl-ovn-shell"><nav class="cwl-ovn-nav" aria-label="Engagement"><div class="brand">' + L("compass") + esc(S.church) + "</div>" +
      [["Overview", "layout-dashboard"], ["Run of show", "list-ordered"], ["Overnight review", "moon"], ["Publish the read-back", "send"], ["Outputs", "file-text"]].map(function (n) { return '<a href="#" tabindex="-1"' + (n[0] === active ? ' class="is-on"' : "") + ">" + L(n[1]) + esc(n[0]) + "</a>"; }).join("") +
      '<div class="sec">Day 2</div><a href="#" tabindex="-1">' + L("calendar") + "Read-back at 9:00</a></nav>" +
      '<div class="cwl-ovn"><header class="cwl-ovn-head"><div class="grow">' + head.left + "</div>" + (head.right || "") + '</header><div class="cwl-ovn-body">' + body + "</div></div></div>";
    CL.icons();
  }

  /* OVN-01 · overnight review */
  stateBoard({ id: "ovn-01", title: "Overnight review", ids: ["OVN-01", "DraftStatusList", "ReviewPresence"],
    note: "From the moment Day 1 closes: drafting progress, then every lens and the provisional outcomes with their review state, who is where, the lock on a section the other facilitator is editing, and flags. Thin outcomes are flagged for the morning, not hidden. Drafts are ready within 30 minutes of Day 1 closing, and the review screen and the remote say so.",
    states: ["Drafting", "Drafts ready", "Both reviewing", "Section locked", "Thin outcome flagged", "Lens reviewed", "Easel photo unreadable", "AI off", "Very long text", "Reduced motion"],
    start: "Both reviewing",
    make: function (ctx) {
      var r = row(ctx.stage, "is-1"); r.style.gridTemplateColumns = "minmax(0, 1fr) 220px";
      ctx.a = app(r, "Overnight review · laptop · data-surface=\"review\"", 1280, 800, "review");
      ctx.rb = frame(r, "Remote · after Day 1", "is-phone");
    },
    draw: function (ctx, st, inst) {
      var key = st === "Drafting" ? "drafting" : st === "Drafts ready" || st === "AI off" ? "ready" : "both", states = clone(S.reviewStates[key]);
      if (st === "Lens reviewed") states.community = "reviewed:cv";
      if (st === "Easel photo unreadable") states.operations = "flagged";
      var pres = key === "drafting" ? [] : key === "ready" ? [{ id: "cv", where: "the overview", you: true }] : [{ id: "cv", where: "Community", editing: st !== "Lens reviewed", you: true }, { id: "jt", where: "Learning", editing: true }];
      var reviewed = Object.keys(states).filter(function (k) { return states[k].indexOf("reviewed") === 0; }).length, ready = Object.keys(states).filter(function (k) { return states[k] !== "drafting"; }).length;
      var prog = key === "drafting" ?
        '<div class="cwl-ovn-progress"><div class="row"><span><b>Drafting</b> · started when Day 1 closed at ' + S.dayClosed + '</span><span class="cwl-a-muted">18 minutes so far · usually under 30</span></div><div class="cwl-ovn-bar"><i style="width:' + Math.round(ready / 7 * 100) + '%"></i></div><div class="row"><span class="cwl-a-muted">' + ready + " of 7 sections drafted. Working from 23 phone sentences per lens on average, 31 scribe cards and 9 easel photos.</span></div></div>" :
        '<div class="cwl-ovn-progress"><div class="row"><span><b>' + reviewed + " of 7 reviewed</b> · drafts ready at " + S.draftsReady + ", 26 minutes after Day 1 closed</span><span class=\"cwl-a-muted\">About 45 minutes to review</span></div><div class=\"cwl-ovn-bar\"><i style=\"width:" + Math.round(reviewed / 7 * 100) + '%"></i></div></div>';
      var flags = st === "AI off" ? BAN("info", "info", "<strong>AI is off for this engagement.</strong> No drafts tonight. Each lens opens with the room's own sentences beside an empty paragraph, so you write it from their words.") :
        (states.outcomes === "flagged" ? '<div class="cwl-a-banner is-warning"><span class="ic">' + L("triangle-alert") + "</span><div><strong>Thin outcome: Families find a home here has no bullets.</strong> It stays on the list and shows as thin in the morning, so the room can fill it or rethink it. Acknowledge it before publishing.</div></div>" : "") +
        (states.operations === "flagged" ? '<div class="cwl-a-banner is-warning"><span class="ic">' + L("triangle-alert") + "</span><div><strong>The draft couldn't read one easel photo</strong> (Community, page 2). Type what it says in Community to count it as a source.</div></div>" : "");
      var title = st === "Very long text" ? null : null;
      var list = P5.DraftStatusList(states, { current: key === "both" ? "community" : null, ai: st !== "AI off", unreadable: st === "Easel photo unreadable", right: key === "drafting" ? "Drafting started " + S.dayClosed : "Private until published" });
      if (st === "Very long text") list = list.replace("Provisional Vision Outcomes", "Provisional Vision Outcomes, including " + W.longOutcome);
      var pub = '<div class="cwl-a-row" style="margin-top:auto">' + B("Review and publish", "is-secondary", "send", " disabled") + '<span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">' + (key === "drafting" ? "Drafts are still being written." : "Every section reviewed and every flag acknowledged first.") + "</span></div>";
      reviewShell(ctx.a, "Overnight review", { left: '<div class="cwl-a-eyebrow">' + esc(S.church) + " · after Day 1 · read-back Day 2 at 9:00</div><div class=\"cwl-a-title\" style=\"font-size:var(--cwl-fs-app-page-title);font-weight:700\">Overnight review</div>", right: (pres.length ? P5.ReviewPresence(pres) : "") + '<span class="cwl-ovn-private">' + L("eye-off") + "Private until published</span>" }, prog + flags + list + pub);
      if (st === "Section locked") { var rowL = ctx.a.querySelectorAll(".cwl-ovn-row")[4]; if (rowL) { rowL.classList.add("is-current"); rowL.insertAdjacentHTML("beforeend", P5.lockChip("jt")); } }
      /* the remote: drafts ready */
      ctx.rb.innerHTML = "";
      var rem = CL.appPhone(ctx.rb, "control");
      rem.innerHTML = '<div class="cwl-ph-head" style="border-color:var(--cwl-app-border)"><span class="cwl-a-label">' + esc(S.church) + '</span><span class="cwl-a-sync">' + L("moon") + "<span>After Day 1</span></span></div>" +
        '<div class="cwl-r-body">' + (key === "drafting" ? '<div class="cwl-scr-queue">' + L("loader-circle") + "<span>Drafting · " + ready + " of 7</span></div>" : '<div class="cwl-ovn-remote-ready">' + L("bell") + "Drafts ready</div>") + P5.DraftStatusList(states, { compact: true, ai: st !== "AI off" }) + '<div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">Review on the laptop. The read-back opens on Day 2 at 9:00.</div></div>';
      CL.icons();
      ctx.button("Play drafting", "play", function () {
        var seq = ["congregation", "community", "leadership", "operations", "learning", "outcomes", "vision"], cur = clone(S.reviewStates.drafting); seq.forEach(function (k) { cur[k] = "drafting"; });
        seq.forEach(function (k, i) { CL.later(function () { cur[k] = k === "outcomes" ? "flagged" : "ready"; var n = seq.filter(function (x) { return cur[x] !== "drafting"; }).length; var lst = ctx.a.querySelector(".cwl-ovn-list"); if (lst) lst.outerHTML = P5.DraftStatusList(cur, { right: "Drafting started " + S.dayClosed }); var bi = ctx.a.querySelector(".cwl-ovn-bar i"); if (bi) bi.style.width = Math.round(n / 7 * 100) + "%"; CL.icons(); }, 500 + i * 700); });
      });
      return {
        "Drafting": "Day 1 has closed. The bar fills as each section is drafted and every row turns from Drafting to Ready to review in place. Nothing here reaches the TV or phones.",
        "Drafts ready": "All seven drafted 26 minutes after Day 1 closed. The review screen and the remote both say Drafts ready. The outcomes are flagged thin.",
        "Both reviewing": "Chris is in Community and Jaisy is in Learning. Each sees where the other is. Congregation and Leadership are reviewed.",
        "Section locked": "Learning is locked for Chris while Jaisy edits it: her name and a lock sit on the row, and opening it is read only until she leaves it.",
        "Thin outcome flagged": "Families find a home here has no bullets. It's flagged in Warning and stays on the list, so the room sees it in the morning.",
        "Lens reviewed": "Chris accepted Community: the row turns Reviewed by Chris and the count moves to 3 of 7.",
        "Easel photo unreadable": "One easel page was too hard to read. Operations is flagged until a facilitator types what the page says.",
        "AI off": "With AI off there are no drafts: every lens says to write it from the room's sentences, and nothing else changes.",
        "Very long text": "A long outcome name wraps in the row title without pushing the state chip.",
        "Reduced motion": "The bar and the rows change in place. The drafting icon stops spinning."
      }[st];
    }
  });

  /* OVN-02 · a lens draft with its source words */
  stateBoard({ id: "ovn-02", title: "A lens draft with its source words", ids: ["OVN-02", "DraftParagraph", "SourcePanel", "VoicesAndTensions", "VersionHistory"],
    note: "Community, " + Y.future + ", in the present tense. Every sentence ends with a source marker: how many sources it has, a quote mark when it's the room's own words, and a Warning marker when it has none. Select a sentence and its sources come forward on the right with the words it came from highlighted. Restore the room's words swaps the AI wording in one action. Voices not to lose and the tensions the room named stay beside the paragraph, never inside it. Every version is kept.",
    states: ["Sentence selected", "Restore the room's words", "A sentence with no source", "Editing", "Locked by Jaisy", "Lens reviewed", "Version history", "Easel photo unreadable", "AI off", "Very long text", "Reduced motion"],
    start: "Sentence selected",
    make: function (ctx) {
      var r = row(ctx.stage, "is-1");
      ctx.a = app(r, "Overnight review · Community · data-surface=\"review\"", 1280, 860, "review");
    },
    draw: function (ctx, st, inst) {
      var a = ctx.a;
      var right = st === "Version history" ? "versions" : "sources";
      reviewShell(a, "Overnight review", { left: '<div class="cwl-a-eyebrow">Overnight review · 10-year Future · private until published</div><div class="cwl-a-title" style="font-size:var(--cwl-fs-app-section-title);font-weight:600">Five Lenses</div>', right: P5.ReviewPresence([{ id: "cv", where: "Community", editing: st !== "Locked by Jaisy", you: true }, { id: "jt", where: st === "Locked by Jaisy" ? "Community" : "Learning", editing: true }]) },
        '<div class="cwl-a-panes" style="flex:1;min-height:0;margin:-18px calc(var(--cwl-app-gutter) * -1)"><section class="cwl-a-pane s5-left" aria-label="Draft"></section><aside class="cwl-a-pane s5-right" aria-label="' + (right === "versions" ? "Version history" : "Sources") + '"><div class="cwl-a-tabs" role="tablist" style="display:flex;gap:6px">' + '<button type="button" class="cwl-a-tag" aria-pressed="' + (right === "sources") + '">' + L("link") + 'Sources</button><button type="button" class="cwl-a-tag" aria-pressed="' + (right === "versions") + '">' + L("history") + "Version history</button></div><div class=\"s5-rbody\"></div></aside></div>");
      var left = a.querySelector(".s5-left"), rbody = a.querySelector(".s5-rbody");
      var sp, dp;
      var opts = { sel: "s3", restored: {}, removed: {}, locked: null, editing: false, reviewed: null, ai0: false, long: false, written: null };
      if (st === "Restore the room's words") opts.sel = "s4";
      if (st === "A sentence with no source") opts.sel = "s7";
      if (st === "Editing") { opts.editing = true; opts.sel = "s1"; }
      if (st === "Locked by Jaisy") opts.locked = "jt";
      if (st === "Lens reviewed" || st === "Version history") { opts.reviewed = "cv"; opts.restored = { s3: true }; opts.removed = { s7: true }; }
      if (st === "AI off") { opts.ai0 = true; opts.written = ["s4", "s2"]; }
      if (st === "Very long text") { opts.long = true; opts.sel = "s1"; }
      if (st === "Easel photo unreadable") opts.sel = "s1";
      dp = new P5.DraftParagraph(left, { onSelect: function (id) { if (sp) sp.set(id, { text: dp.textOf(S.community.sentences.filter(function (x) { return x.id === id; })[0]) }); }, onRestore: function (id) { if (sp) sp.set(id, { instant: true, text: S.community.sentences.filter(function (x) { return x.id === id; })[0].room }); } });
      dp.set(opts);
      left.insertAdjacentHTML("beforeend", P5.VoicesAndTensions(S.community));
      if (right === "versions") rbody.innerHTML = '<div class="cwl-ovn-src-h" style="margin:12px 0 4px">Every version of Community, ' + Y.future + "</div>" + P5.VersionHistory(S.versions);
      else { sp = new P5.SourcePanel(rbody); sp.set(opts.sel, { instant: true, ai0: opts.ai0, written: ["p5", "p4"], unreadable: st === "Easel photo unreadable", text: dp.textOf(S.community.sentences.filter(function (x) { return x.id === opts.sel; })[0]) }); }
      CL.icons();
      if (!opts.ai0 && !opts.locked && !opts.long && right === "sources") ctx.button("Select the next sentence", "mouse-pointer-click", function () { var ids = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"], i = ids.indexOf(dp.state.sel); dp.select(ids[(i + 1) % ids.length]); });
      if (st === "Restore the room's words") ctx.button("Restore the room's words", "quote", function () { dp.restore("s4"); });
      return {
        "Sentence selected": "Sentence 3 is selected: its three sources come forward on the right (a scribe decision card, a phone sentence and the easel photo) with the words it came from highlighted. The lens's other sources wait below, quieter. Click any sentence, or use the button.",
        "Restore the room's words": "Sentence 4 is in AI wording. Restore the room's words swaps it for the room's exact sentence in place, and its marker gains the quote mark. Try the button.",
        "A sentence with no source": "Sentence 7 has no phone sentence, scribe card or photo behind it. It's tinted Warning with a Warning marker, the panel says so, and Accept the lens waits until it's sourced, rewritten from the room's words or removed.",
        "Editing": "Edit makes the paragraph a text box with the focus ring. Markers stay attached to their sentences, and the other facilitator sees the lock.",
        "Locked by Jaisy": "Jaisy is editing Community, so it's read only here: her name and a lock in the head, a sunken paragraph, and every action waits.",
        "Lens reviewed": "Chris accepted the lens after restoring sentence 3's words and Jaisy removed sentence 7. It's marked Reviewed by Chris.",
        "Version history": "Every version is kept: the AI draft, each change with who made it and when, and Restore on any earlier one.",
        "Easel photo unreadable": "One easel page was too hard to read. It shows blurred in the sources with Type what it says, so the draft can use it.",
        "AI off": "No draft. The room's sentences sit on the right with Add to the paragraph; two have been added in their exact words, marked as the room's own.",
        "Very long text": "A 380-character sentence wraps in full with its marker at the end.",
        "Reduced motion": "Selecting a sentence lights its sources at once, with no slide or sweep."
      }[st];
    }
  });

  /* OVN-03 · publish the read-back */
  stateBoard({ id: "ovn-03", title: "Publish the read-back", ids: ["OVN-03", "PublishCheck"], theme: true,
    note: "A TV preview and a phone preview of the first lens, the checklist of lenses, outcomes and acknowledged flags, and Publish. Publishing makes the drafts the read-back. Nothing shows on the TV or phones until Chris goes live on the read-back in the morning. The previews keep their own theme inside the review page through the nesting guard; switch Navy and Off-White to check it.",
    states: ["Not ready", "Ready", "Published"],
    start: "Ready",
    make: function (ctx) {
      var r = row(ctx.stage, "is-1");
      ctx.a = app(r, "Overnight review · publish · data-surface=\"review\"", 1280, 800, "review");
    },
    draw: function (ctx, st) {
      var stt = st === "Not ready" ? "not-ready" : st === "Ready" ? "ready" : "published";
      reviewShell(ctx.a, "Publish the read-back", { left: '<div class="cwl-a-eyebrow">Read-back · Day 2 at 9:00</div><div class="cwl-a-title" style="font-size:var(--cwl-fs-app-page-title);font-weight:700">Publish the read-back</div>', right: P5.ReviewPresence([{ id: "cv", where: "Publish", you: true }, { id: "jt", where: stt === "not-ready" ? "Learning" : "the overview", editing: stt === "not-ready" }]) },
        '<div class="s5-pub"></div><div class="s5-foot cwl-a-row" style="margin-top:auto"></div>');
      P5.PublishCheck(ctx.a.querySelector(".s5-pub"), { state: stt, theme: ctx.theme });
      var foot = ctx.a.querySelector(".s5-foot");
      foot.innerHTML = stt === "published" ? '<div class="cwl-ovn-published">' + L("badge-check") + "Published at 8:42 pm by Chris. The read-back opens when Chris goes live on it on Day 2 at 9:00. Until then the TV and phones show nothing from it.</div>" + SB("Unpublish", "undo-2") :
        B("Publish the read-back", "is-confirm", "send", stt === "not-ready" ? " disabled" : "") + '<span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-table)">' + (stt === "not-ready" ? "Two sections to review and one flag to acknowledge." : "Every version stays. Day 2 corrections are tracked against this one.") + "</span>";
      CL.icons();
      return {
        "Not ready": "Publish waits: two sections unreviewed, Jaisy is still in Learning, and the thin-outcome flag hasn't been acknowledged.",
        "Ready": "Everything reviewed, the flag acknowledged, voices and tensions kept for the report. Publish is the page's one Lime moment.",
        "Published": "Published. The previews are what the room will see at 9:00, starting with Congregation. Nothing reaches the TV or phones until the session goes live."
      }[st];
    }
  });

  /* ================================================================
     PART · THE READ-BACK
     ================================================================ */
  part("part-readback", "The read-back: \"Did we hear you right?\"", "Day 2 at 9:00. The TV shows one lens at a time with a live tally; phones show the full draft with the team's own sentences underneath. The room decides by consensus: the tally shows where the room is and never settles a lens. The facilitator settles each lens when the room agrees, and corrections fold in as tracked changes once accepted.");

  var MISS_CROWD = S.missing.concat(["The Friday youth drop-in.", "Our English classes for newcomers.", "The community choir.", "Hosting the city's warming centre.", "The north end clean-up day.", "Tutoring at the library."]);
  var RB_STATES = ["Empty", "First tap", "The room all agreeing", "A split room", "A correction waiting", "A correction folded in", "Lens settled", "Next lens", "The close", "Crowded, 50 phones", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"];
  function rbData(st) {
    var s = stat(st), d = { lens: "community", settled: ["congregation"], states: {}, yes: 0, change: 0, of: 8, missing: [], queue: [], phone: { answer: null } };
    switch (st) {
      case "First tap": d.yes = 1; d.phone = { answer: "yes", sent: true }; break;
      case "The room all agreeing": d.yes = 8; d.phone = { answer: "yes", sent: true }; d.missing = S.missing.slice(1, 2); break;
      case "A split room": d.yes = 5; d.change = 3; d.missing = S.missing.slice(0, 2); d.phone = { answer: "change", change: S.corrections[0].phone }; break;
      case "A correction waiting": d.yes = 5; d.change = 3; d.missing = S.missing.slice(0, 3); d.queue = [{ c: S.corrections[0], state: "waiting" }]; d.phone = { answer: "change", change: S.corrections[0].phone, sent: true }; break;
      case "A correction folded in": case "AI off": case "Reduced motion": case "Offline and queued": case "Phones down":
        d.yes = 6; d.change = 2; d.missing = S.missing.slice(0, 3); d.states = { x1: "folded" }; d.queue = [{ c: S.corrections[0], state: "accepted" }, { c: S.corrections[1], state: "waiting" }]; d.phone = { answer: "change", change: S.corrections[0].phone, sent: true }; break;
      case "Lens settled": d.yes = 8; d.change = 0; d.missing = S.missing.slice(0, 3); d.states = { x1: "settled", x2: "settled" }; d.settled = ["congregation", "community"]; d.queue = [{ c: S.corrections[0], state: "accepted" }, { c: S.corrections[1], state: "accepted" }]; d.phone = { answer: "yes", sent: true }; break;
      case "Next lens": d.lens = "leadership"; d.settled = ["congregation", "community"]; d.phone = { answer: null }; break;
      case "The close": d.close = true; d.missing = S.missing.slice(1); break;
      case "Crowded, 50 phones": d.of = 50; d.yes = 41; d.change = 9; d.missing = MISS_CROWD; d.queue = [{ c: S.corrections[0], state: "waiting" }]; d.phone = { answer: "yes", sent: true }; break;
      case "Very long text": d.yes = 5; d.change = 3; d.missing = [S.missingLong].concat(S.missing.slice(0, 1)); d.long = true; d.phone = { answer: null }; break;
    }
    return d;
  }
  intBoard({ id: "d2-03", title: "The read-back", ids: ["D2-03", "D2-04", "INT-14", "ReadBackLens", "ReadBackPhone", "ReadBackTally", "MissingList", "TrackedChange", "CorrectionQueue", "LensProgress"], unit: "answered", phoneW: 470,
    note: "The TV shows one lens at a time: the lens progress, \"Community, " + Y.future + "\", the paragraph, the live tally and what's missing as it arrives. Phones show that lens's full draft with the team's source sentences underneath, then the two answers and \"What's missing?\". The scribe records the wording the room agrees and why, the facilitator accepts it on the control surface or the remote, and it folds into the paragraph as a tracked change. The facilitator settles the lens when the room agrees, then moves on. It closes by asking \"Did we hear you right?\" and \"What's missing?\".",
    states: RB_STATES, start: "A correction waiting",
    make: function (ctx) { return new P5.ReadBackLens(ctx.sh); },
    tv: function (ctx, st, inst) {
      var s = stat(st), d = rbData(st), rb = ctx.view;
      rb.o.long = !!d.long; if (d.long) rb.drawn = null;
      if (d.close) rb.set({ close: true, missing: d.missing, instant: inst });
      else { rb.set({ lens: d.lens, settled: d.settled, states: d.states, yes: d.yes, change: d.change, of: d.of, missing: d.missing, instant: inst }); rb.tallyTo(d.yes, d.change, { of: d.of, instant: true }); }
      ctx.sh.count(d.close ? 8 : d.yes + d.change, "answered", inst);
      if (!d.close && d.lens === "community" && !d.states.x1) ctx.button("Taps arrive", "hand", function () { var y = 0, c = 0, seq = ["y", "y", "c", "y", "y", "c", "y", "c"]; rb.tallyTo(0, 0, { of: 8, instant: true }); ctx.sh.count(0, "answered", true); seq.forEach(function (k, i) { CL.later(function () { if (k === "y") y++; else c++; rb.tallyTo(y, c, { of: 8 }); ctx.sh.count(y + c, "answered"); }, 300 + i * 420); }); });
      if (st === "A correction waiting" || st === "A split room") ctx.button("Accept and fold in the correction", "check", function () { rb.fold("x1"); ctx.queue([{ c: S.corrections[0], state: "accepted" }]); });
      if (/folded|AI off|Reduced/.test(st)) ctx.button("Accept the second correction", "check", function () { rb.fold("x2"); ctx.queue([{ c: S.corrections[0], state: "accepted" }, { c: S.corrections[1], state: "accepted" }]); });
      if (st === "Lens settled" || /folded/.test(st)) ctx.button("Settle the lens, then the next lens", "skip-forward", function () { if (rb.settled.indexOf("community") < 0) { rb.settle(); CL.later(function () { rb.next("leadership"); ctx.sh.count(0, "answered"); }, 2400); } else { rb.next("leadership"); ctx.sh.count(0, "answered"); } });
      if (!d.close) ctx.button("What's missing arrives", "message-square-plus", function () { var list = (d.missing || []).slice(); var add = S.missing.filter(function (m) { return list.indexOf(m) < 0; })[0] || "The arts night at the community centre."; list.unshift(add); d.missing = list; rb.ml.set(list, { newest: add, max: 2, always: true }); });
      return {
        "Empty": "Community is on the TV with Congregation settled. No taps yet: the bars wait at zero and \"What's missing?\" says answers appear as they're sent.",
        "First tap": "The first \"Yes, that's us\" grows its bar from zero and the count ticks. Use Taps arrive to watch eight land.",
        "The room all agreeing": "All eight say \"Yes, that's us\". The bars show where the room is; the lens still waits for the facilitator to settle it.",
        "A split room": "Five and three. The bars carry no leader color: the tally shows where the room is and never decides. Chris draws the conversation out.",
        "A correction waiting": "The scribe has sent the wording the room agreed (\"All four\" for \"Two\") with the reason. It waits on the control surface and the remote. Accept it to watch it fold in.",
        "A correction folded in": "Accepted: \"Two\" was struck and left, \"All four\" arrived underlined, and the paragraph reflowed around it. The second correction, a sentence from What's missing, waits.",
        "Lens settled": "Chris settled Community when the room agreed: a Lime sweep crossed the lens in the progress once, then it took its check. The changes are now part of the paragraph.",
        "Next lens": "Leadership is on: the settled lens keeps its check, the progress moved on, and the bars start again from zero.",
        "The close": "All five lenses settled. The TV asks \"Did we hear you right?\" with \"What's missing?\" answers arriving underneath.",
        "Crowded, 50 phones": "Fifty phones: 41 and 9. The four newest missing answers show, with the rest counted on phones.",
        "Offline and queued": "The TV holds its last state with the gray breathing mark. Phones keep their answers and send them in order when it reconnects.",
        "Phones down": "Phones down for the conversation: the tally holds still and phones dim with their answer.",
        "AI off": "With AI off, an accepted correction goes in exactly as the scribe wrote it. Folding, the tally and settling are unchanged.",
        "Reduced motion": "The struck words leave and the new ones appear at once, underlined. The bars and the settle mark change in place.",
        "Very long text": "A long lens paragraph steps down to the TV floor size so it still fits; a long missing answer wraps on its card."
      }[st];
    },
    phones: function (st, ctx) {
      var s = stat(st), d = rbData(st), ph = d.phone || {};
      if (d.close) return [{ label: "Phone · the close", render: function (p) { P5.ReadBackPhone(p, { close: true, missing: "Prayer walks on the street.", settled: S.lensOrder }); } }];
      var list = [{ label: "Phone · " + (ph.answer === "change" ? "it needs a change" : ph.sent ? "answered" : "reading"), render: function (p) { P5.ReadBackPhone(p, { lens: d.lens, states: d.states, settled: d.settled, answer: ph.answer, change: ph.change, sent: ph.sent, down: s.down, offline: s.offline, long: d.long, showTeam: ph.answer !== "change", showMissing: !ph.answer, teamMax: 2 }); } }];
      list.push({ label: "Phone · looking back", cap: "Settled lenses can be read again. Never ahead of the TV.", render: function (p) { P5.ReadBackPhone(p, { lens: "congregation", look: true, current: d.lens, settled: d.settled, teamMax: 2 }); } });
      return list;
    },
    control: function (a, st, ctx) {
      var s = stat(st), d = rbData(st), l = P4.lensByKey(d.lens || "community");
      var tally = d.close ? "" : '<div class="p3-meter"><div><b>' + d.yes + "</b><span>Yes, that's us</span></div><div><b>" + d.change + "</b><span>It needs a change</span></div><div><b>" + (d.of - d.yes - d.change) + "</b><span>Not yet</span></div></div>";
      P4.ctl(a, { part: "Day 2", title: d.close ? "Read-back: the close" : P4.ctlLens(d.lens) + " &nbsp;Read-back: " + esc(l.name) + ", " + Y.future, chips: [s.down ? CHIP("Phones down", "", "smartphone") : CHIP("Live", "run-live", "radio"), CHIP((d.settled || []).length + " of 5 settled", "is-outline", "check")],
        sync: s.offline ? SYNC("", "monitor-off", "TV reconnecting") : SYNC("", "check", "On the TV now"), banner: s.offline ? BAN("warning", "triangle-alert", "<strong>TV reconnecting.</strong> It's holding the last screen and will catch up in one pass.") : "",
        tools: d.close ? [SB("Go to Confirm the Vision Outcomes", "skip-forward", "is-primary")] : [B("Settle the lens", "is-confirm is-sm", "check", (d.settled || []).indexOf(d.lens) >= 0 ? " disabled" : ""), SB("Next lens", "chevron-right"), SB("Phones down", "smartphone")], meter: null,
        listTitle: d.close ? "What's missing" : "Corrections from the scribe", listNote: d.close ? "Anonymous" : (s.ai ? "Folded in as tracked changes once you accept" : "AI off · goes in as written"),
        main: '<div class="p3-items" style="padding:0;background:none;border:0"><div class="s5-queue"></div></div><div class="cwl-a-label" style="margin-top:12px">Where the room is</div>' + tally + '<div class="cwl-a-label" style="margin-top:12px">Lens progress</div><div style="margin-top:6px">' + P5.LensProgress(d.close ? null : d.lens, d.close ? S.lensOrder : d.settled) + "</div>",
        side: PRIVATE("What's missing", '<div class="s5-ml"></div>') + P4.notes("Read the lens aloud first. Ask \"Did we hear you right?\" Let the room talk. Settle only when the room agrees. The tally is a guide, not the decision.") });
      var qh = a.querySelector(".s5-queue");
      ctx.queue = function (list) { qh.innerHTML = d.close ? '<div class="cwl-a-muted">All five lenses settled.</div>' : P5.CorrectionQueue(list, { ai: s.ai }); CL.icons(); };
      ctx.queue(d.queue);
      var ml = new P5.MissingList(a.querySelector(".s5-ml")); ml.set(d.missing, { max: 6, always: true, sub: d.missing.length ? "" : "None yet" });
      if (d.close) qh.innerHTML = '<div class="cwl-ml">' + d.missing.map(function (m) { return '<div class="cwl-ml-i">' + esc(m) + "</div>"; }).join("") + "</div>";
      CL.icons();
    },
    remote: function (box, st) {
      var d = rbData(st), l = P4.lensByKey(d.lens || "community");
      P4.remote(box, { title: d.close ? "Read-back: the close" : "Read-back: " + l.name, top: d.close ? "" : '<div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-label">' + d.yes + " yes · " + d.change + " change</span></div>" + P5.CorrectionQueue(d.queue.filter(function (x) { return x.state === "waiting"; }), {}),
        buttons: d.close ? P4.rbtn("Next session", "chevron-right", "is-primary") : P4.rbtn("Settle the lens", "check", "is-live") + '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next lens", "chevron-right") + "</div>" });
    },
    extra: function (r, st) {
      var d = rbData(st);
      var a = app(r, "Scribe console · Day 2 read-back · the correction composer", 1280, 520, "scribe");
      var con = new P5.ScribeConsole(a, { day: "Day 2" });
      con.header({ session: "Read-back" });
      con.composer({ correction: { lens: P4.lensByKey(d.lens || "community").name + ", " + Y.future, wording: st === "A split room" ? "All four north end schools count us as partners." : "", why: st === "A split room" ? S.corrections[0].reason : "" } });
      var cards = d.queue.map(function (q, i) { return { id: "cx" + i, kind: "correction", time: "9:1" + (4 + i), text: q.c.del ? "All four north end schools count us as partners." : q.c.ins.trim(), why: q.c.reason }; }).reverse();
      con.cards(cards, { instant: true, note: "Sent to Chris" });
      con.photos([], { instant: true });
    }
  });

  CL.icons();
})();
