/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 7 · core7.js
   Components for milestone 7: Publish to CORE (COR-01 to COR-03), the report,
   the visibility plan, check-ins and the read-only copy (AFT-01 to AFT-05).
   Reference code: port the logic into the app's components. Classes cwl-c7-*
   (CORE), cwl-rp-* (report), cwl-vp-* (visibility plan), cwl-ci-* (check-ins),
   cwl-ro-* (read-only copy). Tokens only.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P4 = window.ClearwayLivePass4, W = window.ClearwayLivePass4Data, D = window.ClearwayLivePass7Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide;
  var B = P4.B, CHIP = P4.CHIP, BAN = P4.BAN, SB = P4.SB;
  function ms(n) { return CL.ms(n); }
  function by(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function first(n) { return String(n || "").split(" ")[0]; }

  /* ---------- Small marks ---------- */
  /* AI is marked with the one AI icon in gradient ink and what AI did, in plain words. The sweep runs once when AI acts. */
  function AIMark(words, o) { return '<span class="cwl-c7-ai">' + CL.aiBadge() + "<span>" + esc(words) + "</span></span>"; }
  function CoreStatus(st, o) {
    o = o || {};
    var s = D.coreStatus[st] || D.coreStatus["not-started"];
    return '<span class="cwl-a-core core-' + st + '"><span class="disc">' + L(s.icon) + "</span>" + esc(s.label) + (o.when ? '<span class="cwl-c7-when">' + esc(o.when) + "</span>" : "") + "</span>";
  }
  /* Neutral CORE status for phones: no Warning or Error colors on a phone, so the label and icon carry it. */
  function CoreStatusPhone(st) { var s = D.coreStatus[st]; return '<span class="cwl-ci-cs">' + L(s.icon) + "<span>" + esc(s.label) + "</span></span>"; }
  function Letters(missing) {
    return '<span class="cwl-wf-letters-app">' + P4.LETTERS.map(function (l) { return '<span class="' + (missing.indexOf(l[0]) >= 0 ? "is-missing" : "") + '" title="' + l[1] + (missing.indexOf(l[0]) >= 0 ? ", missing" : "") + '">' + l[0] + "</span>"; }).join("") + "</span>";
  }
  function Src(id) { var s = D.src[id]; return '<span class="cwl-d6-src">' + L(s.icon) + "<span>" + esc(s.label) + "</span></span>"; }
  function lens(key) { return P4.lensChip(key); }
  function roundN(el, to, o) {
    o = o || {};
    var from = parseFloat(el.getAttribute("data-n")); if (isNaN(from)) from = to;
    el.setAttribute("data-n", to);
    if (o.instant || CL.reduced(el) || from === to) { el.textContent = to; return; }
    var d = ms("cwl-dur-count"), t0 = performance.now();
    (function step(t) { var k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); })(t0);
  }

  /* ---------- The setup shell (data-surface="setup"), laptop first ---------- */
  var NAV = [["Overview", "layout-dashboard"], ["Attendees", "users"], ["Discover", "compass"], ["Run of show", "list-ordered"], ["Overnight review", "moon"], ["Outputs", "file-text"], ["CORE", "send"], ["Check-ins", "calendar-check"]];
  function SetupShell(a, o) {
    o = o || {};
    a.innerHTML = '<div class="cwl-a-shell cwl-c7-shell"><aside class="cwl-a-side"><div class="cwl-a-brand"><span class="mk">' + CL.markSVG() + "</span>Clearway Live</div>" +
      NAV.map(function (n) { return '<span class="cwl-a-nav"' + (n[0] === o.nav ? ' aria-current="page"' : "") + ">" + L(n[1]) + "<span>" + esc(n[0]) + "</span></span>"; }).join("") + "</aside>" +
      '<div class="cwl-a-main"><header class="cwl-a-header"><div style="min-width:0"><div class="cwl-a-eyebrow">' + esc(D.church) + " · Wayfinding " + D.base + " · " + esc(o.eyebrow || o.nav) + '</div><div class="cwl-a-title">' + esc(o.title) + "</div></div>" + (o.right || "") + "</header>" +
      '<div class="cwl-a-content">' + (o.tabs ? '<div class="cwl-a-tabs cwl-c7-tabs" role="tablist">' + o.tabs.map(function (t) { return '<span class="cwl-a-tab" role="tab" aria-selected="' + (t === o.tab) + '">' + esc(t) + "</span>"; }).join("") + "</div>" : "") +
      '<div class="c7-body" style="display:flex;flex-direction:column;gap:var(--cwl-app-gap);min-height:0;flex:1"></div></div></div></div>';
    CL.icons();
    return a.querySelector(".c7-body");
  }

  /* ================================================================
     COR-01 · the connection, the overlap (first), the readiness check
     ================================================================ */
  /* CoreConnection: the church's CORE organization and plan */
  function CoreConnection(o) {
    o = o || {};
    var st = o.state || "linked", plan = D.plans[o.plan || "client"];
    var body;
    if (st === "checking") body = '<div class="cwl-c7-conn-main"><span class="cwl-c7-spin">' + L("loader-circle") + '</span><div><b>Reading CORE</b><span class="cwl-a-muted">Looking for Riverside Church, its plan and what is already in it.</span></div></div>';
    else if (st === "unlinked") body = '<div class="cwl-c7-conn-main">' + '<span class="cwl-c7-ic is-warn">' + L("unlink") + "</span><div><b>Riverside Church isn't linked to a CORE organization</b><span class=\"cwl-a-muted\">Nothing can be published until it is. Creating the organization in CORE is done by Clearway, outside this app.</span></div></div>" + '<div class="cwl-a-row">' + SB("Find it in CORE", "search") + "</div>";
    else if (st === "unreachable") body = '<div class="cwl-c7-conn-main">' + '<span class="cwl-c7-ic is-warn">' + L("cloud-off") + "</span><div><b>CORE can't be reached</b><span class=\"cwl-a-muted\">The last check was at 2:58 pm. Nothing is lost. The readiness check below still works, and publishing waits.</span></div></div>" + '<div class="cwl-a-row">' + SB("Read CORE again", "refresh-cw") + "</div>";
    else body = '<div class="cwl-c7-conn-main"><span class="cwl-c7-ic">' + L("send") + "</span><div><b>" + esc(D.coreOrg.name) + ' in CORE</b><span class="cwl-a-muted">Linked by ' + esc(D.coreOrg.linkedBy) + " on " + esc(D.coreOrg.linkedOn) + " · read at 3:02 pm</span></div></div>" +
      '<div class="cwl-a-row">' + CHIP(plan.plan + " plan · " + plan.seatsText, plan.free < 4 ? "is-warning" : "is-outline", "armchair") + SB("Read CORE again", "refresh-cw") + "</div>";
    return '<section class="cwl-a-card cwl-c7-conn" aria-label="CORE connection">' + body + "</section>";
  }

  /* OverlapList: what may already be in CORE. Shown first, before the readiness check. */
  function OverlapList(o) {
    o = o || {};
    var picks = o.picks || {}, items = o.items === undefined ? D.overlap : o.items, st = o.state || "";
    var head = '<header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">Step 1 · What is already in CORE</div><h3 class="cwl-a-section">' + (items.length ? "Two things may overlap" : "Nothing in CORE overlaps") + "</h3></div>" +
      '<span class="cwl-c7-note">' + L("shield-check") + "Publishing adds records and never changes the ones in CORE</span></header>";
    if (!items.length) return '<section class="cwl-a-card cwl-c7-card" data-step="overlap">' + head + '<div class="cwl-c7-quiet">' + L("circle-check") + "<span>CORE has no Vision Outcome or goal with the same title or a close meaning, so everything will be added.</span></div></section>";
    if (st === "checking") return '<section class="cwl-a-card cwl-c7-card" data-step="overlap">' + head + '<div class="cwl-c7-quiet"><span class="cwl-c7-spin">' + L("loader-circle") + "</span><span>Comparing with the records already in CORE.</span></div></section>";
    var rows = items.map(function (x) {
      var p = picks[x.id] !== undefined ? picks[x.id] : x.pick;
      return '<article class="cwl-c7-ov" data-id="' + x.id + '"><div class="cwl-c7-ov-pair"><div class="cwl-c7-ov-side"><span class="cwl-a-eyebrow">From this retreat · ' + esc(x.kind) + "</span><b>" + esc(x.mine) + '</b></div><div class="cwl-c7-ov-mid">' + L("equal") + "<span>" + esc(x.match) + '</span></div><div class="cwl-c7-ov-side is-core"><span class="cwl-a-eyebrow">Already in CORE</span><b>' + esc(x.theirs) + "</b><span class=\"cwl-a-muted\">" + esc(x.detail) + "</span></div></div>" +
        '<div class="cwl-c7-ov-pick"><div class="cwl-c7-seg" role="radiogroup" aria-label="What to do with ' + esc(x.mine) + '">' + x.options.map(function (k) { return '<button type="button" role="radio" aria-checked="' + (p === k) + '" class="' + (p === k ? "is-on" : "") + '">' + L(p === k ? "check" : k === "link" ? "link" : k === "add" ? "plus" : "skip-forward") + esc(D.overlapWords[k]) + "</button>"; }).join("") + "</div>" +
        '<span class="cwl-c7-help">' + (p ? esc(D.overlapHelp[p]) : CHIP("Choose one before publishing", "is-warning", "triangle-alert")) + "</span></div></article>";
    }).join("");
    return '<section class="cwl-a-card cwl-c7-card" data-step="overlap">' + head + '<div class="cwl-c7-ovs">' + rows + "</div></section>";
  }

  /* ReadinessRegister: every Vision Outcome, goal and first step, like a commitments register */
  function gapsFor(kind, id, o) { if (!o.gaps) return []; return (D.gaps[kind] || {})[id] || []; }
  function Disc(ok) { return '<span class="cwl-c7-disc ' + (ok ? "is-ok" : "is-gap") + '" role="img" aria-label="' + (ok ? "Ready" : "Needs fixing") + '">' + L(ok ? "check" : "triangle-alert") + "</span>"; }
  function ownerCell(name, o) {
    if (!name) return '<span class="cwl-c7-miss">' + L("user-x") + "No owner</span>";
    var p = D.people[name];
    if (!p) return '<span class="cwl-c7-miss">' + L("users") + esc(name) + "</span>";
    var tag = o && o.sam ? CHIP("Another CORE church", "is-error", "building-2") : p.core === "match" ? CHIP("In CORE", "is-success", "user-check") : o && o.noseat ? CHIP("No seat free", "is-warning", "armchair") : CHIP("Invitation", "is-info", "mail-plus");
    return '<span class="cwl-c7-own"><b>' + esc(name) + "</b>" + tag + "</span>";
  }
  function ReadinessRegister(o) {
    o = o || {};
    var fixing = o.fixing;
    function row(kind, id, cells, gaps, extra) {
      var open = fixing === id;
      return '<div class="cwl-c7-row' + (gaps.length ? " is-gap" : "") + (open ? " is-open" : "") + '" data-kind="' + kind + '" data-id="' + id + '">' + Disc(!gaps.length) + cells +
        '<span class="cwl-c7-fix">' + (gaps.length ? '<span class="cwl-c7-need">' + gaps.map(esc).join(", ") + "</span>" + SB("Fix", "pencil") : '<span class="cwl-c7-okword">Ready</span>') + "</span>" +
        (open ? '<div class="cwl-c7-edit"><label class="cwl-a-field"><span class="cwl-a-flabel">' + esc(extra && extra.label || "Value") + '</span><input class="cwl-a-input is-focus" value="' + esc(extra && extra.value || "") + '" placeholder="' + esc(extra && extra.ph || "") + '" tabindex="-1"></label><div class="cwl-a-row">' + SB("Save", "check", "is-primary") + SB("Cancel", "x", "is-ghost") + "</div></div>" : "") + "</div>";
    }
    var outs = D.outcomes.map(function (oc) {
      var g = gapsFor("outcomes", oc.id, o), ind = g.length ? [] : oc.ind;
      return row("outcome", oc.id, '<span class="cwl-c7-main"><b>' + esc(oc.name) + '</b><span class="cwl-a-muted">' + (ind.length ? ind.length + " indicator" + (ind.length > 1 ? "s" : "") + " · " + esc(oc.desc) : "No indicators yet") + "</span></span>" + '<span class="cwl-c7-cell">' + CHIP("Status comes from CORE", "is-outline", "circle-dot") + "</span>", g, { label: "Indicator", ph: "In 2029, what's true?" });
    }).join("");
    var goals = D.goals.map(function (gl) {
      var g = gapsFor("goals", gl.id, o), gv = (o.gaps && D.gapValues[gl.id]) || {};
      var owner = gv.owner !== undefined ? gv.owner : gl.owner, end = gv.end !== undefined ? gv.end : gl.end, result = gv.result !== undefined ? gv.result : gl.result;
      var miss = []; if (!owner || !D.people[owner]) miss.push("O"); if (!result) miss.push("R"); if (!end) miss.push("E");
      var ex = gl.id === "g2" ? { label: "Result", ph: "How will we know it is done?" } : gl.id === "g3" ? { label: "End date", ph: "Aug 31, 2027", value: "" } : { label: "Owner", ph: "One person, by name", value: "" };
      return row("goal", gl.id, '<span class="cwl-c7-main"><b>' + esc(gl.title) + '</b><span class="cwl-a-muted">' + (result ? esc(result) : "No result written") + "</span></span>" + '<span class="cwl-c7-cell">' + Letters(miss) + "</span>" + '<span class="cwl-c7-cell">' + ownerCell(owner, { sam: o.sam && gl.owner === "Sam Whitford", noseat: o.seats && D.people[gl.owner] && D.people[gl.owner].core === "invite" && ["Sam Whitford", "Leah Kim"].indexOf(gl.owner) >= 0 }) + "</span>" +
        '<span class="cwl-c7-cell">' + (end ? esc(end) + ' <span class="cwl-a-muted">' + D.seasonLabel[D.seasonOf[end]] + "</span>" : '<span class="cwl-c7-miss">' + L("calendar-x") + "No end date</span>") + "</span>", g, ex);
    }).join("");
    var steps = D.steps.map(function (s) {
      var g = gapsFor("steps", s.id, o), gv = (o.gaps && D.gapValues[s.id]) || {};
      var owner = gv.owner !== undefined ? gv.owner : s.owner, date = gv.date !== undefined ? gv.date : s.date, goal = by(D.goals, s.g);
      return row("step", s.id, '<span class="cwl-c7-main"><b>' + esc(s.text) + '</b><span class="cwl-a-muted">Task in CORE under ' + esc(goal.title) + "</span></span>" + '<span class="cwl-c7-cell">' + ownerCell(owner, { sam: o.sam && s.owner === "Sam Whitford", noseat: o.seats && ["Sam Whitford", "Leah Kim"].indexOf(s.owner) >= 0 }) + "</span>" + '<span class="cwl-c7-cell">' + (date ? esc(date) : '<span class="cwl-c7-miss">' + L("calendar-x") + "No date</span>") + "</span>", g, { label: s.id === "s4" ? "Owner" : "Due date", ph: s.id === "s4" ? "One person, by name" : "Dec 4" });
    }).join("");
    function grp(title, n, bad, cols, inner, icon) { return '<div class="cwl-c7-grp"><div class="cwl-c7-grp-h">' + L(icon) + "<b>" + esc(title) + '</b><span class="cwl-a-muted"><span class="n">' + n + "</span>" + (bad ? ' · <span class="cwl-c7-badn"><span class="n">' + bad + "</span> to fix</span>" : " · all ready") + "</span></div>" + inner + "</div>"; }
    var bo = o.gaps ? 1 : 0, bg = o.gaps ? 3 : 0, bs = o.gaps ? 2 : 0;
    return '<section class="cwl-a-card cwl-c7-card" data-step="ready"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">Step 2 · Readiness</div><h3 class="cwl-a-section">' + (bo + bg + bs ? '<span class="n" data-total>' + (bo + bg + bs) + "</span> things to fix before publishing" : "Everything is ready to publish") + '</h3></div><span class="cwl-c7-note">' + L("list-checks") + "Nothing publishes without a title, an agreed result, one named owner and an end date</span></header>" +
      '<div class="cwl-c7-reg">' + grp("Vision Outcomes", D.outcomes.length, bo, 3, outs, "target") + grp("1-year goals", D.goals.length, bg, 5, goals, "goal") + grp("First steps", D.steps.length, bs, 4, steps, "footprints") + "</div></section>";
  }

  /* OwnerMatch: owners matched to CORE users by email, and who gets an invitation */
  function OwnerMatch(o) {
    o = o || {};
    var names = Object.keys(D.people), seats = o.seats, sam = o.sam;
    var rows = names.map(function (n) {
      var p = D.people[n], res;
      if (sam && n === "Sam Whitford") res = CHIP("Another CORE church", "is-error", "building-2") + '<span class="cwl-a-muted">' + esc(D.otherChurch.church) + "</span>";
      else if (p.core === "match") res = CHIP("Matched · " + p.role, "is-success", "user-check") + '<span class="cwl-a-muted">Goals are theirs in CORE at once</span>';
      else if (seats && ["Sam Whitford", "Leah Kim"].indexOf(n) >= 0) res = CHIP("No seat free", "is-warning", "armchair") + '<span class="cwl-a-muted">Held until a seat is free</span>';
      else res = CHIP("Invitation as Member", "is-info", "mail-plus") + '<span class="cwl-a-muted">' + (p.outside ? "Not at the retreat. " : "") + "Sent after publishing</span>";
      return '<div class="cwl-c7-orow"><span class="cwl-a-avatar">' + esc(n.split(" ").map(function (x) { return x[0]; }).join("")) + '</span><span class="cwl-c7-oname"><b>' + esc(n) + '</b><span class="cwl-a-muted">' + esc(p.email) + '</span></span><span class="cwl-c7-ores">' + res + "</span></div>";
    }).join("");
    var inv = names.filter(function (n) { return D.people[n].core === "invite"; }).length - (sam ? 1 : 0) - (seats ? 2 : 0);
    return '<section class="cwl-a-card cwl-c7-card" data-step="owners"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">Owners</div><h3 class="cwl-a-section">Matched by email</h3></div></header><div class="cwl-c7-owners">' + rows + "</div>" +
      '<div class="cwl-c7-foot">' + L("mail") + "<span><b>" + inv + " CORE invitation" + (inv === 1 ? "" : "s") + "</b> go out through CORE's own invite flow, only after everything is saved. Each person joins as a Member. Pending invitations use a seat.</span></div>" +
      (sam ? '<div class="cwl-c7-foot is-warn">' + L("triangle-alert") + "<span><b>Sam Whitford's email belongs to a CORE user at " + esc(D.otherChurch.church) + ".</b> A person can be in one CORE church only, so Sam isn't linked. Change the owner, or use another email.</span></div>" : "") +
      (seats ? '<div class="cwl-c7-foot is-warn">' + L("armchair") + "<span><b>Riverside's CORE plan has 1 free seat and 4 invitations are needed.</b> Three invitations go out. Two owners are held until the church adds seats in CORE, and their goals are added with no owner for now.</span></div>" : "") +
      "</section>";
  }

  /* PublishSummary: what publishing will do, in counts */
  function PublishSummary(o) {
    o = o || {};
    var second = o.second, c = second ? D.second.fresh : { outcomes: 4, goals: 10, tasks: 7, invitations: 4 };
    var link = second ? 0 : 1, seatsHeld = o.seats ? 2 : 0, sam = o.sam ? 1 : 0;
    var inv = c.invitations - seatsHeld - sam;
    var rows = [["target", "Vision Outcomes", second ? 0 : c.outcomes, second ? "none new" : (link ? "4 new and 1 linked to the one already there" : "new")],
      ["goal", "1-year goals", c.goals, second ? "new" : "each under its outcome"],
      ["footprints", "First steps as tasks", c.tasks, second ? "new" : "each linked to a goal, with its owner and date"],
      ["mail-plus", "CORE invitations", inv, "sent after everything is saved"]];
    var ready = o.ready !== false;
    return '<section class="cwl-a-card cwl-c7-card cwl-c7-sum" data-step="summary"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">' + (second ? "Second publish" : "Publishing will add") + '</div><h3 class="cwl-a-section">' + (second ? "Only what is new" : "One step, all or nothing") + "</h3></div></header>" +
      '<div class="cwl-c7-sumrows">' + rows.map(function (r) { return '<div class="cwl-c7-sumrow">' + L(r[0]) + '<span class="n" data-n="' + r[2] + '">' + r[2] + "</span><span><b>" + r[1] + '</b><span class="cwl-a-muted">' + esc(r[3]) + "</span></span></div>"; }).join("") + "</div>" +
      '<div class="cwl-c7-keeps"><div>' + L("layers") + "<span><b>Vision Matrix:</b> not changed. Place the goals in it after the retreat.</span></div>" +
      '<div class="cwl-c7-intent">' + L("info") + "<span><b>Commander's intent stays here.</b> CORE has nowhere to hold the intent statement, the must-do or what you'll stop. They stay in the report, the Map and the read-only copy, and the first steps go to CORE as tasks.</span></div></div>" +
      (second ? '<div class="cwl-c7-keeps"><div>' + L("database") + "<span><b>22 records are already in CORE</b> and are kept as they are.</span></div></div>" : "") + "</section>";
  }

  /* PublishButton: lead facilitator only, waits for the readiness check */
  function PublishButton(o) {
    o = o || {};
    var lead = o.lead !== false, n = o.fix || 0, label = o.second ? "Publish what's new" : "Publish to CORE";
    if (!lead) return '<div class="cwl-c7-pub">' + B(label, "is-primary", "send", " disabled") + '<span class="cwl-c7-why">' + L("lock") + "Only " + D.lead + ", the lead facilitator, can publish to CORE.</span></div>";
    if (o.offline) return '<div class="cwl-c7-pub">' + B(label, "is-primary", "send", " disabled") + '<span class="cwl-c7-why">' + L("wifi-off") + "Offline. Publishing waits until you're back online.</span></div>";
    if (o.unlinked) return '<div class="cwl-c7-pub">' + B(label, "is-primary", "send", " disabled") + '<span class="cwl-c7-why">' + L("unlink") + "Link Riverside Church to its CORE organization first.</span></div>";
    if (o.unreachable) return '<div class="cwl-c7-pub">' + B(label, "is-primary", "send", " disabled") + '<span class="cwl-c7-why">' + L("cloud-off") + "CORE can't be reached right now.</span></div>";
    if (o.undecided) return '<div class="cwl-c7-pub">' + B(label, "is-primary", "send", " disabled") + '<span class="cwl-c7-why">' + L("triangle-alert") + "Decide what to do about " + o.undecided + " overlap" + (o.undecided > 1 ? "s" : "") + " first.</span></div>";
    if (n) return '<div class="cwl-c7-pub">' + B(label, "is-primary", "send", " disabled") + '<span class="cwl-c7-why">' + L("triangle-alert") + "<span><span class=\"n\" data-pubfix>" + n + "</span> thing" + (n > 1 ? "s" : "") + " to fix first.</span></span></div>";
    return '<div class="cwl-c7-pub">' + B(label, "is-primary", "send") + '<span class="cwl-c7-why is-ok">' + L("circle-check") + "Everything passes the check.</span></div>";
  }

  /* ================================================================
     COR-02 · publish from the control surface and the remote
     ================================================================ */
  /* PublishProgress: one transaction. While it runs nothing shows as created, so nothing looks partial. */
  function PublishProgress(o) {
    o = o || {};
    var st = o.state; /* running | committed | sending | sent | partial | failed */
    var inTx = st === "running", done = st === "committed" || st === "sending" || st === "sent" || st === "partial";
    var failed = st === "failed";
    var rows = [["target", "5 Vision Outcomes", "4 new, 1 linked"], ["goal", "10 goals", "each under its outcome"], ["footprints", "7 first steps", "as tasks with owners and dates"]];
    function recs() {
      return rows.map(function (r) {
        var mark = done ? '<span class="cwl-c7-disc is-ok" role="img" aria-label="Created">' + L("check") + "</span>" : failed ? '<span class="cwl-c7-disc is-none" role="img" aria-label="Not created">' + L("minus") + "</span>" : '<span class="cwl-c7-disc is-wait" role="img" aria-label="Waiting">' + L("loader-circle") + "</span>";
        return '<div class="cwl-c7-prow' + (done ? " is-done" : "") + '">' + mark + '<span class="t"><b>' + esc(r[1]) + '</b><span class="cwl-a-muted">' + (failed ? "Not created" : done ? "Created in CORE" : esc(r[2])) + "</span></span></div>";
      }).join("");
    }
    var sent = st === "sent" ? 4 : st === "sending" ? 2 : st === "partial" ? 2 : 0;
    var invRow;
    if (st === "partial") invRow = '<div class="cwl-c7-prow is-partial"><span class="cwl-c7-disc is-gap" role="img" aria-label="Needs attention">' + L("triangle-alert") + '</span><span class="t"><b>4 CORE invitations</b><span class="cwl-a-muted">2 sent, 2 didn\'t send. The goals are safe in CORE. Resend them from CORE\'s invite flow.</span></span>' + SB("Resend 2", "mail-plus") + "</div>";
    else if (st === "sending" || st === "sent") invRow = '<div class="cwl-c7-prow' + (st === "sent" ? " is-done" : "") + '"><span class="cwl-c7-disc ' + (st === "sent" ? "is-ok" : "is-wait") + '" role="img" aria-label="' + (st === "sent" ? "Sent" : "Sending") + '">' + L(st === "sent" ? "check" : "loader-circle") + '</span><span class="t"><b>4 CORE invitations</b><span class="cwl-a-muted">' + (st === "sent" ? "Sent through CORE" : "Sending through CORE, <span class=\"n\" data-sent>" + sent + "</span> of 4") + "</span></span></div>";
    else invRow = '<div class="cwl-c7-prow is-later"><span class="cwl-c7-disc is-none" role="img" aria-label="Waiting">' + L("clock") + '</span><span class="t"><b>4 CORE invitations</b><span class="cwl-a-muted">' + (failed ? "Not sent" : "Sent after everything is saved") + "</span></span></div>";
    var head = inTx ? "Publishing to CORE" : done ? "Published to CORE" : "Not published yet";
    var sub = inTx ? "Creating everything in CORE as one step. It all happens together or not at all, so you'll see nothing created until it is saved." : st === "committed" || st === "sending" || st === "sent" || st === "partial" ? "Saved in CORE at 3:14 pm. Everything was created together." : "";
    return '<section class="cwl-a-card cwl-c7-card cwl-c7-prog is-' + st + '" data-step="progress" role="status"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">' + (failed ? "Nothing was created" : inTx ? "In progress" : "Committed") + '</div><h3 class="cwl-a-section">' + head + "</h3>" + (sub ? '<p class="cwl-c7-p">' + sub + "</p>" : "") + "</div>" + (inTx ? '<span class="cwl-c7-bar" aria-hidden="true"><i></i></span>' : "") + "</header>" +
      (failed ? BAN("error", "circle-x", "<strong>CORE couldn't save the publish.</strong> " + esc(o.reason || "The request to CORE timed out after 30 seconds.") + ' <span class="cwl-c7-checked">' + L("shield-check") + "We checked CORE afterward: nothing from this publish is in it.</span>") : "") +
      '<div class="cwl-c7-prows">' + recs() + invRow + "</div>" +
      (failed ? '<div class="cwl-a-row">' + B("Try again", "is-primary", "rotate-cw") + B("Publish later from setup", "is-secondary", "clock") + "</div>" : "") + "</section>";
  }

  /* PublishConfirm: one clear step before anything is sent to CORE */
  function PublishConfirm(o) {
    o = o || {};
    return '<div class="cwl-a-modal cwl-c7-modal" role="dialog" aria-label="Publish to CORE"><div class="cwl-a-modal-head"><div><div class="cwl-a-eyebrow">Publish to CORE</div><b class="cwl-a-section">Add this plan to CORE for Riverside Church?</b></div></div><div class="cwl-a-modal-body"><ul class="cwl-c7-conf"><li>' + L("target") + "5 Vision Outcomes (4 new, 1 linked)</li><li>" + L("goal") + "10 goals</li><li>" + L("footprints") + "7 first steps as tasks</li><li>" + L("mail-plus") + "4 CORE invitations, sent after it's saved</li></ul>" +
      '<p class="cwl-c7-p">It adds records and never changes what is in CORE. It happens in one step, so if anything fails nothing is created.</p></div><div class="cwl-a-modal-foot">' + B("Not yet", "is-ghost") + B("Publish to CORE", "is-primary", "send") + "</div></div>";
  }

  /* RemotePublish: the remote's own control, lead facilitator only */
  function RemotePublish(box, o) {
    o = o || {};
    var el = CL.appPhone(box, "control"), st = o.state || "ready", lead = o.lead !== false;
    var body;
    if (!lead) body = '<div class="cwl-c7-rem-note">' + L("lock") + "<span><b>" + esc(D.lead) + " publishes to CORE.</b> Only the lead facilitator can, from their own sign-in.</span></div>";
    else if (st === "running") body = '<div class="cwl-c7-rem-st">' + '<span class="cwl-c7-spin">' + L("loader-circle") + "</span><b>Publishing to CORE</b><span class=\"cwl-a-muted\">It all happens together or not at all. Keep this page open.</span></div>";
    else if (st === "done") body = '<div class="cwl-c7-rem-st">' + '<span class="cwl-c7-disc is-ok is-lg">' + L("check") + '</span><b>Published</b><span class="cwl-a-muted">5 outcomes, 10 goals and 7 first steps are in CORE. 4 invitations sent.</span></div>' + B("Next: Scripture and prayer", "is-primary", "arrow-right");
    else if (st === "partial") body = '<div class="cwl-c7-rem-st">' + '<span class="cwl-c7-disc is-ok is-lg">' + L("check") + '</span><b>Published</b><span class="cwl-a-muted">Everything is in CORE.</span></div>' + BAN("warning", "triangle-alert", "<strong>2 invitations didn't send.</strong> Resend them from setup.") + B("Next: Scripture and prayer", "is-primary", "arrow-right");
    else if (st === "failed") body = '<div class="cwl-c7-rem-st">' + '<span class="cwl-c7-disc is-gap is-lg">' + L("x") + '</span><b>Not published yet</b><span class="cwl-a-muted">CORE couldn\'t save it. Nothing was created. The TV is still on the Day 2 recap.</span></div>' + '<div class="cwl-c7-rem-reason">The request to CORE timed out after 30 seconds.</div>' + B("Try again", "is-primary", "rotate-cw") + B("Publish later", "is-secondary", "clock");
    else if (st === "fix") body = '<div class="cwl-c7-rem-st">' + '<span class="cwl-c7-disc is-gap is-lg">' + L("triangle-alert") + '</span><b>6 things to fix first</b><span class="cwl-a-muted">Open the control surface to fix them.</span></div>' + B("Publish to CORE", "is-primary", "send", " disabled");
    else body = '<div class="cwl-c7-rem-st"><span class="cwl-c7-disc is-ok is-lg">' + L("circle-check") + '</span><b>Ready to publish</b><span class="cwl-a-muted">5 outcomes, 10 goals, 7 first steps and 4 invitations.</span></div>' + B("Publish to CORE", "is-primary", "send");
    el.innerHTML = '<div class="cwl-ph-head" style="border-color:var(--cwl-app-border)"><span class="cwl-a-label">' + esc(W.church) + "</span>" + (o.sync || P4.SYNC("", "check", "On the TV")) + "</div>" +
      '<div class="cwl-r-body' + (o.held ? " cwl-wf-held" : "") + '">' + (o.banner || "") + '<div class="cwl-a-row" style="justify-content:space-between;flex-wrap:nowrap"><div style="min-width:0"><div class="cwl-a-eyebrow">On the TV now</div><div class="cwl-a-label cwl-a-trunc">' + esc(o.tv || "Day 2 recap") + "</div></div>" + CL.liveMark("handed") + "</div>" + body + "</div>";
    CL.icons();
    return el;
  }

  /* TV scenes for COR-02 and COR-03 */
  function PublishedTV(sh, o) {
    o = o || {};
    var host = sh.host; host.innerHTML = "";
    var el = h("div", "cwl-c7-tv"); host.appendChild(el);
    var c = o.counts || { outcomes: 5, goals: 10, steps: 7 };
    el.innerHTML = '<div class="cwl-c7-tv-mark">' + L("check") + '</div><div class="cwl-c7-tv-h">Published to <strong>CORE</strong></div><div class="cwl-c7-tv-nums"><div><b>' + c.outcomes + "</b><span>Vision Outcomes</span></div><div><b>" + c.goals + "</b><span>1-year goals</span></div><div><b>" + c.steps + "</b><span>first steps</span></div></div>" +
      '<div class="cwl-c7-tv-foot">Every owner has their goals in CORE, and four owners get an invitation today.</div>';
    CL.icons();
    return el;
  }
  function PublishedPhone(ph, o) {
    o = o || {};
    var inv = o.invite;
    ph.body.innerHTML = '<div class="cwl-ph-headline">Published to CORE</div><p class="cwl-c7-ph-p">' + (inv ? "Your goals are in CORE. You'll get an email from CORE to join Riverside Church, and your goals will be there when you do." : "Your goals are in CORE, under your account.") + "</p>" +
      '<div class="cwl-c7-ph-card"><span class="cwl-a-eyebrow">Your goal</span><b>Launch the apprentice pathway</b><span>Ends Apr 30, 2027</span></div>';
    ph.foot.innerHTML = '<span class="cwl-ph-muted">' + L("mail") + " " + (inv ? "Look for the CORE email" : "Open CORE any time") + "</span>";
    CL.icons();
  }

  /* PublishHistory: what the app has created in CORE, and the second publish */
  function PublishHistory(o) {
    o = o || {};
    var st = o.state || "one";
    var pubs = [{ n: 1, when: "Nov 13, 3:14 pm", by: "Chris", note: "Committed", c: "5 outcomes, 10 goals, 7 tasks, 4 invitations", ids: 26 }];
    if (st === "two") pubs.unshift({ n: 2, when: D.second.when, by: "Chris", note: "Committed", c: "1 goal, 1 task. Nothing else was added.", ids: 2 });
    var tot = st === "two" ? 28 : 26;
    return '<section class="cwl-a-card cwl-c7-card" data-step="history"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">What this app has created in CORE</div><h3 class="cwl-a-section"><span class="n" data-n="' + tot + '">' + tot + "</span> records, each remembered by its CORE id</h3></div>" + '<span class="cwl-c7-note">' + L("database") + "The app never creates a record twice</span></header>" +
      '<table class="cwl-a-table cwl-c7-hist"><thead><tr><th>Publish</th><th>When</th><th>By</th><th>Added</th><th>CORE ids kept</th><th></th></tr></thead><tbody>' + pubs.map(function (p) { return "<tr><td><b>#" + p.n + "</b></td><td>" + esc(p.when) + "</td><td>" + esc(p.by) + "</td><td>" + esc(p.c) + "</td><td>" + p.ids + "</td><td>" + CHIP(p.note, "is-success", "circle-check") + "</td></tr>"; }).join("") + "</tbody></table></section>";
  }
  /* SecondPublish: only what is new, and what changed here but is not sent */
  function SecondPublish(o) {
    o = o || {};
    var s = D.second, ch = s.changed[0];
    return '<section class="cwl-a-card cwl-c7-card" data-step="second"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">Since the last publish</div><h3 class="cwl-a-section">2 new things, 1 change not sent</h3></div></header>' +
      '<div class="cwl-c7-sec"><div class="cwl-c7-secrow is-new">' + L("plus") + "<span><b>New goal</b> " + esc(s.newGoal.title) + ' <span class="cwl-a-muted">' + esc(s.newGoal.owner) + " · ends " + esc(s.newGoal.end) + "</span></span>" + CHIP("Will be added", "is-info", "plus") + "</div>" +
      '<div class="cwl-c7-secrow is-new">' + L("plus") + "<span><b>New first step</b> " + esc(s.newStep.text) + ' <span class="cwl-a-muted">' + esc(s.newStep.owner) + " · " + esc(s.newStep.date) + "</span></span>" + CHIP("Will be added", "is-info", "plus") + "</div>" +
      '<div class="cwl-c7-secrow is-kept">' + L("lock") + "<span><b>Changed here: " + esc(ch.what) + "</b> " + esc(ch.field) + " is " + esc(ch.mine) + " here and " + esc(ch.core) + ' in CORE. <span class="cwl-a-muted">Publishing never changes what is in CORE. Change it in CORE.</span></span>' + CHIP("Not sent", "is-outline", "ban") + "</div></div></section>";
  }

  /* ================================================================
     AFT-01 · the report
     ================================================================ */
  var ST = { drafted: ["AI drafted", "is-outline", null], edited: ["Edited", "is-info", "pencil"], needs: ["Needs you", "is-warning", "triangle-alert"], thin: ["Thin data", "is-outline", "circle-dashed"], signed: ["Signed off in the room", "is-success", "badge-check"], approved: ["Reviewed", "is-success", "check"] };
  function SectionList(o) {
    o = o || {};
    var cur = o.cur || "heard", over = o.status || {};
    return '<nav class="cwl-rp-nav" aria-label="Report sections">' + D.reportOrder.map(function (s, i) {
      var st = over[s[0]] || D.report[s[0]].status, c = ST[st] || ST.drafted;
      var icon = st === "approved" ? "check" : st === "signed" ? "badge-check" : st === "needs" ? "triangle-alert" : st === "thin" ? "circle-dashed" : st === "edited" ? "pencil" : "";
      return '<a class="cwl-rp-ni' + (s[0] === cur ? " is-current" : "") + '" href="#" tabindex="-1" data-id="' + s[0] + '"><span class="n">' + (i + 1) + "</span><span class=\"t\">" + esc(s[1]) + '</span><span class="st st-' + st + '" title="' + esc(c[0]) + '">' + (icon ? L(icon) : CL.aiBadge()) + "</span></a>";
    }).join("") + "</nav>";
  }
  function Para(p, o) {
    o = o || {};
    var sel = o.sel, own = p.own;
    var srcs = (p.s || []).map(function (id, i) { return '<sup class="cwl-rp-sup" title="' + esc(D.src[id].label) + '">' + (i + 1) + "</sup>"; }).join("");
    var quote = p.q ? '<blockquote class="cwl-rp-q">' + L("quote") + '<div><b>"' + esc(p.q) + '"</b><span>A survey answer, word for word. Anonymous.</span></div></blockquote>' : "";
    return '<div class="cwl-rp-p' + (sel ? " is-selected" : "") + (o.edited ? " is-edited" : "") + '" data-i="' + (o.i || 0) + '"><div class="cwl-rp-gut">' + (own ? '<span class="cwl-a-avatar">CV</span>' : CL.aiBadge()) + "</div><div class=\"cwl-rp-body\">" +
      (p.lens ? '<div class="cwl-rp-lens">' + lens(p.lens) + "</div>" : "") +
      '<p class="cwl-rp-t' + (o.editing ? " is-editing" : "") + '">' + esc(p.t) + srcs + (o.editing ? '<span class="cwl-rp-caret"></span>' : "") + "</p>" + quote +
      (p.thin ? '<div class="cwl-rp-thin">' + '<span class="cwl-d6-thin" role="note">' + L("circle-dashed") + "<b>Thin data</b><span>6 of 87 respondents are under 30. The report says so.</span></span></div>" : "") +
      (sel ? '<div class="cwl-rp-tools">' + SB("Edit", "pencil") + SB("Use the room's words", "quote") + SB("Remove", "trash-2", "is-ghost") + '<span class="cwl-a-muted">Sentence 1 has ' + (p.s || []).length + " source" + ((p.s || []).length === 1 ? "" : "s") + "</span></div>" : "") + "</div></div>";
  }
  function SectionBody(id, o) {
    o = o || {};
    var sec = D.report[id], title = by(D.reportOrder.map(function (x) { return { id: x[0], t: x[1] }; }), id).t;
    var st = (o.status || {})[id] || sec.status, c = ST[st] || ST.drafted;
    var head = '<header class="cwl-rp-sh"><div><div class="cwl-a-eyebrow">Section ' + (D.reportOrder.map(function (x) { return x[0]; }).indexOf(id) + 1) + ' of 17</div><h3 class="cwl-a-title cwl-rp-title">' + esc(title) + "</h3></div>" + '<div class="cwl-a-row">' + (st === "drafted" ? AIMark("Drafted") : CHIP(c[0], c[1], c[2])) + (id === "future" ? CHIP("Signed off in the room, Day 1", "is-success", "badge-check") : "") + "</div></header>";
    var paras = o.empty ? "" : sec.paras.map(function (p, i) { return Para(p, { i: i, sel: o.sel === i, editing: o.editing === i && id === o.editId, edited: o.edited === i }); }).join("");
    var own = id === "risks" && !o.noOwn ? '<div class="cwl-rp-p cwl-rp-own"><div class="cwl-rp-gut"><span class="cwl-a-avatar">CV</span></div><div class="cwl-rp-body"><span class="cwl-a-eyebrow">Chris\'s read · not AI</span><p class="cwl-rp-t">' + esc(D.report.own.risks.replace("Chris's read: ", "")) + "</p></div></div>" : "";
    var note = id === "future" ? '<div class="cwl-c7-quiet">' + L("badge-check") + "<span>The 10-year Future comes from the five lens summaries the room approved on Day 1. Each is word for word what the room signed off, so there is nothing to review here.</span></div>" : "";
    var add = '<div class="cwl-rp-add">' + SB("Add my own read", "plus") + SB("Add a paragraph", "text-cursor-input") + "</div>";
    var empty = o.empty ? '<div class="cwl-c7-quiet is-box">' + L("info") + "<span><b>AI is off for this engagement.</b> Nothing is drafted. Start from the room's words, or write each section by hand.</span><span class=\"cwl-a-row\">" + SB("Start from the room's words", "quote") + SB("Write it", "pencil") + "</span></div>" : "";
    return head + note + (o.drafting ? '<div class="cwl-c7-quiet">' + '<span class="cwl-c7-spin">' + L("loader-circle") + "</span><span>" + AIMark("Drafting") + " this section from the engagement record.</span></div>" : "") + paras + own + empty + add;
  }
  function SourcesPanel(id, o) {
    o = o || {};
    var sec = D.report[id], seen = {}, items = [];
    sec.paras.forEach(function (p) { (p.s || []).forEach(function (s) { if (!seen[s]) { seen[s] = 1; items.push(s); } }); });
    var para = sec.paras[o.sel || 0];
    return '<aside class="cwl-rp-src" aria-label="Sources"><div class="cwl-a-eyebrow">Sources for this section</div>' + items.map(function (s, i) { return '<div class="cwl-rp-sc' + (para && (para.s || []).indexOf(s) >= 0 ? " is-lit" : "") + '"><span class="n">' + (i + 1) + "</span>" + Src(s) + "</div>"; }).join("") +
      '<div class="cwl-c7-keeps"><div>' + L("quote") + "<span>Quotes are word for word. Names appear only where someone owns a step or agreed to be quoted.</span></div></div></aside>";
  }
  function SignOffBar(o) {
    o = o || {};
    var st = o.state || "open";
    if (st === "signed") return '<div class="cwl-rp-sign is-done">' + L("badge-check") + "<span><b>Signed off by Chris on " + D.dates.signOff + ".</b> Version 4 is the one the read-only copy shows. Editing starts version 5 as a draft.</span>" + SB("Export", "download", "is-primary") + "</div>";
    if (st === "stale") return '<div class="cwl-rp-sign is-warn">' + L("triangle-alert") + "<span><b>Edited since sign-off.</b> The read-only copy still shows version 4. Sign off version 5 to replace it.</span>" + SB("Sign off version 5", "badge-check", "is-primary") + "</div>";
    var left = o.left == null ? 3 : o.left;
    return '<div class="cwl-rp-sign">' + L(left ? "list-checks" : "circle-check") + "<span>" + (left ? "<b>" + left + " section" + (left > 1 ? "s" : "") + " still need" + (left > 1 ? "" : "s") + " your review.</b> Sign off when you have read every section." : "<b>Every section is reviewed.</b> Signing off adds your name and the date, and the report goes to the read-only copy.") + "</span>" + B("Sign off", "is-primary", "badge-check", left ? " disabled" : "") + "</div>";
  }
  /* ExportPanel: Word and PDF, Clearway-branded */
  function ExportPanel(o) {
    o = o || {};
    var st = o.state || "ready", draft = !!o.draft;
    function file(kind, name, size, pages) {
      var s = st === "preparing" ? "prep" : st === "failed" ? "fail" : "ok";
      return '<div class="cwl-rp-file is-' + s + '"><span class="ic">' + L(kind === "docx" ? "file-text" : "file-type") + '</span><div class="t"><b>' + esc(name) + '</b><span class="cwl-a-muted">' + (s === "prep" ? "Building the pages in Clearway's document design" : s === "fail" ? "Not built" : esc(size) + " · " + pages + " pages") + "</span></div>" +
        (s === "ok" ? SB("Download", "download", "is-primary") : s === "prep" ? '<span class="cwl-c7-spin">' + L("loader-circle") + "</span>" : SB("Try again", "rotate-cw")) + "</div>";
    }
    return '<section class="cwl-a-card cwl-c7-card cwl-rp-exp"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">Export</div><h3 class="cwl-a-section">' + (draft ? "A draft for your own reading" : "Word and PDF, Clearway-branded") + "</h3></div></header>" +
      (draft ? '<div class="cwl-c7-keeps"><div>' + L("file-warning") + "<span>Not signed off yet, so every page carries a Draft mark in its header. Sign off for the clean copy.</span></div></div>" : "") +
      (st === "failed" ? BAN("error", "circle-x", "<strong>The Word file couldn't be built.</strong> The report is safe. Nothing was changed.") : "") +
      '<div class="cwl-rp-files">' + file("docx", "Riverside Church Wayfinding Report.docx", "1.8 MB", 28) + file("pdf", "Riverside Church Wayfinding Report.pdf", "2.4 MB", 28) + "</div>" +
      '<div class="cwl-c7-keeps"><div>' + L("palette") + "<span>Plus Jakarta Sans, Clearway's colors and its document standard. Source markers stay in the app. Thin data labels and verbatim quotes stay in the document.</span></div></div></section>";
  }
  /* WordPreview: the cover and one inside page, drawn small */
  function WordPreview(o) {
    o = o || {};
    return '<div class="cwl-rp-pv"><figure><div class="cwl-rp-page is-cover"><div class="mk">' + CL.markSVG() + "</div><div class=\"ey\">Wayfinding report</div><div class=\"tt\">Riverside Church</div><div class=\"sb\">10-year Future, 3-year Vision and 1-year Outlook</div><div class=\"ft\">Clearway Church Solutions · " + (o.draft ? "Draft" : "Nov 2026") + "</div></div><figcaption>Cover</figcaption></figure>" +
      '<figure><div class="cwl-rp-page"><div class="ey">What We Heard</div><div class="tt">Small groups came up more than anything else</div><div class="ln"></div><p>45% of the 87 people who answered named small groups as the place they feel most connected.</p><div class="qb">"I came for two months before anyone told me groups existed."</div><p class="sm">Thin data: 6 of 87 respondents are under 30.</p>' + (o.draft ? '<div class="dr">Draft</div>' : "") + '</div><figcaption>An inside page</figcaption></figure></div>';
  }

  /* ================================================================
     AFT-02 · the visibility plan
     ================================================================ */
  function VisibilityPlan(o) {
    o = o || {};
    var rows = (o.rows || D.vplanRows).filter(function (r) { return !o.only || o.only.indexOf(r.id) >= 0; });
    var rev = o.allReviewed;
    var edit = o.editing;
    function cell(r, k) {
      if (edit && edit.id === r.id && edit.k === k) return '<textarea class="cwl-a-input is-focus" rows="3" tabindex="-1">' + esc(r[k]) + "</textarea>";
      return esc(r[k]);
    }
    var body = rows.map(function (r) {
      var done = rev || r.reviewed, flag = o.flag === r.id;
      return '<tr class="cwl-vp-row' + (flag ? " is-flag" : "") + '" data-id="' + r.id + '"><td class="who"><b>' + cell(r, "who") + '</b><div class="cwl-a-row">' + (o.empty ? "" : r.src.map(Src).join("")) + "</div></td><td>" + cell(r, "when") + "</td><td>" + cell(r, "by") + "</td><td>" + cell(r, "hear") + '</td><td class="risk">' + cell(r, "risk") + (flag ? '<div class="cwl-vp-flag">' + L("triangle-alert") + "<span>The room named no donors. Add who, or say there are none.</span></div>" : "") + '</td><td class="rv">' + (done ? CHIP("Reviewed", "is-success", "check") : SB("Mark reviewed", "check")) + "</td></tr>";
    }).join("");
    var left = o.empty ? 0 : rows.filter(function (r) { return !(rev || r.reviewed); }).length;
    return '<section class="cwl-a-card cwl-c7-card cwl-vp"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">Make the Vision Visible</div><h3 class="cwl-a-section">Visibility plan</h3></div><div class="cwl-a-row">' + (o.empty ? "" : AIMark(o.drafting ? "Drafting" : "Drafted from what the room said")) + CHIP("Anchored on Vision Sunday, " + D.dates.visionSunday, "is-outline", "calendar") + "</div></header>" +
      '<div class="cwl-vp-order">' + ["Lead pastor", "Retreat participants", "Elders", "Team", "Key leaders and donors", "Congregation"].map(function (s, i) { return "<span><b>" + (i + 1) + "</b>" + esc(s) + "</span>"; }).join(L("chevron-right")) + "</div>" +
      '<div class="cwl-vp-scroll"><table class="cwl-a-table cwl-vp-table"><thead><tr><th>Who</th><th>When</th><th>Who tells them</th><th>What they hear</th><th>The risk it answers</th><th></th></tr></thead><tbody>' + body + "</tbody></table></div>" +
      '<div class="cwl-vp-foot"><div class="cwl-a-row">' + SB("Add a row", "plus") + '<span class="cwl-a-muted">' + (left ? left + " of " + rows.length + " rows still need review" : "Every row is reviewed") + "</span></div>" + (o.call ? CHIP("Review call: Nov 25, 10:00 am on video", "is-info", "video") : '<span class="cwl-a-muted">' + L("calendar-clock") + " Review it with the church on a call by " + D.dates.followUpBy + "</span>") + "</div></section>";
  }

  /* ================================================================
     AFT-04 · the check-in, by email and on a phone
     ================================================================ */
  function CheckInEmail(o) {
    o = o || {};
    var d = o.day || 30, last = d === 90;
    return '<div class="cwl-ci-mail"><div class="cwl-ci-mail-h"><div class="av">' + CL.markSVG() + '</div><div><b>Clearway Live</b><span>checkins@live.clearway.co</span></div></div>' +
      '<div class="cwl-ci-mail-s">Your ' + d + "-day check-in for Riverside Church</div>" +
      '<div class="cwl-ci-mail-b"><p>Hi ' + esc(D.person.name) + ",</p><p>It has been " + d + " days since the Wayfinding retreat. Two minutes is all this takes: tell us how your own first steps and goals are going" + (last ? ", for the last time" : "") + ".</p><p>It shows where your goals stand in CORE, so you don't need to look anything up.</p>" +
      '<a class="cwl-ci-mail-btn" href="#" tabindex="-1">Open my ' + d + "-day check-in</a><p class=\"sm\">This link is yours. It signs you in after you tap it. Riverside's team and Clearway see your answers. Nobody else does.</p></div></div>";
  }
  var ANS = [["done", "Done", "check"], ["under-way", "Under way", "loader"], ["stuck", "Stuck", "hand-helping"]];
  function CheckInPhone(ph, o) {
    o = o || {};
    var st = o.step || "steps", d = o.day || 30, body = "", foot = "";
    var sel = o.sel;
    function ansRow(step, pick) {
      return '<div class="cwl-ci-step"><div class="cwl-ci-step-t"><b>' + esc(step.text) + '</b><span>Due ' + esc(step.date) + '</span></div><div class="cwl-ci-ans" role="radiogroup" aria-label="' + esc(step.text) + '">' + ANS.map(function (a) { return '<button type="button" role="radio" aria-checked="' + (pick === a[0]) + '" class="' + (pick === a[0] ? "is-on" : "") + '">' + L(a[2]) + "<span>" + a[1] + "</span></button>"; }).join("") + "</div></div>";
    }
    if (st === "open") { body = '<div class="cwl-ph-headline">Your ' + d + "-day check-in</div><p class=\"cwl-c7-ph-p\">Hi " + esc(D.person.name) + ". Two minutes, about your own first steps and goals. Tap to open it.</p>"; foot = PH.btn("Open my check-in", { icon: "arrow-right" }); }
    else if (st === "steps" || st === "stuck" || st === "long") {
      var stp = D.person.steps[0]; if (st === "long") stp = { text: "Meet every ministry lead one to one and write down the person each of them would name as their next leader", date: "Nov 27" };
      body = '<div class="cwl-ci-prog"><span>Step 1 of 3</span><i style="--p:0.33"></i></div><div class="cwl-ph-headline">Your first steps</div>' + ansRow(stp, st === "stuck" ? "stuck" : st === "long" ? "under-way" : sel || "") +
        (st === "stuck" ? '<label class="cwl-ci-note"><span>What would help?</span><textarea class="cwl-ph-input" rows="3" tabindex="-1">I need to know who signs off the role description.</textarea></label>' : "");
      foot = PH.btn("Next", { icon: "arrow-right", disabled: !sel && st === "steps" });
    }
    else if (st === "goals" || st === "core-down") {
      var g = D.person.goals[0];
      body = '<div class="cwl-ci-prog"><span>Step 2 of 3</span><i style="--p:0.66"></i></div><div class="cwl-ph-headline">Your goals</div><div class="cwl-ci-goal"><b>' + esc(g.title) + '</b><span>Ends ' + esc(g.end) + '</span><div class="cwl-ci-gs"><span class="cwl-a-eyebrow">Status in CORE</span>' + (st === "core-down" ? '<span class="cwl-ci-cs is-none">' + L("cloud-off") + "<span>Couldn't read CORE just now</span></span>" : CoreStatusPhone(g.status)) + "</div></div>" +
        '<label class="cwl-ci-note"><span>Anything to add about this goal?</span><textarea class="cwl-ph-input" rows="3" tabindex="-1" placeholder="Optional"></textarea></label>' + (st === "core-down" ? '<div class="cwl-c7-ph-note">' + L("info") + "<span>Your answers still go in. Your facilitator sees the status from CORE.</span></div>" : '<div class="cwl-c7-ph-note">' + L("lock") + "<span>You change a goal's status in CORE, not here.</span></div>");
      foot = PH.btn("Send my check-in", { icon: "send" });
    }
    else if (st === "sent") { body = '<div class="cwl-ph-headline">Thank you</div><p class="cwl-c7-ph-p">Your ' + d + "-day check-in is in." + (d < 90 ? " The next one comes by email on " + (d === 30 ? D.dates.d60 : D.dates.d90) + "." : " That was the last one.") + '</p><div class="cwl-ph-answer cwl-dimmable"><span>Your first step: Done</span><span class="cwl-ph-status">' + L("check") + " Sent</span></div>"; foot = '<span class="cwl-ph-muted">' + L("eye-off") + " Riverside's team and Clearway see this</span>"; }
    else if (st === "answered") { body = '<div class="cwl-ph-headline">You already answered</div><p class="cwl-c7-ph-p">Here is what you sent on ' + D.dates.d30 + ".</p><div class=\"cwl-ph-answer cwl-dimmable\"><span>List every ministry lead and a possible apprentice: Done</span><span class=\"cwl-ph-status\">" + L("check") + " Sent</span></div>"; foot = '<span class="cwl-ph-muted">Your own answers, read-only</span>'; }
    else if (st === "off") { body = '<div class="cwl-ph-headline">This check-in is closed</div><p class="cwl-c7-ph-p">Riverside Church\'s engagement has ended, so the check-ins have stopped. Thank you for the work.</p>'; foot = ""; }
    else if (st === "queued") { body = '<div class="cwl-ph-headline">Your goals</div><div class="cwl-ph-answer cwl-dimmable"><span>Your check-in</span><span class="cwl-ph-status">' + L("wifi-off") + " Saved on this phone</span></div><p class=\"cwl-c7-ph-p\">It will send as soon as you're back online.</p>"; foot = ""; }
    else if (st === "nogoals") { body = '<div class="cwl-ci-prog"><span>Step 1 of 2</span><i style="--p:0.5"></i></div><div class="cwl-ph-headline">Your first steps</div>' + ansRow(D.steps[3], "under-way") + '<div class="cwl-c7-ph-note">' + L("info") + "<span>You don't own a goal, so there is nothing to read from CORE.</span></div>"; foot = PH.btn("Send my check-in", { icon: "send" }); }
    ph.body.innerHTML = body; ph.foot.innerHTML = foot;
    CL.icons();
  }
  var PH = P4.PH;

  /* ================================================================
     AFT-05 · results and follow-ups for the facilitator
     ================================================================ */
  var ANSCHIP = { done: ["Done", "is-success", "check"], "under-way": ["Under way", "is-info", "loader"], stuck: ["Stuck", "is-warning", "hand-helping"], none: ["No answer", "is-outline", "minus"] };
  function CheckInResults(o) {
    o = o || {};
    var day = o.day || 30, st = o.state || "in";
    var res = D.results30.slice();
    if (day >= 60) res = res.map(function (r, i) { return { s: r.s, who: r.who, a: ["done", "done", "done", "done", "under-way", "stuck", "done"][i], note: i === 5 ? "Two families said yes. I'm still looking for a third." : "" }; });
    if (day === 90) res = res.map(function (r, i) { return { s: r.s, who: r.who, a: ["done", "done", "done", "done", "done", "under-way", "done"][i], note: "" }; });
    var partial = st === "waiting";
    if (partial) res = res.map(function (r, i) { return i < 3 ? r : { s: r.s, who: r.who, a: "none", note: "" }; });
    var done = res.filter(function (r) { return r.a === "done"; }).length;
    var answered = res.filter(function (r) { return r.a !== "none"; }).length;
    var tabs = ["30 days", "60 days", "90 days"].map(function (t, i) { return '<span class="cwl-a-tab" role="tab" aria-selected="' + ([30, 60, 90][i] === day) + '">' + t + (day === [30, 60, 90][i] ? "" : [30, 60, 90][i] > day ? "" : "") + "</span>"; }).join("");
    var stat = D.goalStatus30, gs = D.goals.map(function (g) {
      var s = stat[g.id]; if (day >= 60) s = { g1: "on-track", g2: "on-track", g3: "at-risk", g4: "completed", g5: "on-track", g6: "on-track", g7: "on-track", g8: "completed", g9: "at-risk", g10: "on-track" }[g.id];
      if (day === 90) s = { g1: "on-track", g2: "on-track", g3: "off-track", g4: "completed", g5: "on-track", g6: "completed", g7: "on-track", g8: "completed", g9: "at-risk", g10: "on-track" }[g.id];
      return { g: g, s: s };
    });
    var down = st === "core-down";
    var sum = '<div class="cwl-ci-sum"><div><span class="n" data-n="' + answered + '">' + answered + '</span><span class="cwl-a-muted">of 8 answered</span></div><div><span class="n" data-n="' + done + '">' + done + '</span><span class="cwl-a-muted">of 7 first steps done</span></div><div><span class="n">' + res.filter(function (r) { return r.a === "stuck"; }).length + '</span><span class="cwl-a-muted">stuck</span></div><div><span class="n">' + gs.filter(function (x) { return x.s === "at-risk" || x.s === "off-track"; }).length + '</span><span class="cwl-a-muted">goals at risk or off track</span></div></div>';
    var steps = res.map(function (r) {
      var s = by(D.steps, r.s), a = ANSCHIP[r.a];
      return '<tr><td><b>' + esc(s.text) + '</b></td><td>' + esc(r.who) + "</td><td>" + CHIP(a[0], a[1], a[2]) + '</td><td class="cwl-ci-note-c">' + (r.note ? esc(r.note) : '<span class="cwl-a-muted">No note</span>') + "</td></tr>";
    }).join("") + (D.noAnswer.length ? '<tr><td><b>Leah Kim has no first step</b></td><td>Leah Kim</td><td>' + CHIP("No answer", "is-outline", "minus") + '</td><td class="cwl-ci-note-c"><span class="cwl-a-muted">Owns a goal. Hasn\'t opened the email.</span></td></tr>' : "");
    var goals = gs.map(function (x) {
      return "<tr><td><b>" + esc(x.g.title) + "</b></td><td>" + esc(x.g.owner) + "</td><td>" + esc(x.g.end) + "</td><td>" + (down ? CHIP("Last read Dec 13", "is-outline", "cloud-off") : CoreStatus(x.s)) + "</td></tr>";
    }).join("");
    var follow = [];
    res.forEach(function (r) { if (r.a === "stuck") follow.push({ who: r.who, what: by(D.steps, r.s).text, why: r.note || "Marked stuck", kind: "step" }); });
    gs.forEach(function (x) { if (x.s === "at-risk" || x.s === "off-track") follow.push({ who: x.g.owner, what: x.g.title, why: "Goal is " + D.coreStatus[x.s].label.toLowerCase() + " in CORE", kind: "goal" }); });
    var fl = follow.map(function (f, i) {
      var did = o.followed && i === 0;
      return '<div class="cwl-ci-fu' + (did ? " is-done" : "") + '"><span class="cwl-c7-disc ' + (did ? "is-ok" : "is-gap") + '">' + L(did ? "check" : f.kind === "step" ? "hand-helping" : "triangle-alert") + '</span><div class="t"><b>' + esc(f.who) + '</b><span>' + esc(f.what) + '</span><span class="cwl-a-muted">' + esc(f.why) + "</span></div>" + (did ? CHIP("Followed up Dec 14", "is-success", "check") : SB("Follow up", "message-circle")) + "</div>";
    }).join("");
    var top;
    if (st === "scheduled") top = '<div class="cwl-c7-quiet is-box">' + L("calendar-clock") + "<span><b>The 30-day check-in goes out " + D.dates.d30 + " at 9:00 am.</b> Each of the 8 people gets an email about their own first steps and goals. Their goal status is read from CORE when they open it.</span><span class=\"cwl-a-row\">" + SB("Preview the email", "mail") + SB("Send it now", "send") + "</span></div>";
    else top = sum;
    var bounce = st === "bounce" ? BAN("warning", "mail-x", "<strong>One email bounced.</strong> leah@riverside.church didn't accept it. Correct the address and send it again.") : "";
    var closeBox = day === 90 && st === "in" ? '<div class="cwl-c7-keeps"><div>' + L("flag") + "<span><b>This was the last check-in.</b> " + done + " of 7 first steps are done. Close the engagement to turn off device sign-ins, the read-only copy and these emails.</span></div></div>" : "";
    return '<div class="cwl-ci-res">' + '<div class="cwl-a-tabs cwl-c7-tabs" role="tablist">' + tabs + "</div>" + bounce + top + (st === "scheduled" ? "" :
      '<div class="cwl-ci-cols"><div class="cwl-ci-main"><section class="cwl-a-card cwl-c7-card"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">First steps</div><h3 class="cwl-a-section">What people said</h3></div>' + (partial ? CHIP("5 haven't answered", "is-outline", "clock") : "") + (partial ? SB("Send a reminder to 5", "bell") : "") + '</header><table class="cwl-a-table cwl-ci-table"><thead><tr><th>First step</th><th>Owner</th><th>Answer</th><th>Note</th></tr></thead><tbody>' + steps + "</tbody></table></section>" +
      '<section class="cwl-a-card cwl-c7-card"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">Goals</div><h3 class="cwl-a-section">Status read from CORE</h3></div><span class="cwl-c7-note">' + L(down ? "cloud-off" : "refresh-cw") + (down ? "CORE can't be reached. Last read " + D.dates.d30 + ", 9:00 am." : "Read from CORE " + (day === 30 ? D.dates.d30 : day === 60 ? D.dates.d60 : D.dates.d90) + ", 9:00 am") + '</span></header><table class="cwl-a-table cwl-ci-table"><thead><tr><th>Goal</th><th>Owner</th><th>Ends</th><th>Status in CORE</th></tr></thead><tbody>' + goals + "</tbody></table></section></div>" +
      '<aside class="cwl-ci-side"><section class="cwl-a-card cwl-c7-card"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">Follow-ups</div><h3 class="cwl-a-section">' + follow.length + " to follow up</h3></div></header>" + (follow.length ? fl : '<div class="cwl-c7-quiet">' + L("circle-check") + "<span>Nobody is stuck, and no goal is at risk.</span></div>") + "</section>" + closeBox + "</aside></div>") + "</div>";
  }

  /* ================================================================
     AFT-03 · the read-only copy
     ================================================================ */
  function ShareLinks(o) {
    o = o || {};
    var st = o.state || "list", links = (o.links || D.links).slice();
    if (st === "unavailable") return '<section class="cwl-a-card cwl-c7-card cwl-ro-links"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">Read-only copy</div><h3 class="cwl-a-section">Share the plan with the elders</h3></div></header><div class="cwl-c7-quiet is-box">' + L("lock") + "<span><b>Available once the plan is published to CORE.</b> It shows the plan and its CORE status, so it waits for the publish.</span>" + B("Go to CORE", "is-secondary", "send") + "</div></section>";
    if (st === "empty") return '<section class="cwl-a-card cwl-c7-card cwl-ro-links"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">Read-only copy</div><h3 class="cwl-a-section">Share the plan with the elders</h3></div></header><div class="cwl-c7-quiet is-box">' + L("link") + "<span>Make a link for the elders, the board or anyone who should see the plan and its status. They can't edit it, and you can turn the link off at any time.</span>" + B("Make a link", "is-primary", "plus") + "</div></section>";
    var rows = links.map(function (l) {
      var rev = l.state === "revoked", confirm = o.confirm === l.id;
      return '<div class="cwl-ro-link' + (rev ? " is-revoked" : "") + '" data-id="' + l.id + '"><span class="ic">' + L(rev ? "link-2-off" : "link") + '</span><div class="t"><b>' + esc(l.name) + '</b><span class="cwl-a-muted">Made by ' + esc(l.by) + " on " + esc(l.made) + " · " + esc(rev ? "Turned off " + (l.off || "Nov 30") + ". It no longer opens." : l.opened) + "</span>" + (rev ? "" : '<span class="cwl-ro-url">live.clearway.co/plan/<b>riv-7Kq2xN</b></span>') + "</div>" +
        (rev ? CHIP("Turned off", "is-outline", "ban") : confirm ? '<div class="cwl-a-row">' + B("Turn it off", "is-destructive is-sm", "link-2-off") + B("Keep it", "is-ghost is-sm") + "</div>" : '<div class="cwl-a-row">' + SB("Copy link", "copy") + SB("Turn it off", "link-2-off", "is-ghost") + "</div>") + "</div>" + (confirm ? '<div class="cwl-c7-keeps"><div>' + L("triangle-alert") + "<span><b>Anyone with this link will lose access at once.</b> You can make a new link later.</span></div></div>" : "");
    }).join("");
    return '<section class="cwl-a-card cwl-c7-card cwl-ro-links"><header class="cwl-c7-hd"><div><div class="cwl-a-eyebrow">Read-only copy</div><h3 class="cwl-a-section">' + (links.length === 1 ? "One link" : links.length + " links") + '</h3></div>' + SB("Make a link", "plus") + "</header>" + (o.added ? '<div class="cwl-ro-new">' + L("circle-check") + "<span>Link made and copied. Paste it into your message to the elders.</span></div>" : "") + '<div class="cwl-ro-list">' + rows + "</div>" +
      '<div class="cwl-c7-keeps"><div>' + L("eye-off") + "<span>The copy shows the Clearway Map, the Vision Outcomes with their indicators, the goals with owners, dates and CORE status, and the commander's intent cards. Never raw answers, scribe cards or drafts.</span></div><div>" + L("file-text") + "<span>" + (o.report ? "The signed-off report is part of it." : "The report is added once you sign it off.") + "</span></div></div></section>";
  }
  var OWN_SHORT = function (n) { return n; };
  function ReadOnlyCopy(box, o) {
    o = o || {};
    var wide = !!o.wide, st = o.state || "plan";
    var root = box;
    root.classList.add("cwl-ro", wide ? "is-wide" : "is-phone");
    if (st === "revoked") { root.innerHTML = head(false) + '<div class="cwl-ro-main"><div class="cwl-ro-gone">' + L("link-2-off") + "<h2>This link has been turned off</h2><p>The plan is no longer shared at this address. Ask Chris at Clearway for a new link.</p></div></div>"; CL.icons(); return; }
    function head(show) {
      return '<header class="cwl-ro-head"><div class="cwl-ro-brand"><span class="mk">' + CL.markSVG() + "</span><span>Clearway Live</span></div>" + (show === false ? "" : '<span class="cwl-ro-badge">' + L("eye") + "Read-only</span>") + "</header>";
    }
    var down = st === "core-down", offline = st === "offline";
    var goalsBy = D.outcomes.map(function (oc) {
      var gl = D.goals.filter(function (g) { return g.o === oc.id; });
      var intent = W.intent.filter(function (x) { return x.o === oc.id; })[0];
      return '<article class="cwl-ro-oc"><h3>' + (D.outcomes.indexOf(oc) + 1) + ". " + esc(oc.name) + "</h3><p class=\"d\">" + esc(oc.desc) + '</p><div class="cwl-a-eyebrow">Indicators</div><ul class="cwl-ro-ind">' + oc.ind.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + '</ul><div class="cwl-a-eyebrow">1-year goals</div>' + gl.map(function (g) {
        var s = D.goalStatus30[g.id];
        return '<div class="cwl-ro-goal"><div class="t"><b>' + esc(g.title) + '</b><span>' + esc(g.owner) + " · ends " + esc(g.end) + "</span></div>" + (down ? CHIP("Last read Dec 13", "is-outline", "cloud-off") : CoreStatus(s)) + "</div>";
      }).join("") + "</article>";
    }).join("");
    var cards = W.intent.slice(0, o.cards || 2).map(function (c) {
      var oc = by(D.outcomes, c.o);
      var fixed = D.steps.filter(function (s) { return s.o === c.o; });
      return '<article class="cwl-ro-ic"><h3>' + esc(oc.name) + '</h3><dl><dt>Commander\'s intent</dt><dd>' + esc(c.intent || "Every family has a named next step within two weeks.") + "</dd><dt>The must-do</dt><dd>" + esc(c.must || "Welcome every new family by name.") + "</dd><dt>What we'll stop</dt><dd>" + esc(c.stop || "Leaving first-time families to find their own way.") + "</dd><dt>Next 30 days</dt><dd><ul>" + fixed.map(function (s) { return "<li>" + esc(s.text) + " <span>" + esc(s.owner) + ", " + esc(s.date) + "</span></li>"; }).join("") + "</ul></dd></dl></article>";
    }).join("");
    var map = '<div class="cwl-ro-map"><div class="cwl-ro-mf"><span class="cwl-a-eyebrow">Mission</span><p>' + esc(W.map.mission) + '</p></div><div class="cwl-ro-mf"><span class="cwl-a-eyebrow">Values</span><p>' + W.map.values.map(esc).join(" · ") + '</p></div><div class="cwl-ro-mf is-wide"><span class="cwl-a-eyebrow">10-year Future · ' + D.Y.future + '</span><ul>' + W.lenses.map(function (l) { return "<li>" + P4.lensDot(l.key) + "<span>" + esc(W.lensLines[l.key]) + "</span></li>"; }).join("") + '</ul></div><div class="cwl-ro-mf is-wide"><span class="cwl-a-eyebrow">3-year Vision Outcomes · ' + D.Y.vision + "</span><ol>" + D.outcomes.map(function (x) { return "<li>" + esc(x.name) + "</li>"; }).join("") + '</ol></div><div class="cwl-ro-mf is-wide is-empty"><span class="cwl-a-eyebrow">This Year\'s Priorities</span><p>' + L("circle-dashed") + " Left for the church's Annual Planning</p></div></div>";
    var report = st === "report" || o.report ? '<section class="cwl-ro-sec" id="report"><h2>The report</h2><div class="cwl-ro-rep">' + L("file-text") + '<div class="t"><b>Riverside Church Wayfinding Report</b><span>Signed off by Chris on ' + D.dates.signOff + ". 28 pages.</span></div>" + SB("Read the PDF", "file-type") + "</div></section>" : (st === "no-report" ? '<section class="cwl-ro-sec" id="report"><h2>The report</h2><div class="cwl-c7-quiet">' + L("clock") + "<span>The report will appear here once Clearway has signed it off.</span></div></section>" : "");
    root.innerHTML = head() +
      (down ? '<div class="cwl-ro-note is-warn">' + L("cloud-off") + "<span>CORE can't be reached, so statuses show when they were last read.</span></div>" : offline ? '<div class="cwl-ro-note">' + L("wifi-off") + "<span>You're offline. This is what loaded at 4:10 pm.</span></div>" : "") +
      '<div class="cwl-ro-main"><div class="cwl-ro-title"><span class="cwl-a-eyebrow">' + esc(D.church) + ' · Wayfinding plan</span><h1>The plan for ' + (D.base + 1) + " to " + (D.base + 3) + '</h1><span class="cwl-ro-upd">' + L("refresh-cw") + (down ? "Last read from CORE Dec 13, 9:00 am" : D.readonlyUpdated) + "</span></div>" +
      '<nav class="cwl-ro-jump" aria-label="On this page"><a href="#" tabindex="-1">The Map</a><a href="#" tabindex="-1">Vision Outcomes</a><a href="#" tabindex="-1">Commander\'s intent</a>' + (report ? '<a href="#" tabindex="-1">Report</a>' : "") + "</nav>" +
      '<section class="cwl-ro-sec" id="map"><h2>The Clearway Map</h2>' + map + '</section><section class="cwl-ro-sec" id="outcomes"><h2>Vision Outcomes and goals</h2>' + goalsBy + '</section><section class="cwl-ro-sec" id="intent"><h2>Commander\'s intent</h2>' + cards + "</section>" + report +
      '<footer class="cwl-ro-foot">' + L("eye") + "<span>This copy can't be edited. It shows the plan as published to CORE, and its status as CORE last reported it. Chris can turn this link off.</span></footer></div>";
    CL.icons();
  }

  window.ClearwayLivePass7 = {
    AIMark: AIMark, CoreStatus: CoreStatus, CoreStatusPhone: CoreStatusPhone, Letters: Letters, Src: Src, SetupShell: SetupShell, roundN: roundN,
    CoreConnection: CoreConnection, OverlapList: OverlapList, ReadinessRegister: ReadinessRegister, OwnerMatch: OwnerMatch, PublishSummary: PublishSummary, PublishButton: PublishButton,
    PublishProgress: PublishProgress, PublishConfirm: PublishConfirm, RemotePublish: RemotePublish, PublishedTV: PublishedTV, PublishedPhone: PublishedPhone, PublishHistory: PublishHistory, SecondPublish: SecondPublish,
    SectionList: SectionList, SectionBody: SectionBody, SourcesPanel: SourcesPanel, SignOffBar: SignOffBar, ExportPanel: ExportPanel, WordPreview: WordPreview,
    VisibilityPlan: VisibilityPlan, CheckInEmail: CheckInEmail, CheckInPhone: CheckInPhone, CheckInResults: CheckInResults, ShareLinks: ShareLinks, ReadOnlyCopy: ReadOnlyCopy, ANS: ANS
  };
})();
