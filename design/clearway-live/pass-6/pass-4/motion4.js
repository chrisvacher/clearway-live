/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 4 · motion4.js
   The five new movements, each with its tokens, a short prototype and
   its reduced-motion equivalent. Prototypes use the same components as
   the screens, so what plays here is what the boards do.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P3 = window.ClearwayLivePass3, P4 = window.ClearwayLivePass4, W = window.ClearwayLivePass4Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide;
  function ms(n) { return CL.ms(n); }
  function clone(a) { return JSON.parse(JSON.stringify(a)); }

  /* The remote changing hands: holder banners slide in, the held remote's controls settle to cwl-held-dim,
     the new holder's controls rise into place. Exported for the D2-11 board. */
  function handIn(scope) {
    scope.querySelectorAll(".cwl-app").forEach(function (el) {
      if (CL.reduced(el)) return;
      var d = ms("cwl-dur-remote-hand"), ease = CL.v("cwl-ease-signature");
      el.querySelectorAll(".cwl-wf-holder").forEach(function (b) { b.animate([{ opacity: 0, transform: "translateY(-14px)" }, { opacity: 1, transform: "none" }], { duration: d, easing: ease, fill: "backwards" }); });
      if (el.querySelector(".cwl-wf-held")) el.querySelectorAll(".cwl-r-btn").forEach(function (b) { b.animate([{ opacity: 1 }, { opacity: parseFloat(CL.v("cwl-held-dim")) || 0.5 }], { duration: d, easing: ease, fill: "backwards" }); });
      else el.querySelectorAll(".cwl-r-btn, .cwl-wf-person").forEach(function (b, i) { b.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { duration: d, easing: ease, delay: Math.min(i, 6) * 40, fill: "backwards" }); });
    });
  }

  var host = document.getElementById("motion");
  if (!host) { window.ClearwayLivePass4Motion = { handIn: handIn }; return; }

  function proto(spec) {
    var s = h("section", "sc-board"); s.id = spec.id;
    s.innerHTML = '<header class="sc-head"><div><div class="sc-ids"><span class="sc-id">Motion</span><span class="sc-id">' + esc(spec.comp) + '</span></div><h2></h2></div></header><p class="sc-note"></p><div class="sc-actions" data-surface="setup" data-theme="light"></div><div class="sc-row is-1"></div><div class="sc-table"><table class="p4-motion-tok"><thead><tr><th>Token</th><th>Value</th><th>Use</th></tr></thead><tbody></tbody></table></div><p class="sc-note"><b>Reduced motion:</b> <span class="rm"></span></p>';
    s.querySelector("h2").textContent = spec.title; s.querySelector(".sc-note").textContent = spec.note; s.querySelector(".rm").textContent = spec.reduced;
    host.appendChild(s);
    var nav = document.getElementById("toc"); if (nav) { var a = h("a"); a.href = "#" + spec.id; a.textContent = "Motion: " + spec.short; nav.appendChild(a); }
    var tb = s.querySelector("tbody");
    tb.innerHTML = spec.tokens.map(function (t) { return "<tr><td><code>" + t[0] + "</code></td><td><code>" + (CL.v(t[0]) || t[1] || "") + "</code></td><td>" + esc(t[2]) + "</td></tr>"; }).join("");
    var stageRow = s.querySelector(".sc-row"); stageRow.style.gridTemplateColumns = spec.cols || "minmax(0, 1fr)";
    var acts = s.querySelector(".sc-actions");
    var ctx = { row: stageRow, motion: "full" };
    spec.build(ctx);
    function btn(label, icon, fn) { var b = h("button", "cwl-a-btn is-secondary"); b.type = "button"; b.innerHTML = L(icon) + "<span>" + esc(label) + "</span>"; b.onclick = fn; acts.appendChild(b); return b; }
    btn("Play", "play", function () { spec.play(ctx); });
    var rb = btn("Reduced motion: off", "accessibility", function () { ctx.motion = ctx.motion === "full" ? "reduced" : "full"; rb.querySelector("span").textContent = "Reduced motion: " + (ctx.motion === "reduced" ? "on" : "off"); stageRow.querySelectorAll("[data-surface]").forEach(function (e) { if (e.matches(".cwl-tv,.cwl-phone,.cwl-app")) e.setAttribute("data-motion", ctx.motion); }); });
    CL.icons();
  }
  function frame(parent, label) { var f = h("figure", "sc-frame is-tv"); f.innerHTML = '<figcaption class="sc-label"></figcaption><div class="sc-box"></div>'; f.querySelector(".sc-label").textContent = label; parent.appendChild(f); return f.querySelector(".sc-box"); }
  var runs = {};
  function stop(id) { (runs[id] || []).forEach(function (t) { clearTimeout(t); clearInterval(t); }); runs[id] = []; }
  function at(id, fn, t) { (runs[id] = runs[id] || []).push(setTimeout(fn, t)); }

  /* 1. Sentences drifting into clusters and labels growing */
  proto({ id: "m-drift", short: "drift into clusters", comp: "LensWall", title: "Sentences drifting into clusters, labels growing",
    note: "A sentence lands in the column at once (cwl-dur-arrive). When the AI path groups it, a copy of the sentence drifts from its row into its cluster and dissolves there, the row takes the cluster's number, and the label grows from tv-floor toward tv-main as the cluster gathers. Drifts never hold a sentence back: the column and the clusters are separate areas, so nothing anyone is reading moves under them.",
    reduced: "No drift. The row takes its cluster number in place, the cluster's count and latest sentence update at once, and the label takes its new size without growing.",
    tokens: [["cwl-dur-arrive", "", "The sentence landing in the column"], ["cwl-dur-cluster-drift", "", "The copy travelling from the row into its cluster"], ["cwl-ease-calm", "", "Easing for the drift"], ["cwl-delay-regroup-step", "", "Between drifts when several group at once, 12 at most"], ["cwl-delay-label-after-drift", "", "When the label starts growing"], ["cwl-dur-cluster-label", "", "The label growing to its new size"], ["cwl-ease-arrive", "", "Easing for the label"]],
    build: function (ctx) { ctx.sh = P4.shell(frame(ctx.row, "TV"), { lens: "congregation", headline: W.lensPrompt(W.lenses[0]), unit: "sentences" }); ctx.v = new P4.LensWall(ctx.sh.host, { labels: W.congregation.clusters }); var s = W.congregation.seeded.slice(0, 5); requestAnimationFrame(function () { ctx.v.set(s, { instant: true, grouped: s.map(function (x) { return x.id; }) }); ctx.sh.count(5, "sentences", true); }); },
    play: function (ctx) {
      stop("drift"); var base = W.congregation.seeded.slice(0, 5), add = W.congregation.live.slice(0, 6), list = base.slice(), grp = base.map(function (x) { return x.id; });
      ctx.v.cOrder = []; ctx.v.grouped = {}; ctx.v.set(list, { instant: true, grouped: grp });
      add.forEach(function (x, i) {
        at("drift", function () { list.push(x); ctx.v.set(list.slice(), { grouped: grp.slice(), newest: x.id }); ctx.sh.count(list.length, "sentences"); }, 400 + i * 900);
        at("drift", function () { grp.push(x.id); ctx.v.set(list.slice(), { grouped: grp.slice() }); }, 400 + i * 900 + 1300);
      });
    } });

  /* 2. An outcome confirming */
  proto({ id: "m-confirm", short: "an outcome confirming", comp: "OutcomeConfirmRow", title: "An outcome confirming",
    note: "When the facilitator records the room's decision, Lime sweeps once across the row from the left (the screen's one Lime moment, so the LIVE mark steps back to Off-White meanwhile). It holds for part of cwl-dur-new-hold, then settles to a quiet outlined Confirmed or Renamed mark. A challenged row loses its highlight in the same movement.",
    reduced: "No sweep. The Confirmed or Renamed mark appears in place and the counts give way at once.",
    tokens: [["cwl-dur-outcome-confirm", "", "The Lime sweep across the row"], ["cwl-ease-signature", "", "Easing for the sweep"], ["cwl-dur-new-hold", "", "The Lime holds for 40% of this after the sweep"], ["cwl-dur-settle-color", "", "Lime fading back to the row"]],
    build: function (ctx) { ctx.sh = P4.shell(frame(ctx.row, "TV"), { eyebrow: "3-year Vision · " + W.Y.vision, headline: "Confirm, rename or <strong>challenge each outcome</strong>", unit: "answering" }); ctx.v = new P4.OutcomeConfirm(ctx.sh.host); ctx.rows = function () { return W.outcomes.map(function (o) { var c = W.confirm[o.id]; return { id: o.id, name: o.name, c: c.c, r: c.r, x: c.x, challenged: o.id === "o4" }; }); }; requestAnimationFrame(function () { ctx.v.set(ctx.rows(), { instant: true }); ctx.sh.count(8, "answering", true); }); },
    play: function (ctx) {
      stop("confirm"); var r = ctx.rows(); ctx.v.decided = {}; ctx.v.set(r, { instant: true });
      ["o1", "o2", "o4", "o5"].forEach(function (id, i) { at("confirm", function () { var x = r.filter(function (y) { return y.id === id; })[0], c = W.confirm[id]; x.decision = { kind: c.decision, to: c.to }; ctx.v.set(r, { shell: ctx.sh }); }, 500 + i * 1700); });
    } });

  /* 3. Intent-card lines replacing as people type */
  proto({ id: "m-replace", short: "lines replacing", comp: "IntentCard", title: "Intent-card lines replacing as people type",
    note: "Typing that extends a line grows it in place, applied in batches no more often than cwl-delay-type-batch so it never stutters. A rewrite (the new text isn't the old text with more on the end) crossfades in place: the old line lifts and fades out while the new one rises in. A Royal underline sits under the field while it belongs to one phone and shrinks over cwl-dur-field-lock, so the room can see who's still writing without names on the TV.",
    reduced: "The text swaps in place with no crossfade, and the underline is still.",
    tokens: [["cwl-delay-type-batch", "", "Most often the TV applies typed edits"], ["cwl-dur-line-replace", "", "A rewritten line crossfading in place"], ["cwl-ease-exit", "", "The old line leaving"], ["cwl-ease-signature", "", "The new line arriving"], ["cwl-dur-field-lock", "", "A field stays with one phone this long after its last keystroke"]],
    build: function (ctx) { ctx.sh = P4.shell(frame(ctx.row, "TV"), { eyebrow: "Commander's intent · team-led", headline: "", unit: "cards" }); ctx.sh.headEl.style.display = "none"; ctx.v = new P4.IntentBoard(ctx.sh.host); ctx.sh.count(5, "cards", true); ctx.card = function () { var c = clone(W.intent); return c; }; requestAnimationFrame(function () { ctx.c = ctx.card(); ctx.v.set(ctx.c, { present: 0, instant: true }); }); },
    play: function (ctx) {
      stop("replace"); var c = ctx.card(); c[0].intent = ""; c[0].must = "Name an apprentice in every ministry."; ctx.v.set(c, { present: 0, instant: true });
      var t = "Every ministry is growing its own next leader.", words = t.split(" "), i = 0;
      words.forEach(function (w, k) { at("replace", function () { c[0].intent = words.slice(0, k + 1).join(" "); ctx.v.set(c, { present: 0, typing: { field: "intent" } }); }, 300 + k * 260); });
      at("replace", function () { c[0].must = "Name an apprentice in every ministry by Easter."; ctx.v.set(c, { present: 0, typing: { field: "must" } }); }, 300 + words.length * 260 + 700);
      at("replace", function () { c[0].must = "Put an apprentice beside every ministry lead."; ctx.v.set(c, { present: 0, typing: { field: "must" } }); }, 300 + words.length * 260 + 2400);
    } });

  /* 4. The remote changing hands */
  proto({ id: "m-hand", short: "the remote changing hands", comp: "RemoteHandover", title: "The remote changing hands",
    note: "Handing over: on Chris's remote the 'Priya has the remote' banner slides down into place and the controls settle to cwl-held-dim, with Take back at full strength. On Priya's phone the 'You have the remote' banner slides in and the remote controls rise into place, 40ms apart. Taking it back plays the same movements the other way round. The TV never changes.",
    reduced: "The banners and controls change in place with no sliding, rising or dimming over time.",
    tokens: [["cwl-dur-remote-hand", "", "Banners sliding in, controls settling or rising"], ["cwl-ease-signature", "", "Easing for both"], ["cwl-held-dim", "", "Opacity of the held remote's controls"]],
    cols: "repeat(3, minmax(0, 220px)) minmax(0, 1fr)",
    build: function (ctx) {
      ctx.draw = function (held) {
        ctx.row.innerHTML = "";
        var f1 = h("figure", "sc-frame is-phone"); f1.innerHTML = '<figcaption class="sc-label">Chris\'s remote</figcaption><div class="sc-box"></div>'; ctx.row.appendChild(f1);
        P4.remote(f1.querySelector(".sc-box"), { held: held, title: "Commander's intent", banner: held ? '<div class="cwl-wf-holder">' + L("hand-helping") + '<span class="grow">Priya has the remote</span><button type="button" class="cwl-a-btn is-sm">Take back</button></div>' : "", buttons: '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" + P4.rbtn("Phones down", "smartphone") });
        var f2 = h("figure", "sc-frame is-phone"); f2.innerHTML = '<figcaption class="sc-label">Priya\'s phone</figcaption><div class="sc-box"></div>'; ctx.row.appendChild(f2);
        if (held) { var el = CL.appPhone(f2.querySelector(".sc-box"), "control"); el.innerHTML = '<div class="cwl-ph-head" style="border-color:var(--cwl-app-border)"><span class="cwl-a-label">' + esc(W.church) + '</span></div><div class="cwl-r-body"><div class="cwl-wf-holder">' + L("hand-helping") + '<span class="grow">You have the remote</span></div><div class="cwl-r-grid">' + P4.rbtn("Assign pairs", "users") + P4.rbtn("Clock", "timer") + "</div>" + P4.rbtn("Next: present", "chevron-right", "is-primary") + "</div>"; }
        else { var ph = P4.phone(f2.querySelector(".sc-box"), {}); ph.body.innerHTML = (ctx.after ? '<div class="cwl-wf-ph-banner">' + L("hand-helping") + '<span style="flex:1">Chris has the remote</span></div>' : "") + '<div class="cwl-ph-muted">Your card · with Sam</div><div class="cwl-ph-prompt">Leaders raised from within</div>'; }
        var f3 = h("figure", "sc-frame is-phone"); f3.innerHTML = '<figcaption class="sc-label">Co-facilitator</figcaption><div class="sc-box"></div>'; ctx.row.appendChild(f3);
        P4.remote(f3.querySelector(".sc-box"), { held: held, title: "Commander's intent", banner: held ? '<div class="cwl-wf-holder">' + L("hand-helping") + '<span class="grow">Priya has the remote</span></div>' : "", buttons: '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + "</div>" });
        var f4 = h("figure", "sc-frame is-tv"); f4.innerHTML = '<figcaption class="sc-label">TV · never changes</figcaption><div class="sc-box"></div>'; ctx.row.appendChild(f4);
        var tv = CL.stage(f4.querySelector(".sc-box"), "dark"); CL.screenTexture(tv, "input"); var c = h("div", "cwl-tv-content"); tv.appendChild(c); c.innerHTML = '<div class="cwl-tv-eyebrow">Commander\'s intent · team-led</div><div class="cwl-tv-headline">One card for <strong>each outcome</strong></div>';
        ctx.row.querySelectorAll(".cwl-app,.cwl-phone,.cwl-tv").forEach(function (e) { e.setAttribute("data-motion", ctx.motion); });
        CL.icons();
      };
      ctx.draw(false);
    },
    play: function (ctx) { stop("hand"); ctx.after = false; ctx.draw(false); at("hand", function () { ctx.draw(true); handIn(ctx.row); }, 500); at("hand", function () { ctx.after = true; ctx.draw(false); handIn(ctx.row); }, 3200); } });

  /* 5. The Map assembling */
  proto({ id: "m-map", short: "the Map assembling", comp: "ClearwayMapDraft", title: "The Map assembling",
    note: "At the close of Day 2 the draft Map builds itself from the engagement: each field rises into place in reading order, left column then right, cwl-delay-map-step apart. Empty fields arrive like the rest and stay visibly empty. Then page 2 follows the same way.",
    reduced: "Each page is there at once, empty fields included.",
    tokens: [["cwl-dur-map-field", "", "Each field rising into place"], ["cwl-ease-calm", "", "Easing for each field"], ["cwl-delay-map-step", "", "Between fields, in reading order"]],
    build: function (ctx) { ctx.sh = P4.shell(frame(ctx.row, "TV"), { eyebrow: "Draft Clearway Map · page 1 · Identity and Direction", headline: "", unit: "", tally: false }); ctx.sh.headEl.style.display = "none"; ctx.v = new P4.MapDraft(ctx.sh.host); requestAnimationFrame(function () { ctx.v.set({ page: 1, instant: true }); }); },
    play: function (ctx) {
      stop("map"); ctx.sh.prompt("Draft Clearway Map · page 1 · Identity and Direction", ""); ctx.sh.headEl.style.display = "none"; ctx.v.page = null; ctx.v.set({ page: 1, upTo: 0, instant: true });
      ctx.v.set({ page: 1 });
      at("map", function () { ctx.sh.prompt("Draft Clearway Map · page 2 · Action", ""); ctx.sh.headEl.style.display = "none"; ctx.v.page = null; ctx.v.set({ page: 2 }); }, 3600);
    } });

  window.ClearwayLivePass4Motion = { handIn: handIn };
})();
