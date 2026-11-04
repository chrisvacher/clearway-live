/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 7 · screens7.js
   Boards for milestone 7: Publish to CORE (COR-01 to COR-03) and after the
   retreat (AFT-01 to AFT-05). Each board keeps its screens in place and moves
   them between states. Scaffolding matches the pass 6 review page.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P4 = window.ClearwayLivePass4, P7 = window.ClearwayLivePass7, D = window.ClearwayLivePass7Data, W = window.ClearwayLivePass4Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide, B = P4.B, SB = P4.SB;
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
    if (nav) { var a = h("a"); a.href = "#" + id; a.textContent = /^[A-Z]{3}-\d/.test(ids[0]) ? ids[0] + " " + title : title; nav.appendChild(a); }
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
  function app(parent, label, w, hgt, surface, caption) { return CL.appFrame(frame(parent, label, "is-app", caption), w, hgt, surface || "setup"); }
  function seg(names, on, cls) { return '<div class="p3-seg ' + (cls || "") + '" role="group">' + names.map(function (n, i) { return '<span role="button" tabindex="0" aria-pressed="' + (i === on) + '"' + (i === on ? ' class="is-on"' : "") + ">" + esc(n) + "</span>"; }).join("") + "</div>"; }

  /* A board of states: tabs on top, a caption, then whatever spec.draw builds.
     spec.make(ctx) builds the frames once, spec.draw(ctx, state, instant) moves them to the state. */
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
    ctx.select = select;
    spec.states.forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.setAttribute("role", "tab"); t.textContent = s; t.onclick = function () { select(s); }; tabs.appendChild(t); });
    right.querySelectorAll(".p3-theme span").forEach(function (sp, i) {
      sp.onclick = function () { right.querySelectorAll(".p3-theme span").forEach(function (x, j) { x.classList.toggle("is-on", i === j); x.setAttribute("aria-pressed", i === j); }); ctx.theme = i ? "light" : "dark"; stage.innerHTML = ""; spec.make(ctx); select(ctx.state, true); };
    });
    spec.make(ctx);
    requestAnimationFrame(function () { requestAnimationFrame(function () { select(spec.start || spec.states[0], true); }); });
    return ctx;
  }
  function tvShell(box, ctx, o) { return P4.shell(box, { theme: ctx.theme, eyebrow: o.eyebrow || "", headline: o.headline || "", unit: "answers" }); }

  /* The laptop frame: a setup screen that redraws its body in place */
  function setupFrame(ctx, label, nav, title, tabs, tab, hgt) {
    var r = row(ctx.stage, "is-1");
    var a = app(r, label, 1280, hgt || 760, "setup");
    var body = P7.SetupShell(a, { nav: nav, title: title, tabs: tabs, tab: tab });
    ctx.a = a; ctx.body = body;
    return body;
  }
  function inBox(html) { return html; }

  /* ================================================================
     DECISIONS
     ================================================================ */
  (function () {
    var b = board("decisions", "Milestone 7 decisions", ["Defaults to confirm"], "The PRD, the CORE schema check and the Team Hub rulings don't settle these. Every screen below is designed to the Default. Each card says what the other option would change, so you can choose without a redesign. The publish being one all-or-nothing transaction, overlaps shown first, owners matched by email, the lead facilitator publishing, and the Day 1 sign-off feeding the 10-year Future all stand as they are.");
    var DEC = [
      ["Commander's intent and CORE", "CORE has nowhere to hold it, so it isn't published. It stays in the report, the Map and the read-only copy, and the publish screen says so before you press the button (PublishSummary). The first steps go to CORE as tasks.", "Publish it as a note on each Vision Outcome, or as a pinned task per outcome called Commander's intent. PublishSummary gains one row, the readiness check gains one item, and CORE needs the field or a convention agreed first. Nothing else changes."],
      ["Who can press Publish to CORE", "Only the lead facilitator (Chris), from the control surface or from his own remote. A team facilitator holding the remote sees the status and a note, never the button (PublishButton, RemotePublish).", "Any signed-in Clearway facilitator on the engagement can publish. PublishButton loses the lock row and the \"not the lead facilitator\" remote state. Nothing else changes."],
      ["Which words the report and plan use", "\"Visibility plan\", which is Clearway's name for rolling the Vision out (the Brain ruling of Nov 1). The PRD still says \"communication plan\", so the app, the report section and the check-in links say visibility plan, and the PRD needs the same edit.", "Keep \"communication plan\" everywhere. Only labels change: the section heading, the nav item and the export file name."],
      ["Where a Vision Outcome's status comes from", "CORE derives it, so the app publishes none and shows none (the readiness check, ReadinessRegister).", "Add a starting status picker to each outcome in the readiness check. The check gains one editable column."],
      ["Where first steps go", "As CORE tasks under their goal, with the owner and date, so the 30, 60 and 90-day check-ins can match them (PublishSummary, CheckInResults).", "Keep first steps out of CORE and in the app only. The tasks row disappears from the summary, and check-ins read goal status only."],
      ["The Vision Matrix", "Not published. The facilitator places the goals in CORE after the retreat (PublishSummary, Vision Matrix line).", "Publish a starting placement. A column appears in the readiness check; the team places goals on Day 2 on the Map."],
      ["Owners without a CORE account", "Each one gets a CORE invitation, sent through CORE after everything is saved. If the plan has too few seats, the check names the shortfall and the facilitator chooses who is invited now (OwnerMatch, Seats).", "Block publish until every owner has an account. PublishButton gets a fourth reason and OwnerMatch loses the Invite action."],
      ["An email that belongs to another church in CORE", "Flag it in the readiness check. The owner is left unassigned in CORE until the facilitator fixes the address or chooses \"No owner yet\" (ownerCell, Sam Whitford).", "Block publish until the address is fixed. The row changes from a warning to a blocker."],
      ["The read-only copy and the report", "The link shows the plan as published to CORE. The report appears on it only once it is signed off, and a new sign-off replaces what the link shows (SignOffBar, ReadOnlyCopy).", "The link always shows the latest draft, marked Draft. SignOffBar loses its stale state."],
      ["Who gets check-in emails", "Each owner of a first step, at 30, 60 and 90 days, in their own email. Phones only, no sign-in beyond the link. The facilitator sees results and follow-ups (CheckInEmail, CheckInResults).", "Send one team email to everyone with all first steps. CheckInEmail gets a longer list and CheckInResults loses its per-person rows."]
    ];
    var g = h("div", "p4-dec");
    g.innerHTML = DEC.map(function (d) { return "<article><h3>" + esc(d[0]) + '</h3><div class="lbl">Default, designed</div><p class="def">' + esc(d[1]) + '</p><div class="lbl">The other option</div><p>' + esc(d[2]) + "</p></article>"; }).join("");
    b.appendChild(g);
  })();

  /* ================================================================
     PART · PUBLISH TO CORE
     ================================================================ */
  part("part-core", "Publish to CORE", "The plan leaves the retreat in one step. Overlaps with what is already in CORE come first, then a readiness check of every goal and first step with the CORE letters (Connected, Owned, Result, End date), then the owner matches. Setup screens are data-surface=\"setup\": app tokens, Warning and Error allowed, never Sunrise. The TV and phones never show a name or a warning color.");

  /* COR-01 */
  stateBoard({
    id: "cor-01", title: "Check before you publish", ids: ["COR-01", "CoreConnection", "OverlapList", "ReadinessRegister", "OwnerMatch", "PublishSummary", "PublishButton"],
    note: "Setup, laptop first. The facilitator links the church to its CORE organization, sees what may already be in CORE (always first), fixes every gap in the readiness check, sees who is matched to a CORE user by email and who gets an invitation, then publishes. The button stays off while anything is open and says why.",
    states: ["Reading CORE", "Overlaps to decide", "Overlaps decided, gaps to fix", "Fixing a goal", "Seats are short", "Email in another church", "Ready to publish", "Not linked to CORE", "CORE unreachable", "Offline", "Not the lead facilitator", "Reduced motion"],
    start: "Overlaps decided, gaps to fix",
    make: function (ctx) { setupFrame(ctx, "Setup · laptop · data-surface=\"setup\"", "CORE", "Publish to CORE", ["Check", "History"], "Check", 2850); },
    draw: function (ctx, st) {
      var gaps = /gaps|Fixing|Seats|Email/.test(st), checking = st === "Reading CORE", undecided = st === "Overlaps to decide";
      var o = { gaps: gaps, fixing: st === "Fixing a goal" ? "g2" : null, seats: st === "Seats are short", sam: st === "Email in another church" };
      var conn = { state: checking ? "checking" : st === "Not linked to CORE" ? "unlinked" : st === "CORE unreachable" ? "unreachable" : "linked", plan: st === "Seats are short" ? "small" : "client" };
      var picks = undecided ? { x1: null, x2: null } : { x1: "link", x2: "add" };
      var ov = checking ? { state: "checking" } : { picks: picks };
      var blocked = st === "Not linked to CORE" || st === "CORE unreachable";
      var fix = gaps ? (st === "Seats are short" ? 7 : st === "Email in another church" ? 7 : 6) : 0;
      var btn = { fix: fix, lead: st !== "Not the lead facilitator", offline: st === "Offline", unlinked: st === "Not linked to CORE", unreachable: st === "CORE unreachable", undecided: undecided ? 2 : 0 };
      var side = '<div class="cwl-c7-trio">' + P7.PublishSummary(o) + P7.OwnerMatch(o) + '<section class="cwl-a-card cwl-c7-card"><div class="cwl-a-eyebrow">Step 3</div><h3 class="cwl-a-section">Publish</h3>' + P7.PublishButton(btn) + "</section></div>";
      var main = blocked || checking ? "" : '<div class="cwl-c7-col">' + P7.ReadinessRegister(o) + "</div>";
      ctx.body.innerHTML = P7.CoreConnection(conn) + (blocked ? "" : P7.OverlapList(ov)) +
        (blocked ? '<div class="cwl-c7-quiet is-box">' + L(st === "CORE unreachable" ? "cloud-off" : "unlink") + "<span>" + (st === "CORE unreachable" ? "The check needs CORE's current records, so it waits. Nothing you've fixed here is lost." : "Link the church first. Then the check can compare your plan with what CORE already holds.") + "</span></div>" : '<div class="cwl-c7-col">' + main + side + "</div>");
      CL.icons();
      return {
        "Reading CORE": "The app reads the CORE organization, its plan and the records already there. Nothing else shows until that is done, so the screen never shows a guess.",
        "Overlaps to decide": "Two records in CORE may match goals in the plan. The facilitator decides each one: link the plan's goal to the existing record, or add it as new. Publishing waits until both are decided.",
        "Overlaps decided, gaps to fix": "Six things to fix, each with the CORE letter that is missing. The count in the button reason falls as each one is fixed.",
        "Fixing a goal": "Fixing in place: the row opens an edit under it, and the owner field matches by email while you type.",
        "Seats are short": "The plan has fewer free seats than invitations (pending invitations count). The check names the shortfall and who goes first.",
        "Email in another church": "One owner's email belongs to a user in another church in CORE. They are left unassigned until the address is fixed or you choose No owner yet.",
        "Ready to publish": "Everything passes the check. The button turns on.",
        "Not linked to CORE": "No CORE organization is linked to this church. Nothing can be checked or published.",
        "CORE unreachable": "CORE didn't answer. Nothing is lost, and the button explains why it is off.",
        "Offline": "The laptop is offline. The check stays, publishing waits.",
        "Not the lead facilitator": "A team facilitator or the co-facilitator can read the check and fix gaps, but only the lead facilitator publishes.",
        "Reduced motion": "The spinner is a still icon, counts change at once and rows settle without sliding."
      }[st] || "";
    }
  });
  /* Ready to publish needs 0 fixes and no gaps: handled through the state map above by setting gaps false */

  /* COR-02 */
  (function () {
    var b = board("cor-02", "Publish from the control surface and the remote", ["COR-02", "PublishConfirm", "PublishProgress", "RemotePublish", "PublishedTV"], "Day 2, 3:10 pm. The lead facilitator presses Publish to CORE on the control surface or on his own remote. The publish is one transaction: while it runs, nothing shows as created, and it either commits whole or fails with the reason and nothing partial. The TV stays on the Day 2 recap until it commits, then it shows the result. Invitations are sent after the save, so a failed invitation never undoes the goals.");
    var STATES = ["Ready", "Confirming", "Publishing", "Committed", "Invitations sending", "Invitations sent", "2 invitations didn't send", "Failed, nothing created", "Not the lead facilitator", "Offline", "Reduced motion"];
    var bar = h("div", "cwl-a-row"); bar.style.cssText = "justify-content:space-between;align-items:flex-start;gap:12px";
    var tabs = h("div", "cwl-tabs sc-tabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "COR-02 states");
    var right = h("div", "cwl-a-row"); right.setAttribute("data-surface", "setup"); right.setAttribute("data-theme", "light"); right.style.flexWrap = "nowrap"; right.innerHTML = seg(["Navy", "Off-White"], 0, "p3-theme");
    bar.appendChild(tabs); bar.appendChild(right); b.appendChild(bar);
    var cap = h("p", "sc-note"); cap.setAttribute("aria-live", "polite"); b.appendChild(cap);
    var r1 = row(b, "is-tv1"); r1.style.gridTemplateColumns = "minmax(0, 1fr) 520px";
    var tvBox = frame(r1, "TV · 1920 by 1080", "is-tv");
    var phWrap = h("div", "sc-row is-phones"); phWrap.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))"; r1.appendChild(phWrap);
    var r2 = row(b, "is-1"); r2.style.gridTemplateColumns = "minmax(0, 1fr) 260px";
    var theme = "dark", cur = "Ready";
    function build() { tvBox.innerHTML = ""; tvBox.className = "sc-box"; tvShell_ = P4.shell(tvBox, { theme: theme, eyebrow: "Day 2 · 3:10 pm", headline: "", unit: "answers", tally: false }); }
    var tvShell_;
    function select(st) {
      CL.clearTimers(); cur = st;
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.textContent === st ? "true" : "false"); });
      var reduced = st === "Reduced motion", offline = st === "Offline", notLead = st === "Not the lead facilitator";
      var map = { "Ready": "ready", "Confirming": "ready", "Publishing": "running", "Committed": "committed", "Invitations sending": "sending", "Invitations sent": "sent", "2 invitations didn't send": "partial", "Failed, nothing created": "failed", "Reduced motion": "running", "Not the lead facilitator": "ready", "Offline": "ready" };
      var ps = map[st];
      var committed = /^(Committed|Invitations|2 invitations)/.test(st);
      tvShell_.tv.setAttribute("data-motion", reduced ? "reduced" : "full");
      tvShell_.state({ offline: offline, down: false });
      tvShell_.foot("");
      if (committed) P7.PublishedTV(tvShell_, {});
      else { tvShell_.host.innerHTML = '<div class="cwl-c7-tv"><div class="cwl-c7-tv-h">Day 2 <strong>recap</strong></div><div class="cwl-c7-tv-foot">The commitments the room made today, in the room\'s own words.</div></div>'; }
      phWrap.innerHTML = "";
      var ph1 = frame(phWrap, "Phone · an owner with a CORE account", "is-phone", committed ? "Published. Their goals are in CORE." : "Nothing changes on phones until the publish commits."), ph2 = frame(phWrap, "Phone · an owner who gets an invitation", "is-phone", committed ? "Told to expect the CORE email." : "");
      [ph1, ph2].forEach(function (bx, i) {
        var p = P4.phone(bx, { head: offline ? "offline" : "live", motion: reduced ? "reduced" : null });
        if (committed) P7.PublishedPhone(p, { invite: i === 1 });
        else { p.body.innerHTML = '<div class="cwl-ph-headline">Day 2 recap</div><p class="cwl-c7-ph-p">Watch the screen. We are finishing up.</p>'; }
      });
      r2.innerHTML = "";
      var ctl = app(r2, "Control surface · lead facilitator's laptop", 1280, 560, "control");
      ctl.setAttribute("data-motion", reduced ? "reduced" : "full");
      ctl.innerHTML = '<div style="padding:20px;display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:20px;height:100%;background:var(--cwl-app-page)"><div class="c2a" style="display:flex;flex-direction:column;gap:16px"></div><div class="c2b" style="display:flex;flex-direction:column;gap:16px"></div></div>';
      var A = ctl.querySelector(".c2a"), Bx = ctl.querySelector(".c2b");
      var showProg = ps !== "ready" || st === "Confirming";
      A.innerHTML = '<div><div class="cwl-a-eyebrow">Day 2 · 3:10 pm · Publish to CORE</div><div class="cwl-a-title">Publish to CORE</div></div>' + (ps === "ready" ? P7.PublishSummary({}) : P7.PublishProgress({ state: ps, reason: "The request to CORE timed out after 30 seconds." }));
      Bx.innerHTML = '<div class="cwl-a-card cwl-c7-card"><div class="cwl-a-eyebrow">The check</div>' + '<div class="cwl-c7-sumrows"><div class="cwl-c7-sumrow"><span class="cwl-c7-disc is-ok">' + L("check") + '</span><span></span><span><b>Overlaps decided</b><span class="cwl-a-muted">1 linked, 1 added as new</span></span></div><div class="cwl-c7-sumrow"><span class="cwl-c7-disc is-ok">' + L("check") + '</span><span></span><span><b>Every goal has its CORE letters</b><span class="cwl-a-muted">Connected, Owned, Result, End date</span></span></div><div class="cwl-c7-sumrow"><span class="cwl-c7-disc is-ok">' + L("check") + '</span><span></span><span><b>Owners matched by email</b><span class="cwl-a-muted">4 invitations to send</span></span></div></div></div>' +
        (ps === "ready" ? P7.PublishButton({ lead: !notLead, offline: offline, second: false }) : "") + (st === "Confirming" ? '<div class="cwl-c7-scrimbox">' + P7.PublishConfirm({}) + "</div>" : "");
      var rb = frame(r2, notLead ? "Remote · a team facilitator holds it" : "Remote · lead facilitator's phone", "is-phone");
      P7.RemotePublish(rb, { state: ps === "ready" ? "ready" : ps === "running" ? "running" : ps === "failed" ? "failed" : ps === "partial" ? "partial" : "done", lead: !notLead, tv: committed ? "Published to CORE" : "Day 2 recap", held: false });
      cap.textContent = {
        "Ready": "The check passes. Publish to CORE is on, for the lead facilitator only.",
        "Confirming": "One clear step before anything is sent: what will be added, and that nothing in CORE will change.",
        "Publishing": "One transaction. Every row waits together, nothing shows as created and nothing looks half done. The TV stays on the recap.",
        "Committed": "Everything lands together. The rows flip to Created in one beat and the TV shows the result. Invitations come next.",
        "Invitations sending": "Invitations go out through CORE after the save. The count rises as they go.",
        "Invitations sent": "All four sent. The remote offers the next session.",
        "2 invitations didn't send": "The goals are safe. Only the two invitations that failed are offered again, and the remote tells the facilitator to resend from setup.",
        "Failed, nothing created": "CORE couldn't save the publish. The app checks CORE afterward and says nothing from this publish is in it. Try again or publish later from setup.",
        "Not the lead facilitator": "A team facilitator holding the remote sees the status and a note that Chris publishes. The button isn't there.",
        "Offline": "The laptop is offline, so publishing waits and says so. The check stays.",
        "Reduced motion": "The progress bar and spinner are still, and the rows change at once when the publish commits."
      }[st];
      CL.icons();
    }
    STATES.forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.setAttribute("role", "tab"); t.textContent = s; t.onclick = function () { select(s); }; tabs.appendChild(t); });
    right.querySelectorAll(".p3-theme span").forEach(function (sp, i) {
      sp.onclick = function () { right.querySelectorAll(".p3-theme span").forEach(function (x, j) { x.classList.toggle("is-on", i === j); x.setAttribute("aria-pressed", i === j); }); theme = i ? "light" : "dark"; build(); select(cur); };
    });
    build();
    requestAnimationFrame(function () { requestAnimationFrame(function () { select("Publishing"); }); });
  })();

  /* COR-03 */
  stateBoard({
    id: "cor-03", title: "After publishing, and publishing again", ids: ["COR-03", "PublishHistory", "SecondPublish"],
    note: "Setup shows what the app has created in CORE and when. Publishing a second time, after the team added or changed a goal, adds only what is new and never edits or removes a record that is already in CORE. A change to an existing record is shown, and made in CORE.",
    states: ["Published once", "A change is waiting", "Second publish ready", "Second publish committed", "Nothing new to publish", "CORE unreachable"], theme: false,
    make: function (ctx) { setupFrame(ctx, "Setup · laptop · data-surface=\"setup\"", "CORE", "Publish to CORE", ["Check", "History"], "History", 700); },
    draw: function (ctx, st) {
      var body = "";
      if (st === "Published once") body = P7.PublishHistory({ state: "one" });
      else if (st === "A change is waiting" || st === "Second publish ready") body = P7.PublishHistory({ state: "one" }) + P7.SecondPublish();
      else if (st === "Second publish committed") body = P7.PublishHistory({ state: "two" });
      else if (st === "Nothing new to publish") body = P7.PublishHistory({ state: "one" }) + '<div class="cwl-c7-quiet is-box">' + L("circle-check") + "<span><b>Nothing new to publish.</b> Everything in the plan is already in CORE.</span></div>";
      else body = P7.CoreConnection({ state: "unreachable" }) + P7.PublishHistory({ state: "one" });
      ctx.body.innerHTML = body;
      CL.icons();
      return {
        "Published once": "The first publish: what was created, when, by whom, and the CORE records it made. Nothing here can be edited.",
        "A change is waiting": "The team added one goal and one first step since the first publish. The second publish shows what is new, and a changed end date as a change to make in CORE.",
        "Second publish ready": "Only what is new is counted. The 22 records already in CORE are kept as they are.",
        "Second publish committed": "Two records added in the same all-or-nothing way. The history now shows both publishes.",
        "Nothing new to publish": "When nothing is new the button is off, and the screen says so.",
        "CORE unreachable": "The history stays readable. The second publish waits."
      }[st];
    }
  });

  /* ================================================================
     PART · AFTER THE RETREAT
     ================================================================ */
  part("part-after", "After the retreat", "Within a day or two Chris reviews and signs off the report, shares the read-only copy with the elders, and the check-ins run on their own at 30, 60 and 90 days. Facilitator screens are laptop first. The check-in and the read-only copy are phone screens: no sign-in beyond the link, no edit controls, no names a person didn't agree to.");

  /* AFT-01 */
  var SECTION_STATES = { "Draft": "heard", "Editing a paragraph": "heard", "A source lit up": "heard", "Thin data": "heard", "The 10-year Future": "future", "Needs your decision": "risks" };
  stateBoard({
    id: "aft-01", title: "The report draft", ids: ["AFT-01", "SectionList", "SectionBody", "SourcesPanel", "SignOffBar", "ExportPanel", "WordPreview"],
    note: "Clearway's report order, 17 sections, each drafted by AI from the engagement records and marked with the AI icon. The facilitator reads every section, edits any paragraph, sees the sources behind each sentence, adds their own read, signs off, and exports to Clearway-branded Word and PDF. The 10-year Future is word for word what the room signed off on Day 1.",
    states: ["Draft", "Editing a paragraph", "A source lit up", "Thin data", "The 10-year Future", "Needs your decision", "AI is drafting", "AI is off", "Signed off", "Edited since sign-off", "Exporting", "Export ready", "Export failed", "Draft export", "Reduced motion"],
    make: function (ctx) { setupFrame(ctx, "Setup · laptop · data-surface=\"setup\"", "Outputs", "Wayfinding report", null, null, 920); },
    draw: function (ctx, st) {
      var id = SECTION_STATES[st] || "heard";
      var signed = st === "Signed off" || st === "Exporting" || st === "Export ready" || st === "Export failed";
      var stale = st === "Edited since sign-off";
      var left = signed ? 0 : st === "Draft export" ? 3 : 3;
      var sOver = {};
      if (signed || stale) D.reportOrder.forEach(function (s) { if (D.report[s[0]].status !== "signed") sOver[s[0]] = "approved"; });
      var exportState = st === "Exporting" ? "preparing" : st === "Export failed" ? "failed" : "ready";
      var body = '<div class="cwl-rp"><div>' + P7.SectionList({ cur: id, status: sOver }) + '</div><div class="cwl-rp-doc"><div class="cwl-rp-page-card">' +
        P7.SectionBody(id, { sel: st === "A source lit up" || st === "Editing a paragraph" ? 0 : null, editing: st === "Editing a paragraph" ? 0 : null, editId: id, edited: stale ? 0 : null, drafting: st === "AI is drafting", empty: st === "AI is off", status: sOver }) + "</div>" +
        P7.SignOffBar({ state: signed ? "signed" : stale ? "stale" : "open", left: left }) + '</div><div class="cwl-c7-col">' + P7.SourcesPanel(id, { sel: st === "A source lit up" ? 1 : 0 }) +
        (signed || stale || /Export|Draft export/.test(st) ? P7.ExportPanel({ state: exportState, draft: st === "Draft export" }) : "") + "</div></div>";
      ctx.body.innerHTML = body;
      ctx.body.style.overflow = "hidden";
      var pv = ctx.stage.querySelector(".aft1-pv");
      if (!pv) { var r = row(ctx.stage, "is-1"); r.className = "sc-row is-1 aft1-pv"; var bx = frame(r, "Word export · the cover and one inside page", "is-app"); bx.setAttribute("data-surface", "setup"); bx.setAttribute("data-theme", "light"); bx.innerHTML = '<div class="cwl-pv-host"></div>'; }
      ctx.stage.querySelector(".cwl-pv-host").innerHTML = P7.WordPreview({ draft: st === "Draft export" || !signed });
      CL.icons();
      return {
        "Draft": "The first draft of What We Heard. Every sentence is linked to its sources, every section has a status (drafted, edited, needs you, thin data, signed off) and the AI icon says what AI did.",
        "Editing a paragraph": "Editing in place. The edited paragraph is marked, and its sources stay linked.",
        "A source lit up": "Selecting a sentence lights its sources on the right (the same source-light as the overnight review). Sources never leave the app: the Word file carries no markers.",
        "Thin data": "Thin data is said out loud in the paragraph, with the numbers, not hidden.",
        "The 10-year Future": "Shown as signed off in the room: the five lens summaries the room approved on Day 1, word for word, in the present tense.",
        "Needs your decision": "Risks and Roadblocks leaves a place for Chris's own read. It stays marked Needs you until he writes or removes it.",
        "AI is drafting": "A section drafting. The paragraphs arrive as the section finishes, never a half sentence.",
        "AI is off": "AI is off for this engagement. Nothing is drafted. Start from the room's words or write by hand.",
        "Signed off": "Signed off. The version the read-only copy shows is named, and editing afterward starts a new draft version.",
        "Edited since sign-off": "An edit since sign-off keeps the signed version live on the read-only copy until the new one is signed off.",
        "Exporting": "Word and PDF are being built. The report is untouched.",
        "Export ready": "Both files are ready. Clearway's fonts and colors, 28 pages.",
        "Export failed": "The file couldn't be built. The report is safe and nothing was changed.",
        "Draft export": "A draft can be exported for your own reading, with a Draft mark on every page.",
        "Reduced motion": "Sources light at once, the AI icon doesn't sweep and the caret stops blinking."
      }[st];
    }
  });

  /* AFT-02 */
  stateBoard({
    id: "aft-02", title: "The visibility plan", ids: ["AFT-02", "VisibilityPlan"],
    note: "A plan for making the Vision visible, built from what the room said: who needs to hear what, in what words, by when, and through which door. AI drafts it, the facilitator reviews every row, and the sign-off is the facilitator's. The section is called \"Make the Vision Visible\" in the report and the PRD still says communication plan (see the decisions board).",
    states: ["Drafting", "Draft to review", "Editing a cell", "A row to look at", "Everything reviewed", "Nothing said about it", "Reduced motion"],
    make: function (ctx) { setupFrame(ctx, "Setup · laptop · data-surface=\"setup\"", "Outputs", "Visibility plan", ["Report", "Visibility plan"], "Visibility plan", 1150); },
    draw: function (ctx, st) {
      var o = { drafting: st === "Drafting", empty: st === "Nothing said about it", allReviewed: st === "Everything reviewed", editing: st === "Editing a cell" ? { id: "v2", k: "say" } : null, flag: st === "A row to look at" };
      if (st === "Drafting") o.only = ["v1", "v2", "v3"];
      ctx.body.innerHTML = P7.VisibilityPlan(o);
      CL.icons();
      return {
        "Drafting": "AI is drafting from the Map, commander's intent, risks and what the room said about how people hear things.",
        "Draft to review": "Each row has an audience, what to say, when, who carries it and what could go wrong. The AI icon marks what AI wrote.",
        "Editing a cell": "Edit any cell in place. Edited rows stay marked.",
        "A row to look at": "A row can be flagged: something the room said suggests it needs another look before it goes out.",
        "Everything reviewed": "Every row reviewed. The facilitator can include it in the report.",
        "Nothing said about it": "The room never discussed it, so the plan says that and suggests starting from the Vision Sunday date.",
        "Reduced motion": "The AI icon doesn't sweep and rows change at once."
      }[st];
    }
  });

  /* AFT-03 */
  (function () {
    var STATES = ["Share links", "Turn off a link", "A link turned off", "No links yet", "Report not signed off", "With the report", "CORE unreachable", "Offline", "Link turned off, opened", "Reduced motion"];
    var b = board("aft-03", "The read-only copy for the elders", ["AFT-03", "ShareLinks", "ReadOnlyCopy"], "A link the elders open on a phone or a laptop. It shows the Clearway Map, the Vision Outcomes with indicators, the goals with owners, dates and CORE status, and the commander's intent cards, with no edit controls and no Discover data. Chris can turn a link off at any time. It's a public page by link, so it never shows a name a person didn't agree to.");
    var bar = h("div", "cwl-a-row"); bar.style.cssText = "justify-content:space-between;align-items:flex-start;gap:12px";
    var tabs = h("div", "cwl-tabs sc-tabs"); tabs.setAttribute("role", "tablist"); bar.appendChild(tabs); b.appendChild(bar);
    var cap = h("p", "sc-note"); cap.setAttribute("aria-live", "polite"); b.appendChild(cap);
    var r1 = row(b, "is-1");
    var ctl = app(r1, "Setup · where Chris shares and turns links off", 1280, 520, "setup");
    var body = P7.SetupShell(ctl, { nav: "Outputs", title: "Read-only copy", tabs: ["Report", "Visibility plan", "Read-only copy"], tab: "Read-only copy" });
    var r2 = row(b, "is-1"); r2.style.gridTemplateColumns = "minmax(0, 1fr) 380px";
    var wideBox = frame(r2, "Laptop · what the elders open", "is-app"); wideBox.setAttribute("data-surface", "setup"); wideBox.setAttribute("data-theme", "light");
    var phBox = frame(r2, "Phone · what the elders open", "is-phone"); phBox.style.maxWidth = "380px"; phBox.setAttribute("data-surface", "setup"); phBox.setAttribute("data-theme", "light");
    [wideBox, phBox].forEach(function (e) { e.style.border = "1px solid var(--cw-gray-300)"; e.style.borderRadius = "12px"; });
    function select(st) {
      CL.clearTimers();
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.textContent === st ? "true" : "false"); });
      [ctl, wideBox, phBox].forEach(function (e) { e.setAttribute("data-motion", st === "Reduced motion" ? "reduced" : "full"); });
      var ls = { "Turn off a link": { state: "list", confirm: "l1" }, "A link turned off": { state: "list", links: D.links.map(function (l, i) { return i === 0 ? Object.assign({}, l, { state: "revoked" }) : l; }) }, "No links yet": { state: "empty" }, "Offline": { state: "list" }, "CORE unreachable": { state: "list" } }[st] || { state: "list" };
      if (st === "Report not signed off") ls = { state: "list", report: false };
      if (st === "With the report") ls = { state: "list", report: true };
      body.innerHTML = P7.ShareLinks(ls);
      var rs = st === "CORE unreachable" ? "core-down" : st === "Offline" ? "offline" : st === "Link turned off, opened" ? "revoked" : st === "With the report" ? "report" : st === "Report not signed off" ? "no-report" : "plan";
      var rep = st === "With the report";
      wideBox.innerHTML = ""; phBox.innerHTML = "";
      P7.ReadOnlyCopy(wideBox, { wide: true, state: rs, report: rep });
      P7.ReadOnlyCopy(phBox, { wide: false, state: rs, report: rep });
      wideBox.style.height = "640px"; wideBox.style.overflow = "hidden"; phBox.style.height = "720px"; phBox.style.overflow = "hidden";
      cap.textContent = {
        "Share links": "Chris can make a link for the elders, name it, and see when each was last opened. Two active links here.",
        "Turn off a link": "Turning a link off is one clear confirmation. The link stops working at once.",
        "A link turned off": "A turned-off link stays in the list as Turned off, so Chris can see what he has shut.",
        "No links yet": "Nothing shared yet. The report isn't needed to make a link.",
        "Report not signed off": "The link shows the plan only. The report joins it after sign-off.",
        "With the report": "Once the report is signed off the elders also get it, as a Word or PDF download. Cover only, no edit controls.",
        "CORE unreachable": "If CORE can't be reached the page shows the last status it read, with the date, instead of failing.",
        "Offline": "If the phone is offline the page says so and keeps what it has loaded.",
        "Link turned off, opened": "Opening a turned-off link shows a plain page and who to ask. No plan content at all.",
        "Reduced motion": "Nothing on the copy moves, so there's no difference for reduced motion."
      }[st];
      CL.icons();
    }
    STATES.forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.setAttribute("role", "tab"); t.textContent = s; t.onclick = function () { select(s); }; tabs.appendChild(t); });
    requestAnimationFrame(function () { requestAnimationFrame(function () { select("Share links"); }); });
  })();

  /* AFT-04 */
  (function () {
    var STATES = ["Email at 30 days", "Email at 60 days", "Email at 90 days", "Open", "First steps", "A step marked stuck", "A very long step", "Goals", "CORE unreachable", "Sent", "Already answered", "Check-ins have stopped", "Saved on the phone", "No first step of their own", "Reduced motion"];
    var b = board("aft-04", "The 30, 60 and 90-day check-in", ["AFT-04", "CheckInEmail", "CheckInPhone"], "Each person who owns a first step gets an email at 30, 60 and 90 days. The link opens a short check-in on their phone: Done, Under way or Stuck for each of their own first steps, then their goal's status read from CORE, with a place to say what would help. No sign-in beyond the link. The phone shows nothing in Warning or Error colors, so the label and the icon carry the status.");
    var bar = h("div", "cwl-a-row"); bar.style.cssText = "justify-content:space-between;align-items:flex-start;gap:12px";
    var tabs = h("div", "cwl-tabs sc-tabs"); tabs.setAttribute("role", "tablist"); bar.appendChild(tabs); b.appendChild(bar);
    var cap = h("p", "sc-note"); cap.setAttribute("aria-live", "polite"); b.appendChild(cap);
    var r = row(b, "is-2"); r.style.gridTemplateColumns = "380px 260px"; r.style.justifyContent = "start";
    var mailBox = frame(r, "Email · what lands in their inbox", "is-app"); mailBox.setAttribute("data-surface", "setup"); mailBox.setAttribute("data-theme", "light");
    var phBox = frame(r, "Phone · the check-in", "is-phone");
    function select(st) {
      CL.clearTimers();
      tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.textContent === st ? "true" : "false"); });
      var day = /60/.test(st) ? 60 : /90/.test(st) ? 90 : 30;
      var step = { "Email at 30 days": "open", "Email at 60 days": "open", "Email at 90 days": "open", "Open": "open", "First steps": "steps", "A step marked stuck": "stuck", "A very long step": "long", "Goals": "goals", "CORE unreachable": "core-down", "Sent": "sent", "Already answered": "answered", "Check-ins have stopped": "off", "Saved on the phone": "queued", "No first step of their own": "nogoals", "Reduced motion": "steps" }[st];
      mailBox.innerHTML = P7.CheckInEmail({ day: day });
      phBox.innerHTML = "";
      var p = P4.phone(phBox, { head: step === "queued" ? "offline" : "none", motion: st === "Reduced motion" ? "reduced" : null });
      P7.CheckInPhone(p, { day: day, step: step, sel: step === "steps" && st === "First steps" ? "done" : null });
      cap.textContent = {
        "Email at 30 days": "Sent at 9:00 am, " + D.dates.d30 + ". Short, in the person's name, with one button. The link is theirs alone.",
        "Email at 60 days": "Same shape. It names the first steps still open.",
        "Email at 90 days": "The last one. It thanks them and says the check-ins end here.",
        "Open": "The link opens a welcome with how long it takes.",
        "First steps": "One first step at a time, three big answers. Next turns on once one is chosen.",
        "A step marked stuck": "Stuck asks one gentle question, what would help. The answer goes to Chris as a follow-up.",
        "A very long step": "A long step wraps and never gets cut off.",
        "Goals": "Their own goal's status, read from CORE and not asked of them, with a place to add anything.",
        "CORE unreachable": "If CORE can't be read, the check-in still works. The goal status says it couldn't be read.",
        "Sent": "A plain thank you, and when the next one comes.",
        "Already answered": "Opening the link again shows what they sent, not an empty form.",
        "Check-ins have stopped": "After the engagement ends the link says so kindly.",
        "Saved on the phone": "Offline, the answers wait on the phone and send when the signal is back.",
        "No first step of their own": "An owner with a goal and no first step answers about the goal only.",
        "Reduced motion": "The progress bar fills at once."
      }[st];
      CL.icons();
    }
    STATES.forEach(function (s) { var t = h("button", "cwl-tab"); t.type = "button"; t.setAttribute("role", "tab"); t.textContent = s; t.onclick = function () { select(s); }; tabs.appendChild(t); });
    requestAnimationFrame(function () { requestAnimationFrame(function () { select("First steps"); }); });
  })();

  /* AFT-05 */
  stateBoard({
    id: "aft-05", title: "Check-in results and follow-ups", ids: ["AFT-05", "CheckInResults"],
    note: "Chris sees who answered what, how each goal is doing (read from CORE), and a short list of follow-ups: every step marked stuck and every goal at risk or off track. Names are visible here, on the facilitator's own screen. They never reach a TV or a phone.",
    states: ["Not sent yet", "30 days, waiting on 4", "30 days, all in", "A follow-up done", "An email bounced", "60 days", "90 days", "CORE unreachable", "Reduced motion"],
    start: "30 days, all in",
    make: function (ctx) { setupFrame(ctx, "Setup · laptop · data-surface=\"setup\"", "Check-ins", "Check-ins", null, null, 1500); },
    draw: function (ctx, st) {
      var o = { day: /60/.test(st) ? 60 : /90/.test(st) ? 90 : 30, state: st === "Not sent yet" ? "scheduled" : /waiting/.test(st) ? "waiting" : st === "An email bounced" ? "bounce" : st === "CORE unreachable" ? "core-down" : "in", followed: st === "A follow-up done" };
      ctx.body.innerHTML = P7.CheckInResults(o);
      ctx.body.style.overflow = "hidden";
      CL.icons();
      return {
        "Not sent yet": "Before the first email: the date it goes out, and who it goes to.",
        "30 days, waiting on 4": "Answers arrive as people send them and the count rises. Nobody is chased automatically.",
        "30 days, all in": "Everyone answered. Stuck steps and goals at risk collect into follow-ups.",
        "A follow-up done": "Marking a follow-up done keeps it in the list, struck through, so nothing disappears.",
        "An email bounced": "A bounced address is said plainly with the fix beside it.",
        "60 days": "Progress shows against the first check-in.",
        "90 days": "The last one. It closes with what moved and what didn't.",
        "CORE unreachable": "Goal status shows the last read from CORE with its date.",
        "Reduced motion": "Counts change at once."
      }[st];
    }
  });
})();
