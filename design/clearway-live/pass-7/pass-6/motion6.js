/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 6 · motion6.js
   The six new movements, each with its tokens, a short prototype and its
   reduced-motion equivalent. The prototypes run the same components as the
   screens, so what plays here is what the boards do.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P4 = window.ClearwayLivePass4, P6 = window.ClearwayLivePass6, D = window.ClearwayLivePass6Data, W = window.ClearwayLivePass4Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide;
  var host = document.getElementById("motion");
  if (!host) return;
  function clone(a) { return JSON.parse(JSON.stringify(a)); }

  function proto(spec) {
    var s = h("section", "sc-board"); s.id = spec.id;
    s.innerHTML = '<header class="sc-head"><div><div class="sc-ids"><span class="sc-id">Motion ' + spec.n + '</span><span class="sc-id">' + esc(spec.comp) + '</span></div><h2></h2></div></header><p class="sc-note"></p><div class="sc-actions" data-surface="setup" data-theme="light"></div><div class="sc-row is-1"></div><div class="sc-table"><table class="p4-motion-tok"><thead><tr><th>Token</th><th>Value</th><th>Use</th></tr></thead><tbody></tbody></table></div><p class="sc-note"><b>Reduced motion:</b> <span class="rm"></span></p>';
    s.querySelector("h2").textContent = spec.title; s.querySelector(".sc-note").textContent = spec.note; s.querySelector(".rm").textContent = spec.reduced;
    host.appendChild(s);
    var nav = document.getElementById("toc"); if (nav) { var a = h("a"); a.href = "#" + spec.id; a.textContent = "Motion " + spec.n + ": " + spec.short; nav.appendChild(a); }
    s.querySelector("tbody").innerHTML = spec.tokens.map(function (t) { return "<tr><td><code>" + t[0] + "</code></td><td><code>" + esc(CL.v(t[0]) || t[1] || "") + "</code></td><td>" + esc(t[2]) + "</td></tr>"; }).join("");
    var row = s.querySelector(".sc-row"); row.style.gridTemplateColumns = spec.cols || "minmax(0, 1fr)";
    var acts = s.querySelector(".sc-actions"), ctx = { row: row, motion: "full" };
    spec.build(ctx);
    function btn(label, icon, fn) { var b = h("button", "cwl-a-btn is-secondary"); b.type = "button"; b.innerHTML = L(icon) + "<span>" + esc(label) + "</span>"; b.onclick = fn; acts.appendChild(b); return b; }
    btn("Play", "play", function () { stop(spec.id); spec.play(ctx, function (fn, t) { at(spec.id, fn, t); }); });
    var rb = btn("Reduced motion: off", "accessibility", function () {
      ctx.motion = ctx.motion === "full" ? "reduced" : "full";
      rb.querySelector("span").textContent = "Reduced motion: " + (ctx.motion === "reduced" ? "on" : "off");
      row.querySelectorAll("[data-surface]").forEach(function (e) { e.setAttribute("data-motion", ctx.motion); });
    });
    CL.icons();
  }
  function frame(parent, label, cls) { var f = h("figure", "sc-frame " + (cls || "is-tv")); f.innerHTML = '<figcaption class="sc-label"></figcaption><div class="sc-box"></div>'; f.querySelector(".sc-label").textContent = label; parent.appendChild(f); return f.querySelector(".sc-box"); }
  function app(parent, label, w, hgt, surface) { return CL.appFrame(frame(parent, label, "is-app"), w, hgt, surface); }
  var runs = {};
  function stop(id) { (runs[id] || []).forEach(function (t) { clearTimeout(t); }); runs[id] = []; }
  function at(id, fn, t) { (runs[id] = runs[id] || []).push(setTimeout(fn, t)); }
  function themes(ids, o) {
    o = o || {};
    return ids.map(function (id, i) { var t = clone(D.theme(id)); t.of = o.of || D.survey.responses; t.order = i; t.src = "Survey"; t.state = (o.accepted || []).indexOf(id) >= 0 ? "accepted" : "draft"; if (o.counts && o.counts[id] != null) t.n = o.counts[id]; return t; });
  }

  /* 1. New responses arriving */
  proto({ id: "m-responses", n: 1, short: "new responses arriving", comp: "ResponseCount · QuestionResult", cols: "minmax(0, 1fr)",
    title: "New responses arriving",
    note: "In setup, while the survey is still open, Refresh reads Team Hub again. The count rolls from what it was to the new total over cwl-dur-bar-grow, and a quiet chip says how many are new. Choice bars and scale columns grow in place from their current length on the same duration and the signature easing. Options keep the survey's own order, so nothing trades places and nothing jumps.",
    reduced: "The count, bars and columns take their new values at once. The chip appears in place.",
    tokens: [["cwl-dur-bar-grow", "", "The count rolling up, and bars and columns growing from their current length"], ["cwl-ease-signature", "", "Easing for all three"], ["cwl-dur-settle-color", "", "The new-responses chip fading in"], ["cwl-dur-reduced", "", "The reduced-motion fade"]],
    build: function (ctx) {
      var a = app(ctx.row, "Setup · SET-04 and its results", 1280, 470, "setup");
      a.innerHTML = '<div style="padding:20px;display:grid;grid-template-columns:300px minmax(0,1fr) minmax(0,1fr);gap:20px;height:100%;background:var(--cwl-app-page)"><div class="m1c"></div><div class="cwl-a-card m1s" style="padding:16px"></div><div class="cwl-a-card m1b" style="padding:16px"></div></div>';
      ctx.rc = new P6.ResponseCount(a.querySelector(".m1c"));
      ctx.qs = new P6.QuestionResult(a.querySelector(".m1s")); ctx.qb = new P6.QuestionResult(a.querySelector(".m1b"));
      ctx.reset = function () { ctx.rc.set(75, { instant: true, read: "3:40 pm" }); ctx.qs.set(D.q("q1"), { counts: [2, 4, 12, 27, 30], instant: true }); ctx.qb.set(D.q("q2"), { counts: [3, 6, 33, 22, 11], instant: true }); };
      requestAnimationFrame(function () { ctx.reset(); });
    },
    play: function (ctx, later) {
      ctx.reset();
      later(function () { ctx.rc.set(75, { refreshing: true, instant: true, read: "3:40 pm" }); }, 300);
      later(function () { ctx.rc.set(87, { read: "4:12 pm" }); ctx.qs.set(D.q("q1"), {}); ctx.qb.set(D.q("q2"), {}); }, 1200);
    }
  });

  /* 2. A theme growing */
  proto({ id: "m-grow", n: 2, short: "a theme growing", comp: "ThemeList · DiscoverTheme", cols: "minmax(0, 820px)",
    title: "A theme growing",
    note: "New answers join their themes on a refresh. Each count rolls up and its bar grows over cwl-dur-bar-grow. When the order changes, themes glide past each other to their new places (FLIP over cwl-dur-make-room on the signature easing). A theme that appears for the first time arrives with cwl-dur-arrive.",
    reduced: "Counts and bars take their new values and the list reorders in place.",
    tokens: [["cwl-dur-bar-grow", "", "A count rolling and its bar growing"], ["cwl-dur-make-room", "", "Themes trading places (FLIP)"], ["cwl-dur-arrive", "", "A new theme arriving"], ["cwl-ease-signature", "", "Easing for the glide and the bars"]],
    build: function (ctx) {
      var a = app(ctx.row, "Setup · SET-04 results · What could improve", 760, 560, "setup");
      a.innerHTML = '<div style="padding:20px;height:100%;background:var(--cwl-app-page)"></div>';
      ctx.tl = new P6.ThemeList(a.firstChild, { quotes: false });
      ctx.reset = function () { ctx.tl.set(themes(["t1", "t2", "t3", "t4"], { of: 61, counts: D.draftAt.counts }), { instant: true }); };
      requestAnimationFrame(function () { ctx.reset(); });
    },
    play: function (ctx, later) {
      ctx.reset();
      later(function () { ctx.tl.set(themes(["t1", "t2", "t3", "t4"], { of: 74, counts: { t1: 22, t2: 19, t3: 12, t4: 5 } })); }, 400);
      later(function () { ctx.tl.set(themes(["t1", "t2", "t3", "t4", "t5"])); }, 2000);
    }
  });

  /* 3. Merging and rejecting themes */
  proto({ id: "m-merge", n: 3, short: "merging themes", comp: "ThemeList", cols: "minmax(0, 1fr) minmax(0, 1fr)",
    title: "Merging themes, and rejecting one",
    note: "Merge: the theme being folded glides into the one it joins and fades as it goes (cwl-dur-regroup on cwl-ease-calm), the survivor holds a focus ring meanwhile, then the counts add with a roll and the list closes up (cwl-dur-make-room). The survivor says it was merged from 2. Reject: the theme fades and shrinks out (cwl-dur-hide on cwl-ease-exit) and the themes below rise into its place.",
    reduced: "The folded or rejected theme disappears and the counts change in place.",
    tokens: [["cwl-dur-regroup", "", "A theme gliding into the one it joins"], ["cwl-ease-calm", "", "Easing for the glide"], ["cwl-dur-bar-grow", "", "The added count rolling up"], ["cwl-dur-hide", "", "A rejected theme leaving"], ["cwl-ease-exit", "", "Easing for leaving"], ["cwl-dur-make-room", "", "The list closing up"]],
    build: function (ctx) {
      var a = app(ctx.row, "Merge · What's unclear", 620, 420, "setup"), b = app(ctx.row, "Reject · What could improve", 620, 420, "setup");
      a.innerHTML = '<div style="padding:20px;height:100%;background:var(--cwl-app-page)"></div>'; b.innerHTML = '<div style="padding:20px;height:100%;background:var(--cwl-app-page)"></div>';
      ctx.ma = new P6.ThemeList(a.firstChild, { quotes: false }); ctx.mb = new P6.ThemeList(b.firstChild, { quotes: false });
      ctx.reset = function () { ctx.ma.set(themes(["t9", "t10"], { accepted: ["t9"] }), { instant: true }); ctx.mb.set(themes(["t3", "t4", "t5"]), { instant: true }); };
      requestAnimationFrame(function () { ctx.reset(); });
    },
    play: function (ctx, later) {
      ctx.reset();
      later(function () { var nx = themes(["t9"], { accepted: ["t9"] }); nx[0].n = 33; nx[0].merged = 2; ctx.ma.merge("t10", "t9", nx); }, 500);
      later(function () { ctx.mb.set(themes(["t3", "t4"]), { foot: "1 rejected: The coffee. Restore" }); }, 2600);
    }
  });

  /* 4. A Four Helpful Lists card landing */
  proto({ id: "m-card", n: 4, short: "a card landing", comp: "FourListsBoard · FourListsCard",
    title: "A Four Helpful Lists card landing",
    note: "A card slides into its column the moment it's sent (cwl-dur-arrive on cwl-ease-arrive) while the cards below make room (FLIP over cwl-dur-make-room), and it takes the screen's Lime moment for cwl-dur-new-hold. A similar card then glides into its survivor and fades as it goes (cwl-dur-regroup on cwl-ease-calm): one card remains, marked as AI with how many it holds, and its agreement count adds. As phones tap Agree, counts tick (cwl-dur-count), the card swells a little (cwl-dur-swell) and glides up its column when it passes another.",
    reduced: "Cards appear in place with the 150ms fade, folds and trades happen in place, and counts change without the tick.",
    tokens: [["cwl-dur-arrive", "", "A card sliding into its column"], ["cwl-ease-arrive", "", "Easing for the arrival"], ["cwl-dur-make-room", "", "Cards below making room, and cards trading places"], ["cwl-dur-new-hold", "", "The newest card's Lime ring"], ["cwl-dur-regroup", "", "A similar card gliding into its survivor"], ["cwl-ease-calm", "", "Easing for the fold"], ["cwl-dur-count", "", "Agreement counts ticking"], ["cwl-dur-swell", "", "A card swelling as it gains agreement"]],
    build: function (ctx) {
      ctx.sh = P4.shell(frame(ctx.row, "TV · 1920 by 1080"), { unit: "cards" });
      ctx.sh.prompt("Four Helpful Lists · Elders", ""); ctx.sh.headEl.style.display = "none";
      ctx.b = new P6.FourListsBoard(ctx.sh.host, { shell: ctx.sh, max: 4 });
      ctx.reset = function () { ctx.cards = clone(D.listCards).map(function (c, i) { c.t = i; return c; }); ctx.b.set(ctx.cards, { instant: true }); ctx.sh.count(ctx.cards.length, "cards", true); };
      requestAnimationFrame(function () { ctx.reset(); });
    },
    play: function (ctx, later) {
      ctx.reset();
      var sim = clone(D.similar); sim.t = 50;
      later(function () { ctx.cards = ctx.cards.concat([sim]); ctx.b.set(ctx.cards, { newest: sim.id }); ctx.sh.count(ctx.cards.length, "cards"); }, 300);
      later(function () { var nx = ctx.cards.filter(function (c) { return c.id !== sim.id; }).map(function (c) { if (c.id === "c7") { c = clone(c); c.agree += 1; c.folded = 1; } return c; }); ctx.cards = nx; ctx.b.fold(sim.id, "c7", nx); ctx.sh.count(nx.length, "cards"); }, 2000);
      ["c8", "c8", "c8", "c8"].forEach(function (id, i) { later(function () { ctx.cards = ctx.cards.map(function (c) { if (c.id === id) { c = clone(c); c.agree += 1; } return c; }); ctx.b.set(ctx.cards); }, 4000 + i * 500); });
    }
  });

  /* 5. A signal card arriving */
  proto({ id: "m-signal", n: 5, short: "a signal arriving", comp: "SignalPanel · SignalCard · SignalList", cols: "460px 240px",
    title: "A signal card arriving",
    note: "A signal comes into the facilitator's private panel quietly: a soft fade and an 8px rise over cwl-dur-signal-in on cwl-ease-calm, slower than a room arrival so it never pulls the eye from the room. No ring, no color flash, no sound. The cards already there make room (FLIP over cwl-dur-make-room). Dismiss fades it out (cwl-dur-hide) and the list closes up. The facilitator's own remote updates its short list in the same moment.",
    reduced: "The card appears and leaves in place.",
    tokens: [["cwl-dur-signal-in", "", "A signal card coming in, quietly (new)"], ["cwl-ease-calm", "", "Easing for the quiet arrival"], ["cwl-dur-make-room", "", "Cards making room and closing up"], ["cwl-dur-hide", "", "A dismissed card leaving"], ["cwl-ease-exit", "", "Easing for leaving"]],
    build: function (ctx) {
      var a = app(ctx.row, "Control surface · the private panel (FAC-02)", 420, 560, "control");
      a.innerHTML = '<div style="padding:14px;height:100%;background:var(--cwl-app-page)">' + P4.PRIVATE("Alignment signal", '<div class="m5"></div>') + "</div>";
      ctx.p = new P6.SignalPanel(a.querySelector(".m5"));
      ctx.rb = frame(ctx.row, "The facilitator's own remote (FAC-03)", "is-phone");
      ctx.remote = function (cards) { ctx.rb.innerHTML = ""; P4.remote(ctx.rb, { title: "Five Lenses: Congregation", top: P6.SignalList(cards, {}), buttons: '<div class="cwl-r-grid">' + P4.rbtn("Burst", "timer", "is-primary") + P4.rbtn("Phones down", "smartphone") + "</div>" }); };
      ctx.reset = function () { ctx.cards = [D.signal("g3")]; ctx.p.set(ctx.cards, { instant: true }); ctx.remote(ctx.cards); };
      requestAnimationFrame(function () { ctx.reset(); });
    },
    play: function (ctx, later) {
      ctx.reset();
      later(function () { ctx.cards = [D.signal("g2")].concat(ctx.cards); ctx.p.set(ctx.cards, {}); ctx.remote(ctx.cards); }, 300);
      later(function () { ctx.cards = [D.signal("g4")].concat(ctx.cards); ctx.p.set(ctx.cards, {}); ctx.remote(ctx.cards); }, 2000);
      later(function () { var nx = ctx.cards.filter(function (c) { return c.id !== "g2"; }); ctx.cards = nx; ctx.p.dismiss("g2", nx, {}); ctx.remote(nx); }, 3800);
    }
  });

  /* 6. The neutral question going to the TV */
  proto({ id: "m-ask", n: 6, short: "the neutral question", comp: "TVLayer · SignalDetail",
    title: "The neutral question going to the TV",
    note: "From a signal card, Put the question on the TV moves the TV from what's live to the question with the same transition as any session change: the question is prepared behind the live screen and crossfades in over cwl-dur-make-room on the signature easing, while the live screen and the room's count fade back. The question carries no data and never names the signal. Back to the wall plays it the other way and the wall is exactly as it was.",
    reduced: "The question and the wall swap with the 150ms fade.",
    tokens: [["cwl-dur-make-room", "", "The crossfade, the same as a session change"], ["cwl-ease-signature", "", "Easing for the crossfade"], ["cwl-dur-reduced", "", "The reduced-motion swap"]],
    build: function (ctx) {
      ctx.sh = P4.shell(frame(ctx.row, "TV · 1920 by 1080"), { lens: "congregation", headline: W.lensPrompt(W.lenses[0]), unit: "sentences" });
      P4.setLens(ctx.sh, "congregation");
      var wall = new P4.LensWall(ctx.sh.host, { labels: D.wallLabels });
      var list = W.congregation.seeded.concat(W.congregation.live.slice(0, 6)).concat(D.serviceSentences);
      requestAnimationFrame(function () { wall.set(list, { instant: true, grouped: list.map(function (x) { return x.id; }), seedNote: "9 from the pre-call" }); ctx.sh.count(list.length, "sentences", true); });
      ctx.layer = new P6.TVLayer(ctx.sh);
    },
    play: function (ctx, later) {
      ctx.layer.clear({ instant: true });
      later(function () { ctx.layer.show(P6.neutralHTML(D.signal("g1").ask), { over: true, ask: true }); }, 300);
      later(function () { ctx.layer.clear(); }, 3200);
    }
  });
})();
