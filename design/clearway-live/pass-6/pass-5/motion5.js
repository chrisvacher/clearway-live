/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 5 · motion5.js
   The six new movements, each with its tokens, a short prototype and its
   reduced-motion equivalent. The prototypes run the same components as the
   screens, so what plays here is what the boards do.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P4 = window.ClearwayLivePass4, P5 = window.ClearwayLivePass5, S = window.ClearwayLivePass5Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide;
  var host = document.getElementById("motion");
  if (!host) return;

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
  var C = S.cards, LIVE = "Five Lenses: Community";
  var Q = [
    { id: "q1", kind: "decision", time: "11:54", text: "Grow the food bank only with the association.", why: "Capacity, not willingness, holds us back." },
    { id: "q2", kind: "quote", time: "11:55", text: "Our building is the north end's living room." },
    { id: "q3", kind: "action", time: "11:57", text: "Ask the north end association to co-lead the food bank.", owner: "Ben Carter" }
  ];

  /* 1. A scribe card landing, and a queued set syncing in order */
  proto({ id: "m-card", n: 1, short: "a scribe card landing", comp: "ScribeCard · ScribeFeed", cols: "minmax(0, 1.4fr) minmax(0, 1fr)",
    title: "A scribe card landing",
    note: "On the console, a captured card arrives at the top of the list (cwl-dur-arrive on cwl-ease-arrive) while the cards below make room (FLIP over cwl-dur-make-room), with a focus ring for cwl-dur-new-hold. The same card lands in the control surface's scribe panel. After an offline stretch, the queued cards are already on the console: they change state in place, one by one, in capture order. On the control surface they arrive cwl-delay-stagger apart, oldest first, so nothing jumps.",
    reduced: "Cards appear in place with the 150ms fade (cwl-dur-reduced). Nothing slides; queued cards change their state chip in place.",
    tokens: [["cwl-dur-arrive", "", "A card arriving at the top"], ["cwl-ease-arrive", "", "Easing for the arrival"], ["cwl-dur-make-room", "", "The cards below sliding down (FLIP)"], ["cwl-dur-new-hold", "", "The focus ring on the newest card"], ["cwl-delay-stagger", "", "Between synced cards landing on the control surface, oldest first"], ["cwl-dur-reduced", "", "The reduced-motion fade"]],
    build: function (ctx) {
      ctx.con = new P5.ScribeConsole(app(ctx.row, "Scribe console", 1280, 640, "scribe"));
      ctx.con.header({ session: LIVE }); ctx.con.composer({ kind: "quote", session: LIVE }); ctx.con.photos([], { instant: true });
      var a = app(ctx.row, "Control surface · scribe panel", 520, 640, "control");
      a.innerHTML = '<div style="padding:16px;height:100%;background:var(--cwl-app-page)">' + P4.PRIVATE("Scribe", '<div class="s5m-feed"></div>') + "</div>";
      ctx.feed = new P5.ScribeFeed(a.querySelector(".s5m-feed"));
      ctx.reset = function () { ctx.list = C.slice(0, 2).reverse(); ctx.con.cards(ctx.list, { instant: true }); ctx.feed.set(ctx.list, { instant: true }); };
      requestAnimationFrame(function () { ctx.reset(); });
    },
    play: function (ctx, later) {
      ctx.reset();
      [C[2], C[3], C[4]].forEach(function (c, i) { later(function () { ctx.list = [c].concat(ctx.list); ctx.con.cards(ctx.list, { newest: c.id }); ctx.feed.set(ctx.list, { newest: c.id }); }, 400 + i * 1100); });
      later(function () {
        var st = {}, ord = {}; Q.forEach(function (q, i) { st[q.id] = "queued"; ord[q.id] = i + 1; });
        var all = Q.slice().reverse().concat(ctx.list);
        ctx.con.header({ session: LIVE, sync: P4.CHIP("Offline", "is-outline", "wifi-off") });
        ctx.con.cards(all, { states: JSON.parse(JSON.stringify(st)), orders: JSON.parse(JSON.stringify(ord)) });
        Q.forEach(function (q, i) {
          later(function () {
            st[q.id] = "synced"; delete ord[q.id];
            ctx.con.cards(all, { states: JSON.parse(JSON.stringify(st)), orders: JSON.parse(JSON.stringify(ord)) });
            ctx.feed.set(Q.slice(0, i + 1).reverse().concat(ctx.list), { newest: q.id });
            if (i === Q.length - 1) ctx.con.header({ session: LIVE, sync: P4.SYNC("", "check", "Synced") });
          }, 1400 + i * Math.max(120, CL.ms("cwl-delay-stagger") * 5));
        });
      }, 4000);
    }
  });

  /* 2. A sentence's sources lighting up */
  function reviewPanes(ctx, label) {
    var a = app(ctx.row, label, 1280, 640, "review");
    a.innerHTML = '<div class="cwl-ovn" style="height:100%"><div class="cwl-a-panes" style="height:100%"><section class="cwl-a-pane s5m-l"></section><aside class="cwl-a-pane s5m-r"></aside></div></div>';
    return a;
  }
  proto({ id: "m-sources", n: 2, short: "sources lighting up", comp: "DraftParagraph · SourcePanel",
    title: "A sentence's sources lighting up",
    note: "Select a sentence and it takes the selected tint. In the panel, its source cards come forward: cards already there glide to the top (FLIP over cwl-dur-make-room), new ones arrive (cwl-dur-arrive), and the lens's other sources step back below the divider. Then the words each source gave highlight from left to right over cwl-dur-source-light, on the phone sentence, the scribe card and the line of the easel photo alike.",
    reduced: "The sources take their new order at once and the words are highlighted without the sweep.",
    tokens: [["cwl-dur-make-room", "", "Source cards gliding to their new place"], ["cwl-dur-arrive", "", "A source card coming into the panel"], ["cwl-dur-hide", "", "A source card leaving"], ["cwl-dur-source-light", "", "The selected tint, and the highlight sweeping across the source words"], ["cwl-ease-signature", "", "Easing for the tint and the sweep"], ["cwl-app-source-word", "", "The highlight color (Sky 50%, Navy text)"]],
    build: function (ctx) {
      var a = reviewPanes(ctx, "Overnight review · Community");
      ctx.sp = new P5.SourcePanel(a.querySelector(".s5m-r"));
      ctx.dp = new P5.DraftParagraph(a.querySelector(".s5m-l"), { onSelect: function (id) { ctx.sp.set(id, {}); } });
      requestAnimationFrame(function () { ctx.dp.set({ sel: "s1" }); ctx.sp.set("s1", { instant: true }); });
    },
    play: function (ctx, later) { ["s3", "s4", "s5", "s2"].forEach(function (id, i) { later(function () { ctx.dp.select(id); }, 200 + i * 1800); }); }
  });

  /* 3. Restoring the room's words */
  proto({ id: "m-restore", n: 3, short: "restoring the room's words", comp: "DraftParagraph",
    title: "Restoring the room's words",
    note: "Restore the room's words swaps the AI wording for the room's exact sentence in place. The AI wording lifts 0.35em and fades on cwl-ease-exit while the room's words rise into place on cwl-ease-signature, both over cwl-dur-line-replace, the pass 4 crossfade. The paragraph makes room around a different length, and the sentence's marker gains the quote mark. The source panel's sentence changes with it.",
    reduced: "The words swap in place and the marker changes at once.",
    tokens: [["cwl-dur-line-replace", "", "The AI wording giving way to the room's words (pass 4)"], ["cwl-ease-exit", "", "The AI wording leaving"], ["cwl-ease-signature", "", "The room's words arriving"]],
    build: function (ctx) {
      var a = reviewPanes(ctx, "Overnight review · Community");
      ctx.sp = new P5.SourcePanel(a.querySelector(".s5m-r"));
      ctx.dp = new P5.DraftParagraph(a.querySelector(".s5m-l"), { onSelect: function (id) { ctx.sp.set(id, {}); }, onRestore: function (id) { ctx.sp.set(id, { instant: true, text: S.community.sentences.filter(function (x) { return x.id === id; })[0].room }); } });
      ctx.reset = function () { ctx.dp.state.restored = {}; ctx.dp.set({ sel: "s3" }); ctx.sp.set("s3", { instant: true }); };
      requestAnimationFrame(function () { ctx.reset(); });
    },
    play: function (ctx, later) { ctx.reset(); later(function () { ctx.dp.restore("s3"); }, 700); later(function () { ctx.dp.select("s4"); }, 2200); later(function () { ctx.dp.restore("s4"); }, 3600); }
  });

  /* TV prototypes share a read-back TV */
  function rbTV(ctx) {
    ctx.sh = P4.shell(frame(ctx.row, "TV · 1920 by 1080"), { unit: "answered" });
    ctx.rb = new P5.ReadBackLens(ctx.sh);
  }

  /* 4. The tally filling */
  proto({ id: "m-tally", n: 4, short: "the tally filling", comp: "ReadBackTally",
    title: "The tally filling",
    note: "Each tap grows its bar from where it is to its new length over cwl-dur-bar-grow on the signature easing, and its count ticks with it (cwl-dur-count). A bar grows from zero only when its lens first appears. Taps arriving close together retarget the bar mid-movement without restarting it. Neither bar takes a leader color: the tally shows where the room is and never settles a lens.",
    reduced: "Bars take their new length at once and the counts change in place.",
    tokens: [["cwl-dur-bar-grow", "", "A bar growing to its new length (pass 2)"], ["cwl-dur-count", "", "The count ticking"], ["cwl-ease-signature", "", "Easing for the bars"], ["cwl-bar", "", "Bar fill, both answers"], ["cwl-bar-track", "", "The empty track"]],
    build: function (ctx) { rbTV(ctx); requestAnimationFrame(function () { ctx.rb.set({ lens: "community", settled: ["congregation"], instant: true }); ctx.sh.count(0, "answered", true); }); },
    play: function (ctx, later) {
      var y = 0, c = 0; ctx.rb.tallyTo(0, 0, { of: 8, instant: true }); ctx.sh.count(0, "answered", true);
      ["y", "y", "c", "y", "y", "y", "c", "y"].forEach(function (k, i) { later(function () { if (k === "y") y++; else c++; ctx.rb.tallyTo(y, c, { of: 8 }); ctx.sh.count(y + c, "answered"); }, 300 + i * (i > 4 ? 180 : 500)); });
    }
  });

  /* 5. A correction folding in */
  proto({ id: "m-fold", n: 5, short: "a correction folding in", comp: "TrackedChange · ReadBackLens",
    title: "A correction folding in",
    note: "When the facilitator accepts a correction, the strike draws through the deleted words over cwl-dur-tc-strike. They stay readable for cwl-delay-tc-leave, then fade out (cwl-dur-hide on cwl-ease-exit). In the same movement every word of the paragraph glides to its new place (FLIP per word over cwl-dur-make-room) and the inserted words arrive (cwl-dur-arrive) with their underline drawing under them. The underline stays until the lens is settled. Lines are drawn in the text's own color, so the change reads without color on Navy and Off-White.",
    reduced: "The deleted words disappear and the inserted words appear underlined, at once.",
    tokens: [["cwl-dur-tc-strike", "", "The strike or underline drawing across (new)"], ["cwl-delay-tc-leave", "", "How long struck words stay readable before leaving (new)"], ["cwl-dur-hide", "", "Struck words fading out"], ["cwl-dur-make-room", "", "The paragraph reflowing, word by word"], ["cwl-dur-arrive", "", "Inserted words arriving"], ["cwl-tc-line", "", "Line thickness (new)"], ["cwl-tc-offset", "", "Gap under inserted words (new)"]],
    build: function (ctx) { rbTV(ctx); ctx.reset = function () { ctx.rb.drawn = null; ctx.rb.set({ lens: "community", settled: ["congregation"], states: {}, yes: 5, change: 3, missing: S.missing.slice(0, 2), instant: true }); ctx.rb.tallyTo(5, 3, { of: 8, instant: true }); ctx.sh.count(8, "answered", true); }; requestAnimationFrame(function () { ctx.reset(); }); },
    play: function (ctx, later) { ctx.reset(); later(function () { ctx.rb.fold("x1"); }, 500); later(function () { ctx.rb.fold("x2"); }, 3600); }
  });

  /* 6. Moving to the next lens */
  proto({ id: "m-next", n: 6, short: "moving to the next lens", comp: "LensProgress · ReadBackLens",
    title: "Moving to the next lens",
    note: "Settling: Lime sweeps once across the lens in the progress (cwl-dur-outcome-confirm), holds for 40% of cwl-dur-new-hold, and settles over cwl-dur-settle-color to its outlined check. It is the screen's one Lime moment, so the LIVE mark steps back meanwhile. The tracked underlines become plain words. Next lens: the paragraph lifts out (cwl-dur-hide), the current marker moves along the progress as a color change in place (cwl-dur-settle-color), and after cwl-delay-make-room-after-hide the next lens's heading and paragraph rise in (cwl-dur-map-field on cwl-ease-calm). The bars return to zero for the new lens.",
    reduced: "The check, the current lens and the next paragraph appear in place. No sweep.",
    tokens: [["cwl-dur-outcome-confirm", "", "The Lime sweep across the settled lens (pass 4)"], ["cwl-dur-new-hold", "", "The sweep holds for 40% of this"], ["cwl-dur-settle-color", "", "The sweep settling, and the current marker moving on"], ["cwl-dur-hide", "", "The paragraph leaving"], ["cwl-delay-make-room-after-hide", "", "Before the next paragraph comes in"], ["cwl-dur-map-field", "", "The next heading and paragraph rising in (pass 4)"], ["cwl-ease-calm", "", "Easing for the rise"], ["cwl-dur-bar-grow", "", "The bars returning to zero"]],
    build: function (ctx) { rbTV(ctx); ctx.reset = function () { ctx.rb.drawn = null; ctx.rb.set({ lens: "community", settled: ["congregation"], states: { x1: "folded", x2: "folded" }, yes: 8, change: 0, missing: S.missing.slice(0, 2), instant: true }); ctx.rb.tallyTo(8, 0, { of: 8, instant: true }); ctx.sh.count(8, "answered", true); }; requestAnimationFrame(function () { ctx.reset(); }); },
    play: function (ctx, later) { ctx.reset(); later(function () { ctx.rb.settle(); }, 400); later(function () { ctx.rb.next("leadership"); ctx.sh.count(0, "answered"); }, 2900); }
  });
})();
