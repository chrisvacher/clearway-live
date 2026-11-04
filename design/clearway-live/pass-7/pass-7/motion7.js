/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 7 · motion7.js
   Two new movements: a publish committing as one beat, and the AI icon's
   single sweep. The report's source-light reuses pass 5 and the count roll
   reuses pass 6, so they are not repeated.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P4 = window.ClearwayLivePass4, P7 = window.ClearwayLivePass7, D = window.ClearwayLivePass7Data;
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
  function themes(ids, o) {
    o = o || {};
    return ids.map(function (id, i) { var t = clone(D.theme(id)); t.of = o.of || D.survey.responses; t.order = i; t.src = "Survey"; t.state = (o.accepted || []).indexOf(id) >= 0 ? "accepted" : "draft"; if (o.counts && o.counts[id] != null) t.n = o.counts[id]; return t; });
  }


  /* 1. A publish committing */
  proto({ id: "m-commit", n: 1, short: "a publish committing", comp: "PublishProgress",
    title: "A publish committing",
    note: "While the transaction runs, every row waits together and nothing shows as created. When CORE confirms, all rows change in the same beat: each waiting mark settles into a check over cwl-dur-settle-color, the headline changes from Publishing to Published, and the invitations row starts its own count. Nothing slides or reorders, and if the publish fails the rows go to Not created together, the same way.",
    reduced: "The bar is still. The rows and the headline change at once when CORE confirms.",
    tokens: [["cwl-dur-settle-color", "", "Every waiting mark settling into a check in the same beat"], ["cwl-ease-signature", "", "Easing for the settle"], ["cwl-dur-count", "", "The invitations count rising as each is sent"], ["cwl-dur-reduced", "", "The reduced-motion change"]],
    build: function (ctx) {
      var a = app(ctx.row, "Control surface · COR-02", 1280, 520, "control");
      a.innerHTML = '<div style="padding:20px;height:100%;background:var(--cwl-app-page);display:flex;flex-direction:column;gap:16px;max-width:640px"><div class="mc"></div></div>';
      ctx.box = a.querySelector(".mc");
      ctx.draw = function (st) { ctx.box.innerHTML = P7.PublishProgress({ state: st }); CL.icons(); var n = ctx.box.querySelector("[data-sent]"); if (n) P7.roundN(n, st === "sending" ? 2 : 4, { instant: true }); };
      ctx.reset = function () { ctx.draw("running"); };
      requestAnimationFrame(function () { ctx.reset(); });
    },
    play: function (ctx, later) {
      ctx.reset();
      later(function () { ctx.draw("committed"); }, 1800);
      later(function () { ctx.draw("sending"); }, 3200);
      later(function () { ctx.draw("sent"); }, 5000);
    }
  });

  /* 2. The AI icon's sweep */
  proto({ id: "m-ai", n: 2, short: "the AI icon's sweep", comp: "AIMark",
    title: "The AI icon's sweep",
    note: "When AI finishes drafting a section, its icon in gradient ink runs one sweep of light across itself over cwl-dur-ai-sweep, then rests. It never loops, and it never runs while a person is typing. Inside a button or a colored fill the icon is plain.",
    reduced: "The icon is still. There is no sweep.",
    tokens: [["cwl-dur-ai-sweep", "", "One sweep across the icon"], ["cwl-ease-calm", "", "Easing for the sweep"]],
    build: function (ctx) {
      var a = app(ctx.row, "Report · AFT-01", 1280, 220, "setup");
      a.innerHTML = '<div style="padding:24px;height:100%;background:var(--cwl-app-page);display:flex;flex-direction:column;gap:12px"><div class="cwl-a-eyebrow">Section 6 of 17</div><div class="cwl-a-title">What We Heard</div><div class="mi"></div></div>';
      ctx.mi = a.querySelector(".mi");
      ctx.reset = function () { ctx.mi.innerHTML = P7.AIMark("Drafted from the survey, interviews and Four Helpful Lists"); };
      requestAnimationFrame(function () { ctx.reset(); });
    },
    play: function (ctx, later) {
      ctx.reset();
      later(function () { var m = ctx.mi.querySelector(".cwl-ai-mark"); if (m && CL.sweepAi) CL.sweepAi(m); }, 400);
    }
  });
})();
