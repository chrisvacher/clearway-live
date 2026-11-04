/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 4 · screens4.js
   Boards for milestone 4: the Wayfinding session tools. Each interaction
   board keeps one persistent TV that moves between its states without
   redrawing; phones, the remote and the control surface show the state.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P3 = window.ClearwayLivePass3, P4 = window.ClearwayLivePass4, W = window.ClearwayLivePass4Data, D3 = window.ClearwayLivePass3Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide, PH = P4.PH, B = P4.B, CHIP = P4.CHIP, BAN = P4.BAN, SYNC = P4.SYNC, FLAG = P4.FLAG, PRIVATE = P4.PRIVATE, item = P4.item, IB = P4.IB, SB = P4.SB;
  var host = document.getElementById("boards");
  var Y = W.Y;
  var BASE = ["Empty", "First item", "Typical", "Crowded, 50 phones", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"];
  function clone(a) { return JSON.parse(JSON.stringify(a)); }
  function later(fn, t) { return CL.later(fn, t); }

  /* ---------- Scaffolding (matches the pass 3 review page) ---------- */
  function board(id, title, ids, note, parent) {
    var s = h("section", "sc-board"); s.id = id;
    s.innerHTML = '<header class="sc-head"><div><div class="sc-ids"></div><h2></h2></div></header><p class="sc-note"></p><div class="sc-body"></div>';
    s.querySelector("h2").textContent = title;
    s.querySelector(".sc-ids").innerHTML = ids.map(function (x) { return '<span class="sc-id">' + esc(x) + "</span>"; }).join("");
    s.querySelector(".sc-note").textContent = note || "";
    if (!note) s.querySelector(".sc-note").remove();
    (parent || host).appendChild(s);
    var nav = document.getElementById("toc");
    if (nav) { var a = h("a"); a.href = "#" + id; a.textContent = ids[0] && /^[A-Z0-9]+-\d/.test(ids[0]) ? ids[0] + " " + title : title; nav.appendChild(a); }
    return s.querySelector(".sc-body");
  }
  function part(id, title, note) {
    var s = h("div", "p4-part"); s.id = id; s.innerHTML = '<div class="sc-eyebrow"></div><h2></h2>' + (note ? "<p></p>" : "");
    s.querySelector(".sc-eyebrow").textContent = "Part"; s.querySelector("h2").textContent = title; if (note) s.querySelector("p").textContent = note;
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
  function stat(st) { return { offline: st === "Offline and queued", down: st === "Phones down", reduced: st === "Reduced motion", ai: st !== "AI off", crowded: /Crowded/.test(st), long: st === "Very long text" }; }
  function phoneOpts(st, extra) { var s = stat(st), o = { head: s.offline ? "offline" : s.down ? "down" : "live", dim: s.down, motion: s.reduced ? "reduced" : null }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
  function syncFor(st) { return st === "Offline and queued" ? SYNC("", "monitor-off", "TV reconnecting") : SYNC("", "check", "On the TV now"); }
  function bannerFor(st) { return st === "Offline and queued" ? BAN("warning", "triangle-alert", "<strong>TV reconnecting.</strong> It's holding the last screen and will catch up in one pass. Phones are saving answers and will send them in order.") : ""; }
  function liveChips(st, burst) {
    return [st === "Phones down" ? CHIP("Phones down", "", "smartphone") : CHIP("Live", "run-live", "radio"), st === "Phones down" ? CHIP("Draft answers kept", "is-outline", "pencil-line") : CHIP(burst || "Burst 2:41 left", "is-outline", "timer")];
  }

  /* ================================================================
     The interaction board: one persistent TV, phones, the control
     surface and the remote. spec.tv(ctx, state) moves the TV.
     ================================================================ */
  function intBoard(spec) {
    var b = board(spec.id, spec.title, spec.ids, spec.note);
    var bar = h("div", "cwl-a-row"); bar.style.cssText = "justify-content:space-between;align-items:flex-start;gap:12px";
    var tabs = h("div", "cwl-tabs sc-tabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", spec.title + " states");
    var right = h("div", "cwl-a-row"); right.setAttribute("data-surface", "setup"); right.setAttribute("data-theme", "light"); right.style.flexWrap = "nowrap";
    right.innerHTML = spec.noTheme ? "" : seg(["Navy", "Off-White"], 0, "p3-theme");
    bar.appendChild(tabs); bar.appendChild(right); b.appendChild(bar);
    var cap = h("p", "sc-note"); cap.setAttribute("aria-live", "polite"); b.appendChild(cap);
    var acts = h("div", "sc-actions"); acts.setAttribute("data-surface", "setup"); acts.setAttribute("data-theme", "light"); b.appendChild(acts);
    var r1 = row(b, "is-tv1"); r1.style.gridTemplateColumns = "minmax(0, 1fr) " + (spec.phoneW || 440) + "px";
    var tvBox = frame(r1, spec.tvLabel || "TV · 1920 by 1080", "is-tv");
    var phWrap = h("div", "sc-row is-phones"); phWrap.style.gridTemplateColumns = "repeat(auto-fill, minmax(200px, 1fr))"; r1.appendChild(phWrap);
    var r2 = row(b, "is-1"); r2.style.gridTemplateColumns = spec.remote ? "minmax(0, 1fr) 220px" : "minmax(0, 1fr)";
    var ctx = { theme: "dark", state: null, spec: spec, acts: acts };
    function build() {
      tvBox.innerHTML = ""; tvBox.className = "sc-box";
      ctx.sh = P4.shell(tvBox, { theme: ctx.theme, eyebrow: spec.eyebrow || "", headline: spec.headline || "", unit: spec.unit || "answers", tally: spec.tally, lens: spec.lens });
      ctx.view = spec.make ? spec.make(ctx) : null;
    }
    function select(state, instant) {
      CL.clearTimers();
      ctx.state = state;
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.textContent === state ? "true" : "false"); });
      var tv = ctx.sh.tv, s = stat(state);
      tv.setAttribute("data-motion", s.reduced ? "reduced" : "full");
      ctx.sh.state({ offline: s.offline, down: s.down, closed: spec.closedIn && spec.closedIn(state) });
      ctx.sh.foot("");
      acts.innerHTML = "";
      cap.textContent = spec.tv(ctx, state, !!instant) || "";
      phWrap.innerHTML = "";
      (spec.phones ? spec.phones(state, ctx) : []).forEach(function (p) {
        var box = frame(phWrap, p.label, "is-phone", p.cap);
        var ph = P4.phone(box, p.o || phoneOpts(state));
        p.render(ph);
      });
      r2.innerHTML = "";
      if (spec.control) { var a = app(r2, spec.ctlLabel || "Control surface · facilitator view", 1280, spec.ctlH || 560, "control"); spec.control(a, state, ctx); }
      if (spec.remote) { var rbox = frame(r2, spec.remoteLabel || "Remote", "is-phone"); spec.remote(rbox, state, ctx); }
      CL.icons();
    }
    (spec.states || BASE).forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.setAttribute("role", "tab"); t.textContent = s; t.onclick = function () { select(s); }; tabs.appendChild(t); });
    right.querySelectorAll(".p3-theme span").forEach(function (sp, i) {
      sp.onclick = function () { right.querySelectorAll(".p3-theme span").forEach(function (x, j) { x.classList.toggle("is-on", i === j); x.setAttribute("aria-pressed", i === j); }); ctx.theme = i ? "light" : "dark"; build(); select(ctx.state, true); };
    });
    ctx.button = function (label, icon, fn) { var x = h("button", "cwl-a-btn is-secondary"); x.type = "button"; x.innerHTML = L(icon) + "<span>" + esc(label) + "</span>"; x.onclick = fn; acts.appendChild(x); CL.icons(); };
    build();
    requestAnimationFrame(function () { requestAnimationFrame(function () { select(spec.start || (spec.states || BASE)[2], true); }); });
    return ctx;
  }

  /* ================================================================
     MILESTONE 4 DECISIONS: confirmed by Chris on November 3
     ================================================================ */
  (function () {
    var b = board("decisions", "Milestone 4 decisions", ["Decided"], "Chris confirmed these five on November 3. Every screen below is built to them.");
    var DEC = [
      ["Pre-work before the pre-call", "Start with the pre-call. The invite email signs people in and nothing more. Celebrations and success measures start live in the call (PRE-06, PRE-07), from options the facilitator curates in setup.", "Adds a self-paced session reached from the invite email, open until the pre-call: one celebration sentence and a first ranking of success measures. PRE-06 opens with their celebration wall already on the TV, PRE-07 starts from their ranking, and the invite email gains one line about it. No new interaction is needed."],
      ["Seeded lens sentences", "Hidden from everyone, the control surface included, until each lens opens. The facilitator sees only how many people have seeded each lens (PRE-10, D1-06).", "The control surface gains a private 'Seeded so far' panel per lens with the sentences themselves, under the 'only you see this' band, so the facilitator can prepare. The TV and phones are unchanged, and seeded sentences still reach the TV only when the lens opens."],
      ["A current-reality line per Vision Outcome", "Left out. The 3-year Vision and the 1-year Outlook run as designed, with current reality living in What We Heard.", "Each Vision Outcome gains a 'Today' line drawn from Discover (typed by hand until milestone 6), shown above the bullets on D1-11 and on the left of the goal builder (D2-09) with its source. It adds one field to the outcome and one row to the report's 3-year Vision."],
      ["This Year's Priorities", "Left for the church's Annual Planning. The draft Map shows the field as empty with 'Left for Annual Planning' (D2-15).", "Adds a 20-minute session after the 1-year Outlook (D2-10a): a ranking of candidate Annual Initiators drawn from the goals, with the facilitator marking three to five. The Map field fills from it, and the run of show moves lunch to 12:35."],
      ["The day-and-a-half follow-up session", "On video, within two weeks of the half day. A team facilitator holds the remote and shares the TV view in the call, as the pre-call does. Pre-mortem, commander's intent and affirming the cards move there (SET-08).", "In person: the room's TV is paired again for the follow-up, and nothing else changes. Either way, risk links on goals are added after the pre-mortem, and commander's intent publishes as a second, additive publish to CORE."]
    ];
    var g = h("div", "p4-dec");
    g.innerHTML = DEC.map(function (d) { return "<article><h3>" + esc(d[0]) + '</h3><div class="lbl">Decided November 3</div><p class="def">' + esc(d[1]) + "</p></article>"; }).join("");
    b.appendChild(g);
  })();

  /* ================================================================
     LENS IDENTITY · D1-05 lens title card, the five icons on every surface
     ================================================================ */
  (function () {
    var b = board("lens-identity", "Lens identity and the lens title card", ["D1-05", "LensIcon", "LensHeading"], "The Five Lenses share one lens color (Royal) and are told apart by name and icon. The five icons are drawn for Clearway Live on a 24px grid with 2px round strokes, so they sit beside Lucide. Below 20px a lens chip uses cwl-lens-small (Deeper Royal), because Off-White on Royal passes for large text only.");
    var sheet = h("div", "cwl-wf-iconsheet");
    var notes = { congregation: "People gathered", community: "Two houses on one street", leadership: "A flag on the summit", operations: "Connected parts of one system", learning: "An open book with a new shoot" };
    sheet.innerHTML = W.lenses.map(function (l) { return '<figure><span class="grid24">' + P4.lensIcon(l.key, "big") + '</span><figcaption>' + esc(l.name) + "<small>" + esc(notes[l.key]) + '</small></figcaption><div class="cwl-wf-iconsizes">' + [16, 20, 24, 32].map(function (s) { return '<span style="font-size:' + s + 'px;display:inline-flex">' + P4.lensIcon(l.key) + "</span>"; }).join("") + "</div></figure>"; }).join("");
    sheet.querySelectorAll(".grid24 svg").forEach(function (s) { s.style.width = "96px"; s.style.height = "96px"; });
    b.appendChild(sheet);
    var tabs = h("div", "cwl-tabs sc-tabs"); b.appendChild(tabs);
    var r = row(b, "is-tv1"); r.style.gridTemplateColumns = "minmax(0, 1fr) 440px";
    var tvBox = frame(r, "TV · lens title card (section opener)", "is-tv");
    var side = h("div", "sc-row is-phones"); side.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))"; r.appendChild(side);
    var r2 = row(b, "is-1"); r2.style.gridTemplateColumns = "minmax(0, 1fr) 220px";
    var STATES = W.lenses.map(function (l) { return l.name; }).concat(["Customer (setting)", "Very long text", "Off-White screen"]);
    var tv = CL.stage(tvBox, "dark");
    function draw(s) {
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.textContent === s ? "true" : "false"); });
      var l = W.lenses.filter(function (x) { return x.name === s; })[0] || W.lenses[0];
      var name = s === "Customer (setting)" ? "Customer" : s === "Very long text" ? "Congregation and the people who call Riverside home" : l.name;
      tv.innerHTML = ""; tv.setAttribute("data-theme", s === "Off-White screen" ? "light" : "dark"); CL.screenTexture(tv, "opener");
      var top = h("div", "cwl-tv-top"); top.innerHTML = window.ClearwayLivePass2.lockup() + "<span></span>"; tv.appendChild(top);
      var c = h("div", "cwl-tv-content"); tv.appendChild(c);
      var promptName = { key: l.key, name: name };
      c.innerHTML = '<div style="margin:auto 0"><div class="cwl-tv-eyebrow">Five Lenses · Day 1 · ' + (W.lenses.indexOf(l) + 1) + ' of 5</div><div style="margin-top:28px"><span class="cwl-lens" style="font-size:var(--cwl-fs-tv-headline-xl)">' + P4.lensIcon(l.key) + " " + esc(name) + '</span></div><div class="cwl-tv-headline" style="margin-top:44px">' + W.lensPrompt(promptName) + "</div></div>";
      side.innerHTML = "";
      var ph = P4.phone(frame(side, "Phone · waiting", "is-phone"), { waiting: true, head: "none" });
      ph.body.innerHTML = '<div class="cwl-ph-muted">Five Lenses · ' + Y.future + '</div><div class="cwl-wf-ph-lens">' + P4.lensChip(l.key, name) + '</div><div class="cwl-ph-headline">Up next</div><div class="cwl-ph-text">' + esc(W.lensPromptPlain(promptName)) + "</div>";
      var rb = frame(side, "Lens chips at phone size");
      rb.innerHTML = '<div data-surface="phone" data-theme="dark" style="background:var(--cwl-surface);padding:14px;border-radius:12px;display:flex;flex-wrap:wrap;gap:8px;font-size:14px">' + W.lenses.map(function (x) { return P4.lensChip(x.key); }).join("") + '</div><div data-surface="phone" data-theme="light" style="background:var(--cwl-surface);padding:14px;border-radius:12px;display:flex;flex-wrap:wrap;gap:8px;font-size:14px;margin-top:8px">' + W.lenses.map(function (x) { return P4.lensDot(x.key); }).join("") + "</div>";
      r2.innerHTML = "";
      var a = app(r2, "Control surface · run of show and report line", 1280, 340, "control");
      a.innerHTML = '<div class="cwl-a-pad" style="gap:12px"><div class="cwl-a-label">Day 1 · Five Lenses</div><div class="p3-items">' + W.lenses.map(function (x, i) { return item(i + 1, P4.ctlLens(x.key) + " &nbsp;" + esc(W.lensPromptPlain(x)), "Lens wall · seeded from the pre-call", [CHIP(i === 0 ? "Live" : "Ready", i === 0 ? "run-live" : "run-ready", i === 0 ? "radio" : "circle-check")]); }).join("") + '</div><div class="cwl-a-muted">In the report and the Clearway Map, each lens line starts with the same icon at text size.</div></div>';
      var rm = P4.remote(frame(r2, "Remote", "is-phone"), { title: "Five Lenses: " + name, top: '<div class="cwl-a-row">' + P4.ctlLens(l.key) + "</div>", buttons: '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" + P4.rbtn("Go live", "play", "is-live") });
      CL.icons();
    }
    STATES.forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.textContent = s; t.onclick = function () { draw(s); }; tabs.appendChild(t); });
    requestAnimationFrame(function () { draw("Congregation"); });
  })();

  /* ================================================================
     PRE-CALL
     ================================================================ */
  part("part-pre", "Pre-call · 90 minutes on video", "The facilitator shares the TV view in the call and runs everything from the control surface. Decided: no pre-work before the call.");

  /* PRE-06: welcome, prayer and celebrations */
  (function () {
    var b = board("pre-06", "Welcome, prayer and celebrations", ["PRE-06"], "The shared TV view opens on Scripture with the join link along the edge, so people sign in on their phones while the call opens in prayer. They stay signed in for the retreat. Celebrations then run as the pass 3 word cloud and wall.");
    var r = row(b, "is-tv1"); r.style.gridTemplateColumns = "minmax(0, 1fr) 440px";
    var tv = CL.stage(frame(r, "TV view, shared in the call", "is-tv"), "dark");
    CL.screenTexture(tv, "content");
    var top = h("div", "cwl-tv-top"); top.innerHTML = window.ClearwayLivePass2.lockup() + "<span></span>"; tv.appendChild(top);
    var c = h("div", "cwl-tv-content"); tv.appendChild(c);
    var p = W.passages.precall;
    c.innerHTML = '<div style="margin:auto 0;max-width:1500px"><div class="cwl-scripture" style="font-size:var(--cwl-fs-tv-body);font-weight:300;line-height:1.3">' + esc(p.text.split(p.bold)[0]) + "<strong>" + esc(p.bold) + "</strong>" + esc(p.text.split(p.bold)[1] || "") + '</div><div class="cwl-scripture-ref" style="font-size:var(--cwl-fs-tv-main);color:var(--cwl-text)">' + p.ref + ' <span style="font-size:var(--cwl-fs-tv-floor);letter-spacing:0.12em;text-transform:uppercase;color:var(--cwl-text-muted);margin-left:24px">' + p.tr + "</span></div></div>";
    var strip = h("div", "cwl-join-strip"); strip.innerHTML = '<span class="cwl-qr"></span><span><b>live.clearway.co/riverside</b><br><span style="color:var(--cwl-text-muted)">Join on your phone</span></span>'; tv.appendChild(strip);
    CL.qr(strip.querySelector(".cwl-qr"), "https://live.clearway.co/riverside");
    var ps = h("div", "sc-row is-phones"); ps.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))"; r.appendChild(ps);
    var a1 = P4.phone(frame(ps, "Phone · signing in", "is-phone"), { head: "none" });
    a1.body.innerHTML = '<div class="cwl-ph-headline">You\'re invited to Riverside\'s Wayfinding</div><div class="cwl-ph-text">Enter your email and we\'ll send a sign-in code. You\'ll stay signed in for the retreat.</div><input class="cwl-ph-input" value="tasha@riverside.church" tabindex="-1">';
    a1.foot.innerHTML = PH.btn("Send me a sign-in code", { icon: "mail" });
    var a2 = P4.phone(frame(ps, "Phone · signed in", "is-phone"), { waiting: true, head: "none" });
    a2.body.innerHTML = '<div class="cwl-ph-headline" style="margin-top:auto">You\'re in</div><div class="cwl-ph-text">Riverside Church · Wayfinding pre-call. Keep this open, the questions come here.</div>';
    var r2 = row(b, "is-1");
    var a = app(r2, "Control surface · pre-call run of show", 1280, 360, "control");
    P4.ctl(a, { part: "Pre-call", title: "Welcome and prayer", chips: [CHIP("Live", "run-live", "radio"), CHIP("Join strip on", "is-outline", "qr-code")], listTitle: "Pre-call", listNote: "90 minutes",
      items: [item("0:00", "Welcome and prayer", "Scripture, then join", [CHIP("Live", "run-live", "radio")]), item("0:10", "Celebrations", "Word cloud, then open text wall", [CHIP("Ready", "run-ready", "circle-check")]), item("0:25", "Metrics", "Ranking with add an option", [CHIP("Ready", "run-ready", "circle-check")]), item("0:40", "What we heard", "Headlines, then Q&A", [CHIP("Ready", "run-ready", "circle-check")]), item("1:10", "Seed the Five Lenses", "Self-paced until Day 1", [CHIP("Ready", "run-ready", "circle-check")])],
      side: P4.roomPanel([[6, "signed in"], [8, "invited"]]) + P4.notes("Share the TV view in the call, not this screen. Pray, then give the link a minute.") });
  })();

  /* PRE-07: metrics ranking */
  intBoard({ id: "pre-07", title: "Metrics: rank the success measures", ids: ["PRE-07", "INT-06"], eyebrow: "Metrics", headline: "Which measures will tell us <strong>we're getting there?</strong>", unit: "ranking",
    note: "The options are curated in setup from Discover input (Default). The room ranks them and can suggest a missing one, which lands as a new bar. Lands in the 3-year Vision as the success measures the team ranked.",
    states: ["Empty", "First item", "Typical", "Option added", "Crowded, 50 phones", "Offline and queued", "Phones down", "Reduced motion", "Very long text"],
    make: function (ctx) { return new P3.Bars(ctx.sh.host, { place: true, valueW: 240, labelW: 700 }); },
    tv: function (ctx, st, inst) {
      var opts = W.measures.slice(0, 6), rk = W.measureRank;
      if (st === "Empty") rk = []; if (st === "First item") rk = [rk[0]];
      if (st === "Option added") { opts = W.measures.slice(0, 7); rk = rk.concat([[6, 0, 2], [6, 1]]); }
      if (/Crowded/.test(st)) { var x = []; for (var i = 0; i < 50; i++) x.push(rk[i % rk.length]); rk = x; }
      if (st === "Very long text") opts = opts.map(function (o, i) { return i === 1 ? "People in a group that meets in a home at least twice a month" : o; });
      ctx.view.set(P3.rankItems(opts, rk), { instant: inst });
      ctx.sh.count(rk.length, "ranking", inst);
      return { "Option added": "A suggested measure joins as a new bar and the others make room.", "Empty": "Empty tracks wait in place." }[st] || "";
    },
    phones: function (st) { return [{ label: "Phone · ranking", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-prompt">Which measures will tell us we\'re getting there?</div><div class="cwl-wf-ph-list">' + W.measures.slice(0, 5).map(function (m, i) { return '<div class="cwl-wf-ph-item"><span>' + (i + 1) + ". " + esc(m) + '</span><span class="acts"><span>' + L("grip-vertical") + "</span></span></div>"; }).join("") + '</div><div class="cwl-ph-muted">' + L("plus") + " Suggest a missing measure</div>"; p.foot.innerHTML = PH.btn(st === "Offline and queued" ? "Saved on this phone" : "Send my ranking"); } }]; },
    control: function (a, st) { P4.ctl(a, { part: "Pre-call", title: "Metrics", chips: liveChips(st), sync: syncFor(st), banner: bannerFor(st), listTitle: "Options", listNote: "Curated in setup", tools: [SB("Add an option", "plus"), SB("Start burst", "timer", "is-primary")],
      items: W.measures.slice(0, 7).map(function (m, i) { return item(i + 1, esc(m), i === 6 ? "Suggested by the room · accepted" : "From Discover input", [P4.IB("eye-off", "Hide from the TV")]); }), side: P4.roomPanel([[st === "Empty" ? 0 : 7, "ranked"], [8, "signed in"]]) + P4.SIGNAL_SLOT }); }
  });

  /* PRE-08 and PRE-09: what we heard, headlines typed by hand, then Q&A */
  (function () {
    var b = board("pre-08", "What we heard, then questions", ["PRE-08", "PRE-09", "INT-03"], "Until Discover arrives in milestone 6, What We Heard headlines are typed in by hand on the control surface: a number, the headline and its source. Thin data says so on the TV and phones. Q&A follows as the pass 3 rows.");
    var r = row(b, "is-tv1"); r.style.gridTemplateColumns = "minmax(0, 1fr) 440px";
    var tv = CL.stage(frame(r, "TV · headline with depth (PRE-08)", "is-tv"), "dark");
    CL.screenTexture(tv, "content");
    var top = h("div", "cwl-tv-top"); top.innerHTML = window.ClearwayLivePass2.lockup() + "<span></span>"; tv.appendChild(top);
    var c = h("div", "cwl-tv-content"); tv.appendChild(c);
    var hd = W.headlines[1];
    c.innerHTML = '<div class="cwl-tv-eyebrow">What we heard · 2 of 3</div><div style="margin:auto 0"><div class="cwl-big-number" style="font-size:var(--cwl-fs-tv-display);font-weight:700;line-height:1">' + hd.n + '</div><div class="cwl-tv-headline" style="margin-top:24px">' + hd.text + '</div><div style="display:flex;gap:24px;align-items:center;font-size:var(--cwl-fs-tv-floor);font-weight:700;color:var(--cwl-text-muted)"><span class="cwl-marker">' + L("circle-dashed") + " Thin data</span>" + esc(hd.src.split(" · ")[0]) + "</div></div>";
    var ps = h("div", "sc-row is-phones"); ps.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))"; r.appendChild(ps);
    var p1 = P4.phone(frame(ps, "Phone · the depth", "is-phone"), { head: "live" });
    p1.body.innerHTML = '<div class="cwl-ph-muted">What we heard · 2 of 3</div><div class="cwl-ph-headline">6 of 87 survey answers came from people under 30</div><div><span class="cwl-marker">' + L("circle-dashed") + ' Thin data</span></div><div class="cwl-ph-text">Read this one carefully. Six answers can\'t speak for every young adult at Riverside.</div><div class="cwl-ph-muted">Source: congregational survey, October 2026</div>';
    var p2 = P4.phone(frame(ps, "Phone · Q&A (PRE-09)", "is-phone"), { head: "live" });
    p2.body.innerHTML = '<div class="cwl-ph-prompt">What do you want to ask about the results?</div>' + PH.input("Did anyone under 30 mention Sunday times?") + PH.anon();
    p2.foot.innerHTML = PH.btn("Ask");
    var r2 = row(b, "is-1");
    var a = app(r2, "Control surface · headlines typed by hand (PRE-08)", 1280, 440, "control");
    P4.ctl(a, { part: "Pre-call", title: "What we heard", chips: [CHIP("Live", "run-live", "radio"), CHIP("Typed by hand", "is-outline", "keyboard")], listTitle: "Headlines", listNote: "Discover data arrives in milestone 6",
      main: '<div class="p3-items">' + W.headlines.map(function (x, i) { return item(i + 1, '<span class="tnum">' + x.n + "</span> &nbsp;" + x.text.replace(/<[^>]+>/g, ""), esc(x.src) + (x.thin ? " · " + FLAG("Thin data") : ""), [i === 1 ? CHIP("On the TV", "run-live", "radio") : SB("Show", "play"), P4.IB("pencil", "Edit")]); }).join("") + '</div><div class="cwl-a-card" style="padding:14px;display:grid;grid-template-columns:120px 1fr 1fr auto;gap:10px;align-items:end"><div class="cwl-a-field"><label class="cwl-a-flabel">Number</label><input class="cwl-a-input" value="3 of 4"></div><div class="cwl-a-field"><label class="cwl-a-flabel">Headline</label><input class="cwl-a-input" value="staff interviews named unclear ownership as the biggest frustration"></div><div class="cwl-a-field"><label class="cwl-a-flabel">Source</label><input class="cwl-a-input" value="Leadership interviews · 4 conversations"></div>' + B("Save", "is-primary", "check") + "</div>",
      side: P4.SIGNAL_SLOT + P4.notes("Thin data: name it out loud. Then open questions.") });
  })();

  /* PRE-10 and PRE-11: seed the Five Lenses */
  (function () {
    var b = board("pre-10", "Seed the Five Lenses", ["PRE-10", "PRE-11", "INT-12"], "Seeding opens on the pre-call and stays open on phones until Day 1. Sentences stay hidden from everyone, the control surface included, until each lens opens (Decided). Anyone who missed the call watches the recording and seeds afterward from the same link.");
    var r = row(b, "is-tv1"); r.style.gridTemplateColumns = "minmax(0, 1fr) 440px";
    var tv = CL.stage(frame(r, "TV view, shared in the call (PRE-10)", "is-tv"), "dark");
    CL.screenTexture(tv, "opener");
    var top = h("div", "cwl-tv-top"); top.innerHTML = window.ClearwayLivePass2.lockup() + "<span></span>"; tv.appendChild(top);
    var c = h("div", "cwl-tv-content"); tv.appendChild(c);
    c.innerHTML = '<div class="cwl-tv-eyebrow">The 10-year Future · ' + Y.future + '</div><div class="cwl-tv-headline">It\'s ' + Y.future + '. <strong>Describe Riverside</strong> through five lenses.</div><div style="display:flex;flex-wrap:wrap;justify-content:center;gap:24px">' + W.lenses.map(function (l) { return P4.lensHeading(l.key).replace('class="cwl-lens"', 'class="cwl-lens" style="font-size:var(--cwl-fs-tv-body)"'); }).join("") + '</div><div class="cwl-tv-quiet" style="margin-top:56px;font-size:var(--cwl-fs-tv-body);color:var(--cwl-text-muted);font-weight:600">Start writing on your phone. Your sentences stay hidden until each lens opens on Day 1.</div>';
    var ps = h("div", "sc-row is-phones"); ps.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))"; r.appendChild(ps);
    var p1 = P4.phone(frame(ps, "Phone · self-paced seeding", "is-phone"), { head: "none" });
    p1.body.innerHTML = '<div class="cwl-ph-muted">Open until Day 1</div><div class="cwl-wf-ph-lens">' + P4.lensChip("congregation") + '</div><div class="cwl-ph-prompt">It\'s ' + Y.future + ". Describe our Congregation.</div>" + PH.tense() + PH.input("Every generation worships in the same room on a Sunday.", "", 2) + '<div class="cwl-wf-ph-list">' + ["Half of our adults are in a group that meets in a home.", "Newcomers are known by name within their first month."].map(function (t) { return '<div class="cwl-wf-ph-item"><span>' + esc(t) + "<small>" + L("eye-off") + " Hidden until Day 1</small></span></div>"; }).join("") + "</div>";
    p1.foot.innerHTML = PH.btn("Save sentence", { icon: "check" }) + '<div class="cwl-wf-ph-switch">' + W.lenses.slice(0, 2).map(function (l, i) { return '<span class="' + (i === 0 ? "is-on" : "") + '">' + esc(l.name) + " · " + (i ? 0 : 2) + "</span>"; }).join("") + "</div>";
    var p2 = P4.phone(frame(ps, "Phone · missed the call (PRE-11)", "is-phone"), { waiting: true, head: "none" });
    p2.body.innerHTML = '<div class="cwl-ph-headline">You missed the pre-call</div><div class="cwl-ph-text">Watch the recording, then start your Five Lenses sentences. They stay hidden until Day 1.</div><div class="cwl-wf-ph-item"><span>' + L("video") + ' Pre-call recording<small>90 minutes · shared by Chris</small></span></div><div class="cwl-wf-ph-list">' + W.lenses.map(function (l) { return '<div class="cwl-wf-ph-item"><span>' + P4.lensChip(l.key) + '</span><span class="cwl-ph-muted">0</span></div>'; }).join("") + "</div>";
    var r2 = row(b, "is-2");
    var a = app(r2, "Control surface · seeding, sentences hidden", 820, 420, "control");
    a.innerHTML = '<div class="cwl-a-pad" style="gap:12px"><div class="cwl-a-row" style="justify-content:space-between"><div><div class="cwl-a-eyebrow">Riverside Church · Pre-call</div><div class="cwl-a-section">Seed the Five Lenses</div></div>' + CHIP("Open until Day 1", "run-ready", "clock") + '</div><div class="p3-items">' + W.lenses.map(function (l) { return item("", P4.ctlLens(l.key), W.seedCounts[l.key] + " sentences from " + Math.min(8, Math.ceil(W.seedCounts[l.key] / 1.2)) + " people · " + L("eye-off") + " hidden until the lens opens", []); }).join("") + '</div><div class="cwl-a-muted">Counts only. The sentences reach the TV first when each lens opens.</div></div>';
    var s = app(r2, "Setup · pre-call recording for PRE-11", 820, 420, "setup");
    s.innerHTML = '<div class="cwl-a-pad" style="gap:14px"><div class="cwl-a-section">Pre-call recording</div><div class="cwl-a-field"><label class="cwl-a-flabel" for="rec">Recording link</label><input id="rec" class="cwl-a-input" value="https://riverside.zoom.us/rec/share/precall-2026"><div class="cwl-a-help">People who missed the call get this link with the seeding link.</div></div><div class="cwl-a-field"><label class="cwl-a-flabel">Missed the call</label><div class="cwl-a-list">' + ["Ruth Morrison", "Ben Carter"].map(function (n) { return '<div class="cwl-a-li"><span class="cwl-a-avatar">' + n.charAt(0) + '</span><span class="grow">' + esc(n) + '</span><span class="cwl-a-muted">Not seeded yet</span></div>'; }).join("") + "</div></div>" + B("Send the recording and seeding link", "is-primary", "send") + "</div>";
    CL.icons();
  })();

  /* ================================================================
     DAY 1
     ================================================================ */
  part("part-d1", "Day 1 · celebrate and dream", "Base year " + W.base + ": the 10-year Future is " + Y.future + ", the 3-year Vision " + Y.vision + ". Years are values from the engagement, never fixed text.");

  /* D1-04: celebration, short */
  intBoard({ id: "d1-04", title: "Celebration, short", ids: ["D1-04", "INT-01"], eyebrow: D3.cloud.eyebrow, headline: D3.cloud.headline, unit: "answers",
    note: "About 20 minutes: the pass 3 word cloud, or the pre-call celebration wall reopened from the control surface. Nothing new is drawn here: the board shows it in the Wayfinding run of show.",
    states: ["Empty", "First item", "Typical", "Crowded, 50 phones", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"],
    make: function (ctx) { return new P3.Cloud(ctx.sh.host); },
    tv: function (ctx, st, inst) {
      var w = st === "Empty" ? [] : st === "First item" ? D3.cloud.first : st === "Very long text" ? D3.cloud.long : D3.cloud.typical;
      if (/Crowded/.test(st)) { var m = {}; D3.cloud.burst.forEach(function (x) { m[x] = (m[x] || 0) + 1; }); w = Object.keys(m).map(function (k) { return [k, m[k]]; }); }
      ctx.view.set(w.map(function (x) { return { text: x[0], count: x[1] }; }), { instant: inst });
      ctx.sh.count(w.reduce(function (a, x) { return a + x[1]; }, 0), "answers", inst);
    },
    phones: function (st) { return [{ label: "Phone", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-prompt">' + esc(D3.cloud.prompt) + "</div>" + PH.input("", "One word", 1) + PH.sent("youth", st === "Offline and queued" ? "saved" : "sent") + PH.anon(); p.foot.innerHTML = PH.btn("Send"); } }]; },
    control: function (a, st) { P4.ctl(a, { title: "Celebration, short", chips: liveChips(st), sync: syncFor(st), banner: bannerFor(st), tools: [SB("Reopen the pre-call wall", "rotate-ccw"), SB("Start burst", "timer", "is-primary")], items: [item(1, "youth", "6 · combined with young people", [CL.aiBadge(), P4.IB("undo-2", "Undo combine")]), item(2, "alpha", "3", []), item(3, "baptisms", "3", [])], side: P4.roomPanel([[st === "Empty" ? 0 : 8, "answered"], [8, "signed in"]]) + P4.SIGNAL_SLOT }); }
  });

  /* D1-06 / INT-12: the lens wall */
  var LW = W.congregation;
  intBoard({ id: "d1-06", title: "Five Lenses: the lens wall", ids: ["D1-06", "INT-12", "LensWall"], lens: "congregation", headline: W.lensPrompt(W.lenses[0]), unit: "sentences",
    note: "When the lens opens, the sentences seeded since the pre-call arrive first, in a steady flow, so the room starts with everyone's perspective. Then the burst: every sentence lands in the column the moment it's sent. Similar sentences drift into clusters in the main area while people are still typing, and clustering never holds a sentence back.",
    states: ["Hidden seeds", "Empty", "First item", "Typical", "Crowded, 50 phones", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"],
    start: "Typical",
    make: function (ctx) { return new P4.LensWall(ctx.sh.host, { labels: LW.clusters }); },
    tv: function (ctx, st, inst) {
      var s = stat(st), all = LW.seeded.map(function (x) { var y = clone(x); y.seeded = true; return y; }).concat(LW.live);
      var list = all, grouped = all.map(function (x) { return x.id; }), note = "9 from the pre-call";
      if (st === "Hidden seeds") { list = []; grouped = []; note = ""; }
      if (st === "Empty") { list = []; grouped = []; note = ""; }
      if (st === "First item") { list = [LW.live[0]]; grouped = []; note = ""; }
      if (s.crowded) { list = all.concat(LW.burst); grouped = list.map(function (x) { return x.id; }); }
      if (s.long) { list = all.slice(0, 8).concat([{ id: "long", text: LW.long, c: "belong" }]); grouped = list.map(function (x) { return x.id; }); }
      ctx.view.set(list, { instant: inst, ai: s.ai, grouped: grouped, seedNote: note, newest: st === "First item" ? "l1" : null });
      ctx.sh.count(list.length, "sentences", inst);
      if (st === "Hidden seeds" || st === "Empty") ctx.sh.waiting(true, st === "Hidden seeds" ? "Sentences from the pre-call appear first when this lens opens" : "Waiting for sentences"); else ctx.sh.waiting(false);
      if (s.ai && list.length > 1) ctx.sh.foot('<span class="p3-ai-line">' + CL.aiBadge() + " Grouped similar sentences</span>");
      ctx.button("Open the lens: seeds, then the burst", "play", function () {
        ctx.sh.tv.setAttribute("data-motion", "full");
        var seeds = LW.seeded.map(function (x) { var y = clone(x); y.seeded = true; return y; }), shown = [], grp = [], i = 0;
        ctx.view.cOrder = []; ctx.view.set([], { instant: true, grouped: [] }); ctx.sh.waiting(false); ctx.sh.count(0, "sentences", true);
        var queue = seeds.concat(LW.live);
        CL.every(function () {
          if (i < queue.length) { shown.push(queue[i]); ctx.view.set(shown.slice(), { grouped: grp.slice(), seedNote: i < seeds.length ? "From the pre-call" : "9 from the pre-call", newest: queue[i].id }); ctx.sh.count(shown.length, "sentences"); i++; }
          if (i > 3 && grp.length < shown.length - 2) { grp.push(shown[grp.length].id); ctx.view.set(shown.slice(), { grouped: grp.slice(), seedNote: "9 from the pre-call" }); }
        }, 650);
      });
      return {
        "Hidden seeds": "Before the lens opens: nothing seeded shows anywhere, not even on the control surface. The headline and lens are set, the wall waits.",
        "Empty": "Lens open, nothing seeded and nothing sent yet.",
        "First item": "The first sentence lands in the column with the Lime ring. Grouping waits for a second similar sentence.",
        "Typical": "Seeds (sprout mark) first, then new sentences. Every sentence sits in the column with its cluster number. Clusters grow labels from tv-floor to tv-main as they gather. Use the button to watch a lens open.",
        "Crowded, 50 phones": "59 sentences: the column shows the newest nine and counts the rest on phones. Clusters keep their places and labels grow. Up to 12 drifts at once, the rest update in place.",
        "Offline and queued": "The TV holds its last state with the gray breathing mark. Phones keep writing and send in order on reconnect, then everything moves in one pass.",
        "Phones down": "Input closes and the TV holds still for the conversation. Phones dim with their own sentences.",
        "AI off": "No clusters: sentences fill the screen in arrival order, two columns, newest first. The facilitator can undo, pin or turn AI off at any time.",
        "Reduced motion": "No drift: a grouped sentence takes its number in place and its cluster updates at once.",
        "Very long text": "A 280-character sentence wraps in the column and never truncates. In its cluster it shows two lines, with the whole sentence on phones."
      }[st];
    },
    phones: function (st) {
      var s = stat(st);
      if (st === "Hidden seeds") return [{ label: "Phone · seeding, self-paced", o: { head: "none" }, render: function (p) { p.body.innerHTML = '<div class="cwl-wf-ph-lens">' + P4.lensChip("congregation") + '</div><div class="cwl-ph-prompt">It\'s ' + Y.future + ". Describe our Congregation.</div>" + '<div class="cwl-wf-ph-list">' + LW.seeded.slice(0, 2).map(function (x) { return '<div class="cwl-wf-ph-item"><span>' + esc(x.text) + "<small>" + L("eye-off") + " Hidden until this lens opens</small></span></div>"; }).join("") + "</div>"; p.foot.innerHTML = PH.btn("Add a sentence", { icon: "plus" }); } }];
      return [
        { label: "Phone · writing", render: function (p) { p.body.innerHTML = '<div class="cwl-wf-ph-lens">' + P4.lensChip("congregation") + '</div><div class="cwl-ph-prompt">It\'s ' + Y.future + ". Describe our Congregation.</div>" + (s.down ? "" : PH.tense()) + (s.down ? PH.down() : PH.input(s.long ? LW.long : "Grandparents and teenagers serve side by side.", "", 3)) + (s.down ? "" : PH.burst("2:41", 0.55)) + PH.sent("We celebrate a baptism almost every month.", s.offline ? "saved" : "sent") + '<div class="cwl-ph-answer cwl-dimmable"><span><span style="display:inline-flex;margin-right:6px">' + L("sprout") + "</span>" + esc(LW.seeded[0].text) + '</span><span class="cwl-ph-status">' + L("check") + " Seeded</span></div>"; p.foot.innerHTML = s.down ? "" : PH.btn(s.offline ? "Save" : "Send"); } },
        { label: "Phone · present tense check", render: function (p) { p.body.innerHTML = '<div class="cwl-wf-ph-lens">' + P4.lensChip("congregation") + '</div><div class="cwl-ph-prompt">It\'s ' + Y.future + ". Describe our Congregation.</div>" + PH.input("We will start a young adults service.", "", 3) + '<div class="cwl-wf-ph-tense">' + L("clock") + "<span>Try it as if it's already " + Y.future + ': "We have a young adults service."</span></div>' + PH.anon(); p.foot.innerHTML = PH.btn("Send as written") + '<div class="cwl-ph-muted" style="text-align:center">A gentle reminder, never a block.</div>'; } }
      ];
    },
    control: function (a, st) {
      var s = stat(st);
      var hidden = st === "Hidden seeds";
      P4.ctl(a, { title: P4.ctlLens("congregation") + " &nbsp;Five Lenses: Congregation", chips: hidden ? [CHIP("Ready", "run-ready", "circle-check"), CHIP("9 seeded, hidden", "is-outline", "eye-off")] : liveChips(st), sync: syncFor(st), banner: bannerFor(st),
        tools: hidden ? [B("Go live", "is-confirm is-sm", "play")] : [SB("Start burst", "timer", "is-primary"), SB("Spotlight", "sun"), SB("Hide", "eye-off"), SB("Mark a decision", "gavel")],
        listTitle: hidden ? "Seeded since the pre-call" : "Clusters", listNote: hidden ? "Sentences stay hidden until you go live" : s.ai ? "AI groups as sentences arrive" : "AI off · arrival order",
        items: hidden ? [item("", "9 sentences from 8 people", L("eye-off") + " They reach the TV first when this lens opens", [])] : !s.ai ? [item("", "Arrival order", "Turn AI on to group similar sentences", [])] :
          Object.keys(LW.clusters).map(function (k, i) { var n = LW.seeded.concat(LW.live).filter(function (x) { return x.c === k; }).length; return item(i + 1, esc(LW.clusters[k]), n + " sentences" + (i === 0 ? " · pinned" : ""), [CL.aiBadge(), P4.IB("pin", "Pin"), P4.IB("undo-2", "Undo grouping"), P4.IB("pencil", "Rename")]); }),
        side: P4.aiState(s.ai, s.ai ? "grouping similar sentences" : "arrival order") + P4.roomPanel([[hidden ? 0 : s.crowded ? 59 : 19, "sentences"], [s.crowded ? 50 : 8, "signed in"]]) + P4.SIGNAL_SLOT + P4.notes("Phones down after the burst. Draw out the conversation from the clusters and build on the easel.") });
    },
    remote: function (box, st) { P4.remote(box, { title: "Five Lenses: Congregation", sync: st === "Offline and queued" ? SYNC("is-syncing", "refresh-cw", "Syncing") : SYNC("", "check", "On the TV"), top: '<div class="cwl-a-row">' + P4.ctlLens("congregation") + "</div>", buttons: '<div class="cwl-r-grid">' + P4.rbtn("Burst", "timer", "is-primary") + P4.rbtn("Phones down", "smartphone") + "</div>" + '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" }); }
  });

  /* D1-07 to D1-10 / INT-13: cluster and rename, then 100 points */
  var candAt = function (st) {
    var c = clone(W.candidates).map(function (x) { x.ai = true; return x; });
    return c;
  };
  intBoard({ id: "d1-07", title: "Provisional Vision Outcomes: cluster and rename, then 100 points", ids: ["D1-07", "D1-08", "D1-09", "D1-10", "INT-13", "CandidatePriorities"], eyebrow: "Provisional Vision Outcomes", headline: "Which of these are <strong>our priorities?</strong>", unit: "people",
    note: "AI proposes 6 to 10 candidate priorities from all Five Lenses, each with the sentences it came from. They land on the control surface first and reach the TV only when the facilitator sends them. Phones rename, merge or suggest, and the facilitator accepts each with one tap. Then 100 points with a cut line between four and six, and the facilitator marks the provisional outcomes.",
    states: ["On the control surface only", "Sent to the TV", "Rename and merge", "100 points, first", "100 points with the cut line", "Provisional marked", "Crowded, 50 phones", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"],
    start: "Sent to the TV",
    make: function (ctx) { var v = { cands: new P4.CandidateList(ctx.sh.host) }; v.barsHost = h("div", "cwl-wf-host"); ctx.sh.host.appendChild(v.barsHost); v.bars = new P3.Bars(v.barsHost, { valueW: 200, labelW: 760 }); return v; },
    tv: function (ctx, st, inst) {
      var v = ctx.view, pts = /points|Crowded|Offline|Phones down|Reduced/.test(st);
      v.cands.el.style.display = pts ? "none" : ""; v.barsHost.style.display = pts ? "" : "none";
      ctx.sh.prompt("Provisional Vision Outcomes", pts ? "Spend 100 points on <strong>what matters most</strong>" : "Which of these are <strong>our priorities?</strong>");
      if (pts) {
        var alloc = st === "100 points, first" ? W.pointsFirst : W.points;
        if (/Crowded/.test(st)) { var x = []; for (var i = 0; i < 50; i++) x.push(W.points[i % 8]); alloc = x; }
        var opts = st === "Very long text" ? W.pointsOpts.map(function (o, i) { return i === 2 ? "A church that shows up for the city, its schools and the neighbours on our street" : o; }) : W.pointsOpts;
        v.bars.set(P3.pointsItems(opts, alloc), { instant: inst, cut: 5, cutLabel: "Top five" });
        ctx.sh.count(alloc.length, "placed all 100", inst);
        return { "100 points, first": "Bars grow once as the first full budget lands. A person's points count once all 100 are placed.", "100 points with the cut line": "Bars trade places with a glide and cross the cut line. The facilitator set the line at five, between four and six. Points show where the room is. The room decides." }[st] || "";
      }
      var c = candAt(st);
      if (st === "On the control surface only") c = [];
      if (st === "Rename and merge" || st === "Provisional marked" || st === "Very long text") {
        c = c.filter(function (x) { return x.id !== W.merge.from; }).map(function (x) { if (W.renames[x.id]) x.name = W.renames[x.id]; if (x.id === W.merge.into) { x.name = W.merge.name; x.from += 5; } return x; });
      }
      if (st === "Very long text") c[2].name = "A church that shows up for the city, its schools and the neighbours on our street";
      if (st === "Provisional marked") c = c.slice(0, 5).map(function (x) { x.provisional = true; return x; });
      if (st === "AI off") c = c.slice(0, 6).map(function (x) { x.ai = false; return x; });
      v.cands.set(c, { instant: inst, merge: st === "Rename and merge" && !inst ? W.merge : null, waitText: "The facilitator is reviewing the candidates. They come up here when Chris sends them." });
      ctx.sh.count(8, "people", true);
      if (st === "Sent to the TV" || st === "Rename and merge") ctx.sh.foot('<span class="p3-ai-line">' + CL.aiBadge() + " Drafted from all Five Lenses</span>");
      if (st === "Sent to the TV") ctx.button("Play: rename and merge", "play", function () { var c2 = candAt().filter(function (x) { return x.id !== W.merge.from; }).map(function (x) { if (W.renames[x.id]) x.name = W.renames[x.id]; if (x.id === W.merge.into) { x.name = W.merge.name; x.from += 5; } return x; }); v.cands.set(c2, { merge: W.merge }); });
      return {
        "On the control surface only": "The TV waits while the facilitator reviews the AI's candidates. Nothing reaches the room until Send to the TV.",
        "Sent to the TV": "Eight candidates, each with how many sentences it came from and the lenses they came through.",
        "Rename and merge": "Accepted renames replace the name in place. A merge glides one candidate into the one it joins, which takes the new name. The rest close the gap.",
        "Provisional marked": "The facilitator marks five provisional Vision Outcomes. They stay provisional until confirmed on Day 2.",
        "AI off": "With AI off the facilitator types candidates from the clusters and the easel. No AI badge.",
        "Very long text": "Long names wrap inside the panel and never truncate."
      }[st] || "";
    },
    phones: function (st) {
      var pts = /points|Crowded/.test(st), s = stat(st);
      if (pts || s.offline || s.down || st === "Reduced motion") return [{ label: "Phone · 100 points", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-prompt">Spend 100 points on what matters most</div><div class="p3-faders">' + W.pointsOpts.slice(0, 5).map(function (o, i) { var v = [25, 25, 20, 15, 10][i]; return '<div class="p3-fader"><div class="p3-fader-top"><span class="p3-fader-lbl">' + esc(o) + '</span><span class="p3-fader-n">' + v + '</span></div><div class="p3-fader-track"><div class="p3-fader-fill" style="width:' + v + '%"></div><div class="p3-fader-knob" style="left:' + v + '%"></div></div></div>'; }).join("") + '</div><div class="cwl-ph-muted">5 points left</div>'; p.foot.innerHTML = s.down ? "" : PH.btn(s.offline ? "Saved on this phone" : "Place all 100 to send", { disabled: true }); } }];
      return [
        { label: "Phone · rename, merge or suggest", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-prompt">Rename, merge or suggest</div><div class="cwl-wf-ph-list">' + W.candidates.slice(0, 5).map(function (c, i) { return '<div class="cwl-wf-ph-item"><span>' + esc(c.name) + "<small>From " + c.from + ' sentences</small></span><span class="acts"><span>' + L("pencil-line") + "</span><span>" + L("merge") + "</span></span></div>"; }).join("") + '</div><div class="cwl-ph-muted">' + L("plus") + " Suggest a new one</div>"; } },
        { label: "Phone · renaming one", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-muted">Rename</div><div class="cwl-ph-prompt">Young families</div>' + PH.input("Families find a home here", "", 2) + '<div class="cwl-ph-muted">Chris accepts suggestions on the control surface. Accepted ones change on the TV.</div>' + PH.sent("Families find a home here", "sent"); p.foot.innerHTML = PH.btn("Suggest this name"); } }
      ];
    },
    control: function (a, st) {
      var pts = /points|Crowded/.test(st), s = stat(st);
      var cands = W.candidates;
      P4.ctl(a, { title: "Provisional Vision Outcomes", chips: [CHIP(st === "On the control surface only" ? "Ready" : "Live", st === "On the control surface only" ? "run-ready" : "run-live", st === "On the control surface only" ? "circle-check" : "radio"), pts ? CHIP("Cut line at 5", "is-outline", "scissors") : CHIP("8 candidates", "is-outline", "list")], sync: syncFor(st), banner: bannerFor(st),
        tools: st === "On the control surface only" ? [B("Send to the TV", "is-confirm is-sm", "monitor-up"), SB("Add a candidate", "plus"), SB("Redraft", "refresh-cw")] : pts ? [SB("Cut line: 4", ""), SB("5", "", "is-primary"), SB("6", ""), SB("Mark provisional", "flag")] : [SB("Open 100 points", "coins", "is-primary"), SB("Add a candidate", "plus")],
        listTitle: pts ? "Points" : st === "On the control surface only" ? "AI candidates · not on the TV yet" : "Candidates", listNote: pts ? "Complete budgets only" : "Sentences behind each",
        items: pts ? W.pointsOpts.map(function (o, i) { return item(i + 1, esc(o), [24, 23, 18, 14, 13, 6, 4][i] + "% of points" + (i < 5 ? " · above the line" : ""), i < 5 && st === "Provisional marked" ? [CHIP("Provisional", "is-outline", "flag")] : []); }) :
          cands.map(function (c, i) { return item(i + 1, esc(c.name), "From " + c.from + " sentences · " + c.lenses.map(P4.ctlLens).join(" "), [s.ai ? CL.aiBadge() : "", P4.IB("chevron-down", "Show sentences"), P4.IB("pencil", "Rename"), P4.IB("x", "Remove")]); }),
        side: pts ? P4.roomPanel([[8, "placed all 100"], [0, "partial"]]) + P4.SIGNAL_SLOT : PRIVATE("Suggestions", W.suggestions.map(function (x) { return '<div class="cwl-wf-decision" style="gap:4px;padding:10px"><div><b>' + x.kind + "</b> · " + esc(x.text) + (x.to ? " to " + esc(x.to) : "") + '</div><div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-muted">' + esc(x.who) + "</span>" + B("Accept", "is-confirm is-sm", "check") + "</div></div>"; }).join("")) + P4.SIGNAL_SLOT });
    },
    remote: function (box, st) { var pts = /points/.test(st); P4.remote(box, { title: pts ? "100 points" : "Candidate priorities", buttons: pts ? '<div class="cwl-r-grid">' + P4.rbtn("Burst", "timer", "is-primary") + P4.rbtn("Phones down", "smartphone") + "</div>" + P4.rbtn("Mark provisional", "flag") : P4.rbtn("Send to the TV", "monitor-up", "is-live") + '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" }); }
  });

  /* D1-11 and D1-12: outcome bullets */
  intBoard({ id: "d1-11", title: "3-year Vision, first pass: outcome bullets", ids: ["D1-11", "D1-12", "OutcomeBullets"], eyebrow: "3-year Vision · " + Y.vision, headline: "In " + Y.vision + ", <strong>what's true?</strong>", unit: "bullets",
    note: "One Vision Outcome at a time. Bullets fill in under the heading as people type and send. An outcome with no bullets stays flagged in Sunrise until it has one, checked in code. Bullets publish to CORE as the outcome's success indicators.",
    states: ["Empty outcome", "First item", "Typical", "Crowded, 50 phones", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"],
    make: function (ctx) { return new P4.OutcomeBullets(ctx.sh.host); },
    tv: function (ctx, st, inst) {
      var oc = clone(W.outcomes), cur = 0;
      if (st === "Empty outcome") cur = 3;
      if (st === "First item") { oc[3].bullets = ["Every family with kids under 12 is in a group"]; cur = 3; }
      if (/Crowded/.test(st)) { cur = 0; for (var i = 0; i < 9; i++) oc[0].bullets.push(["Two apprentices in kids' ministry", "A leader pathway on the website", "Interns from Riverside's own students", "Every elder mentors one younger leader", "Worship team trains two new leads a year", "Staff meetings include leader development", "Small group hosts coached monthly", "A leadership night every season", "Five residents placed in other churches"][i]); }
      if (st === "Very long text") { cur = 0; oc[0].bullets = oc[0].bullets.concat([W.longOutcome]); oc[0].name = "Leaders raised from within every ministry, every generation and every campus we plant"; }
      ctx.view.set(oc, cur, { instant: inst, newest: st === "First item" ? "Every family with kids under 12 is in a group" : null, cap: 6 });
      ctx.sh.count(oc[cur].bullets.length, "bullets", inst);
      ctx.button("Play: bullets arriving on outcome 4", "play", function () {
        var o2 = clone(W.outcomes); ctx.view.set(o2, 3, {});
        var add = ["Every family with kids under 12 is in a group", "Our kids' ministry has a waiting list of volunteers", "Parents of toddlers meet weekly"], i = 0;
        CL.every(function () { if (i < add.length) { o2[3].bullets.push(add[i]); ctx.view.set(o2, 3, { newest: add[i] }); ctx.sh.count(o2[3].bullets.length, "bullets"); i++; } }, 1400);
      });
      return {
        "Empty outcome": "Families find a home here has no bullets: Sunrise outline and tag on the TV, a Warning chip on the control surface. It stays flagged while the team is still in the room.",
        "First item": "The first bullet lands with the Lime ring, and the flag clears from the rail as it lands.",
        "Crowded, 50 phones": "Past four bullets the cards step down to tv-floor. The newest six show, with the rest on phones.",
        "AI off": "No AI in this tool: the empty-outcome flag is code. Same as Typical.",
        "Reduced motion": "Bullets appear in place with a short fade. The flag is the same."
      }[st] || "";
    },
    phones: function (st) {
      var s = stat(st), empty = st === "Empty outcome" || st === "First item";
      return [{ label: "Phone · adding a bullet", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-muted">Outcome ' + (empty ? 4 : 1) + ' of 5</div><div class="cwl-ph-prompt">' + esc(empty ? W.outcomes[3].name : W.outcomes[0].name) + '</div><div class="cwl-ph-text">In ' + Y.vision + ", what's true?</div>" + (s.down ? PH.down() : PH.input(empty ? "Every family with kids under 12 is in a group" : "", "Name something you could count or see")) + (empty && st === "Empty outcome" ? "" : PH.sent(empty ? "Every family with kids under 12 is in a group" : "12 apprentice leaders serve alongside a ministry lead", s.offline ? "saved" : "sent")); p.foot.innerHTML = s.down ? "" : PH.btn("Send"); } },
        { label: "Phone · all outcomes", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-muted">You can add to any outcome while this session is open</div><div class="cwl-wf-ph-list">' + W.outcomes.map(function (o, i) { var n = o.bullets.length + (i === 3 && st === "First item" ? 1 : 0); return '<div class="cwl-wf-ph-item' + (n ? "" : " is-flagged") + '"><span>' + (i + 1) + ". " + esc(o.name) + "<small>" + (n ? n + (n === 1 ? " bullet" : " bullets") : "") + "</small></span>" + (n ? "" : '<span class="cwl-wf-flag-tag" style="font-size:12px">' + L("circle-alert") + " Empty</span>") + "</div>"; }).join("") + "</div>"; } }];
    },
    control: function (a, st) {
      var empty = st === "Empty outcome";
      P4.ctl(a, { title: "3-year Vision, first pass", chips: liveChips(st), sync: syncFor(st), banner: bannerFor(st) || (st !== "First item" ? BAN("warning", "triangle-alert", "<strong>Families find a home here has no bullets.</strong> It stays flagged until it has at least one.") : ""), tools: [SB("Previous outcome", "chevron-left"), SB("Next outcome", "chevron-right"), SB("Start burst", "timer", "is-primary")], listTitle: "Vision Outcomes", listNote: "Provisional",
        items: W.outcomes.map(function (o, i) { var n = o.bullets.length + (i === 3 && st === "First item" ? 1 : 0); return item(i + 1, esc(o.name), n ? n + (n === 1 ? " bullet" : " bullets") : FLAG("No bullets"), [i === (empty || st === "First item" ? 3 : 0) ? CHIP("On the TV", "run-live", "radio") : SB("Show", "play")]); }),
        side: P4.roomPanel([[13, "bullets"], [8, "signed in"]]) + P4.SIGNAL_SLOT + P4.notes("An empty outcome is a question for the room, not a gap to fill alone.") });
    }
  });

  /* D1-13: close */
  (function () {
    var b = board("d1-13", "Day 1 close", ["D1-13", "ScriptureScreen"], "The provisional outcomes, then Scripture, with the invitation to pray over them overnight. Phones away. Close Day 1 closes every step still open in Day 1, so the overnight draft works from a fixed set of answers.");
    var r = row(b, "is-2");
    var tv1 = CL.stage(frame(r, "TV · the provisional outcomes", "is-tv"), "dark"); CL.screenTexture(tv1, "content");
    var t1 = h("div", "cwl-tv-top"); t1.innerHTML = window.ClearwayLivePass2.lockup() + "<span></span>"; tv1.appendChild(t1);
    var c1 = h("div", "cwl-tv-content"); tv1.appendChild(c1);
    c1.innerHTML = '<div class="cwl-tv-eyebrow">Provisional Vision Outcomes · ' + Y.vision + '</div><div class="cwl-tv-headline">Pray over these <strong>tonight.</strong></div><div style="display:flex;flex-direction:column;gap:18px">' + W.outcomes.map(function (o, i) { return '<div class="cwl-wf-orow" style="font-size:var(--cwl-fs-tv-body)"><span class="cwl-wf-num">' + (i + 1) + '</span><span class="t">' + esc(o.name) + '</span><span class="k"></span></div>'; }).join("") + "</div>";
    var tv2 = CL.stage(frame(r, "TV · Scripture, still", "is-tv"), "dark"); CL.screenTexture(tv2, "content");
    var t2 = h("div", "cwl-tv-top"); t2.innerHTML = window.ClearwayLivePass2.lockup() + "<span></span>"; tv2.appendChild(t2);
    var c2 = h("div", "cwl-tv-content"); tv2.appendChild(c2);
    var p = W.passages.d1close;
    c2.innerHTML = '<div style="margin:auto 0;max-width:1400px"><div class="cwl-scripture" style="font-size:var(--cwl-fs-tv-headline);font-weight:300;line-height:1.2">' + esc(p.text.replace(p.bold, "")) + "<strong>" + esc(p.bold) + '</strong></div><div class="cwl-scripture-ref" style="font-size:var(--cwl-fs-tv-main);color:var(--cwl-text)">' + p.ref + ' <span style="font-size:var(--cwl-fs-tv-floor);letter-spacing:0.12em;text-transform:uppercase;color:var(--cwl-text-muted);margin-left:24px">' + p.tr + "</span></div></div>";
    var r2 = row(b, "is-1"); r2.style.gridTemplateColumns = "minmax(0,1fr) 220px 220px";
    var a = app(r2, "Control surface · close the day", 1280, 330, "control");
    P4.ctl(a, { title: "Close", chips: [CHIP("Live", "run-live", "radio")], tools: [B("Close Day 1", "is-secondary is-sm", "moon")], listTitle: "Still open in Day 1", listNote: "Close Day 1 closes these",
      items: [item("", "Five Lenses, all five", "Open in the Five Lenses segment", [CHIP("Open", "is-outline", "circle-dot")]), item("", "3-year Vision, first pass", "Bullets still arriving", [CHIP("Open", "is-outline", "circle-dot")])],
      side: '<div class="cwl-a-banner is-info" role="status"><span class="ic">' + L("info") + '</span><div>Close Day 1 needs a second tap within 3 seconds. The overnight draft starts from the closed set.</div></div>' });
    var ph = P4.phone(frame(r2, "Phone · phones away", "is-phone"), { waiting: true, head: "none" });
    ph.body.innerHTML = '<div class="cwl-ph-headline" style="margin-top:auto">Phones away</div><div class="cwl-ph-text">' + p.ref + " · " + p.tr + '</div><div class="cwl-ph-text">' + esc(p.text) + "</div>";
    var rm = P4.remote(frame(r2, "Remote · second tap", "is-phone"), { title: "Scripture", buttons: P4.rbtn("Tap again to close Day 1", "moon", "is-primary") + '<div class="cwl-a-muted" style="text-align:center">2 seconds</div>' });
    CL.icons();
  })();

  /* ================================================================
     DAY 2
     ================================================================ */
  part("part-d2", "Day 2 · confirm, stress-test, define, hand over", "The read-back (D2-03, D2-04, INT-14) comes in pass 5.");

  (function () {
    var b = board("d2-01", "Prayer and listening", ["D2-01", "D2-02", "ScriptureScreen", "PrayerScreen"], "Scripture, then a dark still screen while the team prays with phones away. Then one prompt, \"What are we sensing?\", with what the team shares landing quietly in arrival order (no AI).");
    var r = row(b, "is-3");
    var p = W.passages.d2prayer;
    var tv1 = CL.stage(frame(r, "TV · Scripture (D2-01)", "is-tv"), "dark"); CL.screenTexture(tv1, "content");
    var c1 = h("div", "cwl-tv-content"); tv1.appendChild(c1);
    c1.innerHTML = '<div style="margin:auto 0;max-width:1400px"><div class="cwl-scripture" style="font-size:var(--cwl-fs-tv-headline);font-weight:300;line-height:1.2">' + esc(p.text.replace(p.bold, "")) + "<strong>" + esc(p.bold) + '</strong></div><div class="cwl-scripture-ref" style="font-size:var(--cwl-fs-tv-main);color:var(--cwl-text)">' + p.ref + ' <span style="font-size:var(--cwl-fs-tv-floor);letter-spacing:0.12em;text-transform:uppercase;color:var(--cwl-text-muted);margin-left:24px">' + p.tr + "</span></div></div>";
    var tv2 = CL.stage(frame(r, "TV · prayer, dark and still (D2-01)", "is-tv"), "dark"); CL.screenTexture(tv2, "content");
    var c2 = h("div", "cwl-tv-content"); tv2.appendChild(c2); c2.innerHTML = '<div class="cwl-prayer"><div class="cwl-tv-headline" style="margin:0;color:var(--cwl-text-muted)">Let\'s listen.</div></div>';
    var box3 = frame(r, "TV · what are we sensing? (D2-02)", "is-tv");
    var sh = P4.shell(box3, { eyebrow: "Prayer and listening", headline: "What are we <strong>sensing?</strong>", unit: "shared" });
    var wall = new P3.OrderWall(sh.host);
    requestAnimationFrame(function () { wall.set(W.sensing.slice(0, 5), { instant: true }); sh.count(5, "shared", true); });
    var r2 = row(b, "is-phones"); r2.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";
    var a = P4.phone(frame(r2, "Phone · phones away", "is-phone"), { waiting: true, head: "none" }); a.body.innerHTML = '<div class="cwl-ph-headline" style="margin-top:auto">Phones away</div><div class="cwl-ph-text">We\'re praying together.</div>';
    var b2 = P4.phone(frame(r2, "Phone · sensing", "is-phone"), {}); b2.body.innerHTML = '<div class="cwl-ph-prompt">What are we sensing?</div>' + PH.input("Peace about leaders first") + PH.anon(); b2.foot.innerHTML = PH.btn("Share");
    var c3 = P4.phone(frame(r2, "Phone · Scripture", "is-phone"), { head: "none" }); c3.body.innerHTML = '<div class="cwl-ph-muted">' + p.ref + " · " + p.tr + '</div><div class="cwl-ph-text" style="font-size:var(--cwl-fs-phone-input);line-height:1.6">' + esc(p.text) + "</div>";
    var d = P4.phone(frame(r2, "Phone · reduced motion, offline", "is-phone"), { head: "offline", motion: "reduced" }); d.body.innerHTML = '<div class="cwl-ph-prompt">What are we sensing?</div>' + PH.sent("Isaiah 30 again this morning", "saved") + '<div class="cwl-ph-muted">Scripture and prayer are already still. Nothing animates.</div>';
    CL.icons();
  })();

  /* D2-05 and D2-06: outcome confirm */
  var confirmRows = function (st) {
    var rows = W.outcomes.map(function (o) { var c = W.confirm[o.id]; return { id: o.id, name: o.name, c: c.c, r: c.r, x: c.x }; });
    if (st === "Empty") rows.forEach(function (r) { r.c = r.r = r.x = 0; });
    if (st === "First item") rows.forEach(function (r, i) { r.c = i === 0 ? 1 : 0; r.r = r.x = 0; });
    if (/Crowded/.test(st)) rows.forEach(function (r, i) { r.c = [44, 36, 30, 12, 40][i]; r.r = [4, 10, 16, 14, 6][i]; r.x = [2, 4, 4, 24, 4][i]; });
    if (st === "Challenged" || st === "Decided" || st === "Outside four to six") rows[3].challenged = true;
    if (st === "Decided" || st === "Outside four to six") {
      rows.forEach(function (r) { var c = W.confirm[r.id]; if (r.id !== "o4" && (st === "Decided" || r.id === "o1" || r.id === "o2")) r.decision = { kind: c.decision, to: c.to }; });
    }
    if (st === "Outside four to six") { rows = rows.slice(0, 5); rows[2].decision = null; rows[4].decision = null; }
    if (st === "Very long text") { rows[3].name = W.longOutcome; rows[3].challenged = true; }
    return rows;
  };
  intBoard({ id: "d2-05", ctlH: 700, title: "Confirm the Vision Outcomes", ids: ["D2-05", "D2-06", "OutcomeConfirmRow"], eyebrow: "3-year Vision · " + Y.vision, headline: "Confirm, rename or <strong>challenge each outcome</strong>", unit: "answering",
    note: "Phones confirm, rename or challenge each provisional outcome with an optional reason. The TV shows where the room is: counts only, no bars and no winner. A challenged outcome lifts to the top of the control surface and gets a soft highlight on the TV until decided. The facilitator records the room's consensus decision and its reasons. Counts never decide.",
    states: ["Empty", "First item", "Typical", "Challenged", "Decided", "Outside four to six", "Crowded, 50 phones", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"],
    start: "Challenged",
    make: function (ctx) { return new P4.OutcomeConfirm(ctx.sh.host); },
    tv: function (ctx, st, inst) {
      var rows = confirmRows(st);
      ctx.view.set(rows, { instant: inst, shell: ctx.sh });
      var n = rows.filter(function (r) { return r.decision; }).length;
      ctx.sh.count(/Crowded/.test(st) ? 50 : st === "Empty" ? 0 : st === "First item" ? 1 : 8, "answering", inst);
      if (n) ctx.sh.foot('<span class="cwl-wf-confirm-foot">' + L("check") + " " + n + " of " + rows.length + " decided</span>");
      ctx.button("Play: the room confirms outcome 1", "play", function () { var r = confirmRows("Challenged"); ctx.view.set(r, { instant: true, shell: ctx.sh }); later(function () { r[0].decision = { kind: "Confirmed" }; ctx.view.set(r, { shell: ctx.sh }); ctx.sh.foot('<span class="cwl-wf-confirm-foot">' + L("check") + " 1 of 5 decided</span>"); }, 600); });
      return {
        "Challenged": "Families find a home here is challenged: a Royal panel with a Sunrise Challenged tag, and its counts give way to the tag until it's decided.",
        "Decided": "Each decision sweeps Lime across its row once and settles to a quiet Confirmed or Renamed mark. A rename shows the old name struck through beneath.",
        "Outside four to six": "Only two decided so far. The warning lives on the control surface: Wayfinding expects four to six. The TV never warns.",
        "AI off": "No AI in this tool. Same as Typical.",
        "Reduced motion": "No sweep. The Confirmed mark appears in place.",
        "Very long text": "A long outcome name steps down to tv-body and wraps."
      }[st] || "";
    },
    phones: function (st) {
      var s = stat(st);
      return [{ label: "Phone · confirm, rename or challenge", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-muted">Outcome 4 of 5</div><div class="cwl-ph-prompt">Families find a home here</div><div class="cwl-wf-ph-seg"><span>' + L("check") + "Confirm</span><span>" + L("pencil-line") + 'Rename</span><span class="is-on">' + L("hand") + "Challenge</span></div>" + (s.down ? PH.down() : PH.input(W.challengeReasons[0], "Why? Optional", 2)) + PH.anon(); p.foot.innerHTML = s.down ? "" : PH.btn(s.offline ? "Saved on this phone" : "Send"); } },
        { label: "Phone · all five", render: function (p) { p.body.innerHTML = '<div class="cwl-wf-ph-list">' + W.outcomes.map(function (o, i) { var k = ["Confirm", "Confirm", "Rename", "Challenge", "Confirm"][i]; return '<div class="cwl-wf-ph-item"><span>' + (i + 1) + ". " + esc(o.name) + '<small>You said: ' + k + "</small></span></div>"; }).join("") + '</div><div class="cwl-ph-muted">You can change your answer while this is open.</div>'; } }];
    },
    control: function (a, st) {
      var rows = confirmRows(st), lifted = rows.slice().sort(function (x, y) { return (y.challenged && !y.decision ? 1 : 0) - (x.challenged && !x.decision ? 1 : 0); });
      var n = rows.filter(function (r) { return r.decision && r.decision.kind !== "Removed"; }).length;
      var warn = st === "Outside four to six" ? BAN("warning", "triangle-alert", "<strong>" + n + " confirmed.</strong> Wayfinding expects four to six Vision Outcomes. You can still go on.") : "";
      P4.ctl(a, { part: "Day 2", title: "Confirm the Vision Outcomes", chips: liveChips(st), sync: syncFor(st), banner: bannerFor(st) || warn, listTitle: "Outcomes", listNote: "Challenged first · counts show where the room is",
        items: lifted.map(function (r, i) { return item(W.outcomes.map(function (o) { return o.id; }).indexOf(r.id) + 1, esc(r.name), r.decision ? (r.decision.kind === "Renamed" ? "Renamed to " + esc(r.decision.to) : "Confirmed") + " · " + esc(W.confirm[r.id].reason) : L("check") + " " + r.c + " &nbsp; " + L("pencil-line") + " " + r.r + " &nbsp; " + L("hand") + " " + r.x + (r.challenged ? " · " + FLAG("Challenged") : ""), r.decision ? [CHIP(r.decision.kind, "run-done", "check-check")] : [SB("Decide", "gavel", r.challenged ? "is-primary" : "")], r.challenged && !r.decision ? "is-sel" : ""); }),
        side: PRIVATE("Decision", '<div class="cwl-wf-decision"><div class="cwl-a-label">Families find a home here</div>' + seg(["Confirm", "Rename", "Remove"], 1, "is-sm") + '<input class="cwl-a-input" value="Families belong here" aria-label="New name"><textarea aria-label="Reasons">Challenged as a demographic, not an outcome. Agreed the outcome is belonging, with families as the first focus.</textarea><input class="cwl-a-input" value="Families find friends, care and a next step here." aria-label="One-line description"><div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-muted">The room\'s consensus, not the count</span>' + B("Record", "is-confirm is-sm", "check") + "</div></div><div class=\"cwl-a-muted\">Reasons from phones: " + esc(W.challengeReasons.join(" · ")) + "</div>") + P4.SIGNAL_SLOT });
    }
  });

  /* D2-07 and D2-08: pre-mortem */
  intBoard({ id: "d2-07", title: "Pre-mortem", ids: ["D2-07", "D2-08", "INT-08", "PremortemGrid"], eyebrow: "Pre-mortem", headline: "It's " + Y.vision + " and this plan failed. <strong>Why?</strong>", unit: "reasons",
    note: "The pass 3 2x2 in its Wayfinding form: reasons as numbered dots on likelihood and impact. Duplicate reasons merge, the duplicate's dot gliding into the one it joins. Mitigations the team names sit under each reason. Lands in Risks and Roadblocks and Map page 2 Key Issues, and goals link to these risks.",
    states: ["Empty", "First item", "Typical", "Merged duplicate", "Crowded, 50 phones", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text"],
    make: function (ctx) { return new P4.PremortemGrid(ctx.sh.host); },
    tv: function (ctx, st, inst) {
      var it = clone(W.premortem);
      if (st === "Empty") it = []; if (st === "First item") it = it.slice(0, 1).map(function (x) { x.places = x.places.slice(0, 1); delete x.mit; return x; });
      if (st === "AI off") it = it.concat([clone(W.premortemDupe)]);
      if (st === "Very long text") it[2].label = W.premortemLong;
      if (/Crowded/.test(st)) it.forEach(function (x) { var p = x.places, n = p.length; for (var k = 0; k < 6; k++) p.push([Math.min(1, p[k % n][0] + (k % 3 - 1) * 0.04), Math.min(1, p[k % n][1] + (k % 2 - 0.5) * 0.06)]); });
      if (st === "Merged duplicate") { var d = clone(W.premortemDupe); ctx.view.set(clone(W.premortem).concat([d]), { instant: true }); later(function () { ctx.view.set(clone(W.premortem).concat([d]).map(function (x) { return x; }).filter(function (x) { return x.id !== "r7"; }).concat([{ id: "r7", num: 7, label: d.label, places: [], into: "r1" }]), {}); ctx.sh.foot('<span class="p3-ai-line">' + CL.aiBadge() + " Merged 1 duplicate reason</span>"); }, inst ? 50 : 700); }
      else ctx.view.set(it, { instant: inst, newest: st === "First item" ? "r1" : null, shell: ctx.sh });
      var n = it.reduce(function (a, x) { return a + x.places.length; }, 0);
      ctx.sh.count(n, "placements", inst);
      return { "Merged duplicate": "AI merges Too many priorities at once into We tried all five at once: the dot glides into the survivor and fades while the survivor grows. Undo plays it backwards.", "AI off": "No merging: the duplicate stands as its own dot until the facilitator merges it by hand.", "Typical": "Mitigations named in the room show under their reasons. Placements gather as faint dots behind each reason's average." }[st] || "";
    },
    phones: function (st) { var s = stat(st); return [{ label: "Phone · name a reason", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-prompt">It\'s ' + Y.vision + " and this plan failed. Why?</div>" + (s.down ? PH.down() : PH.input("Staff burned out by spring", "", 2)) + PH.sent("We tried all five at once", s.offline ? "saved" : "sent") + PH.anon(); p.foot.innerHTML = s.down ? "" : PH.btn("Send, then place it", { icon: "arrow-right" }); } }, { label: "Phone · place it", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-muted">Staff burned out by spring</div><div class="cwl-ph-prompt">How likely, and how big?</div><div class="p3-phplot" style="height:240px;position:relative;border-radius:8px;box-shadow:inset 0 0 0 2px var(--cwl-border-strong)"><span class="p3-dot cwl-i2" style="width:44px;height:44px;transform:translate(118px,30px);box-shadow:none;font-size:18px">2</span></div><div class="cwl-a-row cwl-ph-muted" style="justify-content:space-between"><span>Likelihood</span><span>Impact</span></div>'; p.foot.innerHTML = PH.btn("Place it", { icon: "check" }); } }]; },
    control: function (a, st) { var s = stat(st); P4.ctl(a, { part: "Day 2", title: "Pre-mortem", chips: liveChips(st), sync: syncFor(st), banner: bannerFor(st), tools: [SB("Start burst", "timer", "is-primary"), SB("Merge two reasons", "merge")], listTitle: "Reasons", listNote: "Mitigations from the room",
      items: W.premortem.map(function (r) { return item(r.num, esc(r.label), r.places.length + " placed" + (r.mit ? " · Mitigation: " + esc(r.mit) : ""), [r.num === 1 && st === "Merged duplicate" ? CL.aiBadge() + " " + P4.IB("undo-2", "Undo merge") : "", P4.IB("pencil", "Add a mitigation")]); }),
      side: P4.aiState(s.ai, s.ai ? "merging duplicate reasons" : "no merging") + P4.SIGNAL_SLOT + P4.notes("Name a mitigation for every reason in the top right before the break.") }); }
  });

  /* INT-15, D2-09, D2-10: CORE goal builder */
  var goalsAt = function (st) {
    var g = clone(W.goals);
    if (st === "Empty") g = [];
    if (st === "First item") g = [{ id: "g9", title: "Name apprentices", result: "", owner: "", end: "", risk: 0 }];
    if (st === "All four met") { g[1].result = "A residency plan the elders approve"; g[1].owner = "Mark Ellison"; g[2].end = "Apr 30, 2027"; }
    if (/Crowded/.test(st)) g = g.concat([{ id: "g4", title: "Coach every group host monthly", result: "Hosts report a monthly coaching call", owner: "Grace Lindqvist", end: "Apr 30, 2027", risk: 2 }, { id: "g5", title: "Leadership night every season", result: "Three nights with 40 people each", owner: "Sam Whitford", end: "Aug 31, 2027", risk: 5 }]);
    if (st === "Very long text") { g[0].title = W.longGoal; g[0].owner = W.longName; }
    if (st === "Day and a half") g.forEach(function (x) { x.risk = 0; });
    return g;
  };
  intBoard({ id: "d2-09", title: "1-year Outlook: the CORE goal builder", ids: ["INT-15", "D2-09", "D2-10", "CoreGoalBuilder", "GoalCard"], eyebrow: "1-year Outlook · " + Y.outlook, headline: "Leaders raised from within: <strong>what happens in " + Y.outlook + "?</strong>", unit: "goals",
    note: "One Vision Outcome at a time: its 3-year Vision on the left, its 1-year goals on the right. Each goal shows the four CORE letters met or missing, checked in code. A goal missing a letter is outlined in Sunrise with what's missing and turns solid when all four are met. One owner, an end date defaulting to a season end, and the pre-mortem risk the goal answers.",
    states: ["Empty", "First item", "Letters missing", "All four met", "Crowded, 50 phones", "Offline and queued", "Phones down", "AI off", "Reduced motion", "Very long text", "Day and a half"],
    start: "Letters missing",
    make: function (ctx) { return new P4.CoreGoalBuilder(ctx.sh.host); },
    tv: function (ctx, st, inst) {
      var g = goalsAt(st);
      ctx.view.set(W.outcomes[0], g, { instant: inst, cap: 4 });
      ctx.sh.count(g.length, "goals", inst);
      var met = g.filter(function (x) { return !P4.coreCheck(x).length; }).length;
      if (g.length) ctx.sh.foot('<span class="cwl-wf-confirm-foot">' + L("check") + " " + met + " of " + g.length + " meet CORE</span>");
      ctx.button("Play: fixing goal 2", "play", function () { var g2 = goalsAt("Letters missing"); ctx.view.set(W.outcomes[0], g2, { instant: true }); later(function () { g2[1].owner = "Mark Ellison"; ctx.view.set(W.outcomes[0], g2, {}); }, 700); later(function () { g2[1].result = "A residency plan the elders approve"; ctx.view.set(W.outcomes[0], g2, {}); }, 1900); });
      return {
        "Empty": "No goals for this outcome yet. The 3-year Vision on the left is what the goals answer.",
        "First item": "A new goal arrives with three letters missing and says what each needs.",
        "Letters missing": "Goal 1 meets CORE. Goal 2 needs an owner and a clear result. Goal 3 needs an end date. Missing letters are outlined and hatched, never told apart by color alone.",
        "All four met": "Every goal turns solid: no flags, all four letters filled, each with a check.",
        "Crowded, 50 phones": "Five goals: cards step down to tv-floor and the fifth shows as a count on phones.",
        "AI off": "No AI in this tool: CORE checks are code. Same as Letters missing.",
        "Reduced motion": "Letters and outlines change in place without transitions.",
        "Very long text": "A long title wraps. A long owner name wraps on its own line in the card's meta row.",
        "Day and a half": "Goals built before the pre-mortem don't need a risk link. The risk tag is added after the follow-up session."
      }[st] || "";
    },
    phones: function (st) {
      var s = stat(st), half = st === "Day and a half";
      return [{ label: "Phone · propose a goal", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-muted">Leaders raised from within · ' + Y.outlook + '</div><div class="cwl-wf-ph-field"><label>Goal</label><input class="cwl-ph-input" value="Design the leader residency" tabindex="-1"></div><div class="cwl-wf-ph-field"><label>Result</label><input class="cwl-ph-input" placeholder="How we\'ll know it\'s done" tabindex="-1"></div><div class="cwl-wf-ph-field"><label>Owner, one person</label><input class="cwl-ph-input" placeholder="Choose from the attendees" tabindex="-1"></div><div class="cwl-wf-ph-field"><label>End date</label><div class="cwl-wf-ph-seg">' + W.seasons.map(function (x, i) { return '<span class="' + (i === 2 ? "is-on" : "") + '">' + x.end.replace(", 20", " 20") + "</span>"; }).join("") + "</div></div>" + (half ? '<div class="cwl-ph-muted">Risk link: after the follow-up session</div>' : '<div class="cwl-wf-ph-field"><label>Risk it answers</label><input class="cwl-ph-input" value="1. We tried all five at once" tabindex="-1"></div>') + '<div class="cwl-wf-ph-letters"><span>C</span><span class="is-missing">O</span><span class="is-missing">R</span><span>E</span></div>'; p.foot.innerHTML = s.down ? PH.down() : PH.btn(s.offline ? "Saved on this phone" : "Propose"); } },
        { label: "Phone · owner not at the retreat", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-prompt">Owner</div><div class="cwl-wf-ph-list">' + W.people.slice(0, 3).map(function (n) { return '<div class="cwl-wf-ph-item"><span>' + esc(n) + "</span></div>"; }).join("") + '</div><div class="cwl-ph-muted">Not here? Add them by name and email.</div><div class="cwl-wf-ph-field"><label>Name</label><input class="cwl-ph-input" value="' + esc(W.goalOwnerOutside.name) + '" tabindex="-1"></div><div class="cwl-wf-ph-field"><label>Email</label><input class="cwl-ph-input" value="' + esc(W.goalOwnerOutside.email) + '" tabindex="-1"></div><div class="cwl-ph-muted">' + esc(W.goalOwnerOutside.note) + "</div>"; p.foot.innerHTML = PH.btn("Add owner", { icon: "user-plus" }); } }];
    },
    control: function (a, st) {
      var g = goalsAt(st);
      P4.ctl(a, { part: "Day 2", title: "1-year Outlook · Leaders raised from within", chips: liveChips(st, "Working block 22:10"), sync: syncFor(st), banner: bannerFor(st), tools: [SB("Previous outcome", "chevron-left"), SB("Next outcome", "chevron-right"), SB("Add a goal", "plus")], listTitle: "Goals", listNote: "CORE checked in code",
        items: g.length ? g.map(function (x, i) { var m = P4.coreCheck(x); return item(i + 1, esc(x.title), '<span class="cwl-wf-letters-app">' + P4.LETTERS.map(function (l) { return '<span class="' + (m.indexOf(l[0]) >= 0 ? "is-missing" : "") + '" title="' + l[1] + '">' + l[0] + "</span>"; }).join("") + "</span> &nbsp;" + (x.owner ? esc(x.owner) : "") + (x.end ? " · " + esc(x.end) : "") + (x.risk ? " · risk " + x.risk : "") + (m.length ? " · " + FLAG(P4.NEEDS[m[0]]) : ""), [x.result && !x.confirmed ? SB("Result is clear", "check") : "", P4.IB("pencil", "Edit goal")]); }) : [item("", "No goals yet", "Phones propose, or add one here", [])],
        side: PRIVATE("Edit goal 2", '<dl class="cwl-wf-kv"><dt>Goal</dt><dd>Design the leader residency</dd><dt>Result</dt><dd><input class="cwl-a-input" placeholder="What done looks like" aria-label="Result"></dd><dt>Owner</dt><dd><input class="cwl-a-input" value="Mark Ellison" aria-label="Owner"></dd><dt>End date</dt><dd>Aug 31, ' + Y.outlook + ' · season end</dd><dt>Risk</dt><dd>' + (st === "Day and a half" ? "Added after the follow-up" : "1. We tried all five at once") + "</dd></dl>") + P4.SIGNAL_SLOT });
    },
    remote: function (box, st) { P4.remote(box, { title: "1-year Outlook", buttons: '<div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-label">Working block</span><span class="cwl-a-label tnum">22:10</span></div><div class="cwl-r-grid">' + P4.rbtn("Minus 1", "minus") + P4.rbtn("Plus 1", "plus") + "</div>" + '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" }); }
  });

  /* D2-11: handing over the remote */
  (function () {
    var b = board("d2-11", "The team takes the remote", ["D2-11", "RemoteHandover"], "The facilitator picks a person and their phone becomes the remote for the team-led block, with a switch between the remote and their own participant view. The team facilitator's remote hides presenter notes, other sessions and the alignment signal. The facilitator sees who has it and can take it back at any moment without the TV changing. The scribe console is off for the block.");
    var tabs = h("div", "cwl-tabs sc-tabs"); b.appendChild(tabs);
    var cap = h("p", "sc-note"); b.appendChild(cap);
    var r = row(b, "is-phones"); r.style.gridTemplateColumns = "repeat(3, 220px) minmax(0, 1fr)";
    var r2 = row(b, "is-1");
    var STATES = ["Choose a person", "Priya has the remote", "Priya's own view", "Take it back", "Block ends", "Offline and queued", "Reduced motion"];
    function draw(st) {
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.textContent === st ? "true" : "false"); });
      r.innerHTML = ""; r2.innerHTML = "";
      var held = st === "Priya has the remote" || st === "Priya's own view" || st === "Offline and queued" || st === "Reduced motion";
      /* the facilitator's remote */
      var fb = frame(r, "Chris's remote", "is-phone");
      if (st === "Choose a person") P4.remote(fb, { title: "1-year Outlook", top: '<div class="cwl-a-label">Hand the remote to</div>' + W.people.slice(0, 4).map(function (n, i) { return '<div class="cwl-wf-person' + (i === 1 ? " is-on" : "") + '"><span class="cwl-a-avatar">' + n.charAt(0) + '</span><span class="grow">' + esc(n) + "</span>" + (i === 1 ? L("check") : "") + "</div>"; }).join(""), buttons: P4.rbtn("Hand over for the team-led block", "hand-helping", "is-primary") + '<div class="cwl-a-muted">Commander\'s intent through affirming the cards</div>' });
      else P4.remote(fb, { held: held, title: held ? "Commander's intent" : "Draft Clearway Map", banner: held ? '<div class="cwl-wf-holder">' + L("hand-helping") + '<span class="grow">Priya has the remote</span><button type="button" class="cwl-a-btn is-sm">Take back</button></div>' : st === "Take it back" ? '<div class="cwl-a-banner is-info" role="status"><span class="ic">' + L("check") + "</span><div>You have the remote. The TV didn't change.</div></div>" : '<div class="cwl-a-banner is-info" role="status"><span class="ic">' + L("check") + "</span><div>The block ended. The remote is back with you.</div></div>",
        sync: st === "Offline and queued" ? SYNC("is-syncing", "refresh-cw", "Syncing") : SYNC("", "check", "On the TV"), buttons: '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" + P4.rbtn("Phones down", "smartphone") });
      /* Priya's phone */
      var pb = frame(r, "Priya's phone", "is-phone");
      if (st === "Priya has the remote" || st === "Offline and queued" || st === "Reduced motion") {
        var el = CL.appPhone(pb, "control");
        el.innerHTML = '<div class="cwl-ph-head" style="border-color:var(--cwl-app-border)"><span class="cwl-a-label">' + esc(W.church) + "</span>" + (st === "Offline and queued" ? SYNC("is-syncing", "wifi-off", "Reconnecting") : SYNC("", "check", "On the TV")) + '</div><div class="cwl-r-body"><div class="cwl-wf-holder">' + L("hand-helping") + '<span class="grow">You have the remote</span></div><div class="cwl-wf-ph-switch" style="box-shadow:inset 0 0 0 1px var(--cwl-app-border-strong)"><span class="is-on" style="background:var(--cwl-app-text);color:var(--cwl-app-card)">Remote</span><span style="color:var(--cwl-app-text)">My card</span></div><div class="cwl-a-eyebrow">Team-led block</div>' +
          ["Commander's intent", "Affirm together"].map(function (n, i) { return '<div class="cwl-wf-person' + (i === 0 ? " is-on" : "") + '"><span class="grow">' + n + "</span>" + (i === 0 ? CHIP("Live", "run-live", "radio") : "") + "</div>"; }).join("") +
          '<div class="cwl-r-grid">' + P4.rbtn("Assign pairs", "users") + P4.rbtn("Clock", "timer") + "</div>" + P4.rbtn("Next: present", "chevron-right", "is-primary") + "</div>";
        CL.icons();
      } else if (st === "Priya's own view") {
        var ph = P4.phone(pb, { head: "live" });
        ph.body.innerHTML = '<div class="cwl-wf-ph-banner">' + L("hand-helping") + '<span style="flex:1">You have the remote</span><span>Open</span></div><div class="cwl-ph-muted">Your card · with Sam</div><div class="cwl-ph-prompt">Leaders raised from within</div><div class="cwl-wf-ph-field"><label>Commander\'s intent</label><textarea class="cwl-ph-input" rows="2" tabindex="-1">Every ministry is growing its own next leader.</textarea></div>';
        ph.foot.innerHTML = PH.btn("Save", { icon: "check" });
      } else {
        var ph2 = P4.phone(pb, { head: "live" });
        ph2.body.innerHTML = (st === "Choose a person" ? "" : '<div class="cwl-wf-ph-banner">' + L("hand-helping") + '<span style="flex:1">Chris has the remote</span></div>') + '<div class="cwl-ph-muted">' + (st === "Choose a person" ? "1-year Outlook" : "Draft Clearway Map") + '</div><div class="cwl-ph-text">' + (st === "Choose a person" ? "Propose a goal on your phone." : "Read along. The Map is on the screen.") + "</div>";
      }
      /* co-facilitator */
      var cb = frame(r, "Co-facilitator's remote", "is-phone");
      P4.remote(cb, { held: held, title: held ? "Commander's intent" : "1-year Outlook", banner: held ? '<div class="cwl-wf-holder">' + L("hand-helping") + '<span class="grow">Priya has the remote</span></div>' : "", buttons: '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" });
      /* TV unchanged */
      var tb = frame(r, "TV · unchanged by the handover", "is-tv");
      var tv = CL.stage(tb, "dark"); CL.screenTexture(tv, "input");
      var tt = h("div", "cwl-tv-top"); tt.innerHTML = window.ClearwayLivePass2.lockup() + CL.liveMark("live", true); tv.appendChild(tt);
      var c = h("div", "cwl-tv-content"); tv.appendChild(c); c.innerHTML = '<div class="cwl-tv-eyebrow">Commander\'s intent · team-led</div><div class="cwl-tv-headline">One card for <strong>each outcome</strong></div>';
      /* control surface */
      var a = app(r2, "Control surface · who has the remote", 1280, 400, "control");
      P4.ctl(a, { part: "Day 2", title: "Commander's intent", chips: [CHIP("Team-led", "run-team-led", "users"), held ? CHIP("Priya has the remote", "is-outline", "hand-helping") : CHIP("You have the remote", "is-outline", "hand")], tools: held ? [B("Take back", "is-primary is-sm", "hand")] : [SB("Hand over", "hand-helping")], listTitle: "Team-led block", listNote: "Scribe console off for the block",
        items: [item("1:10", "Commander's intent", "Pairs draft one card per Vision Outcome", [CHIP(st === "Block ends" ? "Done" : "Live", st === "Block ends" ? "run-done" : "run-live", st === "Block ends" ? "check-check" : "radio")]), item("2:30", "Affirm together", "Sign together", [CHIP(st === "Block ends" ? "Done" : "Ready", st === "Block ends" ? "run-done" : "run-ready", "circle-check")]), item("2:45", "Recap · draft Clearway Map", "Returns to you after the block", [CHIP(st === "Block ends" ? "Live" : "Ready", st === "Block ends" ? "run-live" : "run-ready", st === "Block ends" ? "radio" : "circle-check")])],
        side: PRIVATE("Remote", '<div class="cwl-a-li"><span class="cwl-a-avatar">P</span><span class="grow">' + (held ? "Priya Shah holds the remote" : "You hold the remote") + '</span></div><div class="cwl-a-muted">Taking it back never changes the TV. Publishing to CORE needs the lead facilitator.</div>') + P4.SIGNAL_SLOT });
      cap.textContent = { "Choose a person": "The facilitator picks Priya from the attendees. The block runs from commander's intent through affirming the cards.", "Priya has the remote": "Priya's phone is the remote: only the team-led sessions, no presenter notes, no signal. Chris and the co-facilitator see 'Priya has the remote' and keep Take back.", "Priya's own view": "Priya switches to her own card to draft with Sam. The remote banner stays one tap away.", "Take it back": "Chris takes the remote back. Priya's phone shows 'Chris has the remote' and returns to participant mode. The TV didn't move.", "Block ends": "After the block's last session the remote returns to Chris on its own.", "Offline and queued": "Priya's phone loses the network: her remote shows Reconnecting and Chris can take it back at once.", "Reduced motion": "The banners and controls change in place, without sliding." }[st];
      CL.icons();
      if (window.ClearwayLivePass4Motion && st !== "Reduced motion") window.ClearwayLivePass4Motion.handIn(r);
    }
    STATES.forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.textContent = s; t.onclick = function () { draw(s); }; tabs.appendChild(t); });
    requestAnimationFrame(function () { draw("Priya has the remote"); });
  })();

  /* INT-16, D2-12, D2-13: commander's intent */
  var intentAt = function (st) {
    var c = clone(W.intent);
    if (st === "Pairs assigned") c.forEach(function (x) { x.intent = x.must = x.stop = ""; x.steps = []; });
    if (st === "Typing") c[0].intent = W.intentTyping[1];
    if (/Crowded/.test(st)) c.push({ o: "o6", title: "Prayer that leads", pair: ["Jaisy", "Owen"], intent: "Prayer shapes every decision we make.", must: "", stop: "", steps: [] });
    if (st === "Very long text") c[1].intent = "People meet Jesus here, in our groups, our neighbourhood and our Sunday gatherings, and can tell the story of what changed in their own words";
    if (st === "First item") { c.forEach(function (x, i) { if (i) { x.intent = x.must = x.stop = ""; x.steps = []; } else { x.must = x.stop = ""; x.steps = []; } }); }
    return c;
  };
  intBoard({ id: "d2-12", title: "Commander's intent, team-led", ids: ["INT-16", "D2-12", "D2-13", "IntentCard"], eyebrow: "Commander's intent · team-led", headline: "One card for <strong>each Vision Outcome</strong>", unit: "cards",
    note: "Pairs or trios draft one card per outcome. Each field is locked to one phone while someone types in it and released after a few seconds idle. The TV shows each field as it's typed. A first step without an owner or a date is flagged. Then pairs present: one card fills the TV, and edits replace the old line as they're typed. No scribe in this block.",
    states: ["Pairs assigned", "First item", "Drafting", "Typing", "First step flagged", "Presenting", "Presenting, edit", "Crowded, 50 phones", "Offline and queued", "Phones down", "Reduced motion", "Very long text"],
    start: "Drafting",
    make: function (ctx) { return new P4.IntentBoard(ctx.sh.host); },
    tv: function (ctx, st, inst) {
      var c = intentAt(st), pres = /Presenting/.test(st) || st === "First step flagged";
      ctx.sh.prompt("Commander's intent · team-led", pres ? "" : "One card for <strong>each Vision Outcome</strong>");
      ctx.sh.headEl.style.display = pres ? "none" : "";
      var o = { instant: inst, present: pres ? (st === "First step flagged" ? 1 : 0) : null, typing: st === "Typing" ? { card: "o1", field: "intent" } : null };
      if (st === "Presenting, edit") { c[0].intent = "Every ministry is growing its own next leader."; o.typing = { card: "o1", field: "must" }; }
      ctx.view.set(c, o);
      if (st === "Presenting, edit") later(function () { c[0].must = "Name an apprentice in every ministry by Easter."; ctx.view.set(c, { present: 0, typing: { card: "o1", field: "must" } }); }, inst ? 400 : 900);
      if (st === "Typing") { var k = 1; CL.every(function () { k = Math.min(W.intentTyping.length - 1, k + 1); c[0].intent = W.intentTyping[k]; ctx.view.set(c, { typing: { card: "o1", field: "intent" } }); }, 900); }
      ctx.sh.count(c.length, "cards", true);
      ctx.sh.foot('<span class="cwl-wf-confirm-foot">' + L("clock") + (st === "Drafting" ? " 18:20 left" : " +1:30") + "</span>");
      return {
        "Pairs assigned": "The team facilitator assigned pairs from the remote. Each card waits for its pair.",
        "First item": "Priya and Sam write the first line on their card. The others wait.",
        "Drafting": "Every card filling in at once: each shows its intent line live, how many of the four fields are filled, and a flag when a first step needs an owner or date.",
        "Typing": "Priya types the intent: the line grows in place on the TV in batches of cwl-delay-type-batch, with a quiet underline while the field is hers.",
        "First step flagged": "New faith stories presents with a first step that has no owner or date: the step is outlined in Sunrise and says what it needs until it's fixed. On the overview the card itself carries the flag.",
        "Presenting": "The pair presents: their card fills the TV with all four fields and each first step with its owner and date.",
        "Presenting, edit": "An edit during the presentation replaces the old line as it's typed. A rewrite crossfades in place over cwl-dur-line-replace.",
        "Crowded, 50 phones": "Six outcomes: two rows of three. With a big team, trios share a card and field locks keep one person per field.",
        "Reduced motion": "Lines swap in place without a crossfade. The typing underline is still.",
        "Very long text": "The intent line clamps at three lines on the overview and shows whole when presenting."
      }[st] || "";
    },
    phones: function (st) {
      var s = stat(st);
      return [{ label: "Priya · typing the intent", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-muted">Your card · with Sam</div><div class="cwl-ph-prompt">Leaders raised from within</div><div class="cwl-wf-ph-field"><label>Commander\'s intent</label><span class="lock">' + L("pencil") + ' You\'re editing</span><textarea class="cwl-ph-input" rows="2" tabindex="-1">' + esc(W.intentTyping[2]) + '</textarea></div><div class="cwl-wf-ph-field is-locked"><label>The must-do</label><span class="lock">' + L("lock") + ' Sam is typing</span><textarea class="cwl-ph-input" rows="2" tabindex="-1">Name an apprentice in every</textarea></div>'; p.foot.innerHTML = s.down ? PH.down() : PH.btn(s.offline ? "Saved on this phone" : "Save", { icon: "check" }); } },
        { label: "Sam · a first step", render: function (p) { p.body.innerHTML = '<div class="cwl-ph-muted">Next 30 days</div><div class="cwl-wf-ph-field"><label>Step</label><input class="cwl-ph-input" value="Ask three people to share a baptism story" tabindex="-1"></div><div class="cwl-wf-ph-field"><label>Owner</label><input class="cwl-ph-input" placeholder="One person" tabindex="-1"></div><div class="cwl-wf-ph-field"><label>Date</label><input class="cwl-ph-input" placeholder="By when" tabindex="-1"></div><div><span class="cwl-wf-flag-tag" style="font-size:13px">' + L("circle-alert") + " Needs an owner and a date</span></div>"; p.foot.innerHTML = PH.btn("Add step", { icon: "plus" }); } }];
    },
    control: function (a, st) {
      var c = intentAt(st);
      P4.ctl(a, { part: "Day 2 · team-led", title: "Commander's intent", chips: [CHIP("Team-led", "run-team-led", "users"), CHIP("Priya has the remote", "is-outline", "hand-helping")], sync: syncFor(st), banner: bannerFor(st), tools: [B("Take back", "is-primary is-sm", "hand")], listTitle: "Cards", listNote: "Editable here at any time",
        items: c.map(function (x, i) { var bad = (x.steps || []).filter(function (s) { return P4.stepMissing(s).length; }).length; return item(i + 1, esc(x.title || P4.outcomeById(x.o).name), esc(x.pair.join(" and ")) + " · " + [x.intent, x.must, x.stop, (x.steps || []).length].filter(Boolean).length + " of 4" + (bad ? " · " + FLAG(bad + " step needs an owner or date") : ""), [P4.IB("pencil", "Edit card")]); }),
        side: PRIVATE("Remote", '<div class="cwl-a-li"><span class="cwl-a-avatar">P</span><span class="grow">Priya Shah holds the remote</span></div>') + P4.SIGNAL_SLOT });
    },
    remote: function (box, st) {
      var el = CL.appPhone(box, "control");
      el.innerHTML = '<div class="cwl-ph-head" style="border-color:var(--cwl-app-border)"><span class="cwl-a-label">' + esc(W.church) + "</span>" + SYNC("", "check", "On the TV") + '</div><div class="cwl-r-body"><div class="cwl-wf-holder">' + L("hand-helping") + '<span class="grow">You have the remote</span></div><div class="cwl-a-eyebrow">Team-led block · no notes</div><div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-label">Clock</span><span class="cwl-a-label tnum">' + (st === "Drafting" ? "18:20" : "+1:30") + '</span></div><div class="cwl-r-grid">' + P4.rbtn("Assign pairs", "users") + P4.rbtn("Present", "presentation") + "</div>" + P4.rbtn("Next card", "chevron-right", "is-primary") + "</div>";
      CL.icons();
    },
    remoteLabel: "Priya's remote"
  });

  /* D2-14: affirm together */
  (function () {
    var b = board("d2-14", "Affirm together", ["D2-14", "INT-10"], "Team-led. The room affirms the full set of cards with the pass 3 sign together interaction: names gather beneath the cards.");
    var r = row(b, "is-tv1"); r.style.gridTemplateColumns = "minmax(0, 1fr) 220px";
    var sh = P4.shell(frame(r, "TV", "is-tv"), { eyebrow: "Commander's intent", headline: "We affirm <strong>these five cards</strong>", unit: "signed", tally: false });
    var list = h("div"); list.style.cssText = "display:flex;gap:16px;flex-wrap:wrap;margin-bottom:28px"; list.innerHTML = W.confirmedOutcomes.map(function (o, i) { return '<span class="cwl-marker"><b>' + (i + 1) + "</b> " + esc(o.name) + "</span>"; }).join(""); sh.host.appendChild(list);
    var sign = new P3.Sign(sh.host, { total: 8 });
    requestAnimationFrame(function () { sign.set(W.people.slice(0, 6).map(function (n, i) { return { id: "p" + i, name: n, sig: D3.sign.sigs[i] }; }), { instant: true }); });
    var ph = P4.phone(frame(r, "Phone", "is-phone"), {}); ph.body.innerHTML = '<div class="cwl-ph-prompt">We affirm these five cards</div><div class="cwl-ph-muted">Sign with your finger</div><div class="p3-sigpad" style="height:160px;border-radius:8px;box-shadow:inset 0 0 0 2px var(--cwl-border-strong)"></div>'; ph.foot.innerHTML = PH.btn("Affirm", { icon: "check", cls: "is-confirm" });
    CL.icons();
  })();

  /* D2-15: the draft Clearway Map */
  intBoard({ id: "d2-15", title: "Recap: the draft Clearway Map", ids: ["D2-15", "ClearwayMapDraft"], eyebrow: "Draft Clearway Map", headline: "", unit: "", tally: false,
    note: "The draft Map assembles at the close of Day 2 from the engagement: identity fields from setup, the 10-year Future from the read-back, the confirmed outcomes, the goals, the rhythms and the key issues. A field with nothing in it shows as empty, never filled in. This Year's Priorities stays empty, left for Annual Planning.",
    states: ["Assembling", "Page 1", "Page 2", "Empty fields", "Day and a half", "Reduced motion", "Very long text"],
    start: "Page 1",
    make: function (ctx) { ctx.sh.headEl.style.display = "none"; return new P4.MapDraft(ctx.sh.host); },
    tv: function (ctx, st, inst) {
      var page = st === "Page 2" || st === "Day and a half" ? 2 : 1, data = {};
      if (st === "Empty fields") data = { outcomes: [], goals: [] };
      if (st === "Very long text") data = { outcomes: W.outcomes.map(function (o, i) { return i === 3 ? { name: W.longOutcome } : o; }) };
      ctx.sh.prompt("Draft Clearway Map · page " + page + (page === 1 ? " · Identity and Direction" : " · Action"), "");
      ctx.sh.headEl.style.display = "none";
      if (st === "Assembling") { ctx.view.page = null; ctx.view.set({ page: 1, upTo: 0, instant: true }); var n = 0; CL.every(function () { n++; ctx.view.set({ page: 1, upTo: n }); }, 280); }
      else ctx.view.set({ page: page, instant: inst, data: data });
      ctx.button("Play: the Map assembling", "play", function () { ctx.sh.tv.setAttribute("data-motion", "full"); ctx.view.page = null; ctx.view.set({ page: 1, upTo: 0, instant: true }); CL.clearTimers(); var n = 0; CL.every(function () { n++; ctx.view.set({ page: 1, upTo: n }); }, 240); });
      return { "Assembling": "Fields rise into place in reading order, cwl-delay-map-step apart.", "Page 1": "Identity and Direction. Purpose is empty: it comes from Kingdom Assignment, which hasn't happened yet.", "Page 2": "Action. This Year's Priorities stays empty, left for Annual Planning.", "Empty fields": "With nothing confirmed, the 3-year Vision Outcomes field shows empty. Nothing is filled in to look complete.", "Day and a half": "After the half day: outcomes and goals are ready, while key issues wait for the pre-mortem in the follow-up session.", "Reduced motion": "The Map is there at once.", "Very long text": "A long outcome name wraps within its line." }[st];
    },
    phones: function () { return [{ label: "Phone · read along", o: { head: "live" }, render: function (p) { p.body.innerHTML = '<div class="cwl-ph-muted">Draft Clearway Map</div><div class="cwl-ph-headline">Riverside Church</div><div class="cwl-ph-text"><b>Mission</b><br>' + esc(W.map.mission) + '</div><div class="cwl-ph-text"><b>Purpose</b><br><span class="cwl-marker">' + L("circle-dashed") + ' Empty until Kingdom Assignment</span></div><div class="cwl-ph-text"><b>3-year Vision · ' + Y.vision + "</b><br>" + W.confirmedOutcomes.map(function (o, i) { return (i + 1) + ". " + esc(o.name); }).join("<br>") + "</div>"; } }]; },
    control: function (a, st) {
      var M = W.map, half = st === "Day and a half";
      a.setAttribute("data-surface", "setup");
      a.innerHTML = '<div class="cwl-a-pad" style="gap:12px;overflow:hidden"><div class="cwl-a-row" style="justify-content:space-between"><div><div class="cwl-a-eyebrow">Riverside Church · Day 2</div><div class="cwl-a-section">Draft Clearway Map</div></div><div class="cwl-a-row">' + CHIP("Draft", "run-draft", "pencil-line") + SB("Download PDF", "download") + "</div></div>" +
        '<div class="cwl-wf-mapdoc"><div class="pg"><h4>Page 1 · Identity and Direction</h4>' +
        f("Mission", M.mission) + f("Purpose", "", "Empty until Kingdom Assignment") + f("Values", M.values.join(" · ")) + f("Strategy", M.strategy) + f("10-year Future · " + Y.future, W.lenses.map(function (l) { return l.name + ": " + W.lensLines[l.key]; }).join(" · ")) + f("3-year Vision Outcomes · " + Y.vision, st === "Empty fields" ? "" : W.confirmedOutcomes.map(function (o) { return o.name; }).join(" · ")) +
        '</div><div class="pg"><h4>Page 2 · Action</h4>' + f("This Year's Priorities", "", "Left for Annual Planning") + f("This Season's Goals", st === "Empty fields" ? "" : "Launch the apprentice pathway · Develop a leader in every 1:1") + f("Leadership Rhythms", M.rhythms.join(" · ")) + f("Key Issues", half ? "" : M.keyIssues.join(" · "), half ? "After the follow-up session" : "") + "</div></div></div>";
      CL.icons();
      function f(lb, tx, empty) { return '<div class="f' + (tx ? "" : " is-empty") + '"><b>' + esc(lb) + "</b><p>" + (tx ? esc(tx) : L("circle-dashed") + " " + esc(empty || "Empty")) + "</p></div>"; }
    },
    ctlLabel: "Setup · the draft Map as a document"
  });

  /* ================================================================
     SET-08: templates
     ================================================================ */
  (function () {
    var b = board("set-08", "Templates: Wayfinding and day and a half", ["SET-08"], "Both templates ship with the app. Starting an engagement from one copies its sessions, prompts with years as values, interactions, timings, presenter notes, segments and the team-led block. The day-and-a-half template ends the half day after confirming outcomes and the 1-year Outlook, and moves the pre-mortem and commander's intent to a follow-up session.");
    var tabs = h("div", "cwl-tabs sc-tabs"); b.appendChild(tabs);
    var r = row(b, "is-1");
    var ROS = {
      full: [["Pre-call", [["0:00", "Welcome and prayer", "Scripture, then join"], ["0:10", "Celebrations", "Word cloud, then wall"], ["0:25", "Metrics", "Ranking"], ["0:40", "What we heard", "Headlines, then Q&A"], ["1:10", "Seed the Five Lenses", "Lens seeding, self-paced"]]],
        ["Day 1", [["9:00", "Welcome and prayer", "Join, then Scripture"], ["9:15", "Celebration, short", "Word cloud"], ["9:35", "Five Lenses: Congregation", "Lens wall · segment"], ["10:45", "Five Lenses: Community", "Lens wall · segment"], ["12:30", "Leadership, Operations, Learning", "Lens wall · segment"], ["2:45", "Provisional Vision Outcomes", "Cluster and rename, 100 points"], ["3:45", "3-year Vision, first pass", "Outcome bullets"], ["4:15", "Close", "Scripture"]]],
        ["Day 2", [["8:30", "Prayer and listening", "Prayer, then open text"], ["9:00", "Read-back", "Read-back"], ["9:30", "Confirm the Vision Outcomes", "Outcome confirm"], ["10:00", "Pre-mortem", "2x2 grid"], ["10:45", "1-year Outlook", "CORE goal builder"], ["1:00", "The team takes the remote", "Hand over", "team"], ["1:10", "Commander's intent", "Intent card", "team"], ["2:30", "Affirm together", "Sign together", "team"], ["2:45", "Recap", "Draft Clearway Map"], ["3:10", "Publish and close", "Publish to CORE"]]]],
      half: [["Day 1", [["9:00", "Welcome through Five Lenses", "As the full template"], ["2:45", "Provisional Vision Outcomes", "Cluster and rename, 100 points"], ["3:45", "3-year Vision, first pass", "Outcome bullets"]]],
        ["Day 2, half day", [["8:30", "Prayer and listening", "Prayer, then open text"], ["9:00", "Read-back", "Read-back"], ["9:30", "Confirm the Vision Outcomes", "Outcome confirm"], ["10:00", "1-year Outlook", "CORE goal builder · no risk links yet"], ["11:30", "Close and draft Map", "Draft Clearway Map, what's ready"], ["11:50", "Publish to CORE", "Outcomes and goals"]]],
        ["Follow-up, on video", [["0:00", "The team takes the remote", "Hand over", "team"], ["0:05", "Pre-mortem", "2x2 grid", "team moved"], ["0:35", "Link goals to risks", "CORE goal builder", "team moved"], ["0:50", "Commander's intent", "Intent card", "team moved"], ["1:50", "Affirm together", "Sign together", "team"], ["2:00", "Publish commander's intent", "Second, additive publish"]]]]
    };
    function draw(which) {
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.getAttribute("data-k") === which ? "true" : "false"); });
      r.innerHTML = "";
      var a = app(r, "Setup · new engagement from a template", 1280, 1180, "setup");
      var parts = ROS[which === "half" ? "half" : "full"];
      a.innerHTML = '<div class="cwl-wf-tpl"><aside class="cwl-wf-tpl-side"><div class="cwl-a-label">Templates</div>' +
        [["full", "Wayfinding", "Pre-call, two days, overnight review"], ["half", "Wayfinding, day and a half", "Half day, then a team-led follow-up"], ["ws", "Team workshop", "Library sessions"], ["pr", "Practice", "The practice room"]].map(function (t) { return '<div class="cwl-wf-tpl-card' + (t[0] === which ? " is-on" : "") + '"><b>' + esc(t[1]) + '</b><span class="cwl-a-muted">' + esc(t[2]) + "</span></div>"; }).join("") +
        '<div class="cwl-a-field" style="margin-top:8px"><label class="cwl-a-flabel">Base year</label><input class="cwl-a-input" value="' + W.base + '"><div class="cwl-a-help">10-year Future ' + Y.future + ' · 3-year Vision ' + Y.vision + " · 1-year Outlook " + Y.outlook + '</div></div><div class="cwl-a-field"><label class="cwl-a-flabel">Lens names</label><div style="display:flex;flex-wrap:wrap;gap:6px">' + W.lenses.map(function (l) { return P4.ctlLens(l.key); }).join("") + '</div><div class="cwl-a-help">Rename Congregation to Customer for an organization that isn\'t a church.</div></div>' +
        (which === "half" ? '<div class="cwl-a-field"><label class="cwl-a-flabel">Follow-up</label><input class="cwl-a-input" value="On video, within two weeks"></div>' : "") + "</aside>" +
        '<div class="cwl-wf-tpl-main"><div class="cwl-a-row" style="justify-content:space-between"><div><div class="cwl-a-eyebrow">Run of show preview</div><div class="cwl-a-section">' + (which === "half" ? "Wayfinding, day and a half" : "Wayfinding") + '</div></div>' + B("Start engagement from this template", "is-primary", "arrow-right") + '</div><div class="cwl-wf-ros">' +
        parts.map(function (p) { return '<div class="cwl-wf-ros-part"><span>' + esc(p[0]) + "</span><span>" + p[1].length + " sessions</span></div>" + p[1].map(function (s) { var team = /team/.test(s[3] || ""), moved = /moved/.test(s[3] || ""); return '<div class="cwl-wf-ros-row' + (team ? " is-team" : "") + (moved ? " is-moved" : "") + '"><span class="tm">' + s[0] + '</span><span class="nm">' + esc(s[1]) + '</span><span class="int">' + esc(s[2]) + "</span><span>" + (team ? CHIP("Team-led", "run-team-led", "users") : "") + "</span><span>" + (moved ? CHIP("Moved from Day 2", "is-outline", "move-right") : "") + "</span></div>"; }).join(""); }).join("") + "</div></div></div>";
      CL.icons();
    }
    [["full", "Wayfinding"], ["half", "Day and a half"]].forEach(function (t) { var x = h("button", "cwl-tab"); x.type = "button"; x.textContent = t[1]; x.setAttribute("data-k", t[0]); x.onclick = function () { draw(t[0]); }; tabs.appendChild(x); });
    requestAnimationFrame(function () { draw("full"); });
  })();
})();
