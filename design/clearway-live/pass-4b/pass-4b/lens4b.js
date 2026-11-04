/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 4b · lens4b.js
   window.ClearwayLivePass4b: the components of this pass, named as in code.
   Day 1 lens summaries: AIMark, LensSummaryTV, SummaryPhone, SummaryEditor, SuggestionList,
   VersionList, DecisionPanel, LensSignoff (the five lenses' progress).
   Follow-up access: FollowUpIssue, FollowUpPair, TeamRemote, FollowUpScope.
   Pass 5 revisions: ConfirmLens (the Day 2 confirm), OutcomeStatusList, OutcomeDraft,
   OutcomeSources, PublishDay2.
   Rules kept in code here: the tally has no leader color and never decides; a summary
   that is too long for one screen shows the sentences that fit and says how many more are
   on phones; AI is marked on every summary and every version; no name appears on the TV
   or phones; nothing from a draft reaches the TV or phones before the facilitator sends it.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P4 = window.ClearwayLivePass4, P5 = window.ClearwayLivePass5, W = window.ClearwayLivePass4Data, S = window.ClearwayLivePass5Data, D = window.ClearwayLivePass4bData;
  var h = CL.h, esc = CL.esc, L = CL.lucide, B = P4.B, CHIP = P4.CHIP, SB = P4.SB, SYNC = P4.SYNC, PH = P4.PH;
  function ms(n) { return CL.ms(n); }
  var TC = P5.TrackedChange;

  /* ---------- The AI icon: the design system's own path as a mask, gradient ink, one sweep ---------- */
  (function () {
    var m = /d="([^"]+)"/.exec(CL.lucide("sparkles"));
    if (m) document.documentElement.style.setProperty("--ai-shape", "url(\"data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='black' fill-rule='evenodd' d='" + m[1] + "'/></svg>") + "\")");
  })();
  function AIMark() { return '<span class="cwl-ai-mark" role="img" aria-label="AI"></span>'; }
  function sweepAi(root) {
    var m = root && root.querySelector && root.querySelector(".cwl-ai-mark"); if (!m || CL.reduced(m)) return;
    m.classList.remove("is-sweeping"); void m.offsetWidth; m.classList.add("is-sweeping");
    CL.later(function () { m.classList.remove("is-sweeping"); }, ms("cwl-dur-ai-sweep") + 60);
  }

  /* ---------- Shared: sentences, the shown part, sources ---------- */
  function sentencesOf(k, long) { return long && k === "community" ? D.longCommunity.sentences : D.lens[k].sentences; }
  /* What fits one TV screen at the floor size: the first sentences up to the limit. Checked in code. */
  function fitSentences(list) {
    var out = [], n = 0;
    for (var i = 0; i < list.length; i++) { if (out.length && n + list[i].t.length + 1 > D.fit.floor) break; out.push(list[i]); n += list[i].t.length + 1; }
    return out;
  }
  function reflowNone() { }

  /* ================================================================
     LensSummaryTV · D1-14. One lens per screen: the lens heading with its icon, the present-tense
     10-year Future summary, the AI icon with "Drafted from your sentences", a live Approve and Suggest a
     change tally with no leader color, and the suggestions as they arrive. A new version folds in as
     tracked changes (pass 5's TrackedChange and correction fold). Built on the read-back's grid.
     ================================================================ */
  function LensSummaryTV(sh, o) {
    P5.ReadBackLens.call(this, sh, o);
    var self = this;
    this.el.classList.add("cwl-ls");
    this.el.querySelector(".cwl-rb-ask").textContent = "Does this say it?";
    this.el.querySelectorAll(".cwl-rbt-top span").forEach(function (s, i) { s.textContent = i ? "Suggest a change" : "Approve"; });
    this.ai = h("div", "cwl-ls-ai"); this.para.insertAdjacentElement("afterend", this.ai);
    this.more = h("div", "cwl-ls-more"); this.ai.insertAdjacentElement("afterend", this.more);
    var side = this.el.querySelector(".cwl-rb-side");
    side.insertBefore(this.ml.el, this.changed);
    this.ml.el.querySelector(".cwl-ml-h").firstChild.nodeValue = "Suggested changes";
    var set0 = this.ml.set;
    this.ml.set = function (list, o2) { o2 = o2 || {}; o2.sub = o2.sub || (list.length ? "" : "They appear here as they're sent"); return set0.call(this, list, o2); };
    this.ml.items.style.cssText = "";
    this.sideEl = side;
  }
  LensSummaryTV.prototype = Object.create(P5.ReadBackLens.prototype);
  LensSummaryTV.prototype.constructor = LensSummaryTV;
  LensSummaryTV.prototype.shown = function (k) { var all = sentencesOf(k, this.o.long); var s = this.o.long ? fitSentences(all) : all; this.moreN = all.length - s.length; return s; };
  LensSummaryTV.prototype.text = function (k) { return this.shown(k).map(function (s) { return s.t; }).join(" "); };
  LensSummaryTV.prototype.corrs = function (k) { return this.o.long ? [] : D.lens[k].folds; };
  LensSummaryTV.prototype.words = function (states, instant, custom) {
    var k = this.lens, text = custom ? custom.text : this.text(k);
    var list = TC.words(text, custom ? [] : this.corrs(k), states).filter(function (w) { return w.kind !== "del"; });
    var len = custom ? text.length : Math.max(text.length, this.o.long ? 0 : D.final(k).length);
    this.para.classList.toggle("is-floor", len > D.fit.body);
    var typing = custom && custom.typing;
    P4.keyed(this.para, list, function () { return h("span", "w"); }, function (el, it) {
      el.textContent = it.t; el.classList.toggle("is-ins", it.kind === "ins"); el.classList.toggle("is-del", it.kind === "del"); el.classList.toggle("is-trail", /\s$/.test(it.t));
      var off = /^b(\d+)$/.exec(it.k); el.classList.toggle("is-typing", !!(typing && off && +off[1] >= typing[0] && +off[1] < typing[1]));
    }, { instant: instant });
    this.more.textContent = this.moreN ? "+ " + this.moreN + (this.moreN === 1 ? " more sentence on phones" : " more sentences on phones") : "";
    this.more.style.display = this.moreN ? "" : "none";
  };
  /* The AI line: the icon and what AI did, in plain words. The sweep runs once when AI acts. */
  LensSummaryTV.prototype.aiLine = function (st) {
    var k = st.mode || "ai", v = st.version || 1, n = st.folded || 0, html;
    if (k === "off") html = L("pencil-line") + "<span>Written from your sentences</span>";
    else if (k === "drafting") html = AIMark() + "<span>Drafting from " + (D.counts[this.lens] || 0) + " sentences</span>";
    else if (v > 1) html = AIMark() + "<span><b>Version " + v + "</b> · Folded in from " + n + (n === 1 ? " suggestion" : " suggestions") + "</span>";
    else html = AIMark() + "<span>Drafted from your sentences" + (st.edited ? " · edited" : "") + "</span>";
    this.ai.innerHTML = html; CL.icons();
    if (st.sweep) sweepAi(this.ai);
  };
  LensSummaryTV.prototype.restoreMain = function () {
    this.ai.style.display = ""; this.sideEl.style.display = ""; this.head.parentNode.style.display = "";
    this.el.classList.remove("is-close", "is-done");
  };
  /* st: {lens, settled, states, yes, change, of, suggestions, newestSuggestion, mode: ai|off|drafting, version, folded, edited, custom, sweep, done, instant} */
  LensSummaryTV.prototype.set = function (st) {
    var inst = !!st.instant;
    if (st.done) return this.doneView(st);
    this.restoreMain();
    var changedLens = st.lens !== this.drawn; this.drawn = st.lens;
    this.lens = st.lens; this.settled = st.settled || []; this.states = st.states || {};
    this.progress(); this.heading(this.lens);
    var drafting = st.mode === "drafting";
    if (changedLens || this.wasDrafting || drafting) this.para.innerHTML = "";
    this.wasDrafting = drafting;
    this.sideEl.style.visibility = drafting ? "hidden" : "";
    if (drafting) { this.para.innerHTML = '<div class="cwl-ls-skel"><i></i><i></i><i></i><i></i></div>'; this.more.style.display = "none"; }
    else this.words(this.states, inst || changedLens, st.custom);
    this.para.querySelectorAll(".w.is-ins").forEach(function (w) { w.classList.remove("is-drawing"); });
    this.tally.set(st.yes || 0, st.change || 0, { of: st.of || 8, instant: inst });
    this.ml.set(st.suggestions || [], { newest: st.newestSuggestion, instant: inst, max: 2, always: true });
    this.aiLine(st);
    var folded = Object.keys(this.states).filter(function (x) { return this.states[x] !== "pending"; }, this).length;
    var isSettled = this.settled.indexOf(this.lens) >= 0;
    this.changed.innerHTML = isSettled ? '<span class="cwl-rb-settled">' + L("check") + "Signed off by the room</span>" : folded && !drafting ? L("pencil-line") + folded + (folded === 1 ? " change folded in" : " changes folded in") : "";
    CL.icons();
  };
  /* The summary arriving: the sentences land one after another (cwl-delay-stagger apart), then the AI icon sweeps once. */
  LensSummaryTV.prototype.arrive = function (st, done) {
    var self = this, k = st.lens, sents = this.shown ? null : null;
    this.set({ lens: k, settled: st.settled, mode: "ai", version: 1, yes: 0, change: 0, suggestions: [], instant: true });
    var all = (this.shown(k)), text = "", red = CL.reduced(this.para);
    this.para.innerHTML = ""; this.drawn = k;
    this.aiLine({ mode: "ai", version: 1 });
    if (red) { this.words({}, true); sweepAi(this.ai); if (done) done(); return; }
    all.forEach(function (s, i) {
      CL.later(function () {
        text += (text ? " " : "") + s.t;
        var list = TC.words(text, [], {});
        P4.keyed(self.para, list, function () { return h("span", "w"); }, function (el, it) { el.textContent = it.t; el.classList.toggle("is-trail", /\s$/.test(it.t)); }, { stagger: 20 });
        if (i === all.length - 1) { self.words({}, true); sweepAi(self.ai); if (done) CL.later(done, ms("cwl-dur-arrive")); }
      }, i * (ms("cwl-delay-stagger") * 3));
    });
  };
  /* A new version folding in: the suggestions leave as the tracked changes land (pass 5's fold), then the AI line says version 2 and the icon sweeps once. */
  LensSummaryTV.prototype.foldIn = function (ids, o, done) {
    o = o || {}; var self = this, i = 0;
    this.ml.set(o.remaining || [], { max: 2, always: true });
    (function step() {
      if (i >= ids.length) { self.aiLine({ mode: "ai", version: 2, folded: ids.length, sweep: true }); if (done) done(); return; }
      self.fold(ids[i++], step);
    })();
  };
  /* Undo an AI version: the changes go back out in one movement, the suggestions return to the list. */
  LensSummaryTV.prototype.undoVersion = function (o) {
    this.states = {}; this.words({}, false);
    this.aiLine({ mode: "ai", version: 1 });
    this.ml.set(o && o.suggestions || [], { max: 2, always: true });
    this.changed.innerHTML = ""; CL.icons();
  };
  /* Settle: Lime sweeps once across the lens in the progress, then the outlined check. The room's decision, marked by the facilitator. */
  function settleImpl(label) {
    return function () {
      var k = this.lens, self = this;
      if (this.settled.indexOf(k) < 0) this.settled = this.settled.concat([k]);
      var it = this.prog.querySelector('[data-lens="' + k + '"]');
      var finish = function () {
        self.progress(); self.para.querySelectorAll(".w.is-ins").forEach(function (w) { w.classList.add("is-settled"); w.classList.remove("is-ins"); });
        self.changed.innerHTML = '<span class="cwl-rb-settled">' + L("check") + label + "</span>"; CL.icons();
      };
      if (!it || CL.reduced(this.prog)) return finish();
      var sw = it.querySelector(".sweep"); it.classList.add("is-sweeping"); this.sh.handoff(true);
      sw.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: ms("cwl-dur-outcome-confirm"), easing: CL.v("cwl-ease-signature"), fill: "forwards" }).onfinish = function () {
        CL.later(function () { sw.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms("cwl-dur-settle-color"), fill: "forwards" }).onfinish = function () { self.sh.handoff(false); finish(); }; }, ms("cwl-dur-new-hold") * 0.4);
      };
    };
  }
  LensSummaryTV.prototype.settle = settleImpl("Signed off by the room");
  /* All five lenses signed off */
  LensSummaryTV.prototype.doneView = function (st) {
    this.el.classList.add("is-close", "is-done"); this.lens = null; this.drawn = null; this.settled = D.order.slice(); this.progress();
    this.head.innerHTML = '<span class="cwl-rb-close-h">The 10-year <strong>Future</strong>, signed off</span>';
    this.para.className = "cwl-rb-para";
    this.para.innerHTML = '<div class="cwl-ls-done"><div class="lead">The room decided each lens together. Next, the provisional Vision Outcomes.</div><div class="cwl-ls-five">' + D.order.map(function (k) {
      var l = P4.lensByKey(k); return '<div><span class="nm">' + P4.lensIcon(k) + esc(l.name) + '</span><span class="ln">' + esc(W.lensLines[k]) + "</span></div>";
    }).join("") + "</div></div>";
    this.sideEl.style.display = "none"; this.ai.style.display = "none"; this.more.style.display = "none"; this.changed.innerHTML = "";
    this.ml.set([], { instant: true });
    CL.icons();
  };

  /* ================================================================
     ConfirmLens · D2-03 revised. The Day 2 confirm: one signed-off lens at a time, the same tally,
     what's missing and the corrections as in pass 5, with "Signed off on Day 1" beside the heading.
     ================================================================ */
  function ConfirmLens(sh, o) { P5.ReadBackLens.call(this, sh, o); this.el.classList.add("cwl-ls", "cwl-cf"); }
  ConfirmLens.prototype = Object.create(P5.ReadBackLens.prototype);
  ConfirmLens.prototype.constructor = ConfirmLens;
  ConfirmLens.prototype.heading = function (k) {
    P5.ReadBackLens.prototype.heading.call(this, k);
    this.head.insertAdjacentHTML("beforeend", '<span class="cwl-ls-signed">' + L("check") + "Signed off on Day 1</span>"); CL.icons();
  };
  ConfirmLens.prototype.settle = settleImpl("Confirmed by the room");
  ConfirmLens.prototype.openView = function (st) {
    this.el.classList.add("is-close"); this.lens = null; this.drawn = null; this.settled = []; this.states = {};
    this.progress();
    this.head.innerHTML = '<span class="cwl-rb-close-h">Does the 10-year <strong>Future</strong> still say it?</span>';
    this.para.className = "cwl-rb-para";
    this.para.innerHTML = '<span class="w">Yesterday the room signed off each lens. Five short confirms, one lens at a time.</span>';
    this.el.querySelector(".cwl-rb-side").style.display = "none"; this.changed.innerHTML = "";
    this.ml.set([], { instant: true });
    if (this.ml.el.parentNode !== this.el.querySelector(".cwl-rb-ml")) this.el.querySelector(".cwl-rb-ml").appendChild(this.ml.el);
    CL.icons();
  };
  var closeView0 = P5.ReadBackLens.prototype.closeView;
  ConfirmLens.prototype.closeView = function (st) {
    closeView0.call(this, st);
    this.para.innerHTML = '<span class="w">The 10-year Future, confirmed by the room. One more question before we move on.</span>';
  };
  ConfirmLens.prototype.set = function (st) { if (st.open) return this.openView(st); return P5.ReadBackLens.prototype.set.call(this, st); };

  /* ================================================================
     SummaryPhone · D1-15. The summary with each sentence's source sentences underneath, then Approve
     and Suggest a change (a short box). After sending: what the person sent. A new version shows its
     changes marked until the lens is decided. o: {lens, version, states, answer: approve|suggest|null,
     text, sent, folded (their suggestion is in), decided, look, current, settled, down, offline, long, ai}
     ================================================================ */
  function blocks(k, states, o) {
    var d = D.lens[k], folds = o.long ? [] : d.folds, out = [];
    sentencesOf(k, o.long).forEach(function (s) {
      var repl = folds.filter(function (f) { return f.at && s.t.indexOf(f.at) >= 0; });
      var st = {}; repl.forEach(function (f) { st[f.id] = states[f.id]; });
      var html = repl.length ? TC.html(s.t, repl, st) : esc(s.t);
      var src = s.src.slice(), applied = repl.filter(function (f) { return states[f.id] && states[f.id] !== "pending"; });
      applied.forEach(function (f) { f.src.forEach(function (x) { if (src.indexOf(x) < 0) src.push(x); }); });
      out.push({ html: html, src: src, changed: applied.length > 0, srcNew: applied.length ? applied[0].src : [] });
      folds.filter(function (f) { return f.after && s.t.indexOf(f.after) >= 0 && states[f.id] && states[f.id] !== "pending"; }).forEach(function (f) {
        out.push({ html: '<ins class="cwl-tc-ins">' + esc(f.ins.trim()) + "</ins>", src: f.src.slice(), added: true });
      });
    });
    return out;
  }
  function SummaryPhone(ph, o) {
    o = o || {};
    var k = o.lens || "community", l = P4.lensByKey(k), v = o.version || 1, states = o.states || {};
    var html = P5.LensProgress(k, o.settled || []);
    if (o.look) html += '<div class="cwl-rb-ph-look">' + L("history") + "Looking back · signed off by the room</div>";
    html += '<div class="cwl-lsp-h">' + esc(l.name) + ", " + D.Y.future + "</div>";
    if (o.ai === false) html += '<div class="cwl-lsp-ai">' + L("pencil-line") + "<span>Written from your sentences</span></div>";
    else html += '<div class="cwl-lsp-ai">' + AIMark() + "<span>" + (v > 1 ? "Version " + v + " · Folded in from suggestions" : "Drafted from your sentences") + "</span></div>";
    if (o.decided) html += '<div class="cwl-lsp-banner">' + L("check") + "<span>The room decided. " + esc(l.name) + " is signed off.</span></div>";
    else if (v > 1 && !o.look) html += '<div class="cwl-lsp-banner">' + L("pencil-line") + "<span>" + (o.folded ? "Version 2 is on the TV, with your suggestion in it." : "Version 2 is on the TV. Changes are underlined.") + "</span></div>";
    if (o.down) html += PH.down();
    var bl = blocks(k, states, o), maxSrc = o.compact ? 1 : 2;
    if (o.decided) html += '<div class="cwl-lsp-t">' + bl.map(function (b) { return b.html.replace(/<ins class="cwl-tc-ins">/g, "<span>").replace(/<\/ins>/g, "</span>"); }).join(" ") + "</div>";
    else html += bl.map(function (b) {
      var shown = b.src.slice(0, maxSrc), more = b.src.length - shown.length;
      return '<div class="cwl-lsp-s"><div class="cwl-lsp-t">' + b.html + "</div>" + (b.added ? '<span class="cwl-lsp-new">' + L("plus") + "New sentence from a suggestion</span>" : "") +
        '<ul class="cwl-lsp-src">' + shown.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + (more > 0 ? "<li>+ " + more + " more of your sentences</li>" : "") + "</ul></div>";
    }).join("");
    if (o.answer && o.sent) {
      html += '<div class="cwl-lsp-sent"><span>' + (o.answer === "suggest" ? "You suggested" : "You approved") + "</span>" + (o.answer === "suggest" ? "<q>" + esc(o.text || "") + "</q>" : "") + "</div>";
    }
    ph.body.innerHTML = '<div class="cwl-lsp">' + html + "</div>";
    var foot = "";
    if (o.decided || o.down) foot = "";
    else if (o.look) foot = PH.btn("Back to " + P4.lensByKey(o.current || "community").name, { icon: "arrow-right", cls: "is-secondary" });
    else if (o.answer === "suggest" && !o.sent) foot = '<div class="cwl-lsp-sent"><span>What should change?</span></div>' + PH.input(o.text || "", "A few words is enough", 2) + '<div class="cwl-lsp-row"><span class="cwl-ph-muted">' + (o.text || "").length + ' of 140</span></div>' + PH.btn("Send", {});
    else if (o.sent) foot = PH.sent(o.answer === "suggest" ? "Suggested a change" : "Approve", o.offline ? "saved" : "sent");
    else foot = '<div class="cwl-lsp-row">' + PH.btn("Approve", { icon: "check" }) + PH.btn("Suggest a change", { icon: "pencil-line", cls: "is-secondary" }) + "</div>";
    ph.foot.innerHTML = foot; CL.icons();
  }

  /* ================================================================
     The control surface and the remote: the editor with its field lock, suggestions as they arrive,
     versions with undo, Mark a decision, and the five lenses' progress.
     ================================================================ */
  function lockChip(id, what) { return P5.lockChip(id, what); }
  /* o: {sentences: [string], version, state: view|editing|locked|empty, by, on (index of the sentence being typed), fits, held, ai, edited} */
  function SummaryEditor(o) {
    o = o || {};
    var st = o.state || "view", sents = o.sentences || [], len = sents.join(" ").length;
    var cls = "cwl-lsc-edit" + (st === "editing" ? " is-editing" : "") + (st === "locked" ? " is-locked" : "");
    var lock = st === "editing" ? '<span class="cwl-ovn-lock">' + L("lock") + "You're editing. The TV follows as you type</span>" : st === "locked" ? lockChip(o.by || "jt", "this summary") : "";
    var body = st === "empty" ? '<div class="tx cwl-a-muted">AI is off for this lens. Write the summary from the room\'s sentences on the right, in the present tense.</div>' :
      '<div class="tx" role="textbox" aria-multiline="true"' + (st === "editing" ? ' contenteditable="true"' : "") + ">" + sents.map(function (s, i) { return '<span class="sent' + (o.on === i ? " is-on" : "") + '">' + esc(s) + "</span>" + (o.on === i && st === "editing" ? '<span class="cur"></span>' : ""); }).join(" ") + "</div>";
    var over = len > D.fit.floor;
    var ft = '<span class="cwl-lsc-count' + (over ? " is-over" : "") + '">' + len + " of " + D.fit.floor + " characters fit one TV screen</span>" + (over ? '<span class="cwl-a-flag"><span class="d">' + L("triangle-alert") + "</span>The TV shows the sentences that fit</span>" : "");
    var hd = '<div class="hd">' + (o.ai === false ? L("pencil-line") : AIMark()) + "<span>" + (o.ai === false ? "Summary · written by you" : "Summary · Version " + (o.version || 1) + (o.edited ? " · edited" : "")) + '</span><span class="grow"></span>' + lock + "</div>";
    return '<div class="' + cls + '">' + hd + body + '<div class="ft">' + ft + "</div></div>";
  }
  /* list: [{t, state: new|folded|held|dismissed|applied, same}] */
  function SuggestionList(list, o) {
    o = o || {};
    if (!list.length) return '<div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);padding:4px 0">No suggestions yet. They appear here as phones send them, and on the TV.</div>';
    return '<div class="cwl-lsc-sugg">' + list.map(function (x) {
      var chip = x.state === "folded" ? CHIP("Folded into version 2", "is-success", "check") : x.state === "held" ? CHIP("Held while you edit", "is-outline", "lock") : x.state === "dismissed" ? CHIP("Dismissed", "", "x") : x.state === "applied" ? CHIP("Applied as written", "is-success", "check") : CHIP("New", "is-info", "message-square-plus");
      var acts = x.state === "new" && o.ai === false ? '<div class="cwl-a-row">' + SB("Apply as written", "check", "is-primary") + SB("Dismiss", "x", "is-ghost") + "</div>" : "";
      return '<div class="cwl-lsc-si' + (x.state === "new" && o.newest === x.t ? " is-new" : "") + '"><div>' + esc(x.t) + '</div><div class="st">' + chip + (x.same ? "<span>" + x.same + " say the same</span>" : "") + "</div>" + acts + "</div>";
    }).join("") + "</div>";
  }
  /* versions: [{n, what, who: ai|cv, time, current}] */
  function VersionList(vs, o) {
    return '<div class="cwl-lsc-ver">' + vs.map(function (v) {
      var who = v.who === "ai" ? AIMark() : P5.avatar(v.who);
      return '<div class="cwl-lsc-vi' + (v.current ? " is-current" : "") + '"><span class="n">v' + v.n + "</span>" + who + '<div class="t"><b>' + esc(v.what) + "</b><span>" + esc(v.time) + "</span></div>" + (v.current ? (v.n > 1 && v.who === "ai" && !(o && o.noUndo) ? SB("Undo this version", "undo-2") : CHIP("On the TV", "is-info", "tv")) : "") + "</div>";
    }).join("") + "</div>";
  }
  /* The room's decision for a lens. Counts show where the room is and never decide. o: {state: closed|open|recorded, yes, change, of, choice, reason, lens} */
  function DecisionPanel(o) {
    o = o || {};
    var l = P4.lensByKey(o.lens || "community"), counts = '<div class="p3-meter"><div><b>' + (o.yes || 0) + "</b><span>Approve</span></div><div><b>" + (o.change || 0) + "</b><span>Suggest a change</span></div><div><b>" + Math.max(0, (o.of || 8) - (o.yes || 0) - (o.change || 0)) + "</b><span>Not yet</span></div></div>";
    if (o.state === "recorded") return counts + '<div class="cwl-lsc-done">' + L("badge-check") + "<div><strong>" + esc(l.name) + " is signed off.</strong> " + esc(o.reason || "") + "</div></div>";
    if (o.state === "open") return counts + '<div class="cwl-lsc-dec"><div class="cwl-a-label">Mark a decision for ' + esc(l.name) + '</div>' +
      '<div class="opt' + (o.choice !== "later" ? " is-on" : "") + '"><span class="dot"></span><span><b>The room agrees. Sign it off</b><small>The TV and phones show it as signed off. It goes into the draft Clearway Map.</small></span></div>' +
      '<div class="opt' + (o.choice === "later" ? " is-on" : "") + '"><span class="dot"></span><span><b>Not yet. Come back to it</b><small>It stays open. You can raise it again in the Day 2 confirm.</small></span></div>' +
      '<div class="cwl-a-field"><label class="cwl-a-flabel">Why the room agreed (optional)</label><textarea class="cwl-a-input" rows="2" tabindex="-1">' + esc(o.reason || "") + '</textarea></div>' +
      '<div class="cwl-a-row">' + B("Record the decision", "is-confirm", "check") + B("Cancel", "is-ghost", "x") + '</div><div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">Counts show where the room is. They never decide.</div></div>';
    return counts;
  }
  /* The five lenses: where each stands. states: {lens: signed|now|ready|drafting}, vers */
  function LensSignoff(states, o) {
    o = o || {};
    return '<div class="cwl-lsc-five">' + D.order.map(function (k) {
      var l = P4.lensByKey(k), st = states[k] || "ready", chip = st === "signed" ? CHIP("Signed off", "is-success", "badge-check") : st === "now" ? CHIP("On the TV", "is-info", "tv") : st === "drafting" ? CHIP("Drafting", "is-outline", "loader-circle") : st === "deferred" ? CHIP("Come back to it", "is-outline", "clock") : CHIP("Drafted", "", "circle-check");
      return '<div class="cwl-lsc-fi' + (st === "now" ? " is-now" : "") + '">' + P4.lensIcon(k) + '<span class="grow">' + esc(l.name) + "</span>" + (o.ai === false ? "" : "") + chip + "</div>";
    }).join("") + "</div>";
  }

  /* ================================================================
     Follow-up access (FAC-05, FAC-06). The Clearway facilitator issues it for one block; the team
     facilitator pairs the shared TV view and takes the remote with a link and a code, no Clearway sign-in.
     ================================================================ */
  var F = D.followup;
  function rail(o) {
    /* One bar: the window the access works in (light) and the sessions inside it (solid), with a now marker when o.now (0 to 1) is given. */
    return '<div class="cwl-fu-rail"><div class="bar"><i style="left:0;right:0"></i><b style="left:' + (o.from || 17) + "%;width:" + (o.span || 40) + '%"></b></div><div class="ticks"><span>Opens ' + F.opens + ' am</span><span>Sessions ' + F.start + " to " + F.end + '</span><span>Ends ' + F.closes + " pm</span></div></div>";
  }
  var FU_CHIP = { none: ["Not issued", "", "key-round"], issued: ["Issued, waiting for Priya", "is-info", "mail-check"], paired: ["Priya has the remote", "is-success", "hand-helping"], expiring: ["Ends in 15 minutes", "is-warning", "clock"], expired: ["Ended", "is-outline", "clock"], revoked: ["Revoked", "is-outline", "ban"], bounced: ["Email didn't send", "is-warning", "mail-warning"] };
  /* st: none|issued|paired|expiring|expired|revoked|bounced */
  function FollowUpIssue(st, o) {
    o = o || {};
    var c = FU_CHIP[st], live = st === "issued" || st === "paired" || st === "expiring" || st === "bounced", ended = st === "expired" || st === "revoked";
    var code = live ? '<span class="cwl-fu-code is-wide' + (o.showCode ? "" : " is-hidden") + '" aria-label="Code">' + (o.showCode ? F.code.replace(" ", "") : "MAPLE4821").split("").map(function (ch) { return "<span>" + (o.showCode ? esc(ch) : "&bull;") + "</span>"; }).join("") + "</span>" : '<span class="cwl-fu-code is-wide is-empty" aria-label="No code yet">' + "000000000".split("").map(function () { return "<span></span>"; }).join("") + "</span>";
    var devices = st === "paired" || st === "expiring" ? '<div class="cwl-fu-kv"><div><span class="k">TV view</span><span class="v">' + L("monitor-check") + " Paired from Priya's laptop. Shared in the call</span></div><div><span class=\"k\">Remote</span><span class=\"v\">" + L("smartphone") + " Priya's phone. You can take it back at any time</span></div></div>" :
      st === "issued" || st === "bounced" ? '<div class="cwl-fu-kv"><div><span class="k">TV view</span><span class="v cwl-a-muted">Not paired yet</span></div><div><span class="k">Remote</span><span class="v cwl-a-muted">Not taken yet</span></div></div>' : "";
    var banner = st === "bounced" ? P4.BAN("warning", "mail-warning", "<strong>The email didn't reach Priya.</strong> Copy the link and send it another way. The code isn't in the email, so the link alone does nothing.") :
      st === "expiring" ? P4.BAN("warning", "clock", "<strong>Access ends at " + F.closes + " pm.</strong> Priya keeps the remote until then. Extend by an hour if the session runs long.") :
        st === "expired" ? P4.BAN("info", "info", "<strong>The access ended at " + F.closes + " pm.</strong> The remote came back to you and the TV didn't change. Priya's link and code no longer work.") :
          st === "revoked" ? P4.BAN("info", "info", "<strong>You revoked the access.</strong> The remote came back to you and the TV didn't change. Priya's link and code stopped working at once.") : "";
    var acts = st === "none" ? [B("Issue the access and email the link", "is-primary", "send")] :
      ended ? [B("Issue new access", "is-primary", "key-round")] :
        [B(o.showCode ? "Hide the code" : "Show the code", "is-secondary", o.showCode ? "eye-off" : "eye"), B("Copy the link", "is-secondary", "link"), st === "bounced" ? B("Send the email again", "is-primary", "send") : "", B("Extend by an hour", "is-secondary", "clock"), B("Reissue", "is-secondary", "refresh-cw"), B("Revoke", "is-ghost", "ban")];
    return '<div class="cwl-fu">' + (banner || "") + '<div class="cwl-a-row" style="justify-content:space-between"><div class="cwl-a-row">' + CHIP(c[0], c[1], c[2]) + '<span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">' + (live ? "Works only for this block, then ends by itself" : ended ? "No longer works" : "Only the lead facilitator can issue it") + "</span></div></div>" +
      '<div class="cwl-fu-grid"><div class="cwl-fu-card"><h4>Who</h4><div class="cwl-fu-kv"><div><span class="k">Team facilitator</span><span class="v">' + esc(F.person.name) + '</span></div><div><span class="k">Email</span><span class="v">' + esc(F.person.email) + '</span></div></div><p>Chosen from the attendee list. The link goes to this email and nowhere else.</p></div>' +
      '<div class="cwl-fu-card"><h4>What it covers</h4><div class="cwl-fu-kv"><div><span class="k">Follow-up</span><span class="v">' + esc(F.date) + '</span></div><div><span class="k">Block</span><span class="v">' + F.sessions.map(function (x) { return esc(x.n); }).join(", ") + '</span></div></div><p>Only these sessions. The half day, presenter notes, Discover data and the alignment signal stay with you.</p></div></div>' +
      '<div class="cwl-fu-card"><h4>When it works</h4>' + rail({ from: 17, span: 40 }) + "<p>From " + F.opens + " am, an hour before the first session, to " + F.closes + " pm, two hours after the last. It then ends by itself, and the remote comes back to you.</p></div>" +
      '<div class="cwl-fu-grid"><div class="cwl-fu-card"><h4>The link</h4><div class="cwl-a-row"><span class="cwl-a-input" style="max-width:none;flex:1;display:flex;align-items:center;height:36px;font-size:var(--cwl-fs-app-table)">' + (live ? esc(F.link) : "Issued with the access") + "</span></div><p>Emailed from live.clearway.co. It looks like any other email from Clearway, and it works only with the code.</p></div>" +
      '<div class="cwl-fu-card"><h4>The code</h4>' + code + "<p>You tell Priya the code in the call or by text. It is never in the email, and it stops working with the link.</p></div></div>" +
      devices + '<div class="cwl-a-row">' + acts.join("") + "</div></div>";
  }
  /* The team facilitator's side. st: before|enter|wrong|locked|pair|waiting|paired|ended|revoked */
  function codeBoxes(n, val, cls) { var chars = (val || "").split(""); var out = ""; for (var i = 0; i < n; i++) out += "<span>" + (chars[i] ? esc(chars[i]) : "") + "</span>"; return '<span class="cwl-fu-code is-wide ' + (cls || "") + '">' + out + "</span>"; }
  function FollowUpPair(st) {
    var head = '<div class="cwl-a-eyebrow">' + esc(D.church) + " · Follow-up · " + esc(F.date) + "</div>";
    if (st === "before") return '<div class="cwl-fu-page">' + head + "<h2>This follow-up opens at " + F.opens + " am</h2><p>Come back to this link then. You don't need a Clearway account.</p></div>";
    if (st === "ended") return '<div class="cwl-fu-page">' + head + "<h2>This follow-up has ended</h2><p>The remote is back with Chris, and the room's screen didn't change. Ask Chris for new access if you need it again.</p></div>";
    if (st === "revoked") return '<div class="cwl-fu-page">' + head + "<h2>This access was turned off</h2><p>Chris turned it off. The remote is back with him. Ask him for new access if you need it.</p></div>";
    if (st === "enter" || st === "wrong" || st === "locked") {
      var msg = st === "wrong" ? '<div class="cwl-a-banner is-error" role="alert"><span class="ic">' + L("circle-alert") + "</span><div>That code doesn't match. 2 tries left.</div></div>" : st === "locked" ? '<div class="cwl-a-banner is-info" role="status"><span class="ic">' + L("info") + "</span><div>Too many tries. Try again in 10 minutes, or ask Chris for the code again.</div></div>" : "";
      return '<div class="cwl-fu-page">' + head + "<h2>Enter the code Chris gave you</h2><p>You'll run the pre-mortem, commander's intent and affirming the cards for " + esc(D.church) + ". The code is nine letters and numbers.</p>" + codeBoxes(9, st === "enter" ? "MAPLE" : st === "wrong" ? "MAPLE4812" : "MAPLE4812") + msg + B(st === "locked" ? "Try again in 10 minutes" : "Continue", st === "locked" ? "is-secondary" : "is-primary", "arrow-right", st === "locked" ? " disabled" : "") + "</div>";
    }
    var s1 = st === "pair" || st === "waiting" ? "is-now" : "is-done";
    var steps = '<ol class="cwl-fu-steps"><li class="is-done"><div class="t">Code accepted<span>You\'re Priya Shah, running the follow-up. Access ends at ' + F.closes + " pm.</span></div></li>" +
      '<li class="' + (st === "paired" ? "is-done" : "is-now") + '"><div class="t">Open the TV view in its own tab<span>This is the screen the team sees. It never shows names, and it keeps the last screen if the wifi drops.</span>' + (st === "paired" ? '<div class="cwl-fu-tvtab">' + L("monitor-check") + "<span>TV view paired. Waiting for you to share it in the call.</span></div>" : st === "waiting" ? '<div class="cwl-fu-tvtab">' + L("loader-circle") + "<span>Waiting for the tab to connect</span></div>" : B("Open the TV view", "is-primary", "external-link")) + "</div></li>" +
      '<li class="' + (st === "paired" ? "is-now" : "") + '"><div class="t">Share that tab in the video call<span>Choose the TV view tab when your call asks what to share, not your whole screen.</span></div></li>' +
      '<li><div class="t">Take the remote on your phone<span>Open the same link on your phone, enter the code again, and tap Take the remote. Chris can take it back at any time.</span><span class="cwl-a-row">' + B("Show a QR code for your phone", "is-secondary", "qr-code") + "</span></div></li></ol>";
    return '<div class="cwl-fu-page">' + head + "<h2>Pair the TV view</h2><p>Four short steps. Chris and the team will see what you share in the call.</p>" + steps + "</div>";
  }
  /* The team facilitator's remote. o: {held: you|chris, ending, offline, ended} */
  function TeamRemote(box, o) {
    o = o || {};
    var l = o.ended ? "" : '<div class="cwl-wf-holder">' + L("hand-helping") + '<span class="grow">' + (o.held === "chris" ? "Chris has the remote" : "You have the remote") + "</span></div>";
    var ex = '<div class="cwl-fu-expiry">' + L("clock") + (o.ending ? "Access ends in 15 minutes" : o.ended ? "Access ended. The remote is back with Chris" : "Access ends at " + F.closes + " pm") + "</div>";
    var btns = o.ended ? "" : o.held === "chris" ? '<div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">Chris took it for a moment. The TV didn\'t change. Ask him to hand it back.</div>' + P4.rbtn("Ask for the remote", "hand", "") :
      P4.rbtn("Go live on the next session", "play", "is-live") + '<div class="cwl-r-grid">' + P4.rbtn("Back", "chevron-left") + P4.rbtn("Next", "chevron-right") + '</div><div class="cwl-r-grid">' + P4.rbtn("Phones down", "smartphone") + P4.rbtn("Spotlight", "sun") + "</div>" + '<div class="cwl-r-grid">' + P4.rbtn("Hide", "eye-off") + P4.rbtn("Undo AI merge", "undo-2") + "</div>";
    P4.remote(box, { held: o.held === "chris", title: o.ended ? "Follow-up ended" : "Commander's intent", sync: o.offline ? SYNC("is-syncing", "wifi-off", "Reconnecting") : SYNC("", "check", "On the TV"), banner: l, top: '<div class="cwl-a-eyebrow">Pre-mortem to affirm · no notes</div>' + ex, buttons: btns });
  }
  var SHOW = [["list-ordered", "The three sessions of this block, in order, with Go live, Back and Next"], ["smartphone", "Phones down and Open phones, Spotlight, Hide an item, Undo the last AI merge, room size"], ["tv", "A small mirror of what the TV has confirmed it is showing"], ["users", "Assigning pairs for commander's intent, with first names"], ["clock", "When the access ends"]];
  var HIDE = [["eye-off", "The alignment signal"], ["eye-off", "Presenter notes"], ["eye-off", "Discover data: survey results, the Four Helpful Lists, interviews, What We Heard"], ["eye-off", "The half day and every other session, including the lens summaries"], ["eye-off", "The door list, emails, scribe cards and settings"], ["eye-off", "Publish to CORE, the AI switches, and revoking access"]];
  function FollowUpScope() {
    var li = function (a) { return a.map(function (x) { return "<li>" + L(x[0]) + "<span>" + esc(x[1]) + "</span></li>"; }).join(""); };
    return '<div class="cwl-fu-scope"><div class="cwl-fu-card"><h4>The team remote shows</h4><ul>' + li(SHOW.map(function (x) { return ["check", x[1]]; })) + '</ul></div><div class="cwl-fu-card is-hide"><h4>The team remote never shows</h4><ul class="is-hide">' + li(HIDE) + "</ul></div></div>";
  }

  /* ================================================================
     Pass 5 revisions: the overnight review of outcomes and the 3-year Vision first pass
     ================================================================ */
  function OutcomeStatusList(states, o) {
    o = o || {};
    var rows = D.ovnRows.map(function (r) {
      var st = states[r.id] || "ready", k = st.split(":")[0], sub = k === "drafting" ? "Tidying from Day 1" : r.sub;
      if (o.ai === false) { st = r.thin ? "flagged" : "nodraft"; sub = r.thin ? r.sub : "AI is off. Write it from the room's bullets and the scribe's numbers"; }
      if (o.unreadable && r.id === "o2") sub = "1 easel photo the draft couldn't read";
      var title = r.title; if (o.long && r.id === "o4") title = W.longOutcome;
      return '<div class="cwl-ovn-row' + (o.current === r.id ? " is-current" : "") + '"><span class="ic">' + L(r.thin ? "list-x" : "list-checks") + '</span><div class="t"><b>' + esc(title) + "</b>" + (o.compact ? "" : "<span>" + esc(sub) + "</span>") + "</div>" + P5.statusChip(st) + "</div>";
    }).join("");
    var done = '<div class="cwl-ovn-row"><span class="ic">' + L("telescope") + '</span><div class="t"><b>10-year Future, five lenses</b>' + (o.compact ? "" : "<span>Decided by the room on Day 1. Not redrafted overnight</span>") + '</div><span class="cwl-ovn-st is-reviewed">' + L("badge-check") + "Signed off on Day 1</span></div>";
    return '<div class="cwl-ovn-list">' + (o.compact ? "" : '<div class="cwl-ovn-list-h"><span>' + esc(o.title || "Provisional Vision Outcomes and the 3-year Vision first pass") + "</span><span>" + esc(o.right || "") + "</span></div>") + rows + done + "</div>";
  }
  function hl(text, part) {
    if (!part) return esc(text);
    var i = text.toLowerCase().indexOf(part.toLowerCase()); if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<span class="cwl-ovn-hl">' + esc(text.slice(i, i + part.length)) + "</span>" + esc(text.slice(i + part.length));
  }
  function srcCard(r, lit) {
    var cls = "cwl-ovn-scard" + (lit ? " is-lit" : " is-dim");
    if (r.t === "bullet") return '<div class="' + cls + '"><div class="meta">' + L("smartphone") + "Phone · 3-year Vision, first pass · anonymous</div><div>" + hl(r.s, lit ? r.hl : null) + "</div></div>";
    if (r.t === "card") {
      var c = D.ovnCards[r.id], k = S.kinds[c.kind];
      return '<div class="' + cls + '"><div class="meta">' + L(k.icon) + "Scribe · " + esc(k.label) + " · " + esc(c.time) + "</div><div" + (c.kind === "quote" ? ' style="font-weight:600"' : "") + ">" + (c.kind === "quote" ? "“" : "") + hl(c.text, lit ? r.hl : null) + (c.kind === "quote" ? "”" : "") + "</div>" + (c.owner ? '<span class="who">' + L("lock") + esc(c.owner) + " · for the record, never in the room</span>" : "") + "</div>";
    }
    if (r.t === "photo") {
      var p = S.photos[r.id], lines = [];
      if (lit && r.hl) p.lines.forEach(function (t, i) { if (t.toLowerCase().indexOf(r.hl.toLowerCase()) >= 0 || r.hl.toLowerCase().indexOf(t.toLowerCase()) >= 0) lines.push(i); });
      return '<div class="' + cls + '"><div class="meta">' + L("camera") + "Easel photo · " + esc(p.label) + " · " + esc(p.time) + "</div>" + P5.photoSVG(r.id, { hi: lit ? lines : [] }) + "</div>";
    }
    return "";
  }
  /* OutcomeDraft: the tidied outcome and its bullets. Each bullet shows how many sources it has; one without a source is flagged. */
  function OutcomeDraft(host, o) {
    this.o = o || {}; this.el = h("div", "cwl-ovn-draft"); host.appendChild(this.el); this.state = { sel: "b1", restored: {}, removed: {} };
    var self = this;
    this.el.addEventListener("click", function (e) {
      var s = e.target.closest && e.target.closest(".cwl-ovo-i"); if (s && !self.state.locked && !self.state.ai0) { self.select(s.getAttribute("data-b")); return; }
      var r = e.target.closest && e.target.closest("[data-act='restore']"); if (r) self.restore(self.state.sel);
    });
  }
  OutcomeDraft.prototype.data = function () { var d = D.outcomes[this.state.thin ? 1 : 0]; if (this.state.extra && !this.state.thin) d = { id: d.id, name: d.name, was: d.was, bullets: d.bullets.concat([{ id: "b4", ai: "Alpha welcomes 120 people each season.", src: [] }]) }; return d; };
  OutcomeDraft.prototype.textOf = function (b) { return this.state.restored[b.id] && b.room ? b.room : b.ai; };
  OutcomeDraft.prototype.set = function (st) {
    var self = this, d; for (var k in st) this.state[k] = st[k]; st = this.state; d = this.data();
    var prov = st.reviewed ? '<span class="cwl-ovn-prov">' + L("badge-check") + "Reviewed by " + esc(P5.fac(st.reviewed).first) + "</span>" : st.ai0 ? '<span class="cwl-ovn-prov">' + L("pencil-line") + "Written from the room's bullets</span>" : '<span class="cwl-ovn-prov">' + AIMark() + " AI tidied · not yet reviewed</span>";
    var head = '<div class="cwl-ovn-h"><h2>' + L("list-checks") + esc(d.name) + '</h2>' + prov + '<span style="margin-left:auto"></span>' + (st.locked ? lockChip(st.locked, "this outcome") : "") + "</div>" + (d.was !== d.name ? '<div class="cwl-ovo-was">The room called it “' + esc(d.was) + "”. Renamed on Day 1 and kept.</div>" : "");
    var body;
    if (st.thin) body = '<div class="cwl-ovo-empty">' + L("triangle-alert") + "<div><strong>No bullets.</strong> The room ran out of time before “In 2029, what's true?” for this outcome. It stays on the list and shows as thin on Day 2, so the room can fill it or rethink it. The draft doesn't invent any.</div></div>";
    else if (st.ai0) body = '<div class="cwl-ovo-b">' + (st.written || []).map(function (id) { var b = d.bullets.filter(function (x) { return x.id === id; })[0]; return '<div class="cwl-ovo-i" data-b="' + id + '"><span class="txt">' + esc(b.room || b.ai) + '</span><span class="cwl-ovn-mark is-room">' + L("quote") + "</span></div>"; }).join("") + '<div class="cwl-a-muted">Add the room\'s bullets from the right, then edit them in the present tense.</div></div>';
    else body = '<div class="cwl-ovo-b' + (st.locked ? " is-locked" : "") + '"' + (st.editing ? ' contenteditable="true" role="textbox"' : "") + ">" + d.bullets.map(function (b) {
      var n = b.src.length, room = self.textOf(b) === b.room, removed = st.removed[b.id];
      var mark = n ? '<span class="cwl-ovn-mark' + (room ? " is-room" : "") + '">' + (room ? L("quote") : "") + n + "</span>" : '<span class="cwl-ovn-mark is-none">' + L("triangle-alert") + "</span>";
      var text = st.long && b.id === "b1" ? W.longOutcome + "." : self.textOf(b);
      return '<div class="cwl-ovo-i' + (b.id === st.sel ? " is-selected" : "") + (!n && !removed ? " is-unsourced" : "") + '" data-b="' + b.id + '" tabindex="0"' + (removed ? ' style="opacity:.5;text-decoration:line-through"' : "") + '><span class="txt" data-text="' + esc(text) + '">' + esc(text) + "</span>" + mark + "</div>";
    }).join("") + "</div>";
    var sel = d.bullets.filter(function (x) { return x.id === st.sel; })[0], tools = "";
    if (sel && !st.ai0 && !st.thin) {
      var can = sel.room && this.textOf(sel) !== sel.room;
      tools = '<div class="cwl-ovn-tools"><span class="lbl">Bullet ' + (d.bullets.indexOf(sel) + 1) + (sel.src.length ? "" : " · no source") + "</span>" + B("Edit", "is-secondary is-sm", "pencil", st.locked ? " disabled" : "") +
        B(can ? "Restore the room's words" : sel.room ? "The room's words" : "No single source to restore", "is-secondary is-sm", "quote", can && !st.locked ? ' data-act="restore"' : " disabled") + B(st.removed[sel.id] ? "Put back" : "Remove", "is-ghost is-sm", st.removed[sel.id] ? "undo-2" : "trash-2", st.locked ? " disabled" : "") + "</div>";
    }
    var unsrc = d.bullets.filter(function (b) { return !b.src.length && !st.removed[b.id]; }).length;
    var banner = unsrc && !st.reviewed && !st.ai0 ? '<div class="cwl-a-banner is-warning"><span class="ic">' + L("triangle-alert") + "</span><div><strong>Bullet 4 has no source.</strong> Nothing the room typed, the scribe captured or the easel shows supports “120 people”. Add a source, rewrite it from the room's words, or remove it before accepting the outcome.</div></div>" : "";
    var foot = '<div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);font-weight:600">The number in a bullet comes from a scribe card or an easel photo, never from the AI.</span>' + (st.reviewed ? CHIP("Outcome reviewed", "is-success", "badge-check") : B("Accept the outcome", "is-confirm", "badge-check", st.locked || unsrc || st.thin ? " disabled" : "")) + "</div>";
    this.el.innerHTML = head + body + tools + banner + foot; CL.icons();
  };
  OutcomeDraft.prototype.select = function (id) { if (this.state.sel === id) return; this.set({ sel: id }); if (this.o.onSelect) this.o.onSelect(id); };
  OutcomeDraft.prototype.restore = function (id) {
    var b = this.data().bullets.filter(function (x) { return x.id === id; })[0]; if (!b || !b.room || this.state.restored[id]) return;
    var span = this.el.querySelector('.cwl-ovo-i[data-b="' + id + '"] .txt'); this.state.restored[id] = true;
    if (span) P4.replaceText(span, b.room);
    var self = this; CL.later(function () { self.set({}); }, CL.reduced(this.el) ? 0 : ms("cwl-dur-line-replace") + 80);
  };
  /* OutcomeSources: the words behind the selected bullet. Sources come forward, the rest wait below. */
  function OutcomeSources(host) {
    this.el = h("div", "cwl-ovn-src cwl-ovo-src"); host.appendChild(this.el);
    this.el.innerHTML = '<div class="cwl-ovn-src-h">Sources for the selected bullet</div><div class="cwl-ovn-src-sent"></div><div class="cwl-ovn-srclist"></div>';
    this.list = this.el.querySelector(".cwl-ovn-srclist"); this.sentEl = this.el.querySelector(".cwl-ovn-src-sent");
  }
  OutcomeSources.prototype.set = function (bid, o) {
    o = o || {}; var d = D.outcomes[0], b = d.bullets.filter(function (x) { return x.id === bid; })[0] || { ai: "Alpha welcomes 120 people each season.", src: [] };
    var key = function (r) { return r.t + ":" + (r.id || r.s); };
    if (o.ai0) {
      this.el.querySelector(".cwl-ovn-src-h").textContent = "The room's bullets and the scribe's numbers";
      this.sentEl.textContent = "AI is off, so there's no tidy draft. Add the room's own bullets, then edit.";
      var items0 = d.bullets.map(function (x) { return { k: "b:" + x.id, html: '<div class="cwl-ovn-scard is-lit"><div class="meta">' + L("smartphone") + "Phone · anonymous</div><div>" + esc(x.room) + '</div><div class="cwl-a-row">' + SB((o.written || []).indexOf(x.id) >= 0 ? "Added" : "Add to the outcome", (o.written || []).indexOf(x.id) >= 0 ? "check" : "plus") + "</div></div>" }; });
      P4.keyed(this.list, items0, function () { return h("div"); }, function (el, it) { el.innerHTML = it.html; }, { instant: true }); CL.icons(); return;
    }
    this.el.querySelector(".cwl-ovn-src-h").textContent = "Sources for bullet " + (d.bullets.indexOf(b) + 1);
    this.sentEl.textContent = o.text || b.ai;
    var lit = b.src, litK = lit.map(key), all = [], seen = {};
    d.bullets.forEach(function (x) { x.src.forEach(function (r) { if (!seen[key(r)]) { seen[key(r)] = 1; all.push(r); } }); });
    var rest = all.filter(function (r) { return litK.indexOf(key(r)) < 0; }).slice(0, 2);
    var items = lit.map(function (r) { return { k: key(r), r: r, lit: true }; });
    if (!lit.length) items.push({ k: "none", none: true });
    items.push({ k: "divider", divider: true });
    rest.forEach(function (r) { items.push({ k: key(r), r: r, lit: false }); });
    if (o.unreadable) items.push({ k: "photo:easel-v2", r: { t: "photo", id: "easel-v2" }, unread: true });
    P4.keyed(this.list, items, function () { return h("div"); }, function (el, it) {
      var sig = it.none ? "none" : it.divider ? "div" : (it.lit ? "lit" : "dim") + (it.unread ? "u" : ""); if (el.getAttribute("data-sig") === sig) return; el.setAttribute("data-sig", sig);
      if (it.none) el.innerHTML = '<div class="cwl-a-banner is-warning"><span class="ic">' + L("triangle-alert") + "</span><div><strong>No source.</strong> No bullet, scribe card or easel photo supports this one.</div></div>";
      else if (it.divider) el.innerHTML = '<div class="cwl-ovn-src-h" style="margin-top:6px">Other sources for this outcome</div>';
      else if (it.unread) el.innerHTML = '<div class="cwl-ovn-scard"><div class="meta">' + L("camera") + "Easel photo · " + esc(S.photos["easel-v2"].label) + "</div>" + P5.photoSVG("easel-v2", { forceBlur: true, unreadable: true }) + '<div class="cwl-a-banner is-warning"><span class="ic">' + L("triangle-alert") + "</span><div><strong>The draft couldn't read this page.</strong> Type what it says so it can count as a source.</div></div>" + SB("Type what it says", "keyboard") + "</div>";
      else el.innerHTML = srcCard(it.r, it.lit);
      var card = el.querySelector(".cwl-ovn-scard.is-lit");
      if (card && !o.instant && !CL.reduced(el)) { card.classList.remove("is-lit"); requestAnimationFrame(function () { requestAnimationFrame(function () { card.classList.add("is-lit"); }); }); }
    }, { instant: o.instant, stagger: 40 });
    CL.icons();
  };
  /* PublishDay2 · OVN-03 revised: previews of what the room sees at 9:00 and 9:30, the checklist, Publish. st: not-ready | ready | published */
  function PublishDay2(el, o) {
    o = o || {}; var st = o.state || "ready", theme = o.theme || "dark";
    var ok = function (t, sub) { return '<div class="c is-ok"><span class="d">' + L("check") + '</span><div class="t">' + t + (sub ? "<span>" + sub + "</span>" : "") + "</div></div>"; };
    var todo = function (t, sub) { return '<div class="c is-todo"><span class="d"></span><div class="t">' + t + (sub ? "<span>" + sub + "</span>" : "") + "</div></div>"; };
    var flag = function (t, sub) { return '<div class="c is-flag"><span class="d">' + L("triangle-alert") + '</span><div class="t">' + t + (sub ? "<span>" + sub + "</span>" : "") + "</div></div>"; };
    var checks = st === "not-ready" ?
      ok("Leaders raised from within and A church that shows up for the city reviewed") + todo("New faith stories and Homes and every generation", "Chris and Jaisy are still in them") + flag("Flag not acknowledged: Families find a home here has no bullets", '<label class="cwl-a-check" style="margin-top:6px;font-weight:600;color:var(--cwl-app-text)"><input type="checkbox" tabindex="-1">Show it in the morning as thin</label>') :
      ok("Five outcomes reviewed", "Every number has a source") + ok("3-year Vision, first pass reviewed", "13 bullets, 2 with numbers added from scribe cards") + ok("1 flag acknowledged", "Families find a home here shows as thin in the morning") + ok("The 10-year Future needs nothing", "Decided by the room on Day 1. Day 2 starts with a short confirm");
    el.innerHTML = '<div class="cwl-ovn-pub"><div class="cwl-ovn-preview"><span class="cwl-a-eyebrow">TV preview · 9:00, the confirm opens</span><div class="pv-tv"></div></div><div class="cwl-ovn-preview"><span class="cwl-a-eyebrow">Phone preview · the first lens to confirm</span><div class="pv-ph"></div></div>' +
      '<div class="cwl-ovn-preview"><span class="cwl-a-eyebrow">Checklist</span><div class="cwl-ovn-check">' + checks + "</div></div></div>";
    var sh = P4.shell(el.querySelector(".pv-tv"), { theme: theme, unit: "answered" });
    var cf = new ConfirmLens(sh); cf.set({ lens: "congregation", settled: [], yes: 0, change: 0, missing: [], instant: true });
    sh.count(0, "answered", true); sh.state({ down: false });
    var ph = P4.phone(el.querySelector(".pv-ph"), { head: "live" });
    P5.ReadBackPhone(ph, { lens: "congregation", showTeam: false, showMissing: true });
    CL.icons(); return { sh: sh, cf: cf };
  }

  window.ClearwayLivePass4b = {
    AIMark: AIMark, sweepAi: sweepAi, fitSentences: fitSentences, sentencesOf: sentencesOf,
    LensSummaryTV: LensSummaryTV, SummaryPhone: SummaryPhone, summaryBlocks: blocks, SummaryEditor: SummaryEditor, SuggestionList: SuggestionList, VersionList: VersionList, DecisionPanel: DecisionPanel, LensSignoff: LensSignoff,
    FollowUpIssue: FollowUpIssue, FollowUpPair: FollowUpPair, TeamRemote: TeamRemote, FollowUpScope: FollowUpScope, codeBoxes: codeBoxes, rail: rail,
    ConfirmLens: ConfirmLens, OutcomeStatusList: OutcomeStatusList, OutcomeDraft: OutcomeDraft, OutcomeSources: OutcomeSources, PublishDay2: PublishDay2
  };
})();
