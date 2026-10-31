/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 2 · screens.js
   Milestone 2 screens, each tagged with its screen ID:
   FAC-04, screen check, holding, D1-01, D1-02, D1-03 (word cloud and
   response wall), FAC-01, FAC-03, SET-07, phone states, the private
   "Only you see this" treatment, FAIL-01 to FAIL-06, FAIL-08, FAIL-10,
   and the two open decisions for design pass 2.
   Built only from Clearway Live classes and tokens plus pass2.css.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P2 = window.ClearwayLivePass2, h = CL.h, esc = CL.esc, L = CL.lucide, R = P2.ROOM;
  var host = document.getElementById("boards");

  /* ---------- Scaffolding ---------- */
  function board(id, title, ids, note) {
    var s = h("section", "sc-board"); s.id = id;
    s.innerHTML = '<header class="sc-head"><div><div class="sc-ids"></div><h2></h2></div></header><p class="sc-note"></p><div class="sc-body"></div>';
    s.querySelector("h2").textContent = title;
    s.querySelector(".sc-ids").innerHTML = ids.map(function (x) { return '<span class="sc-id">' + esc(x) + "</span>"; }).join("");
    s.querySelector(".sc-note").textContent = note || "";
    if (!note) s.querySelector(".sc-note").remove();
    host.appendChild(s);
    var nav = document.getElementById("toc");
    if (nav) { var a = h("a"); a.href = "#" + id; a.textContent = title; nav.appendChild(a); }
    return s.querySelector(".sc-body");
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
  function tv(parent, label, type, theme, caption) {
    var t = CL.stage(frame(parent, label, "is-tv", caption), theme || "dark");
    CL.screenTexture(t, type || "input");
    return t;
  }
  function top(t, right, left) {
    var d = h("div", "cwl-tv-top");
    d.innerHTML = (left || P2.lockup()) + '<span class="p2-right">' + (right || "") + "</span>";
    t.appendChild(d); return d;
  }
  function content(t, html, style) { var c = h("div", "cwl-tv-content"); if (style) c.style.cssText = style; c.innerHTML = html; t.appendChild(c); return c; }
  function foot(t, left, right) { var f = h("div", "cwl-tv-foot"); f.innerHTML = "<span>" + (left || "") + "</span><span>" + (right || "") + "</span>"; t.appendChild(f); return f; }
  var LIVE = '<span class="cwl-live-marker">Live</span>';
  function tally(n, unit) { return '<span class="cwl-tally"><span class="cwl-tally-n">' + n + "</span> " + (unit || "answers") + "</span>"; }

  function phone(parent, label, type, caption) {
    var p = CL.phone(frame(parent, label, "is-phone", caption), "dark");
    CL.screenTexture(p, type || "phone-answering");
    return p;
  }
  function phead(p, right) { var d = h("div", "cwl-ph-head"); d.innerHTML = '<span class="cwl-ph-church">' + esc(R.church) + "</span>" + (right == null ? '<span class="cwl-live-marker">Live</span>' : right); p.appendChild(d); return d; }
  function pbody(p, html) { var d = h("div", "cwl-ph-body"); d.innerHTML = html; p.appendChild(d); return d; }
  function pfoot(p, html) { var d = h("div", "cwl-ph-foot"); d.innerHTML = html; p.appendChild(d); return d; }
  function ans(text, status) {
    var st = { sent: L("check") + " Sent", saved: L("wifi-off") + " Saved on this phone", sending: L("refresh-cw") + " Sending" }[status || "sent"];
    return '<div class="cwl-ph-answer"><span>' + esc(text) + '</span><span class="cwl-ph-status">' + st + "</span></div>";
  }
  var ANON = '<div><span class="cwl-marker">' + L("eye-off") + " Anonymous on the screen</span></div>";
  var PROMPT = "One word for what God is doing at Riverside";

  function app(parent, label, w, hgt, surface, caption) { return CL.appFrame(frame(parent, label, "is-app", caption), w, hgt, surface || "control"); }
  function appPhone(parent, label, caption) { var b = frame(parent, label, "is-phone", caption); return CL.appPhone(b, "control"); }
  var B = function (label, cls, icon, extra) { return '<button type="button" class="cwl-a-btn ' + (cls || "is-secondary") + '"' + (extra || "") + ">" + (icon ? L(icon) : "") + (label ? "<span>" + esc(label) + "</span>" : "") + "</button>"; };
  var CHIP = function (label, cls, icon) { return '<span class="cwl-a-chip ' + (cls || "") + '">' + (icon ? L(icon) : "") + "<span>" + esc(label) + "</span></span>"; };
  var RUNS = { draft: ["Draft", "pencil-line"], ready: ["Ready", "circle-check"], live: ["Live", "radio"], done: ["Done", "check-check"], "team-led": ["Team-led", "users"] };
  var RUN = function (k) { return CHIP(RUNS[k][0], "run-" + k, RUNS[k][1]); };
  var BAN = function (kind, icon, html) { return '<div class="cwl-a-banner is-' + kind + '" role="' + (kind === "error" ? "alert" : "status") + '"><span class="ic">' + L(icon) + "</span><div>" + html + "</div></div>"; };
  var SYNC = function (cls, icon, t) { return '<span class="cwl-a-sync ' + cls + '">' + L(icon) + "<span>" + t + "</span></span>"; };
  var PRIVATE = function (title, body) { return '<div class="cwl-private"><div class="cwl-private-band">' + L("eye-off") + " Only you see this" + (title ? '<span style="margin-left:auto;font-weight:600;opacity:1">' + esc(title) + "</span>" : "") + '</div><div class="cwl-private-body">' + body + "</div></div>"; };
  function tabs(parent, names, on) {
    var t = h("div", "cwl-tabs sc-tabs"); t.setAttribute("role", "tablist");
    names.forEach(function (n, i) { var b = h("button", "cwl-tab"); b.type = "button"; b.setAttribute("role", "tab"); b.textContent = n; b.onclick = function () { sel(i); }; t.appendChild(b); });
    parent.appendChild(t);
    function sel(i) { t.querySelectorAll("button").forEach(function (b, j) { b.setAttribute("aria-selected", i === j); }); on(i, names[i]); CL.icons(); }
    return sel;
  }

  /* ============================================================
     FAC-04 · TV pairing
     ============================================================ */
  (function () {
    var b = board("pairing", "TV pairing", ["FAC-04"], "The TV runs in a browser on the church's computer at the screen, connected by HDMI or screen mirroring. Opening live.clearway.co/tv shows a large code; the facilitator enters it on the control surface. Pairing survives the browser closing (FAIL-04) and lasts until the engagement closes.");
    var r = row(b, "is-2");
    var t = tv(r, "TV · waiting to pair", "holding", "dark", "No church identity shows before pairing. Digits are set at tv-display (144px) on light cards so they read from the back of the room.");
    top(t, "", '<span class="cwl-tv-logo">' + CL.markSVG("solid") + "</span>");
    content(t, '<div class="p2-pair"><div class="cwl-tv-eyebrow">Pair this screen</div><div class="p2-pair-code" aria-label="Pairing code 4 8 2 9 1 6"><span>4</span><span>8</span><span>2</span><span class="p2-sep">·</span><span>9</span><span>1</span><span>6</span></div><div class="p2-pair-steps">On your laptop, open the control surface and choose <strong>Pair a TV</strong>. Enter this code.</div></div>');
    foot(t, '<span class="cwl-tv-upclose">live.clearway.co/tv</span>', '<span class="cwl-tv-upclose">Code changes in 4:52</span>');
    var t2 = tv(r, "TV · paired, nothing live", "holding", "dark", "On pairing, the code card cross-fades to the holding screen. From here the TV shows only what the control surface puts live.");
    top(t2, "");
    content(t2, '<div style="margin:auto 0"><div class="cwl-tv-eyebrow">' + esc(R.event) + '</div><div class="cwl-tv-headline-xl" style="margin-top:16px"><strong>' + esc(R.church) + '</strong></div><div class="cwl-tv-quiet" style="margin-top:24px;display:flex;gap:16px;align-items:center">' + L("check") + " This screen is paired</div></div>");
    var r2 = row(b, "is-1");
    var a = app(r2, "Control surface · Pair a TV", 1100, 600, "control", "Pair is a confirm, so it carries the view's one Lime moment. Paired screens list with when each was last seen; unpairing asks first.");
    a.innerHTML = '<div class="cwl-a-pad" style="opacity:.55"><div class="cwl-a-title">Live room</div><div class="cwl-a-muted">Riverside Church · Wayfinding · Day 1</div></div><div class="cwl-a-scrim"></div>' +
      '<div class="cwl-a-modal" role="dialog" aria-labelledby="pairT" style="width:560px"><div class="cwl-a-panel-head" style="height:auto;padding:18px 24px"><div><div class="cwl-a-section" id="pairT">Pair a TV</div><div class="cwl-a-muted">Enter the code on the screen at the front of the room.</div></div><button type="button" class="cwl-a-btn is-ghost is-icon" aria-label="Close">' + L("x") + "</button></div>" +
      '<div class="cwl-a-pad"><div class="cwl-a-field"><label class="cwl-a-flabel" for="pc">Code on the TV</label><input id="pc" class="cwl-a-input" value="482 916" style="font-size:24px;height:56px;letter-spacing:0.2em;font-weight:700;font-variant-numeric:tabular-nums"></div>' +
      '<div class="cwl-a-eyebrow">Paired screens</div><div class="cwl-a-list"><div class="cwl-a-li"><span class="cwl-a-avatar">' + L("monitor") + '</span><div class="grow"><div class="cwl-a-label">Front TV · Chrome on Windows</div><div class="cwl-a-muted">Last seen just now · showing Nothing live</div></div>' + B("Unpair", "is-ghost is-sm") + "</div></div>" +
      '<div class="cwl-a-help">You can pair more than one screen for larger rooms. Pairing lasts until the engagement closes.</div></div>' +
      '<div class="cwl-a-modal-foot">' + B("Cancel", "is-secondary") + B("Pair this TV", "is-confirm", "monitor-check") + "</div></div>";
  })();

  /* ============================================================
     Screen check
     ============================================================ */
  (function () {
    var b = board("screen-check", "Screen check", ["Screen check", "Practice room"], "Run before the room arrives, from the top of every template. If any Lime corner is cut off, the TV is overscanning: set its picture size to Just Scan, Screen Fit or 1:1. The circle must look round. The ladder shows every TV size so the farthest seat can confirm the floor.");
    var r = row(b, "is-1");
    var t = tv(r, "TV · screen check at 1920 by 1080", "content", "dark");
    var c = h("div", "p2-check");
    c.innerHTML = '<div class="p2-check-edge"></div><div class="p2-check-safe"></div><div class="p2-check-corner tl"></div><div class="p2-check-corner tr"></div><div class="p2-check-corner bl"></div><div class="p2-check-corner br"></div><div class="p2-check-cross"></div><div class="p2-check-cross is-h"></div><div class="p2-check-circle"></div>' +
      '<div class="p2-ladder">' + [["tv-display", 144, "Aa 8"], ["tv-headline-xl", 96, "Grow"], ["tv-headline", 64, "Where is God"], ["tv-main", 56, "Welcoming culture"], ["tv-body", 44, "Small groups in homes"], ["tv-floor", 36, "23 answers"], ["tv-upclose", 24, "Reconnecting (up close only)"]].map(function (x) { return '<div><small>' + x[0] + " · " + x[1] + 'px</small><span style="font-size:' + x[1] + 'px">' + esc(x[2]) + "</span></div>"; }).join("") + "</div>" +
      '<div class="p2-check-label"><div class="cwl-tv-eyebrow">Screen check</div><div class="cwl-tv-body" style="margin-top:12px">Every Lime corner should be fully visible.</div></div>';
    t.appendChild(c);
    var r2 = row(b, "is-3");
    ["very-large", "medium", "very-small"].forEach(function (rs, i) {
      var tt = tv(r2, "Room size · " + ["very large screen (1.0)", "medium screen (1.2)", "very small screen (1.5, default for a U of 8)"][i], "input", "dark");
      tt.setAttribute("data-room", rs);
      top(tt, tally(23) + LIVE);
      content(tt, '<div class="cwl-tv-eyebrow">Celebration</div><div class="cwl-tv-headline">What is God doing that\'s <strong>worth celebrating?</strong></div><div class="p2-group-list" style="margin-top:24px"><div class="p2-group" style="font-size:56px"><span class="lbl">Baptisms</span><span class="n">4</span></div><div class="p2-group" style="font-size:48px"><span class="lbl">Young families</span><span class="n">2</span></div></div>');
    });
  })();

  /* ============================================================
     Holding and walk-in
     ============================================================ */
  (function () {
    var b = board("holding", "Holding and walk-in", ["Nothing live", "Breaks"], "Shown between sessions and on Nothing live. Texture G2 (the large solid mark cropped off the edge, with glow). No LIVE marker. Phones wait over the offset pattern with one line about what happens next.");
    var r = row(b, "is-holding");
    var t = tv(r, "TV · walk-in, Nothing live", "holding", "dark");
    top(t, "");
    content(t, '<div style="margin:auto 0"><div class="cwl-tv-eyebrow">' + esc(R.event) + '</div><div class="cwl-tv-headline-xl" style="margin-top:16px"><strong>' + esc(R.church) + '</strong></div><div class="cwl-tv-quiet" style="margin-top:24px">Welcome. Coffee is at the back.</div></div>');
    var t2 = tv(r, "TV · break", "holding", "dark");
    top(t2, "");
    content(t2, '<div style="margin:auto 0"><div class="cwl-tv-eyebrow">Break</div><div class="cwl-tv-headline-xl" style="margin-top:16px">Back at <strong>10:45</strong></div><div class="cwl-tv-quiet" style="margin-top:24px">Next: Five Lenses · Community</div></div>');
    var p = phone(r, "Phone · Nothing live", "phone-waiting");
    phead(p, "<span></span>");
    pbody(p, '<div class="cwl-ph-headline">Nothing live right now</div><div class="cwl-ph-text">We\'ll bring you back when the next session starts.</div>');
  })();

  /* ============================================================
     D1-01 · Join screen
     ============================================================ */
  (function () {
    var b = board("join", "Join screen", ["D1-01"], "First thing on Day 1. People who signed in at the pre-call only scan the code. Names arrive one at a time with the arrival motion and the count ticks. First name only; 14 names, then '+ N more'.");
    var r = row(b, "is-tv1");
    var t = tv(r, "TV · names arriving", "holding", "dark");
    top(t, '<span class="cwl-tally"><span class="cwl-tally-n" data-n="0">0</span> here</span>');
    var c = content(t, '<div class="cwl-join"><div class="cwl-qr"></div><div><div class="cwl-tv-eyebrow">' + esc(R.church) + '</div><div class="cwl-join-link p2-join-link" style="margin-top:16px">' + esc(R.link) + '</div><div class="cwl-tv-quiet" style="margin-top:20px">Scan the code or type the link. No app needed.</div><div class="cwl-names"><span>Waiting for the first phone</span></div></div></div>');
    CL.qr(c.querySelector(".cwl-qr"), "https://" + R.link);
    var names = c.querySelector(".cwl-names"), n = t.querySelector(".cwl-tally-n");
    function play() {
      names.innerHTML = "<span>Waiting for the first phone</span>"; CL.countTo(n, 0);
      R.people.forEach(function (who, i) {
        setTimeout(function () {
          if (i === 0) names.innerHTML = "";
          var s = h("span"); s.textContent = who;
          CL.flip(names, function () { names.appendChild(s); });
          CL.countTo(n, i + 1);
        }, 600 + i * 700);
      });
    }
    play();
    var p = phone(r, "Phone · signed in at the pre-call", "phone-waiting");
    phead(p, "<span></span>");
    pbody(p, '<div class="cwl-ph-church" style="font-size:var(--cwl-fs-phone-input)">' + esc(R.church) + '</div><div class="cwl-ph-headline">You\'re in</div><div class="cwl-ph-text">Watch the screen. Questions will appear here.</div>');
    var p2 = phone(r, "Phone · refresh restores the room", "phone-answering");
    phead(p2, "<span></span>");
    pbody(p2, '<div class="cwl-ph-headline">Opening the room</div><div class="cwl-ph-text">Signed in as Ruth. No sign-in form shows while the session is restored.</div>');
    var ctl = h("div", "sc-actions"); ctl.innerHTML = B("Replay arrivals", "is-secondary", "rotate-ccw"); ctl.setAttribute("data-surface", "setup"); ctl.setAttribute("data-theme", "light");
    ctl.querySelector("button").onclick = play; b.appendChild(ctl);
  })();

  /* ============================================================
     D1-02 · Welcome and prayer (Scripture)
     ============================================================ */
  (function () {
    var b = board("scripture", "Welcome and prayer", ["D1-02"], "After the join screen, the session opens on Scripture. Texture D (glow only), quiet and still. Phones carry the same passage with the translation named. The passage is pasted in setup.");
    var r = row(b, "is-tv1");
    var t = tv(r, "TV · Scripture", "content", "dark");
    top(t, "");
    content(t, '<div style="margin:auto 0"><div class="cwl-tv-eyebrow">Welcome and prayer</div><div class="cwl-tv-headline-xl" style="margin-top:24px">Write the vision, and make it plain on tablets, <strong>that he who runs may read it.</strong></div><div class="cwl-scripture-ref">Habakkuk 2:2 · World English Bible</div></div>');
    var p = phone(r, "Phone · reading", "phone-answering");
    phead(p, "<span></span>");
    pbody(p, '<div class="cwl-ph-church">Welcome and prayer</div><div class="cwl-ph-prompt">Habakkuk 2:2</div><div class="cwl-ph-text">Write the vision, and make it plain on tablets, that he who runs may read it.</div><div class="cwl-ph-source">World English Bible</div>');
    var p2 = phone(r, "Phone · prayer", "phone-waiting");
    phead(p2, "<span></span>");
    pbody(p2, '<div class="cwl-ph-headline">Phones away</div><div class="cwl-ph-text">We\'re praying together.</div>');
  })();

  /* ============================================================
     D1-03 · Word cloud and response wall
     ============================================================ */
  (function () {
    var b = board("word-cloud", "Word cloud and response wall", ["D1-03", "INT-01", "INT-02"], "Both run on the live engine from the motion review. Use Add an answer to watch an arrival here; the motion review has every other control.");
    var r = row(b, "is-2");
    var cloud = new P2.LiveRoom(frame(r, "TV · D1-03 word cloud", "is-tv", "Each word keeps its own place: new words take the free space nearest the middle, growing words ease their neighbours aside, nothing re-sorts or re-wraps. Size follows the square root of the count; Sky for one mention, Off-White when repeated, Sunrise for the leader."), null, { session: "cloud" });
    var wall = new P2.LiveRoom(frame(r, "TV · response wall", "is-tv", "Answers scroll in the right column, newest first, fading out at the foot. The main area shows the AI's groups as short theme labels, all one color, sized by how many answers each holds and marked AI grouped. Groups update a moment after the answers land, so AI never sits between a phone and the screen."), null, { session: "wall" });
    var ctl = h("div", "sc-actions"); ctl.setAttribute("data-surface", "setup"); ctl.setAttribute("data-theme", "light");
    ctl.innerHTML = B("Add an answer to the cloud", "is-primary", "send") + B("Add an answer to the wall", "is-secondary", "send") + '<a class="cwl-a-link" href="' + esc((document.querySelector("#toc a") || {}).getAttribute ? document.querySelector("#toc a").getAttribute("href") : "motion-review.html") + '">Open the motion review</a>';
    var bs = ctl.querySelectorAll("button");
    bs[0].onclick = function () { cloud.addOne(false); }; bs[1].onclick = function () { wall.addOne(false); };
    b.appendChild(ctl);
    var r3 = row(b, "is-1");
    var t = tv(r3, "TV · join strip on (first session of each day)", "input", "dark", "The optional join strip puts a small QR code and the room link in the bottom right so late arrivals can join. On by default for the first session of each day.");
    top(t, tally(17) + LIVE);
    var c = content(t, '<div class="cwl-tv-eyebrow">Celebration</div><div class="cwl-tv-headline" style="margin-bottom:32px">One word for what God is doing <strong>at Riverside</strong></div><div class="cwl-cloud" style="margin-right:300px"></div>');
    CL.wordCloud(c.querySelector(".cwl-cloud"), P2.SESSIONS.cloud.seed.map(function (w) { return { text: w[0], count: w[1] }; }), { maxPx: 150, newHold: false });
    var js = h("div", "cwl-join-strip"); js.innerHTML = '<span class="cwl-tv-upclose" style="font-size:var(--cwl-fs-tv-floor);color:var(--cwl-text-muted)">' + esc(R.link) + '</span><div class="cwl-qr"></div>'; t.appendChild(js);
    CL.qr(js.querySelector(".cwl-qr"), "https://" + R.link);
  })();

  /* ============================================================
     FAC-01 · Control surface
     ============================================================ */
  var DAY1 = [["9:00", "Welcome and prayer", "Scripture", "done"], ["9:15", "Celebration", "word cloud · 20 min", "live"], ["9:35", "Five Lenses: Congregation", "open text · 55 min", "ready"], ["10:30", "Break", "Nothing live", "ready"], ["10:45", "Five Lenses: Community", "open text · 60 min", "ready"], ["11:45", "Lunch", "Nothing live", "draft"]];
  (function () {
    var b = board("control", "Control surface", ["FAC-01", "FAIL-02", "FAIL-06"], "The facilitator's laptop at the high-top. In charge of the TV and every phone at once, and never shown to the room. Left: run of show with timing and Up next. Centre: what the TV has confirmed, what phones are doing, and the live controls. Right: everything private, under the 'Only you see this' band. The alignment signal arrives in milestone 6.");
    var r = row(b, "is-1");
    var a = app(r, "Control surface · laptop at 1440 by 900", 1440, 900, "control");
    a.innerHTML = '<div class="p2-fac">' +
      '<div class="p2-fac-head"><div class="who"><span class="mk">' + CL.markSVG("solid") + '</span><div style="min-width:0"><div class="cwl-a-eyebrow">' + esc(R.church) + ' · Wayfinding</div><div class="cwl-a-section">Day 1 · Live room</div></div></div>' +
      '<div class="cwl-a-row" style="flex-wrap:nowrap"><span class="p2-sync-slot"></span><span class="p2-remote-holder">' + L("smartphone") + ' You have the remote · Jaisy is watching</span>' + B("Print run of show", "is-secondary", "printer") + "</div></div>" +
      '<div class="p2-fac-cols">' +
      /* left: run of show */
      '<div class="p2-fac-col"><div class="cwl-a-row" style="justify-content:space-between"><div class="cwl-a-label">Run of show</div><span class="cwl-a-chip is-success">' + L("clock") + "<span>On time · 9:24</span></span></div>" +
      '<div class="p2-run"><div class="p2-run-part">Day 1</div>' + DAY1.map(function (x, i) { return '<div class="p2-run-row' + (x[3] === "live" ? " is-current" : "") + (i === 2 ? " is-next" : "") + '"><span class="t">' + x[0] + '</span><div style="min-width:0"><div class="ttl">' + esc(x[1]) + '</div><div class="sub">' + esc(x[2]) + "</div></div>" + RUN(x[3]) + "</div>"; }).join("") + "</div>" +
      PRIVATE("Up next", '<div class="cwl-a-label">Five Lenses: Congregation</div><div class="p2-notes">Set the posture: we\'re describing what\'s true in 2036, not planning. Seeded sentences show first. Four-minute burst, then phones down and work the easel. Watch for small groups.</div>') + "</div>" +
      /* centre: TV mirror and controls */
      '<div class="p2-fac-col is-center"><div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-eyebrow">On the TV now</span><span class="p2-sync-mini"></span></div><div class="p2-mirror"></div>' +
      '<div class="cwl-a-row" style="justify-content:space-between"><div><div class="cwl-a-eyebrow">On phones now</div><div class="cwl-a-label">Input open · burst 3:12 left</div></div><div class="cwl-progress" style="width:220px"><i style="width:64%"></i></div></div>' +
      '<div class="p2-banner-slot"></div>' +
      '<div class="p2-ctrl">' + B("Go live: Congregation", "is-primary is-wide", "play") + B("Back", "is-secondary", "chevron-left") + B("Next", "is-secondary", "chevron-right") +
      B("Extend 1 min", "is-secondary", "plus") + B("End burst", "is-secondary", "square") + B("Phones down", "is-secondary", "smartphone") + B("Nothing live", "is-secondary", "pause") +
      B("Spotlight", "is-secondary", "sun") + B("Hide", "is-secondary", "eye-off") + B("Refresh phones", "is-secondary", "refresh-cw") + B("TV view on phones", "is-secondary", "monitor-smartphone") +
      '</div><div class="cwl-a-row"><label class="cwl-a-flabel" for="rs">Room size</label><div class="cwl-a-select" style="width:240px;position:relative"><select id="rs"><option>Very small screen</option><option>Small screen</option><option>Medium screen</option><option>Large screen</option><option>Very large screen</option></select>' + L("chevron-down") + '</div><span class="cwl-a-help">Scales all TV type at once.</span></div></div>' +
      /* right: private */
      '<div class="p2-fac-col">' +
      PRIVATE("Room", '<div class="p2-stat"><div><b>8 of 8</b><span class="cwl-a-muted">Signed in</span></div><div><b>7</b><span class="cwl-a-muted">Answered this session</span></div><div><b>23</b><span class="cwl-a-muted">Answers</span></div><div><b>0.41s</b><span class="cwl-a-muted">Phone to TV, 95th</span></div></div>') +
      PRIVATE("At the door", '<div class="cwl-a-list"><div class="cwl-a-li"><span class="cwl-a-avatar">JL</span><div class="grow"><div class="cwl-a-label cwl-a-trunc">Jordan Lee</div><div class="cwl-a-muted cwl-a-trunc">jordan.lee@example.org · not on the list</div></div><div class="actions">' + B("Approve", "is-primary is-sm", "check") + '</div></div></div>' + B("Sign someone in by hand", "is-ghost is-sm", "key-round")) +
      PRIVATE("Presenter notes", '<div class="p2-notes">Open with the one-word cloud, then sentences. Name "momentum" if it leads: Daniel and Grace both raised it last week. Keep this to 20 minutes.</div>') +
      "</div></div></div>";
    var mirror = new P2.LiveRoom(a.querySelector(".p2-mirror"), null, { session: "cloud" });
    var syncSlot = a.querySelector(".p2-sync-slot"), mini = a.querySelector(".p2-sync-mini"), ban = a.querySelector(".p2-banner-slot");
    var sel = tabs(b, ["Live", "Syncing (FAIL-06)", "TV reconnecting (FAIL-02)", "Fallback mode"], function (i) {
      var st = [SYNC("", "check", "On the TV now"), SYNC("is-syncing", "refresh-cw", "Syncing"), SYNC("", "monitor-off", "TV reconnecting"), SYNC("", "check", "On the TV now")][i];
      syncSlot.innerHTML = st; mini.innerHTML = st;
      ban.innerHTML = ["", BAN("warning", "triangle-alert", "<strong>The TV hasn't confirmed yet.</strong> It keeps showing the last screen; the controls show what the TV confirms. The room is fine."),
        BAN("warning", "triangle-alert", "<strong>TV reconnecting.</strong> It's holding the last screen. If it stays down, show the TV view on phones.") + '<div style="margin-top:8px">' + B("Show the TV view on phones", "is-secondary", "monitor-smartphone") + "</div>",
        BAN("info", "info", "<strong>Fallback mode.</strong> This venue blocks live connections, so the room updates every 1 to 2 seconds. Motion still runs; nothing redraws.")][i];
      mirror.setOffline(i === 2, true);
      a.querySelector(".p2-mirror").style.filter = i === 2 ? "grayscale(0.6)" : "";
      CL.icons();
    });
    var tb = b.querySelector(".sc-tabs"); b.insertBefore(tb, b.firstChild);
    sel(0);
    var r2 = row(b, "is-2");
    var a2 = app(r2, "Control surface · Preview, not live", 700, 420, "control", "Preview browses any session with its phone depth and notes without moving the room. Go live from the preview sends it.");
    a2.innerHTML = '<div class="cwl-a-pad"><div class="p2-r-preview"><div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-eyebrow">Preview · not on the TV</span>' + CHIP("Ready", "run-ready", "circle-check") + '</div><div class="cwl-a-section">Five Lenses: Congregation</div><div class="cwl-a-muted">TV: "It\'s 2036. Describe our Congregation." · Phones: write in the present tense · Burst 4 minutes</div><div class="cwl-a-row">' + B("Go live from preview", "is-primary", "play") + B("Close preview", "is-ghost") + "</div></div>" + PRIVATE("Presenter notes", '<div class="p2-notes">Seeded sentences appear first. Three of them mention campus pastors raised here.</div>') + "</div>";
    var a3 = app(r2, "Control surface · two remotes", 700, 420, "control", "The facilitator's phone and laptop, or the facilitator and co-facilitator, see each other's presses at once.");
    a3.innerHTML = '<div class="cwl-a-pad"><div class="cwl-a-toast is-info" role="status"><span class="ic">' + L("radio") + '</span><div><strong>Jaisy pressed Phones down</strong><div class="cwl-a-muted">From her phone · just now</div></div>' + B("", "is-ghost is-icon", "x", ' aria-label="Dismiss"') + '</div><div class="cwl-a-row">' + SYNC("", "check", "On the TV now") + '<span class="p2-remote-holder">' + L("users") + ' Chris and Jaisy have the remote</span></div><div class="cwl-a-muted">Presses from either remote change the one room state; both remotes and this view then follow what the TV confirms.</div></div>';
  })();

  /* ============================================================
     FAC-03 · Phone remote
     ============================================================ */
  function remote(parent, label, opts, caption) {
    var el = appPhone(parent, label, caption);
    opts = opts || {};
    var syncing = opts.state === "syncing";
    el.innerHTML = '<div class="cwl-ph-head" style="border-color:var(--cwl-app-border)"><span class="cwl-a-label">' + esc(R.church) + "</span>" + (syncing ? SYNC("is-syncing", "refresh-cw", "Syncing") : SYNC("", "check", "On the TV")) + "</div>" +
      '<div class="cwl-r-body" style="overflow:auto"><div class="tvm" style="border-radius:8px;overflow:hidden;flex:none"></div>' +
      '<div class="cwl-a-row" style="justify-content:space-between;flex-wrap:nowrap"><div style="min-width:0"><div class="cwl-a-eyebrow">On the TV now</div><div class="cwl-a-label cwl-a-trunc">Celebration</div></div>' + (opts.down ? '<span class="cwl-a-chip">' + L("smartphone") + "<span>Phones down</span></span>" : '<span class="cwl-live-marker is-handed-off" style="font-size:12px">Live</span>') + "</div>" +
      (syncing ? BAN("warning", "triangle-alert", "The TV hasn't confirmed yet. The room is fine.") : "") +
      (opts.burst ? '<div class="p2-r-countdown"><b>3:12</b><div class="cwl-progress"><i style="width:64%"></i></div>' + B("", "is-ghost is-icon", "plus", ' aria-label="Extend 1 minute"') + "</div>" : "") +
      (opts.preview ? '<div class="p2-r-preview"><div class="cwl-a-eyebrow">Preview · not on the TV</div><div class="cwl-a-label">Five Lenses: Congregation</div><div class="cwl-a-muted">It\'s 2036. Describe our Congregation.</div></div>' : '<div class="cwl-a-eyebrow">Up next</div><div class="cwl-a-label">Five Lenses: Congregation</div>') +
      '<button type="button" class="cwl-r-btn ' + (opts.burst || opts.down ? "is-primary" : "is-live") + '">' + L("play") + (opts.preview ? "Go live from preview" : "Go live") + "</button>" +
      '<div class="cwl-r-grid"><button type="button" class="cwl-r-btn">' + L("chevron-left") + 'Back</button><button type="button" class="cwl-r-btn">Next' + L("chevron-right") + "</button></div>" +
      (opts.burst ? '<div class="cwl-r-grid"><button type="button" class="cwl-r-btn">' + L("square") + 'End burst</button><button type="button" class="cwl-r-btn">' + L("smartphone") + "Phones down</button></div>"
        : '<div class="cwl-r-grid"><button type="button" class="cwl-r-btn is-primary">' + L("timer") + 'Start burst</button><div class="cwl-r-seg" role="radiogroup" aria-label="Burst length"><span role="radio" aria-checked="false">3</span><span role="radio" aria-checked="true">4</span><span role="radio" aria-checked="false">5</span></div></div>') +
      '<div class="cwl-r-grid"><button type="button" class="cwl-r-btn">' + L("sun") + 'Spotlight</button><button type="button" class="cwl-r-btn">' + L("eye-off") + "Hide</button></div>" +
      '<div class="cwl-r-grid"><button type="button" class="cwl-r-btn">' + L(opts.down ? "smartphone" : "pause") + (opts.down ? "Open phones" : "Nothing live") + '</button><button type="button" class="cwl-r-btn">' + L("monitor-smartphone") + "TV on phones</button></div>" +
      '<div class="cwl-r-grid"><button type="button" class="cwl-r-btn">' + L("refresh-cw") + 'Refresh phones</button><button type="button" class="cwl-r-btn">' + L("type") + "Room size</button></div></div>";
    var t = CL.stage(el.querySelector(".tvm"), "dark"); CL.screenTexture(t, "input");
    top(t, tally(23) + (opts.down ? '<span class="cwl-state-pill">' + L("smartphone") + " Phones down</span>" : LIVE));
    var c = content(t, '<div class="cwl-tv-headline" style="margin-bottom:24px">One word for what God is doing <strong>at Riverside</strong></div><div class="cwl-cloud"></div>');
    CL.wordCloud(c.querySelector(".cwl-cloud"), P2.SESSIONS.cloud.seed.map(function (w) { return { text: w[0], count: w[1] }; }), { maxPx: 150, newHold: false });
    if (syncing) t.style.filter = "grayscale(0.5)";
    return el;
  }
  (function () {
    var b = board("remote", "Phone remote", ["FAC-03", "FAIL-05", "FAIL-06"], "The live controls in the facilitator's hand, with the laptop closed if need be (FAIL-05). The mirror at the top always shows what the TV has confirmed, never what was asked. One Lime moment: Go live, or the burst progress while a burst runs.");
    var r = row(b, "is-phones");
    remote(r, "Live, ready for the next session", {}, "Go live is the view's Lime moment, so the LIVE pill takes its outline form.");
    remote(r, "Burst running", { burst: true }, "Burst progress takes the Lime moment; Go live steps to primary. Extend adds a minute.");
    remote(r, "Preview", { preview: true }, "Browsing a session without moving the room.");
    remote(r, "Phones down", { down: true }, "Phones are locked; the TV holds still.");
    remote(r, "Syncing (FAIL-06)", { state: "syncing" }, "After 2 seconds without the TV confirming. The TV wins; the remote corrects itself.");
  })();

  /* ============================================================
     SET-07 · Basic run of show, FAIL-10 printout
     ============================================================ */
  (function () {
    var b = board("run-of-show", "Run of show", ["SET-07", "FAIL-10"], "Sessions grouped by part, in order. Each has a title, planned start and length, mode, interaction, the prompt, phone depth, settings and presenter notes. Edits to a live or ready session go out when you press Save, never per keystroke. The whole run of show prints before the day, so the easel can carry the room if the tech fails.");
    var r = row(b, "is-1");
    var a = app(r, "Setup · run of show with a session open", 1440, 900, "setup");
    var rows = function (part, list) { return '<div class="cwl-a-section" style="font-size:16px">' + part + '</div><div class="cwl-a-list">' + list.map(function (x, i) { return '<div class="cwl-a-li' + (x[4] ? " is-current" : "") + '"><span class="cwl-a-handle" aria-label="Drag to reorder">' + L("grip-vertical") + '</span><span class="time">' + x[0] + '</span><div class="grow"><div class="cwl-a-label cwl-a-trunc">' + esc(x[1]) + '</div><div class="cwl-a-muted">' + esc(x[2]) + "</div></div>" + RUN(x[3]) + '<div class="actions">' + B("Preview", "is-ghost is-sm") + "</div></div>"; }).join("") + "</div>"; };
    a.innerHTML = '<div class="cwl-a-shell"><nav class="cwl-a-side" aria-label="Engagement"><div class="cwl-a-brand" style="display:flex;align-items:center;gap:10px;padding:4px 8px 14px"><span class="mk">' + CL.markSVG("solid") + '</span><strong>Clearway</strong></div>' +
      [["layout-dashboard", "Overview"], ["users", "Attendees"], ["list-ordered", "Run of show", 1], ["radio", "Live room"], ["printer", "Printouts"], ["lock", "Discover", 2]].map(function (n) { return '<a class="cwl-a-nav" href="#run-of-show"' + (n[2] === 1 ? ' aria-current="page"' : n[2] === 2 ? ' aria-disabled="true"' : "") + ">" + L(n[0]) + "<span>" + n[1] + "</span></a>"; }).join("") + "</nav>" +
      '<div style="display:flex;flex-direction:column;min-width:0;position:relative"><div class="cwl-a-header"><div style="min-width:0"><div class="cwl-a-eyebrow">' + esc(R.church) + ' · Wayfinding</div><h1 class="cwl-a-title">Run of show</h1></div><div class="cwl-a-row" style="flex-wrap:nowrap">' + B("Print run of show", "is-secondary", "printer") + B("Add session", "is-primary", "plus") + "</div></div>" +
      '<div class="cwl-a-content" style="padding-right:calc(var(--cwl-app-panel-w) + 24px)">' +
      rows("Pre-call · Nov 6", [["7:00", "Welcome and prayer", "Scripture · live · 10 min", "done"], ["7:10", "Celebrations", "word cloud, then open text · live · 20 min", "done"]]) +
      rows("Day 1 · Nov 14", [["9:00", "Welcome and prayer", "join, then Scripture · live · 15 min", "ready"], ["9:15", "Celebration", "word cloud · live · 20 min", "ready"], ["9:35", "Five Lenses: Congregation", "open text · live · 55 min", "draft", 1], ["10:30", "Break", "Nothing live · 15 min", "ready"]]) +
      "</div>" +
      '<aside class="cwl-a-panel" aria-label="Edit session"><div class="cwl-a-panel-head"><div class="cwl-a-section">Five Lenses: Congregation</div>' + B("", "is-ghost is-icon", "x", ' aria-label="Close"') + "</div>" +
      '<div class="cwl-a-pad" style="overflow:auto;flex:1"><div class="p2-form">' +
      '<div class="cwl-a-field is-full"><label class="cwl-a-flabel" for="st">Title</label><input id="st" class="cwl-a-input" value="Five Lenses: Congregation"></div>' +
      '<div class="cwl-a-field"><label class="cwl-a-flabel" for="sp">Part</label><input id="sp" class="cwl-a-input" value="Day 1"></div>' +
      '<div class="cwl-a-field"><label class="cwl-a-flabel" for="sm">Mode</label><input id="sm" class="cwl-a-input" value="Live, in the room"></div>' +
      '<div class="cwl-a-field"><label class="cwl-a-flabel" for="ss">Planned start</label><input id="ss" class="cwl-a-input" value="9:35"></div>' +
      '<div class="cwl-a-field"><label class="cwl-a-flabel" for="sl">Length</label><input id="sl" class="cwl-a-input" value="55 min"></div>' +
      '<div class="cwl-a-field is-full"><label class="cwl-a-flabel" for="si">Interaction</label><input id="si" class="cwl-a-input" value="Open text wall"></div>' +
      '<div class="cwl-a-field is-full"><label class="cwl-a-flabel" for="sq">Prompt on the TV and phones</label><textarea id="sq" class="p2-textarea">It\'s 2036. Describe our Congregation.</textarea><span class="cwl-a-help">{base year + 10} fills in from the engagement: 2036.</span></div>' +
      '<div class="cwl-a-field is-full"><label class="cwl-a-flabel" for="sd">Phone depth</label><textarea id="sd" class="p2-textarea">Write in the present tense. One sentence each, as many as you like.</textarea></div>' +
      '<div class="cwl-a-field is-full"><span class="cwl-a-flabel">Settings</span><div class="cwl-a-list">' +
      [["Anonymous on the screen", true], ["Join strip on the TV", false], ["AI grouping", false]].map(function (x) { return '<div class="cwl-a-li" style="min-height:48px"><span class="grow cwl-a-label">' + x[0] + '</span><button type="button" class="cwl-a-toggle" role="switch" aria-checked="' + x[1] + '" aria-label="' + x[0] + '"></button></div>'; }).join("") +
      '<div class="cwl-a-li" style="min-height:48px"><span class="grow cwl-a-label">Burst length</span><span class="cwl-a-muted">4 minutes</span></div><div class="cwl-a-li" style="min-height:48px"><span class="grow cwl-a-label">Answer limit</span><span class="cwl-a-muted">280 characters</span></div></div><span class="cwl-a-help">AI grouping arrives in milestone 3.</span></div>' +
      '<div class="cwl-a-field is-full"><label class="cwl-a-flabel" for="sn">' + L("lock") + ' Presenter notes</label><textarea id="sn" class="p2-textarea">Set the posture: describing what\'s true, not planning. Watch for small groups.</textarea><span class="cwl-a-help">Only facilitators see these. They never reach the TV or phones.</span></div>' +
      '<div class="cwl-a-field is-full"><label class="cwl-a-flabel" for="sx">Lands in</label><input id="sx" class="cwl-a-input" value="The 10-year Future"></div>' +
      '</div></div><div class="cwl-a-panel-foot"><span class="cwl-a-help" style="margin-right:auto">Edits go out when you save.</span>' + B("Cancel", "is-secondary") + B("Save", "is-primary") + "</div></aside></div></div>";
    var r2 = row(b, "is-print");
    var pr = app(r2, "FAIL-10 · printed run of show (letter, portrait)", 816, 1056, "setup");
    var all = [["9:00", "Welcome and prayer", "Join, then Scripture", "Habakkuk 2:2 (World English Bible).", "Names arrive on the join screen."], ["9:15", "Celebration", "Word cloud", "One word for what God is doing at Riverside", "Name momentum if it leads."], ["9:35", "Five Lenses: Congregation", "Open text wall", "It's 2036. Describe our Congregation.", "Seeded sentences first. 4-minute burst."], ["10:30", "Break", "Nothing live", "", ""], ["10:45", "Five Lenses: Community", "Open text wall", "It's 2036. Describe our Community.", ""], ["11:45", "Lunch", "Nothing live", "", ""]];
    pr.innerHTML = '<div class="p2-print"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px"><div><div class="cwl-a-eyebrow">' + esc(R.church) + ' · Wayfinding</div><div class="cwl-a-title">Day 1 run of show</div></div><span style="width:36px;height:36px;color:var(--cwl-app-text)">' + CL.markSVG("solid") + '</span></div><div class="cwl-a-muted" style="margin-top:4px">Printed Nov 13 at 8:14 pm · Room link ' + esc(R.link) + '</div><h3>Sessions</h3><table><thead><tr><th>Time</th><th>Session</th><th>Prompt</th><th>Notes</th></tr></thead><tbody>' +
      all.map(function (x) { return '<tr><td class="tnum">' + x[0] + "</td><td><strong>" + esc(x[1]) + '</strong><div class="cwl-a-muted">' + esc(x[2]) + "</div></td><td>" + esc(x[3]) + "</td><td>" + esc(x[4]) + "</td></tr>"; }).join("") +
      '</tbody></table><h3>If the tech fails</h3><p>The easel carries the room. Ask each prompt aloud and capture on sticky notes; the scribe keeps capturing offline. Phones queue anything typed and send it when the wifi returns.</p></div>';
  })();

  /* ============================================================
     Participant phone states
     ============================================================ */
  (function () {
    var b = board("phones", "Participant phone states", ["D1-03", "FAIL-01", "FAIL-02", "FAIL-08"], "One-handed, from 360px wide, touch targets at least 44px, inputs above the keyboard. A phone follows the room and never runs ahead. Failures are said quietly: never Error, never an alarm.");
    var r = row(b, "is-phones");
    var p = phone(r, "Waiting", "phone-waiting", "Signed in, nothing open yet. One line, no instructions.");
    phead(p, "<span></span>"); pbody(p, '<div class="cwl-ph-church" style="font-size:var(--cwl-fs-phone-input)">' + esc(R.church) + '</div><div class="cwl-ph-headline">You\'re in</div><div class="cwl-ph-text">Watch the screen. Questions will appear here.</div>');

    p = phone(r, "Answering, burst running", "phone-answering", "The burst ring is the Lime moment, so the LIVE marker takes its outline form. The TV shows no countdown.");
    phead(p, '<span class="cwl-live-marker is-handed-off">Live</span>');
    pbody(p, '<div class="cwl-burst"><div class="cwl-burst-ring" style="--p:0.64"></div><div><div class="cwl-burst-time">3:12</div><div class="cwl-ph-muted">left to answer</div></div></div><div class="cwl-ph-prompt">' + PROMPT + "</div>" + ANON);
    pfoot(p, '<input class="cwl-ph-input" value="momentum" aria-label="Your answer"><div class="cwl-ph-count"><span>Up to 3 words</span><span>8 / 28</span></div><button class="cwl-btn" type="button">' + L("send") + " Send</button>");

    p = phone(r, "Sent", "phone-answering", "Sent shows the moment the answer leaves the phone. Not Lime: Sent isn't a confirm.");
    phead(p); pbody(p, '<div class="cwl-ph-prompt">' + PROMPT + "</div>" + ANON + '<div class="cwl-ph-sent">' + ans("momentum") + ans("youth") + "</div>");
    pfoot(p, '<input class="cwl-ph-input" aria-label="Your answer" placeholder="Another word"><div class="cwl-ph-count"><span>2 of 3 sends used</span><span>0 / 28</span></div><button class="cwl-btn" type="button">' + L("send") + " Send</button>");

    p = phone(r, "Over the limit", "phone-answering", "The phone says so and holds Send. It never cuts an answer silently.");
    phead(p); pbody(p, '<div class="cwl-ph-prompt">' + PROMPT + "</div>" + ANON);
    pfoot(p, '<input class="cwl-ph-input" value="young families finding us" aria-invalid="true" aria-describedby="ol" aria-label="Your answer"><div class="cwl-ph-count" id="ol"><span>4 words. Keep it to 3.</span><span>25 / 28</span></div><button class="cwl-btn" type="button" disabled>' + L("send") + " Send</button>");

    p = phone(r, "Offline (FAIL-01)", "phone-answering", "Venue wifi dropped. Input still works; each unsent answer says Saved on this phone and sends in the order written.");
    phead(p, '<span class="cwl-marker">' + L("wifi-off") + " Offline</span>");
    pbody(p, '<div class="cwl-ph-prompt">' + PROMPT + "</div>" + ANON + '<div class="cwl-ph-sent">' + ans("momentum") + ans("hope", "saved") + ans("students", "saved") + "</div>");
    pfoot(p, '<input class="cwl-ph-input" aria-label="Your answer" placeholder="Another word"><button class="cwl-btn" type="button">' + L("send") + " Send</button>");

    p = phone(r, "Reconnecting", "phone-answering", "Back online: saved answers send one at a time, in order, with gentle retries. Each turns to Sent in place.");
    phead(p, '<span class="cwl-marker">' + L("refresh-cw") + " Reconnecting</span>");
    pbody(p, '<div class="cwl-ph-prompt">' + PROMPT + "</div>" + ANON + '<div class="cwl-ph-sent">' + ans("momentum") + ans("hope") + ans("students", "sending") + "</div>");

    p = phone(r, "Phones down", "phone-waiting", "Dimmed to cwl-text-muted (still AA). Typed but unsent words stay as a draft.");
    p.classList.add("is-dimmed");
    phead(p, '<span class="cwl-marker">' + L("smartphone") + " Phones down</span>");
    pbody(p, '<div class="cwl-ph-prompt">' + PROMPT + '</div><div class="cwl-phones-down">' + L("smartphone") + ' Phones down</div><div class="cwl-ph-sent">' + ans("momentum") + ans("youth") + '</div><div class="cwl-ph-muted">Draft kept: "joy"</div>');

    p = phone(r, "Session closed", "phone-waiting", "The person's own answers, read-only.");
    phead(p, "<span></span>");
    pbody(p, '<div class="cwl-ph-church">Celebration · closed</div><div class="cwl-ph-prompt">' + PROMPT + '</div><div class="cwl-ph-sent">' + ans("momentum") + ans("youth") + '</div><div class="cwl-ph-text">This session is closed. Your answers are kept.</div>');

    p = phone(r, "TV view on phones (FAIL-02)", "phone-answering", "When the TV is down but the network works, every phone shows what the TV would show, with input still underneath.");
    phead(p, '<span class="cwl-marker">' + L("monitor-smartphone") + " TV view</span>");
    var bd = pbody(p, '<div class="sc-ph-tv" style="border-radius:8px;overflow:hidden"></div><div class="cwl-ph-prompt" style="font-size:var(--cwl-fs-phone-input)">' + PROMPT + "</div>");
    pfoot(p, '<input class="cwl-ph-input" aria-label="Your answer" placeholder="One word"><button class="cwl-btn" type="button">' + L("send") + " Send</button>");
    var mt = CL.stage(bd.querySelector(".sc-ph-tv"), "dark"); CL.screenTexture(mt, "input");
    top(mt, tally(23) + LIVE);
    var mc = content(mt, '<div class="cwl-tv-headline" style="margin-bottom:24px">One word for what God is doing <strong>at Riverside</strong></div><div class="cwl-cloud"></div>');
    CL.wordCloud(mc.querySelector(".cwl-cloud"), P2.SESSIONS.cloud.seed.map(function (w) { return { text: w[0], count: w[1] }; }), { maxPx: 150, newHold: false });

    p = phone(r, "New phone (FAIL-08)", "phone-answering", "A phone died. The person signs in on another device and sees their own answers for the live session.");
    phead(p);
    pbody(p, '<div class="p2-ph-banner">' + L("check") + '<span>Signed in on this phone as Ruth. Your answers are here.</span></div><div class="cwl-ph-prompt">' + PROMPT + '</div><div class="cwl-ph-sent">' + ans("momentum") + ans("youth") + "</div>");

  })();

  /* ============================================================
     The private treatment
     ============================================================ */
  (function () {
    var b = board("private", "Only you see this", ["FAC-01", "FAC-03"], "Every private panel on the control surface sits on the private ground under a 32px Navy band that reads 'Only you see this' with the eye-off icon, so it can never be mistaken for the TV if the laptop is ever shared. Room surfaces can't use these tokens: they're declared only on the control surface and set to initial on the TV and phones.");
    var r = row(b, "is-3");
    [["Room", '<div class="p2-stat"><div><b>8 of 8</b><span class="cwl-a-muted">Signed in</span></div><div><b>7</b><span class="cwl-a-muted">Answered this session</span></div></div>'],
     ["Presenter notes", '<div class="p2-notes">Name "momentum" if it leads. Keep this to 20 minutes.</div>'],
     ["At the door", '<div class="cwl-a-list"><div class="cwl-a-li"><span class="cwl-a-avatar">JL</span><div class="grow"><div class="cwl-a-label">Jordan Lee</div><div class="cwl-a-muted cwl-a-trunc">not on the list</div></div>' + B("Approve", "is-primary is-sm", "check") + "</div></div>"]].forEach(function (x) {
      var a = app(r, "Private panel · " + x[0], 420, 220, "control");
      a.innerHTML = '<div class="cwl-a-pad">' + PRIVATE(x[0], x[1]) + "</div>";
    });
    var ul = h("ul", "sc-rules"); ul.setAttribute("data-surface", "setup"); ul.setAttribute("data-theme", "light");
    ul.innerHTML = ["Private: presenter notes, counts, the door list, latency, and later the alignment signal and scribe cards.", "Not private: the TV mirror and the live controls. They show what the room sees.", "A team facilitator's remote never shows private panels.", "Phone remote: the same band on any private block (the short signal list in milestone 6)."].map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    b.appendChild(ul);
  })();

  /* ============================================================
     Failure states map
     ============================================================ */
  (function () {
    var b = board("failures", "Failure states", ["FAIL-01 to FAIL-06", "FAIL-08", "FAIL-10"], "Where each milestone 2 failure is designed. Warning and Error colors appear only on the control surface and remote; the TV and phones say it quietly.");
    var t = h("div", "sc-table"); t.setAttribute("data-surface", "setup"); t.setAttribute("data-theme", "light");
    var F = [["FAIL-01", "Venue wifi drops: phones", "Phones keep taking input; 'Saved on this phone'; send in order on reconnect", "Participant phone states · Motion review: Reconnecting"],
      ["FAIL-02", "The TV loses its connection", "TV keeps its last state with a 24px Reconnecting mark; control shows a Warning banner and offers TV view on phones", "Control surface tab · Phone states: TV view · Motion review"],
      ["FAIL-03", "The scribe goes offline", "Milestone 5", "Not in this pass"],
      ["FAIL-04", "The TV's browser is closed", "Reopening live.clearway.co/tv resumes the current session without re-pairing; it cross-fades in, never flashes white", "TV pairing"],
      ["FAIL-05", "The facilitator's laptop dies", "The remote carries every control", "Phone remote"],
      ["FAIL-06", "The remote and the TV disagree", "The TV wins; Syncing after 2 seconds; the control surface shows a quiet Warning", "Control surface tab · Phone remote"],
      ["FAIL-08", "A phone dies", "Sign in on another device; own answers return", "Participant phone states"],
      ["FAIL-10", "The tech fails completely", "The easel carries the room; print the run of show and prompts beforehand", "Run of show"]];
    t.innerHTML = '<table class="cwl-a-table"><thead><tr><th>Screen</th><th>When</th><th>What happens</th><th>Designed in</th></tr></thead><tbody>' + F.map(function (x) { return "<tr><td><strong>" + x[0] + "</strong></td><td>" + esc(x[1]) + "</td><td>" + esc(x[2]) + "</td><td>" + esc(x[3]) + "</td></tr>"; }).join("") + "</tbody></table>";
    b.appendChild(t);
  })();

  /* ============================================================
     Open decisions for design pass 2
     ============================================================ */
  (function () {
    var b = board("decisions", "Decided for design pass 2", ["Default TV screen", "The church on the TV"], "Chris decided both on October 30: the default TV screen is dark (Navy), and the church's logo sits beside Clearway's on every TV screen after pairing. Codex still builds the TV theme as a setting on the engagement, defaulting to dark. The alternatives stay here for reference.");
    var r = row(b, "is-2");
    [["dark", "Default TV screen · Chosen: dark (Navy), textured"], ["light", "Alternative: light (Off-White), no texture"]].forEach(function (th) {
      var t = tv(r, th[1], "input", th[0]);
      top(t, tally(17) + LIVE);
      var c = content(t, '<div class="cwl-tv-eyebrow">Celebration</div><div class="cwl-tv-headline" style="margin-bottom:32px">One word for what God is doing <strong>at Riverside</strong></div><div class="cwl-cloud"></div>');
      CL.wordCloud(c.querySelector(".cwl-cloud"), P2.SESSIONS.cloud.seed.map(function (w) { return { text: w[0], count: w[1] }; }), { maxPx: 168, newHold: false });
    });
    var r2 = row(b, "is-3");
    [["Chosen: the church's logo beside Clearway's", P2.lockup(), true], ["Alternative: church name only", null, true], ["Alternative: Clearway only", null, false]].forEach(function (o) {
      var t = tv(r2, o[0], "holding", "dark");
      top(t, "", o[1] || '<span class="cwl-tv-logo">' + CL.markSVG("solid") + "</span>");
      content(t, '<div class="cwl-join"><div class="cwl-qr"></div><div>' + (o[2] ? '<div class="cwl-tv-eyebrow">' + esc(R.church) + "</div>" : "") + '<div class="cwl-join-link p2-join-link" style="margin-top:16px">' + esc(R.link) + '</div><div class="cwl-names"><span>Mark</span><span>Priya</span><span>Daniel</span></div></div></div>');
      CL.qr(t.querySelector(".cwl-qr"), "https://" + R.link);
    });
    var p = h("p", "sc-note"); p.textContent = "The church's logo sits on an Off-White tile at the Clearway mark's 56px height, after a hairline, so any logo color reads on Navy. The Riverside logo here is a placeholder; the real one comes from the church record in Team Hub. With no logo on file, the church's name sits in the tile. Before pairing, the TV shows the Clearway mark only.";
    b.appendChild(p);
  })();

  CL.icons();
})();
