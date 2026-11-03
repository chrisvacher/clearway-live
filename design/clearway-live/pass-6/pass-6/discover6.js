/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 6 · discover6.js
   window.ClearwayLivePass6: the milestone 6 components, named as in code.
   Survey (read from Team Hub): SurveyLink, ResponseCount, QuestionResult, SegmentFilter,
   DuplicateFlag, SurveyResultScreen (TV, phone, control).
   Themes: DiscoverTheme, ThemeList, ThinFlag, NotesUpload.
   Four Helpful Lists: FourListsBoard (TV), FourListsCard, FourListsComposer (phone).
   What We Heard: WhatWeHeardHeadline.
   The alignment signal: SignalCard, SignalDetail, SignalPanel (control), SignalList (remote).
   Rules kept in code here: the app never writes to Team Hub and never shows an email; segments
   under 5 respondents are never drawn; the thin data rule is code (D.isThin); signal markup only
   renders on data-surface="control" (the facilitator's own control surface and remote).
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P3 = window.ClearwayLivePass3, P4 = window.ClearwayLivePass4, D = window.ClearwayLivePass6Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide, B = P4.B, CHIP = P4.CHIP, BAN = P4.BAN, SB = P4.SB, IB = P4.IB;
  function ms(n) { return CL.ms(n); }

  /* ---------- Markers that read without color ---------- */
  /* ThinFlag: a dashed outline, the circle-dashed icon, the words "Thin data" and the reason. */
  function ThinFlag(reason, o) {
    o = o || {};
    if (o.surface === "tv" || o.surface === "phone") return '<span class="cwl-marker cwl-d6-thin-tv" role="note">' + L("circle-dashed") + " Thin data" + (reason && o.reason !== false ? '<span class="r"> · ' + esc(reason) + "</span>" : "") + "</span>";
    return '<span class="cwl-d6-thin" role="note" title="Thin data: rests on fewer than 10 responses, under 10 percent of respondents, or one interview">' + L("circle-dashed") + "<b>Thin data</b>" + (reason ? "<span>" + esc(reason) + "</span>" : "") + "</span>";
  }
  function AIDrafted() { return '<span class="cwl-d6-ai">' + CL.aiBadge() + "<span>AI drafted</span></span>"; }
  var SRC = { survey: ["clipboard-list", "Survey"], interviews: ["mic", "Interviews"], lists: ["columns-4", "Four Helpful Lists"], board: ["users", "Elders conversation"], staff: ["briefcase", "Staff conversation"] };
  function srcChip(k, text, count) { var s = SRC[k] || SRC.survey; return '<span class="cwl-d6-src">' + L(s[0]) + "<span>" + esc(text || s[1]) + "</span>" + (count ? "<b>" + esc(count) + "</b>" : "") + "</span>"; }
  /* Leaving the app: an outbound link always names the host */
  function teamHubBtn(label, cls) { return '<a class="cwl-a-btn ' + (cls || "is-secondary") + ' cwl-d6-out" href="#" tabindex="-1" role="button">' + L("external-link") + "<span>" + esc(label || "Open in Team Hub") + '</span><small>' + esc(D.teamHub) + "</small></a>"; }

  /* Rolling numbers move with the bars (cwl-dur-bar-grow, signature), never jump */
  function roll(el, to, fmt, o) {
    o = o || {}; fmt = fmt || function (n) { return Math.round(n); };
    var from = parseFloat(el.getAttribute("data-n")); if (isNaN(from)) from = to;
    el.setAttribute("data-n", to);
    if (o.instant || CL.reduced(el) || from === to) { el.textContent = fmt(to); return; }
    var d = ms("cwl-dur-bar-grow"), t0 = performance.now();
    (function step(t) { var k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); })(t0);
  }

  /* ================================================================
     SurveyLink · SET-04. The linked Team Hub survey. Team Hub builds, publishes, closes and
     hosts it; Clearway Live only reads it. st: none | pick | draft | open | closed | email | csv | unreachable
     ================================================================ */
  function statusChip(st) {
    if (st === "draft") return CHIP("Draft in Team Hub", "run-draft", "pencil-line");
    if (st === "closed") return CHIP("Closed " + D.survey.closes, "run-done", "lock");
    if (st === "csv") return CHIP("Imported from CSV", "is-outline", "file-spreadsheet");
    return CHIP("Open · closes " + D.survey.closes, "run-ready", "circle-dot");
  }
  function SurveyLink(st, o) {
    o = o || {};
    var S = D.survey;
    if (st === "none" || st === "pick") {
      var list = st === "pick" ? '<div class="cwl-a-list">' + D.otherSurveys.map(function (s, i) { return '<label class="cwl-a-li' + (i === 0 ? " is-current" : "") + '"><input type="radio" name="d6pick" tabindex="-1"' + (i === 0 ? " checked" : "") + '><span class="grow"><b class="cwl-a-label">' + esc(s.title) + '</b><br><span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);font-weight:600">' + esc(s.status === "draft" ? "Draft" : "Open") + " · " + s.responses + " responses · " + esc(s.closes) + "</span></span></label>"; }).join("") + "</div>" : "";
      return '<section class="cwl-a-card cwl-d6-link is-empty"><div class="cwl-d6-link-head"><span class="cwl-d6-ic">' + L("clipboard-list") + '</span><div class="grow"><div class="cwl-a-section">' + (st === "pick" ? "Link a Team Hub survey" : "No survey linked yet") + "</div>" +
        '<p class="cwl-a-muted cwl-d6-p">' + (st === "pick" ? "Surveys linked to this engagement in Team Hub. The app reads its questions and responses and never changes them." : "Build the congregational survey in Team Hub from the Wayfinding template and link it to this engagement there. It shows up here to link.") + "</p></div></div>" + list +
        '<div class="cwl-a-row">' + (st === "pick" ? B("Link this survey", "is-primary", "link") + B("Cancel", "is-ghost") : teamHubBtn("Open in Team Hub to create it", "is-primary") + B("Link a survey", "is-secondary", "link") + B("Import a CSV", "is-ghost", "upload")) + "</div></section>";
    }
    if (st === "csv") {
      var c = D.csv;
      return '<section class="cwl-a-card cwl-d6-link"><div class="cwl-d6-link-head"><span class="cwl-d6-ic">' + L("file-spreadsheet") + '</span><div class="grow"><div class="cwl-a-row" style="gap:10px"><div class="cwl-a-section">' + esc(c.file) + "</div>" + statusChip("csv") + "</div>" +
        '<p class="cwl-a-muted cwl-d6-p">A survey run outside Team Hub. ' + c.rows + " rows, " + c.matched + " of " + c.columns + " columns matched to questions. Imported " + esc(c.importedAt) + ".</p></div></div>" +
        '<div class="cwl-d6-kv"><span>Not matched</span><b>' + c.unmatched.map(esc).join(", ") + ' <span class="cwl-a-muted">(kept out of the results)</span></b><span>About you</span><b>Age band, years attending and involvement matched for segments</b></div>' +
        '<div class="cwl-a-row">' + B("Replace the file", "is-secondary", "upload") + B("Link a Team Hub survey instead", "is-ghost", "link") + "</div></section>";
    }
    var draft = st === "draft", closed = st === "closed";
    var link = draft ? '<div class="cwl-d6-share is-none"><span class="cwl-a-muted">The link and QR code appear when the survey is published in Team Hub.</span></div>' :
      '<div class="cwl-d6-share"><div class="cwl-d6-qr" data-qr="https://' + esc(D.surveyUrl()) + '" aria-label="QR code for the survey"></div><div class="grow" style="min-width:0;display:flex;flex-direction:column;gap:8px"><label class="cwl-a-flabel">' + (closed ? "Survey link (closed)" : "Open link for the congregation · no sign-in") + '</label><div class="cwl-a-row" style="flex-wrap:nowrap"><input class="cwl-a-input" readonly tabindex="-1" value="' + esc(D.surveyUrl()) + '"' + (closed ? " disabled" : "") + ">" + B("Copy link", "is-secondary", "copy", closed ? " disabled" : "") + "</div>" +
      '<div class="cwl-a-row">' + SB("Download QR code", "download") + '<span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);font-weight:600">' + (closed ? "Team Hub shows a closed message on this page." : "Hosted by Team Hub. The answering page isn't part of Clearway Live.") + "</span></div></div></div>";
    var banner = "";
    if (st === "email") banner = BAN("warning", "triangle-alert", "<strong>This survey collects email in Team Hub.</strong> Clearway Live never shows an email, and themes never carry one. For fully anonymous answers, turn off email collection in Team Hub before more responses arrive.");
    if (st === "unreachable") banner = BAN("warning", "cloud-off", "<strong>Team Hub can't be reached right now.</strong> Showing what was read at " + esc(S.lastRead) + " " + esc(S.lastReadDay) + ". Nothing is lost. Refresh again in a minute.");
    var locked = draft ? '<span class="cwl-d6-lockline">' + L("pencil-line") + "Questions can still change in Team Hub</span>" : '<span class="cwl-d6-lockline">' + L("lock") + "Questions locked since " + esc(S.lockedAt) + ". Team Hub locks them at the first response.</span>";
    return '<section class="cwl-a-card cwl-d6-link"><div class="cwl-d6-link-head"><span class="cwl-d6-ic">' + L("clipboard-list") + '</span><div class="grow" style="min-width:0"><div class="cwl-a-row" style="gap:10px"><div class="cwl-a-section cwl-a-trunc">' + esc(S.title) + "</div>" + statusChip(st === "email" || st === "unreachable" ? "open" : st) + "</div>" +
      '<p class="cwl-a-muted cwl-d6-p">From the ' + esc(S.template) + " template · " + D.questions.length + " questions · " + (draft ? "not published yet" : "opened " + esc(S.opened)) + "</p>" + locked + "</div></div>" + banner + link +
      '<div class="cwl-a-row">' + teamHubBtn(draft ? "Open in Team Hub to publish" : closed ? "Open in Team Hub" : "Open in Team Hub", draft ? "is-primary" : "is-secondary") + B("Unlink", "is-ghost", "unlink") + '<span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);font-weight:600;margin-left:auto">Read only. Build, publish and close happen in Team Hub.</span></div></section>';
  }
  function drawQR(root) { (root || document).querySelectorAll(".cwl-d6-qr[data-qr]").forEach(function (el) { if (!el.firstChild) CL.qr(el, el.getAttribute("data-qr")); }); }

  /* ================================================================
     ResponseCount · SET-04. Counted by the app each time it reads Team Hub: when SET-04 opens
     and on Refresh. No live count. A refresh that brings new responses rolls the number up.
     ================================================================ */
  function ResponseCount(host) {
    var el = this.el = h("div", "cwl-d6-count"); host.appendChild(el);
    el.innerHTML = '<div class="n-wrap"><span class="n" data-n="0">0</span><span class="u">responses</span><span class="delta"></span></div><div class="meta"><span class="read"></span><span class="b"></span></div>';
    this.n = el.querySelector(".n"); this.read = el.querySelector(".read"); this.b = el.querySelector(".b"); this.delta = el.querySelector(".delta");
  }
  /* o: {read, refreshing, unreachable, csv, closed, instant, under30} */
  ResponseCount.prototype.set = function (n, o) {
    o = o || {};
    var prev = parseFloat(this.n.getAttribute("data-n")) || 0;
    roll(this.n, n, null, { instant: o.instant });
    this.el.querySelector(".u").textContent = n === 1 ? "response" : "responses";
    var d = n - prev;
    this.delta.textContent = !o.instant && d > 0 ? "+" + d + " since the last read" : "";
    this.delta.classList.toggle("is-on", !o.instant && d > 0);
    this.read.innerHTML = o.csv ? L("file-spreadsheet") + "From the CSV import" : o.unreachable ? L("cloud-off") + "Last read " + esc(o.read || D.survey.lastRead) + ". Team Hub can't be reached" : o.refreshing ? '<span class="cwl-a-spin"></span>Reading Team Hub' : L("refresh-cw") + "Read from Team Hub at " + esc(o.read || D.survey.lastRead);
    this.b.innerHTML = o.csv ? "" : B(o.refreshing ? "Reading" : "Refresh", "is-secondary is-sm", "refresh-cw", o.refreshing ? " disabled" : "");
    CL.icons();
  };

  /* ================================================================
     QuestionResult · SET-04 results. One question's results, in the survey's own option order
     (so nothing jumps): bars for single and multiple choice and dropdown, a distribution for
     scale, eNPS and slider, a count for date and PDF upload, themes for open text.
     ================================================================ */
  var TYPE = { linear_scale: "1 to 5 scale", single_choice: "Single choice", multi_choice: "Multiple choice", long_text: "Long text", short_text: "Short text", dropdown: "Dropdown", enps: "eNPS, 0 to 10", slider: "Slider", date: "Date", pdf_upload: "PDF upload" };
  var TYPE_ICON = { linear_scale: "gauge", single_choice: "circle-dot", multi_choice: "square-check", long_text: "align-left", short_text: "text-cursor-input", dropdown: "chevron-down", enps: "gauge", slider: "sliders-horizontal", date: "calendar", pdf_upload: "file-up" };
  function QuestionResult(host) {
    var el = this.el = h("section", "cwl-d6-qr-res"); host.appendChild(el);
    el.innerHTML = '<header class="hd"><div class="t"><div class="cwl-a-eyebrow ty"></div><div class="cwl-a-section tt"></div></div><div class="ans"></div></header><div class="note"></div><div class="body"></div>';
    this.body = el.querySelector(".body"); this.kind = null;
  }
  /* d: {counts, n (respondents), answered, segment, instant, thin} */
  QuestionResult.prototype.set = function (q, d) {
    d = d || {};
    var el = this.el, kind = q.type, self = this;
    el.querySelector(".ty").innerHTML = L(TYPE_ICON[kind] || "circle") + " " + esc(TYPE[kind] || kind) + (q.sec ? " · " + esc(q.sec) : "");
    el.querySelector(".tt").textContent = q.title;
    var answered = d.answered != null ? d.answered : q.answered != null ? q.answered : (q.counts ? (kind === "multi_choice" ? d.n || D.survey.responses : q.counts.reduce(function (a, b) { return a + b; }, 0)) : 0);
    el.querySelector(".ans").innerHTML = '<b class="tnum">' + answered + "</b> answered" + (d.segment ? '<span class="cwl-a-muted"> · ' + esc(d.segment) + "</span>" : "");
    el.querySelector(".note").innerHTML = d.thin ? ThinFlag(d.thin) : "";
    var sig = kind + "|" + q.id;
    if (this.sig !== sig) { this.body.innerHTML = ""; this.sig = sig; this.first = true; }
    var counts = d.counts || q.counts;
    if (kind === "single_choice" || kind === "multi_choice" || kind === "dropdown") this.bars(q.options, counts, kind === "multi_choice" ? (d.n || D.survey.responses) : null, d);
    else if (kind === "linear_scale" || kind === "enps" || kind === "slider") this.dist(q, counts, d);
    else if (kind === "date" || kind === "pdf_upload") this.body.innerHTML = '<div class="cwl-d6-only"><b class="tnum">' + answered + "</b><span>" + (kind === "date" ? "people gave a date. Dates are listed in Team Hub, not charted here." : "people uploaded a file. Files stay in Team Hub and never reach the room.") + "</span></div>";
    CL.icons();
    this.first = false;
  };
  QuestionResult.prototype.bars = function (opts, counts, people, d) {
    var total = people || counts.reduce(function (a, b) { return a + b; }, 0), max = Math.max.apply(null, counts.concat([1])), body = this.body, inst = d.instant || this.first;
    if (!body.firstChild) body.innerHTML = '<div class="cwl-d6-bars">' + opts.map(function (o, i) { return '<div class="r" data-i="' + i + '"><span class="l">' + esc(o) + '</span><span class="tr"><i style="width:0%"></i></span><span class="v"><b class="tnum" data-n="0">0</b><small></small></span></div>'; }).join("") + "</div>" + (people ? '<div class="cwl-d6-foot">Pick all that apply, so shares are of the ' + total + " people who answered.</div>" : "");
    body.querySelectorAll(".r").forEach(function (r, i) {
      var c = counts[i] || 0, bar = r.querySelector("i");
      if (inst) { bar.style.transition = "none"; }
      bar.style.width = (c / max * 100).toFixed(2) + "%";
      if (inst) { void bar.offsetWidth; bar.style.transition = ""; }
      roll(r.querySelector("b"), c, null, { instant: inst });
      r.querySelector("small").textContent = D.pct(c, total) + "%";
    });
  };
  QuestionResult.prototype.dist = function (q, counts, d) {
    var body = this.body, inst = d.instant || this.first, n = counts.reduce(function (a, b) { return a + b; }, 0), max = Math.max.apply(null, counts.concat([1]));
    var labels = q.type === "enps" ? counts.map(function (c, i) { return String(i); }) : q.type === "slider" ? q.buckets : counts.map(function (c, i) { return String(i + (q.min || 1)); });
    if (!body.firstChild) body.innerHTML = '<div class="cwl-d6-dist"><div class="avg"><b class="tnum" data-n="0">0</b><span></span></div><div class="cols">' + labels.map(function (lb) { return '<div class="c"><span class="v tnum" data-n="0">0</span><i style="height:0%"></i><span class="x">' + esc(lb) + "</span></div>"; }).join("") + "</div></div>" +
      (q.lo ? '<div class="cwl-d6-ends"><span>1 · ' + esc(q.lo) + "</span><span>" + q.max + " · " + esc(q.hi) + "</span></div>" : q.type === "enps" ? '<div class="cwl-d6-ends"><span>0 · Not at all likely</span><span>10 · Extremely likely</span></div>' : "");
    body.querySelectorAll(".c").forEach(function (c, i) {
      var bar = c.querySelector("i");
      if (inst) bar.style.transition = "none";
      bar.style.height = ((counts[i] || 0) / max * 100).toFixed(2) + "%";
      if (inst) { void bar.offsetWidth; bar.style.transition = ""; }
      roll(c.querySelector(".v"), counts[i] || 0, null, { instant: inst });
    });
    var avgEl = body.querySelector(".avg b"), lab = body.querySelector(".avg span");
    if (q.type === "enps") {
      var pro = (counts[9] || 0) + (counts[10] || 0), det = counts.slice(0, 7).reduce(function (a, b) { return a + b; }, 0), score = n ? Math.round((pro - det) / n * 100) : 0;
      roll(avgEl, score, function (x) { return (x > 0 ? "+" : "") + Math.round(x); }, { instant: inst }); lab.textContent = "eNPS from " + n + " answers";
    } else if (q.type === "slider") {
      var mids = [10, 30, 50, 70, 90], s = counts.reduce(function (a, c, i) { return a + c * mids[i]; }, 0);
      roll(avgEl, n ? s / n : 0, function (x) { return Math.round(x); }, { instant: inst }); lab.textContent = "average of " + n;
    } else {
      var sum = counts.reduce(function (a, c, i) { return a + c * (i + (q.min || 1)); }, 0);
      roll(avgEl, n ? sum / n : 0, function (x) { return x.toFixed(1); }, { instant: inst }); lab.textContent = "average of " + n;
    }
  };

  /* ================================================================
     DiscoverTheme · one theme. ThemeList · the keyed list: counts roll, bars grow, themes trade
     places by count (FLIP), a merge glides one theme into another, a reject leaves and the
     list closes up.
     t: {id, label, n, of, kind: survey|interviews, state: draft|accepted|renamed, renamedFrom,
         merged, quotes, src (chip text), also[]}
     ================================================================ */
  function themeCount(t) { return t.kind === "interviews" ? t.n + " of " + t.of + " interviews" : t.n + " of " + t.of; }
  function DiscoverTheme(t, o) {
    o = o || {};
    var thin = t.kind === "interviews" ? D.isThin(t.n, t.of, "interviews") : D.isThin(t.n, t.of);
    var thinWhy = t.kind === "interviews" ? "one interview" : t.n + " of " + t.of + " respondents";
    var st = t.state || "draft", accepted = st === "accepted";
    var srcs = (t.kind === "interviews" ? srcChip("interviews", "Interviews", t.n + " of " + t.of) : srcChip(t.srcKey || "survey", t.src || "Survey")) + (t.also || []).map(function (k) { return srcChip(k); }).join("");
    var acts = o.actions === false ? "" : accepted ? '<div class="acts">' + CHIP("Accepted", "is-success", "check") + SB("Undo", "undo-2", "is-ghost") + "</div>" :
      '<div class="acts">' + B("Accept", "is-primary is-sm", "check") + SB("Rename", "pencil") + SB("Merge", "merge") + SB("Reject", "x", "is-ghost") + "</div>";
    return '<article class="cwl-d6-theme' + (accepted ? " is-accepted" : "") + (thin ? " is-thin" : "") + (o.target ? " is-target" : "") + '" aria-label="' + esc(t.label) + '">' +
      '<div class="top"><div class="lb"><b class="label" data-text="' + esc(t.label) + '">' + esc(t.label) + "</b>" + (t.renamedFrom ? '<span class="was">' + L("pencil") + "Renamed from " + esc(t.renamedFrom) + "</span>" : "") + (t.merged ? '<span class="was">' + L("merge") + "Merged from " + t.merged + " themes</span>" : "") + "</div>" +
      '<div class="rest"><b class="tnum cnt" data-n="' + t.n + '">' + t.n + '</b><span>' + (t.kind === "interviews" ? "of " + t.of + " interviews" : "of " + t.of) + "</span></div></div>" +
      (t.kind === "interviews" ? "" : '<div class="tr"><i style="width:' + (t.n / t.of * 100).toFixed(2) + '%"></i></div>') +
      '<div class="meta">' + srcs + (st === "draft" || t.ai ? AIDrafted() : "") + (thin ? ThinFlag(thinWhy) : "") + "</div>" +
      (t.quotes && t.quotes.length && o.quotes !== false ? '<ul class="qs">' + t.quotes.slice(0, o.quoteMax || 2).map(function (x) { return "<li>“" + esc(x) + "”</li>"; }).join("") + "</ul>" : "") +
      acts + "</article>";
  }
  function ThemeList(host, o) {
    this.o = o || {};
    this.el = h("div", "cwl-d6-themes"); host.appendChild(this.el);
    this.foot = h("div", "cwl-d6-foot"); host.appendChild(this.foot);
  }
  /* list: themes (sorted here by count). o: {instant, foot} */
  ThemeList.prototype.set = function (list, o) {
    o = o || {};
    var self = this, sorted = list.slice().sort(function (a, b) { return b.n - a.n || (a.order || 0) - (b.order || 0); });
    P4.keyed(this.el, sorted.map(function (t) { return { k: t.id, t: t }; }), function () { return h("div", "cwl-d6-slot"); }, function (slot, it) {
      var t = it.t, sig = [t.label, t.state, t.renamedFrom, t.merged, t.of, (t.quotes || []).length, t.ai, self.o.quotes].join("|");
      if (slot.getAttribute("data-sig") !== sig) {
        var old = slot.querySelector(".cnt"), prevN = old ? parseFloat(old.getAttribute("data-n")) : null, oldLabel = slot.querySelector(".label");
        var prevText = oldLabel ? oldLabel.getAttribute("data-text") : null;
        slot.innerHTML = DiscoverTheme(t, self.o); slot.setAttribute("data-sig", sig);
        var cnt = slot.querySelector(".cnt"); if (cnt && prevN != null && !isNaN(prevN)) { cnt.setAttribute("data-n", prevN); roll(cnt, t.n, null, { instant: o.instant }); }
        var lab = slot.querySelector(".label"); if (lab && prevText && prevText !== t.label && !o.instant) { lab.setAttribute("data-text", prevText); lab.textContent = prevText; P4.replaceText(lab, t.label); }
      } else {
        var c = slot.querySelector(".cnt"); if (c) roll(c, t.n, null, { instant: o.instant });
        var bar = slot.querySelector(".tr i"); if (bar) bar.style.width = (t.n / t.of * 100).toFixed(2) + "%";
      }
    }, { instant: o.instant });
    this.foot.innerHTML = o.foot || "";
    CL.icons();
  };
  /* Merge: `from` glides into `into` while it fades (cwl-dur-regroup, calm), then the counts add */
  ThemeList.prototype.merge = function (fromId, intoId, next, o) {
    var self = this, from = this.el.querySelector('[data-k="' + fromId + '"]'), into = this.el.querySelector('[data-k="' + intoId + '"]');
    if (!from || !into || CL.reduced(this.el)) { this.set(next, o); return; }
    var a = from.getBoundingClientRect(), b = into.getBoundingClientRect(), scale = this.el.getBoundingClientRect().width / (this.el.offsetWidth || 1) || 1;
    into.classList.add("is-receiving");
    from.classList.add("is-leaving");
    from.animate([{ transform: "none", opacity: 1 }, { transform: "translate(0," + ((b.top - a.top) / scale) + "px) scale(0.96)", opacity: 0 }], { duration: ms("cwl-dur-regroup"), easing: CL.v("cwl-ease-calm"), fill: "forwards" }).onfinish = function () {
      CL.flip(self.el, function () { from.remove(); }, { selector: ":scope > [data-k]:not(.is-leaving)" });
      into.classList.remove("is-receiving");
      self.set(next, o);
    };
  };

  /* ================================================================
     SegmentFilter · SET-04 results. Segments come from the About you section. A segment under 5
     respondents is never drawn: it shows as hidden, with the reason. Thin segments are flagged.
     ================================================================ */
  function SegmentFilter(o) {
    o = o || {};
    var groups = D.questions.filter(function (q) { return q.seg; });
    return '<section class="cwl-a-card cwl-d6-seg"><div class="cwl-a-row" style="justify-content:space-between"><div class="cwl-a-label">' + L("filter") + " Segments</div><button type=\"button\" class=\"cwl-a-tag\" tabindex=\"-1\" aria-pressed=\"" + !o.selected + "\">" + (o.selected ? L("x") + "Clear" : "Everyone") + "</button></div><div class=\"cwl-a-muted\" style=\"font-size:var(--cwl-fs-app-micro);font-weight:600;margin-top:-6px\">From the About you section</div>" +
      groups.map(function (q) {
        var tot = q.type === "multi_choice" ? D.survey.responses : q.counts.reduce(function (a, b) { return a + b; }, 0);
        return '<div class="g"><div class="gh">' + esc(q.segName) + "</div><div class=\"chips\">" +
          q.options.map(function (op, i) {
            var n = q.counts[i];
            if (n < D.HIDE_UNDER) return '<span class="cwl-d6-hidden" title="Hidden so a small group can\'t be identified">' + L("eye-off") + esc(op) + "<small>hidden</small></span>";
            var thin = D.isThin(n, tot), on = o.selected && o.selected.g === q.seg && o.selected.i === i;
            return '<button type="button" class="cwl-a-tag' + (thin ? " is-thin" : "") + '" aria-pressed="' + !!on + '" tabindex="-1">' + esc(op) + '<span class="cwl-a-count">' + n + "</span>" + (thin ? L("circle-dashed") : "") + "</button>";
          }).join("") + "</div></div>";
      }).join("") +
      (D.noLocation ? '<div class="g"><div class="gh">Location</div><div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);font-weight:600">Not in this survey. Riverside meets in one place.</div></div>' : "") +
      '<div class="cwl-d6-note">' + L("eye-off") + "<span>Segments with fewer than " + D.HIDE_UNDER + " respondents are hidden so small groups can't be identified. " + L("circle-dashed") + " marks a thin segment.</span></div></section>";
  }

  /* DuplicateFlag · possible duplicates with what matched. Never blocks, never removes. */
  function DuplicateFlag(list, o) {
    o = o || {};
    if (!list.length) return '<section class="cwl-a-card cwl-d6-dup"><div class="cwl-a-label">' + L("copy") + " Possible duplicates</div><div class=\"cwl-a-muted\" style=\"font-size:var(--cwl-fs-app-table)\">None flagged.</div></section>";
    return '<section class="cwl-a-card cwl-d6-dup"><div class="cwl-a-row" style="justify-content:space-between"><div class="cwl-a-label">' + L("copy") + " " + list.length + " possible duplicates</div>" + CHIP("All kept in the results", "is-outline", "check") + "</div>" +
      list.map(function (d) {
        return '<div class="r"><div class="t"><b>Responses ' + d.a + " and " + d.b + "</b><span>" + (d.network ? "Same network, " : "") + esc(d.gap) + ", the same answers to " + (d.same === d.of ? "all " + d.of : d.same + " of " + d.of) + " questions</span></div>" + (o.checked && o.checked.indexOf(d.id) >= 0 ? CHIP("Checked", "is-success", "check") : SB("Mark as checked", "check")) + "</div>";
      }).join("") +
      '<div class="cwl-d6-note">' + L("wifi") + "<span>" + D.sameNetwork + " responses share a network with another, which is normal on church wifi. Only near-identical answers from one network are flagged. Nothing is ever blocked or removed.</span></div></section>";
  }

  /* ================================================================
     NotesUpload · SET-06. Paste, Word, PDF or text. Each file's state and which conversation it is.
     files: [{id, name, kind, state: uploading|reading|read|unreadable, words, progress, reason}]
     ================================================================ */
  function NotesUpload(files, o) {
    o = o || {};
    var rows = files.map(function (f) {
      var st = f.state === "uploading" ? '<span class="st"><span class="cwl-progress" role="progressbar" aria-valuenow="' + (f.progress || 40) + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + (f.progress || 40) + '%"></i></span>Uploading</span>' :
        f.state === "reading" ? '<span class="st"><span class="cwl-a-spin"></span>Reading</span>' :
        f.state === "unreadable" ? '<span class="st is-err">' + L("circle-alert") + "Couldn't read it</span>" :
        '<span class="st">' + L("check") + f.words.toLocaleString("en-CA") + " words</span>";
      return '<div class="cwl-d6-file' + (f.state === "unreadable" ? " is-err" : "") + '"><span class="fi">' + L(/\.pdf$/.test(f.name) ? "file-text" : /\.docx$/.test(f.name) ? "file-type" : /pasted/.test(f.name) ? "clipboard-paste" : "file") + '</span><div class="t"><b class="cwl-a-trunc" title="' + esc(f.name) + '">' + esc(f.name) + "</b>" +
        '<span class="cwl-a-select is-sm"><select tabindex="-1" aria-label="Which conversation">' + ["interview", "board", "staff"].map(function (k) { return "<option" + (k === f.kind ? " selected" : "") + ">" + esc(D.kinds[k]) + "</option>"; }).join("") + "</select>" + L("chevron-down") + "</span>" +
        (f.state === "unreadable" ? '<span class="why">' + esc(f.reason) + "</span>" : "") + "</div>" + st + "</div>";
    }).join("");
    var count = files.filter(function (f) { return f.kind === "interview" && f.state === "read"; }).length;
    return '<section class="cwl-d6-notes"><div class="cwl-d6-drop">' + L("upload") + '<div><b>Drop notes or transcripts here</b><span>Word, PDF or text. Or paste them.</span></div>' + B("Paste notes", "is-secondary is-sm", "clipboard-paste") + "</div>" +
      '<div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-label">' + count + (count === 1 ? " interview" : " interviews") + " and " + files.filter(function (f) { return f.kind !== "interview" && f.state === "read"; }).length + " input conversations</span></div>" +
      '<div class="cwl-d6-files">' + rows + "</div>" +
      '<div class="cwl-d6-note">' + L("lock") + "<span>Notes stay with Clearway. Only themes without names reach the report or the room.</span></div></section>";
  }

  /* ================================================================
     FOUR HELPFUL LISTS · INT-11
     FourListsCard: the text, its column and its agreement count. The four columns are told apart
     by heading and position, never color.
     ================================================================ */
  function colOf(k) { for (var i = 0; i < D.cols.length; i++) if (D.cols[i].key === k) return D.cols[i]; return D.cols[0]; }
  function FourListsCard(c, o) {
    o = o || {};
    var ag = c.agree || 0;
    return '<div class="cwl-card is-compact cwl-fl-card' + (o.newest ? " is-newest" : "") + '"><span class="tx">' + esc(c.text) + '</span><span class="ft">' + (c.folded ? '<span class="cwl-fl-ai">' + CL.aiBadge() + "<span>" + (c.folded + 1) + "</span></span>" : "") + '<span class="cwl-fl-agree' + (ag ? "" : " is-zero") + '" aria-label="' + ag + ' agree">' + L("arrow-up") + '<b class="tnum" data-n="' + ag + '">' + ag + "</b></span></span></div>";
  }
  function FourListsBoard(host, o) {
    this.o = o || {};
    var el = this.el = h("div", "cwl-fl-board"); host.appendChild(el);
    el.innerHTML = D.cols.map(function (c, i) { return '<section class="cwl-fl-col" data-col="' + c.key + '" aria-label="' + esc(c.q) + '"><header><span class="ix">' + (i + 1) + '</span><span class="q">' + esc(c.q) + '</span><span class="n tnum"></span></header><div class="cwl-fl-list"></div><div class="cwl-fl-more"></div></section>'; }).join("");
  }
  /* cards: [{id, col, text, agree, folded}]. o: {instant, newest, max} */
  FourListsBoard.prototype.set = function (cards, o) {
    o = o || {};
    var self = this, max = o.max || this.o.max || 5;
    D.cols.forEach(function (c) {
      var sec = self.el.querySelector('[data-col="' + c.key + '"]'), list = sec.querySelector(".cwl-fl-list");
      var mine = cards.filter(function (x) { return x.col === c.key; }).sort(function (a, b) { return (b.agree || 0) - (a.agree || 0) || (a.t || 0) - (b.t || 0); });
      var shown = mine.slice(0, max);
      P4.keyed(list, shown.map(function (x) { return { k: x.id, c: x }; }), function () { return h("div", "cwl-fl-slot"); }, function (slot, it) {
        var x = it.c, sig = x.text + "|" + (x.folded || 0) + "|" + (o.newest === x.id);
        if (slot.getAttribute("data-sig") !== sig) {
          var old = slot.querySelector(".cwl-fl-agree b"), prev = old ? parseFloat(old.getAttribute("data-n")) : null;
          slot.innerHTML = FourListsCard(x, { newest: o.newest === x.id }); slot.setAttribute("data-sig", sig);
          var nb = slot.querySelector(".cwl-fl-agree b"); if (prev != null && !isNaN(prev)) { nb.setAttribute("data-n", prev); CL.countTo(nb, x.agree || 0); }
        } else {
          var b = slot.querySelector(".cwl-fl-agree b"), was = parseFloat(b.getAttribute("data-n"));
          if (was !== (x.agree || 0)) { CL.countTo(b, x.agree || 0); slot.querySelector(".cwl-fl-agree").classList.toggle("is-zero", !x.agree); if (!o.instant && !CL.reduced(slot)) slot.firstChild.animate([{ transform: "scale(1)" }, { transform: "scale(1.04)" }, { transform: "scale(1)" }], { duration: ms("cwl-dur-swell"), easing: CL.v("cwl-ease-signature") }); }
        }
      }, { instant: o.instant });
      sec.querySelector(".n").textContent = mine.length ? mine.length : "";
      sec.querySelector(".cwl-fl-more").textContent = mine.length > max ? "+ " + (mine.length - max) + " more on phones" : "";
      sec.classList.toggle("is-empty", !mine.length);
    });
    if (o.newest && this.o.shell) { var n = this.el.querySelector('[data-k="' + o.newest + '"] .cwl-fl-card'); if (n) this.o.shell.moment(n, "is-newest"); }
    CL.icons();
  };
  /* A similar card slides into its survivor and becomes one card; the count adds */
  FourListsBoard.prototype.fold = function (fromId, intoId, next, o) {
    o = o || {};
    var self = this, from = this.el.querySelector('[data-k="' + fromId + '"]'), into = this.el.querySelector('[data-k="' + intoId + '"]');
    if (!from || !into || CL.reduced(this.el)) { this.set(next, o); return; }
    var a = from.getBoundingClientRect(), b = into.getBoundingClientRect(), scale = this.el.getBoundingClientRect().width / (this.el.offsetWidth || 1) || 1;
    from.classList.add("is-leaving");
    from.animate([{ transform: "none", opacity: 1 }, { transform: "translate(" + ((b.left - a.left) / scale) + "px," + ((b.top - a.top) / scale) + "px) scale(0.9)", opacity: 0 }], { duration: ms("cwl-dur-regroup"), easing: CL.v("cwl-ease-calm"), fill: "forwards" }).onfinish = function () {
      var list = from.parentNode; CL.flip(list, function () { from.remove(); }, { selector: ":scope > [data-k]:not(.is-leaving)" });
      self.set(next, o);
    };
  };

  /* FourListsComposer · phone. Pick a column, write a card, send; then agree with others' cards with one tap.
     o: {col, text, sent, agreed:[ids], cards, down, offline, look} */
  function FourListsComposer(ph, o) {
    o = o || {};
    var col = o.col || "missing", P = P4.PH;
    var pick = '<div class="cwl-fl-pick" role="radiogroup" aria-label="Which list">' + D.cols.map(function (c) { var on = c.key === col; return '<span role="radio" aria-checked="' + on + '" class="' + (on ? "is-on" : "") + '">' + (on ? L("check") : "") + esc(c.q) + "</span>"; }).join("") + "</div>";
    var others = (o.cards || []).filter(function (c) { return o.allCols || c.col === col; }).slice(0, o.max || 3);
    var agree = others.length ? '<div class="cwl-ph-muted" style="margin-top:4px">Agree with others · ' + esc(colOf(col).q) + '</div><div class="cwl-fl-agrees">' + others.map(function (c) { var on = (o.agreed || []).indexOf(c.id) >= 0; return '<div class="cwl-fl-arow' + (on ? " is-on" : "") + '"><span>' + esc(c.text) + '</span><span class="b" role="button" aria-pressed="' + on + '">' + L(on ? "check" : "arrow-up") + (on ? "Agreed" : "Agree") + "</span></div>"; }).join("") + "</div>" : "";
    if (o.down) { ph.body.innerHTML = '<div class="cwl-ph-prompt">Four Helpful Lists</div>' + P.down() + (o.sent ? P.sent(o.sent, "sent") : ""); ph.foot.innerHTML = ""; CL.icons(); return; }
    ph.body.innerHTML = '<div class="cwl-ph-prompt">Add to a list</div>' + pick + P.input(o.text || "", "One thing, a few words", 2) + (o.sent ? P.sent(o.sent, o.offline ? "saved" : "sent") : "") + agree + P.anon();
    ph.foot.innerHTML = P.btn("Send");
    CL.icons();
  }

  /* ================================================================
     WhatWeHeardHeadline · a headline built from accepted themes, with source chips, counts and
     the thin flag. Extends the pass 4 HeadlineDepth. o.surface: setup (row) | tv | phone
     ================================================================ */
  function WhatWeHeardHeadline(hd, o) {
    o = o || {};
    var chips = hd.src.map(function (s) { return srcChip(s.k, s.t, s.c); }).join("");
    if (o.surface === "phone") return '<div class="cwl-ph-headline">' + esc(hd.plain) + "</div>" + (hd.thin ? "<div>" + ThinFlag(hd.thin, { surface: "phone", reason: false }) + "</div>" : "") + '<div class="cwl-ph-text">' + esc(hd.detail) + '</div><div class="cwl-wwh-srcs">' + hd.src.map(function (s) { return '<span class="cwl-wwh-src">' + L((SRC[s.k] || SRC.survey)[0]) + "<span>" + esc(s.t) + "</span><b>" + esc(s.c) + "</b></span>"; }).join("") + "</div>";
    if (o.surface === "tv") return '<div class="cwl-wwh-tv"><div class="cwl-big-number' + (o.callout === false ? "" : " is-callout") + '">' + esc(hd.n) + '</div><div class="cwl-tv-headline-xl">' + hd.text + '</div><div class="cwl-wwh-tv-src">' + (hd.thin ? ThinFlag(hd.thin, { surface: "tv", reason: false }) : "") + "<span>" + hd.src.map(function (s) { return esc(s.t); }).join(" · ") + "</span></div></div>";
    return '<article class="cwl-wwh' + (hd.thin ? " is-thin" : "") + '"><span class="n tnum">' + esc(hd.n) + '</span><div class="t"><div class="hl">' + hd.text + '</div><div class="meta">' + chips + (hd.thin ? ThinFlag(hd.thin) : "") + (hd.typed ? '<span class="cwl-d6-src">' + L("keyboard") + "<span>Typed by hand</span></span>" : "") + "</div></div>" + (o.actions === false ? "" : '<div class="acts">' + (o.live ? CHIP("On the TV", "run-live", "radio") : SB("Show", "play")) + IB("pencil", "Edit") + IB("grip-vertical", "Reorder") + "</div>") + "</article>";
  }

  /* ================================================================
     THE ALIGNMENT SIGNAL · facilitator's control surface and own remote only.
     Kinds are told apart by icon and label: Aligned circle-check, Divergent split, Silent volume-x,
     Thin data circle-dashed. The disc colors are the existing facilitator-only tokens.
     ================================================================ */
  var KIND = { aligned: ["circle-check", "Aligned"], divergent: ["split", "Divergent"], silent: ["volume-x", "Silent"], thin: ["circle-dashed", "Thin data"] };
  function disc(kind) { return '<span class="cwl-signal-disc" aria-hidden="true">' + L(KIND[kind][0]) + "</span>"; }
  function SignalCard(sg, o) {
    o = o || {};
    return '<article class="cwl-signal cwl-sg-card is-' + sg.kind + (o.saved ? " is-saved" : "") + '" aria-label="' + esc(KIND[sg.kind][1] + ": " + sg.theme) + '">' + disc(sg.kind) +
      '<div class="b"><div class="cwl-sg-kind">' + esc(KIND[sg.kind][1]) + '</div><div class="cwl-signal-title">' + esc(sg.theme) + '</div><div class="ln">' + esc(sg.line) + "</div>" +
      (o.saved ? '<div class="sv">' + L("bookmark-check") + "Saved as a citation for the report</div>" : "") +
      '<div class="acts">' + SB("Open", "panel-right-open") + SB("Dismiss", "x", "is-ghost") + "</div></div></article>";
  }
  function SignalDetail(sg, o) {
    o = o || {};
    var room = sg.room, rs = room.sentences + (room.sentences === 1 ? " sentence" : " sentences") + ", " + room.cards + (room.cards === 1 ? " scribe card" : " scribe cards");
    return '<article class="cwl-sg-detail is-' + sg.kind + '"><div class="cwl-a-row" style="justify-content:space-between;flex-wrap:nowrap">' + SB("All signals", "chevron-left", "is-ghost") + "</div>" +
      '<div class="cwl-signal is-' + sg.kind + '" style="padding:0;background:none">' + disc(sg.kind) + '<div><div class="cwl-sg-kind">' + esc(KIND[sg.kind][1]) + '</div><div class="cwl-sg-theme">' + esc(sg.theme) + "</div></div></div>" +
      '<div class="cwl-sg-h">Why it\'s showing</div><div class="cwl-sg-ev">' + sg.ev.map(function (e) { return '<div class="r">' + L((SRC[e.k] || SRC.survey)[0]) + "<span>" + esc(e.t) + "</span><b>" + esc(e.c) + "</b></div>"; }).join("") +
      '<div class="r is-room">' + L("radio") + "<span>Said in the room today</span><b>" + esc(rs) + "</b></div></div>" +
      (room.text.length ? '<ul class="cwl-sg-said">' + room.text.slice(0, 3).map(function (t) { return "<li>“" + esc(t) + "”</li>"; }).join("") + "</ul>" : "") +
      '<div class="cwl-sg-h">A neutral question you could ask</div><textarea class="cwl-a-input cwl-sg-q" rows="2" tabindex="-1">' + esc(sg.ask) + "</textarea>" +
      '<div class="cwl-sg-acts">' + (o.onTV ? B("Back to the wall", "is-secondary", "undo-2") + CHIP("Question on the TV", "is-outline", "tv") : B("Put the question on the TV", "is-primary", "tv")) + "</div>" +
      '<div class="cwl-sg-acts">' + (sg.kind === "aligned" ? (o.saved ? CHIP("Saved as a citation", "is-success", "bookmark-check") : SB("Save as a citation", "bookmark-plus")) : "") + SB("Dismiss", "x", "is-ghost") + "</div>" +
      '<div class="cwl-sg-fine">' + L("info") + "<span>The TV shows only the question. No data, and the signal isn't named.</span></div></article>";
  }

  /* SignalPanel · FAC-02 in the control surface's private panel. Cards come in quietly
     (cwl-dur-signal-in on calm: a soft fade and a short rise, no ring, no sound) and leave on Dismiss.
     o: {state: none|aiOff|list|detail|team, held, saved, onTV} */
  function SignalPanel(host) {
    this.el = h("div", "cwl-sg-panel"); host.appendChild(this.el);
    this.el.innerHTML = '<div class="cwl-sg-sub"></div><div class="cwl-sg-list"></div><div class="cwl-sg-held"></div><div class="cwl-sg-open"></div>';
    this.sub = this.el.querySelector(".cwl-sg-sub"); this.list = this.el.querySelector(".cwl-sg-list"); this.held = this.el.querySelector(".cwl-sg-held"); this.open = this.el.querySelector(".cwl-sg-open");
  }
  SignalPanel.prototype.set = function (cards, o) {
    o = o || {};
    var self = this;
    if (o.state === "none" || o.state === "aiOff" || o.state === "team") {
      this.list.innerHTML = ""; this.open.innerHTML = ""; this.held.innerHTML = "";
      this.sub.innerHTML = '<div class="cwl-sg-empty">' + L(o.state === "aiOff" ? "power-off" : o.state === "team" ? "hand-helping" : "circle-dashed") + "<div><b>" + (o.state === "aiOff" ? "The signal is off" : o.state === "team" ? "Priya has the remote" : "The signal starts once themes are accepted") + "</b><span>" + (o.state === "aiOff" ? "AI is off for this engagement, and the signal is AI. Discover themes still show in What We Heard." : o.state === "team" ? "The signal stays here and on your own remote. Priya's remote never shows it." : "Accept survey, interview and Four Helpful Lists themes in Discover. Only accepted themes count.") + "</span></div></div>";
      CL.icons(); return;
    }
    this.sub.innerHTML = '<div class="cwl-sg-meta"><span>' + esc(D.signalSession) + "</span><span>" + cards.length + (cards.length === 1 ? " signal" : " signals") + "</span></div>";
    this.held.innerHTML = o.held ? '<div class="cwl-sg-heldnote">' + L("clock") + "<span>" + o.held + (o.held === 1 ? " silent theme waits" : " silent themes wait") + " until phones first go down in this session.</span></div>" : "";
    if (o.state === "detail" && o.open) {
      this.list.style.display = "none";
      this.open.innerHTML = SignalDetail(D.signal(o.open) || o.openSignal, { saved: o.saved && o.saved.indexOf(o.open) >= 0, onTV: o.onTV });
      CL.icons(); return;
    }
    this.list.style.display = ""; this.open.innerHTML = "";
    P4.keyed(this.list, cards.map(function (c) { return { k: c.id, c: c }; }), function () { return h("div", "cwl-sg-slot"); }, function (slot, it) {
      var sv = !!(o.saved && o.saved.indexOf(it.k) >= 0), sig = String(sv);
      if (slot.getAttribute("data-sig") !== sig) { slot.innerHTML = SignalCard(it.c, { saved: sv }); slot.setAttribute("data-sig", sig); }
    }, { instant: true });
    /* quiet arrival: only new cards, softer and slower than a room arrival */
    if (!o.instant) this.list.querySelectorAll("[data-k]").forEach(function (s) { if (!s.getAttribute("data-shown") && !CL.reduced(s)) s.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: ms("cwl-dur-signal-in"), easing: CL.v("cwl-ease-calm"), fill: "backwards" }); });
    this.list.querySelectorAll("[data-k]").forEach(function (s) { s.setAttribute("data-shown", "1"); });
    CL.icons();
  };
  SignalPanel.prototype.dismiss = function (id, next, o) {
    var self = this, s = this.list.querySelector('[data-k="' + id + '"]');
    if (!s || CL.reduced(this.el)) { this.set(next, o); return; }
    s.classList.add("is-leaving");
    CL.leave(s, function () { CL.flip(self.list, function () { s.remove(); }, { selector: ":scope > [data-k]:not(.is-leaving)" }); self.set(next, o); });
  };

  /* SignalList · FAC-03, the facilitator's own remote. The short list, each opening to its line of evidence.
     A team facilitator's remote never renders it (o.team). */
  function SignalList(cards, o) {
    o = o || {};
    if (o.team) return "";
    if (o.state === "none") return '<div class="cwl-sg-rlist"><div class="cwl-sg-rhead">' + L("eye-off") + 'Signal<span>Only you</span></div><div class="cwl-sg-rnone">Starts once Discover themes are accepted.</div></div>';
    return '<div class="cwl-sg-rlist"><div class="cwl-sg-rhead">' + L("eye-off") + "Signal · " + cards.length + "<span>Only you</span></div>" +
      cards.map(function (c) { var op = o.open === c.id; return '<div class="cwl-sg-ritem is-' + c.kind + (op ? " is-open" : "") + '"><div class="row">' + disc(c.kind) + '<span class="t"><b>' + esc(KIND[c.kind][1]) + "</b>" + esc(c.theme) + "</span>" + L(op ? "chevron-up" : "chevron-down") + "</div>" + (op ? '<div class="ln">' + esc(c.line) + '</div><div class="cwl-a-row" style="gap:6px">' + SB("Put the question up", "tv", "is-primary") + SB("Dismiss", "x", "is-ghost") + "</div>" : "") + "</div>"; }).join("") +
      (o.held ? '<div class="cwl-sg-rnone">' + L("clock") + " " + o.held + " silent waits for phones down</div>" : "") + "</div>";
  }

  /* ================================================================
     The TV: a new screen crossfades in over the old one, the same transition as any session change
     (cwl-dur-make-room). Used for SET-10 results and the neutral question.
     ================================================================ */
  function TVLayer(sh) { this.sh = sh; this.cur = null; }
  TVLayer.prototype.show = function (html, o) {
    o = o || {};
    var tv = this.sh.tv, red = CL.reduced(tv), d = ms("cwl-dur-make-room");
    var layer = h("div", "cwl-tv-content cwl-d6-layer"); layer.innerHTML = html; tv.insertBefore(layer, tv.querySelector(".cwl-tv-foot"));
    var old = this.cur || (o.over ? this.sh.content : null);
    this.cur = layer;
    /* A question carries no data: the room's count and the AI line step back with the wall */
    tv.classList.toggle("has-ask", !!o.ask);
    if (!o.instant && !red) layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d, easing: CL.v("cwl-ease-signature"), fill: "backwards" });
    if (old) {
      if (old === this.sh.content) { if (o.instant || red) old.style.opacity = 0; else old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d, easing: CL.v("cwl-ease-signature"), fill: "forwards" }); old.setAttribute("aria-hidden", "true"); }
      else if (o.instant || red) old.remove(); else old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d, easing: CL.v("cwl-ease-signature"), fill: "forwards" }).onfinish = function () { old.remove(); };
    }
    CL.icons();
    return layer;
  };
  /* Back to what was live underneath */
  TVLayer.prototype.clear = function (o) {
    o = o || {};
    var tv = this.sh.tv, red = CL.reduced(tv), d = ms("cwl-dur-make-room"), cur = this.cur, base = this.sh.content;
    this.cur = null;
    tv.classList.remove("has-ask");
    base.getAnimations().forEach(function (a) { a.cancel(); }); base.removeAttribute("aria-hidden");
    if (o.instant || red) { base.style.opacity = ""; if (cur) cur.remove(); return; }
    base.style.opacity = ""; base.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d, easing: CL.v("cwl-ease-signature") });
    if (cur) cur.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d, easing: CL.v("cwl-ease-signature"), fill: "forwards" }).onfinish = function () { cur.remove(); };
  };
  /* The neutral question: a question only. No data, and it never names the signal. */
  function neutralHTML(q, session) { return '<div class="cwl-tv-eyebrow">' + esc(session || D.signalSession) + '</div><div class="cwl-d6-ask"><div class="cwl-tv-headline-xl">' + esc(q) + "</div></div>"; }

  /* ================================================================
     SurveyResultScreen · SET-10. One question or one accepted theme at a time on the TV, sourced
     from Team Hub, with the detail on phones. item: {kind: choice|scale|theme|heard, q, theme, counts}
     ================================================================ */
  function srFoot(n) { return '<div class="cwl-sr-foot">' + L("clipboard-list") + "<span>Congregational survey · " + n + " responses · closed " + esc(D.survey.closes) + "</span></div>"; }
  function SurveyResultScreen(sh) { this.sh = sh; this.layer = new TVLayer(sh); sh.content.style.display = "none"; }
  SurveyResultScreen.prototype.show = function (it, o) {
    o = o || {};
    var n = it.n || D.survey.responses, html;
    if (!it || it.kind === "none") { html = '<div class="cwl-tv-eyebrow">What we heard</div><div class="cwl-sr-wait">Results from the congregational survey show here, one at a time.</div>'; this.layer.show(html, o); return; }
    if (it.kind === "theme") {
      var t = it.theme, thin = D.isThin(t.n, n);
      html = '<div class="cwl-tv-eyebrow">What we heard · ' + esc(it.eyebrow || "The congregational survey") + '</div><div class="cwl-sr-theme"><div class="num"><span class="cwl-big-number' + (thin ? "" : " is-callout") + '">' + t.n + '</span><span class="of">of ' + n + ' answers</span></div><div class="cwl-tv-headline-xl">' + esc(it.lead || "") + "<strong>" + esc(t.label) + "</strong></div>" + (thin ? '<div class="th">' + ThinFlag(t.n + " of " + n + " respondents", { surface: "tv" }) + "</div>" : "") + "</div>" + srFoot(n);
      this.layer.show(html, o); return;
    }
    var q = it.q, layer;
    html = '<div class="cwl-tv-eyebrow">What we heard · The congregational survey</div><div class="cwl-tv-headline cwl-sr-q">' + esc(q.title) + '</div><div class="cwl-sr-host"></div>' + (it.thin ? '<div class="th">' + ThinFlag(it.thin, { surface: "tv" }) + "</div>" : "") + srFoot(n);
    layer = this.layer.show(html, o);
    var host = layer.querySelector(".cwl-sr-host");
    if (it.kind === "choice") {
      var bars = new P3.Bars(host, { labelW: 420, valueW: 220, maxRow: 112 });
      bars.set(P3.choiceItems(q.options, it.counts || q.counts, q.type === "multi_choice" ? n : null), { instant: true });
      if (!o.instant && !CL.reduced(layer)) { bars.set(q.options.map(function (op, i) { return { id: "o" + i, label: op, frac: 0, value: "" }; }), { instant: true }); requestAnimationFrame(function () { bars.set(P3.choiceItems(q.options, it.counts || q.counts, q.type === "multi_choice" ? n : null)); }); }
    } else {
      var sc = new P3.Scale(host, { max: q.max || 5, lo: q.lo, hi: q.hi });
      sc.set(o.instant || CL.reduced(layer) ? (it.counts || q.counts) : [0, 0, 0, 0, 0], n, { instant: true });
      if (!o.instant && !CL.reduced(layer)) requestAnimationFrame(function () { sc.set(it.counts || q.counts, n); });
    }
  };
  /* The phone's depth for the same item */
  function SurveyResultPhone(ph, it, o) {
    o = o || {};
    var n = it.n || D.survey.responses, body;
    if (!it || it.kind === "none") { ph.body.innerHTML = '<div class="cwl-ph-headline">What we heard</div><div class="cwl-ph-text">The survey results show on the TV. The detail for each one appears here.</div>'; ph.foot.innerHTML = ""; return; }
    if (it.kind === "theme") {
      var t = it.theme, thin = D.isThin(t.n, n);
      body = '<div class="cwl-ph-muted">What we heard · the congregational survey</div><div class="cwl-ph-headline">' + esc(t.label) + "</div>" + (thin ? "<div>" + ThinFlag(t.n + " of " + n, { surface: "phone" }) + "</div>" : "") +
        '<div class="cwl-ph-text"><b>' + t.n + " of " + n + "</b> answers to “" + esc(D.q(t.q).title) + "”</div>" +
        '<div class="cwl-sr-quotes">' + t.quotes.map(function (x) { return "<blockquote>“" + esc(x) + "”</blockquote>"; }).join("") + "</div><div class=\"cwl-ph-source\">Example answers, no names · Congregational survey, " + n + " responses</div>";
    } else {
      var q = it.q, counts = it.counts || q.counts;
      body = '<div class="cwl-ph-muted">What we heard · the congregational survey</div><div class="cwl-ph-headline" style="font-size:var(--cwl-fs-phone-prompt)">' + esc(q.title) + "</div>" + (it.thin ? "<div>" + ThinFlag(it.thin, { surface: "phone" }) + "</div>" : "") +
        '<div class="cwl-sr-rows">' + (it.kind === "scale" ? counts.map(function (c, i) { return '<div class="r"><span>' + (i + 1) + (i === 0 ? " · " + esc(q.lo) : i === counts.length - 1 ? " · " + esc(q.hi) : "") + "</span><b>" + c + "</b></div>"; }).join("") :
          q.options.map(function (op, i) { return '<div class="r"><span>' + esc(op) + "</span><b>" + counts[i] + " · " + D.pct(counts[i], q.type === "multi_choice" ? n : counts.reduce(function (a, b) { return a + b; }, 0)) + "%</b></div>"; }).join("")) + "</div>" +
        '<div class="cwl-ph-source">Rests on ' + (q.type === "multi_choice" ? n : counts.reduce(function (a, b) { return a + b; }, 0)) + " answers · Congregational survey, " + n + " responses</div>";
    }
    ph.body.innerHTML = '<div class="cwl-sr-ph">' + body + "</div>"; ph.foot.innerHTML = "";
    CL.icons();
  }

  window.ClearwayLivePass6 = {
    ThinFlag: ThinFlag, AIDrafted: AIDrafted, srcChip: srcChip, teamHubBtn: teamHubBtn, roll: roll,
    SurveyLink: SurveyLink, drawQR: drawQR, ResponseCount: ResponseCount, QuestionResult: QuestionResult, TYPE: TYPE,
    DiscoverTheme: DiscoverTheme, ThemeList: ThemeList, themeCount: themeCount, SegmentFilter: SegmentFilter, DuplicateFlag: DuplicateFlag, NotesUpload: NotesUpload,
    FourListsCard: FourListsCard, FourListsBoard: FourListsBoard, FourListsComposer: FourListsComposer, colOf: colOf,
    WhatWeHeardHeadline: WhatWeHeardHeadline,
    KIND: KIND, SignalCard: SignalCard, SignalDetail: SignalDetail, SignalPanel: SignalPanel, SignalList: SignalList,
    TVLayer: TVLayer, neutralHTML: neutralHTML, SurveyResultScreen: SurveyResultScreen, SurveyResultPhone: SurveyResultPhone
  };
})();
