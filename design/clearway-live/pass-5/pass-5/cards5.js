/* Clearway Live · design pass 5 · cards5.js
   Live previews for the scribe, overnight and read-back components in the design system.
   Each card runs the same code as the milestone 5 screens: pick a state, switch the TV or
   phone theme and reduced motion, or play the component's movement. */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P4 = window.ClearwayLivePass4, P5 = window.ClearwayLivePass5, S = window.ClearwayLivePass5Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide, C = S.cards;
  var LIVE = "Five Lenses: Community";

  function appBox(box, w, hgt, surface) { return CL.appFrame(box, w, hgt, surface); }
  function rbShell(box, theme) { var sh = P4.shell(box, { theme: theme, unit: "answered" }); return sh; }

  var CARDS = {
    ScribeCard: { id: "SCR-01", title: "Scribe card", kind: "app", surface: "scribe", w: 920, h: 460,
      states: {
        "Every kind": function (el) { el.innerHTML = '<div class="cwl-s5-sheet">' + [C[0], C[1], C[2], C[3], C[4], S.mitigation, C[6]].map(function (c) { return P5.ScribeCard(c, { recordNote: true }); }).join("") + "</div>"; },
        "Queued and syncing": function (el) { el.innerHTML = '<div class="cwl-s5-sheet">' + P5.ScribeCard(C[1], { state: "synced" }) + P5.ScribeCard(C[0], { state: "syncing", order: 2 }) + P5.ScribeCard(C[3], { state: "queued", order: 3 }) + "</div>"; },
        "Re-filed": function (el) { el.innerHTML = '<div class="cwl-s5-sheet">' + P5.ScribeCard(C[4], { refiled: "Five Lenses: Operations", actions: "console" }) + "</div>"; },
        "Names on review screens": function (el) { el.innerHTML = '<div class="cwl-s5-sheet">' + P5.ScribeCard(C[0], { names: true }) + P5.ScribeCard(C[0], { recordNote: true }) + P5.ScribeCard(C[0], { actions: "feed" }) + "</div>"; },
        "Very long text": function (el) { el.innerHTML = '<div class="cwl-s5-sheet" style="grid-template-columns:minmax(0,1fr)">' + P5.ScribeCard(S.longCard, { actions: "console" }) + "</div>"; }
      } },
    CaptureComposer: { id: "SCR-01", title: "Capture composer", kind: "app", surface: "scribe", w: 420, h: 620,
      states: {
        "Typing a quote": function (el) { el.innerHTML = '<div class="cwl-scr-col" style="height:100%">' + P5.CaptureComposer({ kind: "quote", text: S.typing.text, who: S.typing.who, session: LIVE }) + "</div>"; },
        "Tension": function (el) { el.innerHTML = '<div class="cwl-scr-col" style="height:100%">' + P5.CaptureComposer({ kind: "tension", text: "Growth: more services or more groups?", session: LIVE }) + "</div>"; },
        "Action": function (el) { el.innerHTML = '<div class="cwl-scr-col" style="height:100%">' + P5.CaptureComposer({ kind: "action", text: "List our current community partners.", session: LIVE }) + "</div>"; },
        "Correction": function (el) { el.innerHTML = '<div class="cwl-scr-col" style="height:100%">' + P5.CaptureComposer({ correction: { lens: "Community, " + S.Y.future, wording: "All four north end schools count us as partners.", why: S.corrections[0].reason } }) + "</div>"; },
        "Error": function (el) { el.innerHTML = '<div class="cwl-scr-col" style="height:100%">' + P5.CaptureComposer({ kind: "quote", text: "", error: "Type what was said, then Enter", session: LIVE }) + "</div>"; },
        "Off for the team-led block": function (el) { el.innerHTML = '<div class="cwl-scr-col" style="height:100%">' + P5.CaptureComposer({ kind: "quote", off: true, session: "Nothing: the team has the room" }) + "</div>"; }
      } },
    EaselCapture: { id: "SCR-02", title: "Easel capture", kind: "phones",
      states: {
        "One tap, then attach": function (row) { ["camera", "review", "uploading", "attached"].forEach(function (s) { var b = h("div"); row.appendChild(b); P5.EaselCapture(b, { step: s }); }); },
        "Offline and failed": function (row) { ["queued", "failed", "nothing", "off"].forEach(function (s) { var b = h("div"); row.appendChild(b); P5.EaselCapture(b, { step: s }); }); }
      } },
    ScribeFeed: { id: "FAC-01", title: "Scribe feed", kind: "app", surface: "control", w: 460, h: 620, play: true,
      states: {
        "Typical": function (el, ctx) { el.innerHTML = '<div style="padding:16px;height:100%;background:var(--cwl-app-page)">' + P4.PRIVATE("Scribe", '<div class="f"></div>') + "</div>"; ctx.feed = new P5.ScribeFeed(el.querySelector(".f")); ctx.list = C.slice(0, 4).reverse(); ctx.feed.set(ctx.list, { instant: true }); },
        "Quote on the TV": function (el, ctx) { CARDS.ScribeFeed.states.Typical(el, ctx); ctx.feed.set(ctx.list, { instant: true, promoted: "k1" }); },
        "Empty": function (el) { el.innerHTML = '<div style="padding:16px;height:100%;background:var(--cwl-app-page)">' + P4.PRIVATE("Scribe", '<div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">The scribe\'s cards for this session appear here as they\'re captured.</div>') + "</div>"; },
        "Crowded": function (el, ctx) { CARDS.ScribeFeed.states.Typical(el, ctx); ctx.feed.set(S.burst.slice().reverse(), { instant: true }); }
      },
      playFn: function (ctx) { [C[4], C[5], C[6]].forEach(function (c, i) { CL.later(function () { ctx.list = [c].concat(ctx.list); ctx.feed.set(ctx.list, { newest: c.id }); }, 300 + i * 1000); }); } },
    PromotedQuote: { id: "FAC-01", title: "Promoted quote", kind: "tv", play: true,
      states: {
        "On the TV": function (box, ctx) { ctx.sh = P4.shell(box, { theme: ctx.theme, lens: "community", headline: "It's " + S.Y.future + ". Describe our <strong>Community.</strong>", unit: "sentences" }); ctx.sh.count(9, "sentences", true); requestAnimationFrame(function () { P5.PromotedQuote(ctx.sh, C[0].text, { session: LIVE }); }); },
        "Off": function (box, ctx) { ctx.sh = P4.shell(box, { theme: ctx.theme, lens: "community", headline: "It's " + S.Y.future + ". Describe our <strong>Community.</strong>", unit: "sentences" }); ctx.sh.count(9, "sentences", true); }
      },
      playFn: function (ctx) { P5.PromotedQuote(ctx.sh, null); CL.later(function () { P5.PromotedQuote(ctx.sh, C[0].text, { session: LIVE }); }, 900); } },
    DraftParagraph: { id: "OVN-02", title: "Draft paragraph", kind: "app", surface: "review", w: 760, h: 560, play: true,
      states: {
        "Sentence selected": function (el, ctx) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%"></div>'; ctx.dp = new P5.DraftParagraph(el.firstChild); ctx.dp.set({ sel: "s3" }); },
        "No source": function (el, ctx) { CARDS.DraftParagraph.states["Sentence selected"](el, ctx); ctx.dp.set({ sel: "s7" }); },
        "Locked": function (el, ctx) { CARDS.DraftParagraph.states["Sentence selected"](el, ctx); ctx.dp.set({ locked: "jt" }); },
        "Reviewed": function (el, ctx) { CARDS.DraftParagraph.states["Sentence selected"](el, ctx); ctx.dp.set({ reviewed: "cv", restored: { s3: true }, removed: { s7: true } }); },
        "AI off": function (el, ctx) { CARDS.DraftParagraph.states["Sentence selected"](el, ctx); ctx.dp.set({ ai0: true, written: ["s4", "s2"] }); },
        "Drafting": function (el, ctx) { CARDS.DraftParagraph.states["Sentence selected"](el, ctx); ctx.dp.set({ loading: true }); }
      },
      playFn: function (ctx) { ctx.dp.state.restored = {}; ctx.dp.set({ sel: "s3" }); CL.later(function () { ctx.dp.restore("s3"); }, 500); } },
    SourcePanel: { id: "OVN-02", title: "Source panel", kind: "app", surface: "review", w: 520, h: 720, play: true,
      states: {
        "Sentence 3": function (el, ctx) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%;overflow:hidden"></div>'; ctx.sp = new P5.SourcePanel(el.firstChild); ctx.sp.set("s3", { instant: true }); },
        "No source": function (el, ctx) { CARDS.SourcePanel.states["Sentence 3"](el, ctx); ctx.sp.set("s7", { instant: true }); },
        "Unreadable photo": function (el, ctx) { CARDS.SourcePanel.states["Sentence 3"](el, ctx); ctx.sp.set("s1", { instant: true, unreadable: true, restMax: 0 }); },
        "AI off": function (el, ctx) { CARDS.SourcePanel.states["Sentence 3"](el, ctx); ctx.sp.set("s1", { ai0: true, written: ["p5", "p4"] }); }
      },
      playFn: function (ctx) { ["s4", "s5", "s3"].forEach(function (id, i) { CL.later(function () { ctx.sp.set(id, {}); }, 200 + i * 1600); }); } },
    VoicesAndTensions: { id: "OVN-02", title: "Voices and tensions", kind: "app", surface: "review", w: 760, h: 300,
      states: { "Typical": function (el) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%">' + P5.VoicesAndTensions(S.community) + "</div>"; } } },
    ReviewPresence: { id: "OVN-01", title: "Review presence", kind: "app", surface: "review", w: 760, h: 180,
      states: {
        "Both reviewing": function (el) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%;gap:12px">' + P5.ReviewPresence([{ id: "cv", where: "Community", editing: true, you: true }, { id: "jt", where: "Learning", editing: true }]) + '<div>' + P5.lockChip("jt", "Learning") + "</div></div>"; },
        "Alone": function (el) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%">' + P5.ReviewPresence([{ id: "cv", where: "the overview", you: true }]) + "</div>"; }
      } },
    VersionHistory: { id: "OVN-02", title: "Version history", kind: "app", surface: "review", w: 520, h: 380,
      states: { "Typical": function (el) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%">' + P5.VersionHistory(S.versions) + "</div>"; } } },
    DraftStatusList: { id: "OVN-01", title: "Draft status list", kind: "app", surface: "review", w: 820, h: 480,
      states: {
        "Drafting": function (el) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%">' + P5.DraftStatusList(S.reviewStates.drafting, { right: "Drafting started " + S.dayClosed }) + "</div>"; },
        "Both reviewing": function (el) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%">' + P5.DraftStatusList(S.reviewStates.both, { current: "community" }) + "</div>"; },
        "All reviewed": function (el) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%">' + P5.DraftStatusList(S.reviewStates.done, {}) + "</div>"; },
        "AI off": function (el) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%">' + P5.DraftStatusList(S.reviewStates.ready, { ai: false }) + "</div>"; }
      } },
    PublishCheck: { id: "OVN-03", title: "Publish check", kind: "app", surface: "review", w: 1080, h: 520, theme: true,
      states: {
        "Ready": function (el, ctx) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%"><div class="p"></div></div>'; P5.PublishCheck(el.querySelector(".p"), { state: "ready", theme: ctx.theme }); },
        "Not ready": function (el, ctx) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%"><div class="p"></div></div>'; P5.PublishCheck(el.querySelector(".p"), { state: "not-ready", theme: ctx.theme }); }
      } },
    ReadBackLens: { id: "D2-03", title: "Read-back lens", kind: "tv", play: true,
      states: {
        "Split room": function (box, ctx) { ctx.sh = rbShell(box, ctx.theme); ctx.rb = new P5.ReadBackLens(ctx.sh); requestAnimationFrame(function () { ctx.rb.set({ lens: "community", settled: ["congregation"], yes: 5, change: 3, missing: S.missing.slice(0, 2), instant: true }); ctx.rb.tallyTo(5, 3, { of: 8, instant: true }); ctx.sh.count(8, "answered", true); }); },
        "Folded in": function (box, ctx) { ctx.sh = rbShell(box, ctx.theme); ctx.rb = new P5.ReadBackLens(ctx.sh); requestAnimationFrame(function () { ctx.rb.set({ lens: "community", settled: ["congregation"], states: { x1: "folded", x2: "folded" }, yes: 7, change: 1, missing: S.missing.slice(0, 2), instant: true }); ctx.sh.count(8, "answered", true); }); },
        "The close": function (box, ctx) { ctx.sh = rbShell(box, ctx.theme); ctx.rb = new P5.ReadBackLens(ctx.sh); requestAnimationFrame(function () { ctx.rb.set({ close: true, missing: S.missing, instant: true }); ctx.sh.count(8, "answered", true); }); },
        "Very long text": function (box, ctx) { ctx.sh = rbShell(box, ctx.theme); ctx.rb = new P5.ReadBackLens(ctx.sh, { long: true }); requestAnimationFrame(function () { ctx.rb.set({ lens: "community", settled: ["congregation"], yes: 2, change: 1, missing: [S.missingLong], instant: true }); }); }
      },
      playFn: function (ctx) { ctx.rb.drawn = null; ctx.rb.set({ lens: "community", settled: ["congregation"], yes: 5, change: 3, missing: S.missing.slice(0, 2), instant: true }); CL.later(function () { ctx.rb.fold("x1"); }, 400); CL.later(function () { ctx.rb.fold("x2"); }, 3400); CL.later(function () { ctx.rb.settle(); }, 5600); CL.later(function () { ctx.rb.next("leadership"); }, 8000); } },
    ReadBackTally: { id: "D2-03", title: "Read-back tally", kind: "tv", play: true,
      states: { "Split room": function (box, ctx) { ctx.sh = rbShell(box, ctx.theme); ctx.rb = new P5.ReadBackLens(ctx.sh); requestAnimationFrame(function () { ctx.rb.set({ lens: "community", settled: ["congregation"], instant: true }); ctx.rb.tallyTo(5, 3, { of: 8, instant: true }); }); } },
      playFn: function (ctx) { var y = 0, c = 0; ctx.rb.tallyTo(0, 0, { of: 8, instant: true }); "yycyyycy".split("").forEach(function (k, i) { CL.later(function () { if (k === "y") y++; else c++; ctx.rb.tallyTo(y, c, { of: 8 }); ctx.sh.count(y + c, "answered"); }, 300 + i * 420); }); } },
    ReadBackPhone: { id: "D2-04", title: "Read-back phone", kind: "phones", theme: true,
      states: {
        "Answering": function (row, ctx) { [{ answer: null, showMissing: true }, { answer: "change", change: S.corrections[0].phone, showTeam: false }, { answer: "yes", sent: true }].forEach(function (o) { var b = h("div"); row.appendChild(b); var p = P4.phone(b, { theme: ctx.theme, head: "live" }); o.lens = "community"; o.settled = ["congregation"]; o.teamMax = 2; P5.ReadBackPhone(p, o); }); },
        "Looking back and the close": function (row, ctx) { var b = h("div"); row.appendChild(b); P5.ReadBackPhone(P4.phone(b, { theme: ctx.theme, head: "live" }), { lens: "congregation", look: true, current: "community", settled: ["congregation"], teamMax: 2 }); var c = h("div"); row.appendChild(c); P5.ReadBackPhone(P4.phone(c, { theme: ctx.theme, head: "live" }), { close: true, settled: S.lensOrder }); }
      } },
    MissingList: { id: "D2-03", title: "What's missing", kind: "tv", play: true,
      states: { "The close": function (box, ctx) { ctx.sh = rbShell(box, ctx.theme); ctx.rb = new P5.ReadBackLens(ctx.sh); requestAnimationFrame(function () { ctx.rb.set({ close: true, missing: S.missing.slice(0, 2), instant: true }); }); } },
      playFn: function (ctx) { var l = S.missing.slice(0, 2); S.missing.slice(2).concat(["The Friday youth drop-in."]).forEach(function (m, i) { CL.later(function () { l = [m].concat(l); ctx.rb.ml.set(l, { newest: m, max: 6, always: true }); }, 300 + i * 900); }); } },
    TrackedChange: { id: "D2-03", title: "Tracked change", kind: "app", surface: "review", w: 820, h: 470,
      states: { "Every surface": function (el) { el.innerHTML = '<div class="cwl-ovn" style="padding:20px;height:100%;gap:14px"><div class="cwl-ovn-src-h">In review and on the control surface</div><div class="cwl-ovn-para">' + P5.TrackedChange.html(S.readback.community, S.corrections, { x1: "folded", x2: "folded" }) + '</div><div class="cwl-ovn-src-h">Settled</div><div class="cwl-ovn-para">' + P5.TrackedChange.html(S.readback.community, S.corrections, { x1: "settled", x2: "settled" }) + "</div></div>"; } } },
    CorrectionQueue: { id: "INT-14", title: "Correction queue", kind: "app", surface: "control", w: 640, h: 360,
      states: {
        "Waiting": function (el) { el.innerHTML = '<div style="padding:16px">' + P5.CorrectionQueue([{ c: S.corrections[0], state: "accepted" }, { c: S.corrections[1], state: "waiting" }]) + "</div>"; },
        "Empty": function (el) { el.innerHTML = '<div style="padding:16px">' + P5.CorrectionQueue([]) + "</div>"; },
        "AI off": function (el) { el.innerHTML = '<div style="padding:16px">' + P5.CorrectionQueue([{ c: S.corrections[1], state: "waiting" }], { ai: false }) + "</div>"; }
      } },
    LensProgress: { id: "D2-03", title: "Lens progress", kind: "tv", play: true,
      states: { "Two settled": function (box, ctx) { ctx.sh = rbShell(box, ctx.theme); ctx.rb = new P5.ReadBackLens(ctx.sh); requestAnimationFrame(function () { ctx.rb.set({ lens: "community", settled: ["congregation"], yes: 8, instant: true }); }); } },
      playFn: function (ctx) { ctx.rb.settle(); CL.later(function () { ctx.rb.next("leadership"); }, 2400); } }
  };

  function card(name, note) {
    var c = CARDS[name], root = document.getElementById("root"); root.className = "cwl-doc";
    root.innerHTML = '<div class="cwl-doc-eyebrow">Component · ' + esc(c.id) + '</div><div class="cwl-doc-title">' + esc(c.title) + '</div><div class="cwl-tabs" role="tablist"></div>' +
      '<div class="xtra" style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0"></div><div class="box"></div><div class="cwl-doc-note" aria-live="polite"></div>';
    var ctx = { theme: "dark", motion: "full" }, cur = Object.keys(c.states)[0];
    var tabs = root.querySelector(".cwl-tabs"), xtra = root.querySelector(".xtra"), box = root.querySelector(".box");
    function build() {
      CL.clearTimers(); box.innerHTML = "";
      tabs.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", b.textContent === cur ? "true" : "false"); });
      var el;
      if (c.kind === "tv") { el = h("div"); box.appendChild(el); }
      else if (c.kind === "phones") { el = h("div"); el.style.cssText = "display:grid;grid-template-columns:repeat(4,200px);gap:14px"; box.appendChild(el); }
      else { var b = h("div"); b.style.maxWidth = c.w + "px"; box.appendChild(b); el = appBox(b, c.w, c.h, c.surface); }
      c.states[cur](el, ctx);
      box.querySelectorAll("[data-surface]").forEach(function (e) { e.setAttribute("data-motion", ctx.motion); });
      root.querySelector(".cwl-doc-note").textContent = note || "";
      CL.icons();
    }
    Object.keys(c.states).forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.textContent = s; t.onclick = function () { cur = s; build(); }; tabs.appendChild(t); });
    function x(label, fn) { var b = h("button", "cwl-tab"); b.type = "button"; b.textContent = label; b.onclick = function () { fn(b); }; xtra.appendChild(b); return b; }
    if (c.kind === "tv" || c.theme) x("Off-White", function (b) { ctx.theme = ctx.theme === "dark" ? "light" : "dark"; b.setAttribute("aria-selected", ctx.theme === "light"); build(); });
    x("Reduced motion", function (b) { ctx.motion = ctx.motion === "full" ? "reduced" : "full"; b.setAttribute("aria-selected", ctx.motion === "reduced"); build(); });
    if (c.play) x("Play the movement", function () { CL.clearTimers(); c.playFn(ctx); });
    build();
  }
  window.ClearwayLivePass5Card = card;
  window.ClearwayLivePass5Cards = CARDS;
})();
