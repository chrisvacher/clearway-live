/* ================================================================
   CLEARWAY LIVE · DESIGN PASS 5 · scribe5.js
   window.ClearwayLivePass5: the milestone 5 components, named as in code.
   Scribe: ScribeCard, CaptureComposer, ScribeConsole, EaselCapture, ScribeFeed, PromotedQuote.
   Overnight: DraftParagraph, SourcePanel, VoicesAndTensions, ReviewPresence, VersionHistory,
   DraftStatusList, PublishCheck.
   Read-back: ReadBackLens, ReadBackTally, ReadBackPhone, MissingList, TrackedChange,
   CorrectionQueue, LensProgress.
   Rules kept in code here: speaker names render only where names: true (the review screens);
   nothing from a draft reaches a TV or phone component until it is published; the tally never
   settles a lens.
   ================================================================ */
(function () {
  "use strict";
  var CL = window.ClearwayLive, P3 = window.ClearwayLivePass3, P4 = window.ClearwayLivePass4, W = window.ClearwayLivePass4Data, S = window.ClearwayLivePass5Data;
  var h = CL.h, esc = CL.esc, L = CL.lucide, B = P4.B, CHIP = P4.CHIP, SYNC = P4.SYNC, IB = P4.IB, SB = P4.SB;
  function ms(n) { return CL.ms(n); }
  function fac(id) { for (var i = 0; i < S.facilitators.length; i++) if (S.facilitators[i].id === id) return S.facilitators[i]; return { first: "Claude", initials: "AI", name: "AI draft" }; }
  function sessionTitle(id) { for (var i = 0; i < S.runOfShow.length; i++) if (S.runOfShow[i].id === id) return S.runOfShow[i].title; return id; }
  function cardById(id) { var all = S.cards.concat([S.mitigation, S.longCard]); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function hl(text, part) {
    if (!part) return esc(text);
    var i = text.toLowerCase().indexOf(part.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<span class="cwl-ovn-hl">' + esc(text.slice(i, i + part.length)) + "</span>" + esc(text.slice(i + part.length));
  }

  /* ================================================================
     Easel photo: drawn as an easel page (the design files carry no real photos).
     hi: line indexes to highlight (the source words); unreadable: the page is blurred.
     ================================================================ */
  function photoSVG(id, o) {
    o = o || {};
    var p = S.photos[id] || S.photos["easel-1"], hiLines = o.hi || [];
    var lines = p.lines.map(function (t, i) {
      var y = 38 + i * 19, head = i === 0;
      if (o.unreadable || o.forceBlur) return '<rect class="blur" x="52" y="' + (y - 10) + '" width="' + (head ? 96 : 60 + (t.length * 3) % 70) + '" height="9" rx="4.5"/>';
      return (hiLines.indexOf(i) >= 0 ? '<rect class="hl" x="47" y="' + (y - 12) + '" width="' + Math.min(150, 10 + t.length * 5.1) + '" height="16" rx="3"/>' : "") +
        '<text class="ink' + (head ? " is-head" : "") + '" x="52" y="' + y + '" font-size="' + (head ? 11 : 10) + '"' + (t.length * 5.1 > 140 ? ' textLength="140" lengthAdjust="spacingAndGlyphs"' : "") + ">" + esc(t) + "</text>";
    }).join("");
    return '<span class="cwl-scr-photo" role="img" aria-label="Easel photo, ' + esc(p.label) + (o.unreadable ? ", hard to read" : "") + '"><svg viewBox="0 0 240 180" aria-hidden="true">' +
      '<path class="stand" d="M70 170 L58 178 M170 170 L182 178 M120 14 L120 6"/>' +
      '<rect class="paper" x="36" y="14" width="168" height="156" rx="2"/>' + lines + "</svg></span>";
  }
  function photoFigure(id, o) {
    o = o || {}; var p = S.photos[id];
    return '<figure class="' + (o.cls || "") + '">' + photoSVG(id, o) + '<figcaption class="cwl-scr-photo-cap"><b>' + esc(p.label) + "</b><span>" + esc(o.status || p.time) + "</span></figcaption>" + (o.extra || "") + "</figure>";
  }

  /* ================================================================
     ScribeCard: one capture. Icon and word tell the kinds apart.
     o: {names (review screens only), state, order, refiled, actions: "console"|"feed", promoted, session}
     ================================================================ */
  function kindChip(kind) { var k = S.kinds[kind]; return '<span class="cwl-scr-kind">' + L(k.icon) + "<span>" + esc(k.label) + "</span></span>"; }
  function stateChip(st, o) {
    if (st === "queued") return CHIP("Saved on this laptop", "is-outline", "wifi-off");
    if (st === "queued-phone") return CHIP("Saved on this phone", "is-outline", "wifi-off");
    if (st === "syncing") return SYNC("is-syncing", "refresh-cw", "Syncing");
    if (st === "synced") return SYNC("", "check", "Synced");
    if (st === "failed") return CHIP("Didn't upload", "is-error", "x");
    return "";
  }
  function ScribeCard(c, o) {
    o = o || {};
    var body = "";
    if (c.kind === "quote") body = '<div class="cwl-scr-text">“' + esc(c.text) + "”</div>";
    else if (c.kind === "photo") body = photoSVG(c.photo || "easel-1", { hi: o.hi });
    else if (c.kind === "file") body = '<div class="cwl-scr-file">' + L("file-text") + "<span>" + esc(c.text) + "</span><small>" + esc(c.size || "") + "</small></div>";
    else body = '<div class="cwl-scr-text">' + esc(c.text) + "</div>";
    if (c.kind === "tension" && c.views) body += '<div class="cwl-scr-views"><div><b>One view</b>' + esc(c.views[0]) + "</div><div><b>The other view</b>" + esc(c.views[1]) + "</div></div>";
    var facts = [];
    if (c.kind === "decision" && c.why) facts.push(L("message-square-text") + "Why: " + esc(c.why));
    if (c.kind === "action") { if (c.owner) facts.push(L("user") + esc(c.owner)); if (c.date) facts.push(L("calendar") + esc(c.date)); if (!c.owner) facts.push(L("user") + "No owner named"); }
    if (c.kind === "mitigation" && c.risk) facts.push(L("link") + "Linked to " + esc(c.risk));
    if (c.kind === "correction" && c.why) facts.push(L("message-square-text") + "Why: " + esc(c.why));
    if (c.who && o.names) facts.push(L("lock") + esc(c.who) + " · for the record");
    else if (c.who && o.recordNote) facts.push(L("lock") + "Speaker kept for the record");
    var acts = "", topActs = "";
    if (o.actions === "console") topActs = '<div class="cwl-scr-acts">' + IB("pencil", "Edit") + IB("folder-input", "Re-file to another session") + "</div>";
    if (o.actions === "feed" && c.kind === "quote") acts = '<div class="cwl-scr-acts">' + (o.promoted ? SB("Take off the TV", "monitor-off") : SB("Promote to TV", "tv", "is-primary")) + "</div>";
    var meta = esc(c.time) + (o.session ? " · " + esc(o.session) : "");
    return '<article class="cwl-scr-card is-' + c.kind + (o.state === "queued" || o.state === "queued-phone" ? " is-queued" : "") + (o.state === "failed" ? " is-failed" : "") + (o.promoted ? " is-promoted" : "") + '" aria-label="' + esc(S.kinds[c.kind].label) + '">' +
      '<div class="cwl-scr-top">' + (o.order ? '<span class="cwl-scr-order" aria-label="Sends ' + o.order + '">' + o.order + "</span>" : "") + kindChip(c.kind) + '<span class="cwl-scr-meta">' + meta + "</span>" +
      '<span class="cwl-scr-state">' + (o.refiled ? '<span class="cwl-scr-refiled">' + L("folder-input") + "Re-filed to " + esc(o.refiled) + "</span>" : stateChip(o.state)) + (o.promoted ? CHIP("On the TV", "is-outline", "tv") : "") + "</span>" + topActs + "</div>" +
      body + (facts.length ? '<div class="cwl-scr-facts"><span>' + facts.join("</span><span>") + "</span></div>" : "") + acts + "</article>";
  }

  /* ================================================================
     CaptureComposer: pick a kind by key, type, add a speaker for the record, Enter.
     The session it attaches to follows the run of show.
     o: {kind, text, who, session, off, error, correction: {lens, wording, why}}
     ================================================================ */
  function CaptureComposer(o) {
    o = o || {};
    var dis = o.off ? ' aria-disabled="true"' : "";
    if (o.correction) {
      var cr = o.correction;
      return '<div class="cwl-scr-comp cwl-a-row" style="flex-direction:column;align-items:stretch;gap:10px">' +
        '<div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-a-eyebrow">Capture</span>' + kindChip("correction") + "</div>" +
        '<div class="cwl-scr-attach">' + L("link") + "<span>For " + esc(cr.lens) + "</span></div>" +
        '<div class="cwl-a-field"><label class="cwl-a-flabel">The wording the room agrees</label><textarea class="cwl-a-input" tabindex="-1">' + esc(cr.wording || "") + "</textarea></div>" +
        '<div class="cwl-a-field"><label class="cwl-a-flabel">Why</label><textarea class="cwl-a-input" style="min-height:64px" tabindex="-1">' + esc(cr.why || "") + '</textarea><span class="cwl-a-help">Chris sees this with the change before accepting it.</span></div>' +
        '<div class="cwl-a-row" style="justify-content:space-between"><span class="cwl-scr-keys"><span class="cwl-a-kbd">Enter</span> send to Chris</span>' + B("Send correction", "is-primary", "corner-down-left") + "</div></div>";
    }
    var kinds = S.kindOrder.map(function (k) { var d = S.kinds[k]; return '<button type="button" class="cwl-a-tag" aria-pressed="' + (k === (o.kind || "quote") && !o.off) + '" aria-keyshortcuts="' + d.key + '"' + dis + ">" + L(d.icon) + esc(d.label) + '<span class="cwl-a-kbd">' + d.key + "</span></button>"; }).join("");
    var tension = (o.kind === "tension") ? '<div class="cwl-scr-two"><div class="cwl-a-field"><label class="cwl-a-flabel">One view</label><input class="cwl-a-input" tabindex="-1" value=""></div><div class="cwl-a-field"><label class="cwl-a-flabel">The other view</label><input class="cwl-a-input" tabindex="-1" value=""></div></div>' : "";
    var action = (o.kind === "action") ? '<div class="cwl-scr-two"><div class="cwl-a-field"><label class="cwl-a-flabel">Owner, if named</label><input class="cwl-a-input" tabindex="-1" value=""></div><div class="cwl-a-field"><label class="cwl-a-flabel">Date, if named</label><input class="cwl-a-input" tabindex="-1" value=""></div></div>' : "";
    return '<div class="cwl-scr-comp" style="display:flex;flex-direction:column;gap:10px">' +
      '<span class="cwl-a-eyebrow">Capture</span>' +
      '<div class="cwl-scr-kinds" role="group" aria-label="Card kind">' + kinds + "</div>" +
      '<div class="cwl-a-field"><label class="cwl-a-flabel">' + (o.kind === "tension" ? "The tension" : "What was said") + '</label><textarea class="cwl-a-input" tabindex="-1" placeholder="Type, pick a kind with 1 to 6, Enter to capture"' + (o.off ? " disabled" : "") + ">" + esc(o.text || "") + "</textarea>" + (o.error ? '<span class="cwl-a-err">' + L("circle-alert") + " " + esc(o.error) + "</span>" : "") + "</div>" + tension + action +
      '<div class="cwl-a-field"><label class="cwl-a-flabel">Who said it</label><input class="cwl-a-input" tabindex="-1" value="' + esc(o.who || "") + '" placeholder="Optional"' + (o.off ? " disabled" : "") + '><span class="cwl-scr-record">' + L("lock") + "For the record only. Never on the TV, phones or the read-back.</span></div>" +
      '<div class="cwl-scr-attach" title="' + esc(o.session || "") + '">' + L("link") + "<span>Attaches to " + esc(o.session || "Nothing live") + "</span></div>" +
      '<div class="cwl-a-row" style="justify-content:space-between;flex-wrap:nowrap">' + B("Upload a file", "is-ghost is-sm", "paperclip", o.off ? " disabled" : "") + B("Capture", "is-primary", "corner-down-left", o.off ? " disabled" : "") + "</div>" +
      '<div class="cwl-scr-keys"><span><span class="cwl-a-kbd">1</span> to <span class="cwl-a-kbd">6</span> kind</span><span><span class="cwl-a-kbd">Enter</span> capture</span><span><span class="cwl-a-kbd">U</span> upload</span><span><span class="cwl-a-kbd">Esc</span> clear</span></div></div>';
  }

  /* ================================================================
     ScribeConsole · SCR-01. The laptop: composer, this session's cards, the photo strip.
     ================================================================ */
  function ScribeConsole(el, o) {
    o = o || {};
    this.el = el;
    el.innerHTML = '<div class="cwl-scr"><header class="cwl-scr-head"><div class="grow"><div class="cwl-a-eyebrow">' + esc(S.church) + " · " + esc(o.day || "Day 1") + ' · Scribe</div><div class="cwl-scr-session"><b class="s-title"></b><span class="s-chip"></span></div></div>' +
      '<span class="cwl-scr-follow">' + L("list-ordered") + 'Follows the run of show</span><span class="s-sync"></span></header>' +
      '<div class="cwl-scr-body"><section class="cwl-scr-col is-comp" aria-label="Capture"></section><section class="cwl-scr-col is-cards" aria-label="This session\'s cards"><div class="cwl-scr-colhead"><span class="cwl-a-label s-count"></span><span class="cwl-a-muted s-note"></span></div><div class="s-banner"></div><div class="cwl-scr-list"></div><div class="cwl-scr-more"></div></section>' +
      '<section class="cwl-scr-col is-photos" aria-label="Photos"><div class="cwl-scr-colhead"><span class="cwl-a-label">Photos and files</span></div><div class="cwl-scr-strip"></div><span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">Photos from your phone attach to the live session.</span></section></div>' +
      '<div class="cwl-scr-off" hidden><div class="cwl-scr-off-card"><span class="disc">' + L("users") + '</span><h3>The team has the room</h3><p>The scribe console is off for the team-led block. The team\'s own cards are the record. It turns back on for the recap.</p></div></div></div>';
    this.list = el.querySelector(".cwl-scr-list"); this.comp = el.querySelector(".is-comp"); this.strip = el.querySelector(".cwl-scr-strip");
    CL.icons();
  }
  ScribeConsole.prototype.header = function (o) {
    var el = this.el;
    el.querySelector(".s-title").textContent = o.session || "Nothing live";
    el.querySelector(".s-chip").innerHTML = o.chip || (o.session ? CHIP("Live", "run-live", "radio") : CHIP("Nothing live", "", "pause"));
    el.querySelector(".s-sync").innerHTML = o.sync || SYNC("", "check", "Synced");
    el.querySelector(".cwl-scr-off").hidden = !o.off;
    CL.icons();
  };
  ScribeConsole.prototype.composer = function (o) { this.comp.innerHTML = CaptureComposer(o); CL.icons(); };
  /* cards: newest first. o: {newest, states {id: state}, orders, refiled {id: name}, banner, count, note, more, instant} */
  ScribeConsole.prototype.cards = function (cards, o) {
    o = o || {};
    var self = this;
    this.el.querySelector(".s-count").textContent = o.count || ("This session · " + cards.length + (cards.length === 1 ? " card" : " cards"));
    this.el.querySelector(".s-note").textContent = o.note || "Newest first";
    this.el.querySelector(".s-banner").innerHTML = o.banner || "";
    this.el.querySelector(".cwl-scr-more").textContent = o.more || "";
    var list = cards.map(function (c) { return { k: c.id, c: c }; });
    P4.keyed(this.list, list, function () { return h("div", "cwl-scr-slot"); }, function (slot, it) {
      var st = o.states && o.states[it.k], ord = o.orders && o.orders[it.k], rf = o.refiled && o.refiled[it.k];
      var sig = st + "|" + ord + "|" + rf + "|" + (it.c.text.length);
      if (slot.getAttribute("data-sig") !== sig) { slot.innerHTML = ScribeCard(it.c, { state: st, order: ord, refiled: rf, actions: "console", recordNote: true }); slot.setAttribute("data-sig", sig); }
      var card = slot.firstChild; if (card) card.classList.toggle("is-new", it.k === o.newest);
    }, { instant: o.instant });
    if (o.newest) CL.later(function () { var n = self.list.querySelector('[data-k="' + o.newest + '"] .cwl-scr-card'); if (n) n.classList.remove("is-new"); }, ms("cwl-dur-new-hold"));
    CL.icons();
  };
  /* photos: [{id, status, cls, extra}] newest first */
  ScribeConsole.prototype.photos = function (photos, o) {
    o = o || {};
    var list = photos.map(function (p) { return { k: p.id + (p.file ? "f" : ""), p: p }; });
    P4.keyed(this.strip, list, function () { return h("div"); }, function (slot, it) {
      var p = it.p, sig = (p.status || "") + (p.cls || "");
      if (slot.getAttribute("data-sig") === sig) return; slot.setAttribute("data-sig", sig);
      if (p.file) slot.innerHTML = '<div class="cwl-scr-file">' + L("file-text") + "<span>" + esc(p.file) + "</span></div>";
      else slot.innerHTML = photoFigure(p.id, { status: p.status, cls: p.cls, extra: p.extra, forceBlur: false });
    }, { instant: o.instant });
    CL.icons();
  };

  /* ================================================================
     EaselCapture · SCR-02. The scribe's phone: one tap, retake or attach, upload a file.
     o: {step: camera|review|uploading|attached|queued|failed|off|nothing, session}
     ================================================================ */
  function EaselCapture(box, o) {
    o = o || {};
    var el = CL.appPhone(box, "scribe");
    var st = o.step || "camera", sess = o.session || "Five Lenses: Community";
    var sync = st === "queued" ? CHIP("Offline", "is-outline", "wifi-off") : st === "uploading" ? SYNC("is-syncing", "refresh-cw", "Uploading") : st === "failed" ? CHIP("Didn't upload", "is-error", "x") : SYNC("", "check", "Synced");
    var head = '<div class="cwl-ph-head" style="border-color:var(--cwl-app-border)"><span class="cwl-a-label">Scribe</span>' + sync + "</div>";
    var body;
    if (st === "off") body = '<div class="cwl-scr-off-card" style="padding:24px 8px"><span class="disc">' + L("users") + '</span><h3 style="font-size:var(--cwl-fs-app-section-title)">The team has the room</h3><p style="font-size:var(--cwl-fs-app-table)">Photos are off for the team-led block.</p></div>';
    else {
      var view = st === "review" || st === "uploading" || st === "failed" || st === "queued" || st === "attached" ? photoSVG(o.photo || "easel-1") : '<span style="color:var(--cwl-app-card);font-size:var(--cwl-fs-app-micro);font-weight:600">Point at the easel page</span>';
      body = '<div class="cwl-scr-cam"><div><div class="cwl-a-eyebrow">Attaches to</div><div class="cwl-a-label cwl-a-trunc" title="' + esc(sess) + '">' + (st === "nothing" ? "Nothing live" : esc(sess)) + "</div></div>" +
        '<div class="cwl-scr-view">' + (st === "camera" || st === "nothing" ? '<span class="frame"></span>' : "") + view + "</div>";
      if (st === "camera" || st === "nothing") body += '<button type="button" class="cwl-scr-shutter" aria-label="Photograph the easel"' + (st === "nothing" ? ' aria-disabled="true"' : "") + ">" + L("camera") + "</button>" + (st === "nothing" ? '<div class="cwl-a-muted" style="text-align:center;font-size:var(--cwl-fs-app-micro)">Photos attach to the live session. Nothing is live.</div>' : "") + '<div class="cwl-scr-phrow">' + B("Upload a file", "is-secondary is-sm", "paperclip") + B("This session", "is-ghost is-sm", "images") + "</div>";
      else if (st === "review") body += '<div class="cwl-scr-phrow">' + B("Retake", "is-secondary", "rotate-ccw") + B("Attach", "is-primary", "check") + "</div>";
      else if (st === "uploading") body += '<div class="cwl-progress" role="progressbar" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100"><i style="width:60%"></i></div><div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">Uploading to ' + esc(sess) + "</div>";
      else if (st === "attached") body += '<div class="cwl-a-banner is-info"><span class="ic">' + L("check") + "</span><div><strong>Attached.</strong> It's on the console now.</div></div>" + '<button type="button" class="cwl-scr-shutter" aria-label="Photograph the easel">' + L("camera") + "</button>";
      else if (st === "queued") body += '<div class="cwl-scr-queue">' + L("wifi-off") + '<span>Saved on this phone</span><span class="n" style="margin-left:auto">2</span></div><div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">Photos send in the order you took them when the phone is back online.</div>';
      else if (st === "failed") body += '<div class="cwl-a-banner is-error" role="alert"><span class="ic">' + L("x") + "</span><div><strong>This photo didn't upload.</strong> It's still on this phone.</div></div>" + '<div class="cwl-scr-phrow">' + B("Retake", "is-secondary", "rotate-ccw") + B("Try again", "is-primary", "refresh-cw") + "</div>";
      body += "</div>";
    }
    el.innerHTML = head + '<div class="cwl-r-body">' + body + "</div>";
    CL.icons();
    return el;
  }

  /* ================================================================
     ScribeFeed · the control surface's private panel. Cards land as they're captured;
     a quote can be promoted to the TV, anonymously. No speaker names here.
     ================================================================ */
  function ScribeFeed(host, o) {
    this.o = o || {};
    this.el = h("div", "cwl-scr-feed"); host.appendChild(this.el);
    this.more = h("div", "cwl-scr-feed-more"); host.appendChild(this.more);
  }
  ScribeFeed.prototype.set = function (cards, o) {
    o = o || {};
    var max = o.max || 4, shown = cards.slice(0, max), self = this;
    P4.keyed(this.el, shown.map(function (c) { return { k: c.id, c: c }; }), function () { return h("div"); }, function (slot, it) {
      var pr = o.promoted === it.k, st = o.states && o.states[it.k], sig = pr + "|" + st;
      if (slot.getAttribute("data-sig") !== sig) { slot.innerHTML = ScribeCard(it.c, { actions: "feed", promoted: pr, state: st }); slot.setAttribute("data-sig", sig); }
      var card = slot.firstChild; if (card) card.classList.toggle("is-new", it.k === o.newest);
    }, { instant: o.instant, stagger: o.stagger });
    this.more.textContent = cards.length > max ? "+ " + (cards.length - max) + " more cards on the scribe console" : "";
    if (o.newest) CL.later(function () { var n = self.el.querySelector('[data-k="' + o.newest + '"] .cwl-scr-card'); if (n) n.classList.remove("is-new"); }, ms("cwl-dur-new-hold"));
    CL.icons();
  };

  /* PromotedQuote · TV. A scribe quote, anonymous, in the pass 3 spotlight with the content treatment. */
  function PromotedQuote(sh, text, o) {
    o = o || {};
    if (!text) { sh.spotlight(null); return; }
    var words = text.split(" "), cut = Math.max(1, Math.floor(words.length * 0.55));
    var html = '<div class="cwl-pq-text">“' + esc(words.slice(0, cut).join(" ")) + " <strong>" + esc(words.slice(cut).join(" ")) + "”</strong></div>";
    sh.spotlight(html, esc(o.session || "Five Lenses: Community"), "From the room");
  }

  /* ================================================================
     OVERNIGHT REVIEW
     ================================================================ */
  function avatar(id, size) { var f = fac(id); return '<span class="cwl-a-avatar"' + (size ? ' style="width:' + size + "px;height:" + size + 'px"' : "") + ' title="' + esc(f.name) + '">' + esc(f.initials) + "</span>"; }

  /* ReviewPresence: [{id, where, editing, you}] */
  function ReviewPresence(list) {
    return '<div class="cwl-ovn-pres" aria-label="Who is reviewing">' + list.map(function (p) {
      var f = fac(p.id);
      return '<span class="cwl-ovn-who' + (p.you ? " is-you" : "") + '">' + avatar(p.id) + "<span><b>" + esc(p.you ? "You" : f.first) + "</b> · " + (p.editing ? "editing " : "in ") + esc(p.where) + "</span></span>";
    }).join("") + "</div>";
  }
  function lockChip(id, what) { return '<span class="cwl-ovn-lock">' + avatar(id) + L("lock") + esc(fac(id).first) + " is editing" + (what ? " " + esc(what) : "") + "</span>"; }

  /* DraftStatusList: every lens and the provisional outcomes with their state */
  function statusChip(st) {
    var p = (st || "ready").split(":"), k = p[0], who = p[1] ? fac(p[1]).first : "";
    if (k === "drafting") return '<span class="cwl-ovn-st is-drafting">' + L("loader-circle") + "Drafting</span>";
    if (k === "ready") return '<span class="cwl-ovn-st is-ready">' + L("circle-check") + "Ready to review</span>";
    if (k === "editing") return '<span class="cwl-ovn-st is-editing">' + L("pencil") + esc(who) + " editing</span>";
    if (k === "reviewed") return '<span class="cwl-ovn-st is-reviewed">' + L("badge-check") + "Reviewed" + (who ? " by " + esc(who) : "") + "</span>";
    if (k === "flagged") return '<span class="cwl-ovn-st is-flag"><span class="d">' + L("triangle-alert") + "</span>Flagged</span>";
    if (k === "nodraft") return '<span class="cwl-ovn-st">' + L("pencil-line") + "Write from the room's words</span>";
    return "";
  }
  function sectionIcon(sec) { return sec.lens ? P4.lensIcon(sec.lens) : L(sec.kind === "outcomes" ? "list-checks" : "telescope"); }
  function DraftStatusList(states, o) {
    o = o || {};
    var rows = S.sections.map(function (sec) {
      var st = states[sec.id] || "ready", k = st.split(":")[0];
      var sub = k === "drafting" ? "Drafting from Day 1" : k === "flagged" ? (sec.note || "Needs a look") : sec.id === "operations" && o.unreadable ? "1 easel photo the draft couldn't read" : (sec.sentences + (sec.kind === "lens" ? " sentences" : sec.kind === "outcomes" ? " outcomes" : " bullets") + (st.indexOf("editing") === 0 ? " · locked for " + (st.split(":")[1] === "cv" ? "Jaisy" : "Chris") : ""));
      if (o.ai === false && sec.kind === "lens") { st = "nodraft"; sub = "AI is off. Write it from the room's sentences"; }
      return '<div class="cwl-ovn-row' + (o.current === sec.id ? " is-current" : "") + '"><span class="ic">' + sectionIcon(sec) + '</span><div class="t"><b>' + esc(sec.title) + "</b>" + (o.compact ? "" : "<span>" + esc(sub) + "</span>") + "</div>" + statusChip(st) + "</div>";
    }).join("");
    return '<div class="cwl-ovn-list">' + (o.compact ? "" : '<div class="cwl-ovn-list-h"><span>' + esc(o.title || "10-year Future by lens, then the outcomes") + "</span><span>" + esc(o.right || "") + "</span></div>") + rows + "</div>";
  }

  /* VoicesAndTensions */
  function VoicesAndTensions(d, o) {
    o = o || {};
    return '<div class="cwl-ovn-vt"><section><h4>' + L("mic") + "Voices not to lose</h4>" + d.voices.map(function (v) { return "<blockquote>“" + esc(v.text) + "”</blockquote><small>" + esc(v.from) + ". Kept apart so it isn't smoothed away.</small>"; }).join("") + "</section>" +
      "<section><h4>" + L("zap") + "Tensions the room named</h4>" + d.tensions.map(function (t) { return "<blockquote>" + esc(t.text) + '</blockquote><div class="cwl-scr-views"><div><b>One view</b>' + esc(t.views[0]) + "</div><div><b>The other view</b>" + esc(t.views[1]) + "</div></div><small>Scribe tension card. Goes to Strategic Tensions, not into the paragraph.</small>"; }).join("") + "</section></div>";
  }

  /* VersionHistory */
  function VersionHistory(versions) {
    return '<div class="cwl-ovn-ver">' + versions.map(function (v) {
      var who = v.who === "ai" ? '<span class="cwl-a-avatar" style="background:var(--cwl-ai)" title="AI">' + CL.aiBadge(true) + "</span>" : avatar(v.who);
      return '<div class="v"><span class="n">v' + v.n + "</span>" + who + '<div class="t"><b>' + esc(v.what) + "</b><span>" + esc(v.who === "ai" ? "AI draft" : fac(v.who).first) + " · " + esc(v.time) + "</span></div>" + (v.current ? CHIP("Current", "is-info", "check") : SB("Restore", "history")) + "</div>";
    }).join("") + "</div>";
  }

  /* ================================================================
     DraftParagraph · OVN-02. Each sentence carries a source marker; a sentence with no
     source is flagged. The selected sentence gets Edit, Restore the room's words and Remove.
     ================================================================ */
  function DraftParagraph(host, o) {
    this.o = o || {}; this.d = this.o.data || S.community;
    this.el = h("div", "cwl-ovn-draft"); host.appendChild(this.el);
    this.state = { sel: "s3", restored: {}, removed: {} };
    var self = this;
    this.el.addEventListener("click", function (e) {
      var s = e.target.closest && e.target.closest(".cwl-ovn-sent"); if (s && !self.state.locked && !self.state.ai0) { self.select(s.getAttribute("data-s")); return; }
      var r = e.target.closest && e.target.closest("[data-act='restore']"); if (r) self.restore(self.state.sel);
    });
  }
  DraftParagraph.prototype.textOf = function (s) { return this.state.restored[s.id] && s.room ? s.room : s.ai; };
  DraftParagraph.prototype.set = function (st) {
    var self = this, d = this.d;
    for (var k in st) this.state[k] = st[k];
    st = this.state;
    var lensName = P4.lensByKey(d.lens).name;
    var prov = st.reviewed ? '<span class="cwl-ovn-prov">' + L("badge-check") + "Reviewed by " + esc(fac(st.reviewed).first) + "</span>" : st.ai0 ? '<span class="cwl-ovn-prov">' + L("pencil-line") + "Written from the room's sentences</span>" : '<span class="cwl-ovn-prov">' + CL.aiBadge() + " AI drafted · not yet reviewed</span>";
    var head = '<div class="cwl-ovn-h"><h2>' + P4.lensDot(d.lens) + esc(lensName) + ", " + S.Y.future + "</h2>" + prov + '<span style="margin-left:auto"></span>' + (st.locked ? lockChip(st.locked, "this lens") : "") + "</div>";
    var sents = d.sentences;
    var para;
    if (st.ai0) {
      para = '<div class="cwl-ovn-para">' + (st.written || []).map(function (id) { var s = sents.filter(function (x) { return x.id === id; })[0]; return '<span class="cwl-ovn-sent" data-s="' + id + '"><span class="txt">' + esc(s.room || s.ai) + '</span><span class="cwl-ovn-mark is-room" title="The room\'s own words">' + L("quote") + "</span></span> "; }).join("") +
        '<span class="cwl-a-muted">Add the room\'s sentences from the right, then edit them into a paragraph in the present tense.</span></div>';
    } else if (st.loading) {
      para = '<div class="cwl-ovn-para"><div class="cwl-a-muted" style="margin-bottom:10px">' + CL.aiBadge() + " Drafting from 23 phone sentences, 7 scribe cards and 2 easel photos</div>" + '<span class="cwl-a-skel" style="width:96%;height:12px"></span><div style="height:10px"></div><span class="cwl-a-skel" style="width:88%;height:12px"></span><div style="height:10px"></div><span class="cwl-a-skel" style="width:70%;height:12px"></span></div>';
    } else {
      para = '<div class="cwl-ovn-para' + (st.locked ? " is-locked" : "") + (st.editing ? " is-editing" : "") + '"' + (st.editing ? ' contenteditable="true" role="textbox" aria-multiline="true"' : "") + ">" + (st.long ? '<span class="cwl-ovn-sent" data-s="s1"><span class="txt">' + esc(d.long) + '</span><span class="cwl-ovn-mark">9</span></span>' :
        sents.map(function (s, i) {
          var room = self.textOf(s) === s.room;
          var n = s.src.length, removed = st.removed[s.id];
          var mark = n ? '<span class="cwl-ovn-mark' + (room ? " is-room" : "") + '" title="' + n + (n === 1 ? " source" : " sources") + (room ? ", the room's own words" : "") + '">' + (room ? L("quote") : "") + n + "</span>" : '<span class="cwl-ovn-mark is-none" title="No source">' + L("triangle-alert") + "</span>";
          return '<span class="cwl-ovn-sent' + (s.id === st.sel ? " is-selected" : "") + (!n && !removed ? " is-unsourced" : "") + (removed ? " is-removed" : "") + '" data-s="' + s.id + '" tabindex="0"><span class="txt" data-text="' + esc(self.textOf(s)) + '">' + esc(self.textOf(s)) + "</span>" + mark + "</span>" + (i < sents.length - 1 ? " " : "");
        }).join("")) + "</div>";
    }
    var sel = sents.filter(function (x) { return x.id === st.sel; })[0];
    var tools = "";
    if (!st.ai0 && !st.loading && sel && !st.long) {
      var canRestore = sel.room && self.textOf(sel) !== sel.room;
      tools = '<div class="cwl-ovn-tools"><span class="lbl">Sentence ' + (sents.indexOf(sel) + 1) + (sel.src.length ? "" : " · no source") + "</span>" +
        B("Edit", "is-secondary is-sm", "pencil", st.locked ? " disabled" : "") +
        B(canRestore ? "Restore the room's words" : sel.room ? "The room's words" : "No single source to restore", "is-secondary is-sm", "quote", (canRestore && !st.locked ? ' data-act="restore"' : " disabled")) +
        B(st.removed[sel.id] ? "Put back" : "Remove", "is-ghost is-sm", st.removed[sel.id] ? "undo-2" : "trash-2", st.locked ? " disabled" : "") + "</div>";
    }
    var unsourced = sents.filter(function (s) { return !s.src.length && !st.removed[s.id]; }).length;
    var banner = st.long || st.ai0 || st.loading ? "" : unsourced && !st.reviewed ? '<div class="cwl-a-banner is-warning"><span class="ic">' + L("triangle-alert") + "</span><div><strong>Sentence 7 has no source.</strong> Nothing the room wrote, said or put on the easel supports it. Add a source, rewrite it from the room's words, or remove it before accepting the lens.</div></div>" : "";
    var foot = '<div class="cwl-a-row" style="justify-content:space-between">' + '<span class="cwl-tc-key cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);font-weight:600"><span><span class="cwl-ovn-mark">3</span> sources</span><span><span class="cwl-ovn-mark is-room">' + L("quote") + "2</span> the room's own words</span><span><span class=\"cwl-ovn-mark is-none\">" + L("triangle-alert") + "</span> no source</span></span>" +
      (st.reviewed ? CHIP("Lens reviewed", "is-success", "badge-check") : B("Accept the lens", "is-confirm", "badge-check", st.locked || (unsourced && !st.ai0) || st.loading ? " disabled" : "")) + "</div>";
    this.el.innerHTML = head + para + tools + banner + foot;
    CL.icons();
  };
  DraftParagraph.prototype.select = function (id) {
    if (this.state.sel === id) return;
    this.set({ sel: id });
    if (this.o.onSelect) this.o.onSelect(id);
  };
  /* Restore the room's words in place: the AI wording gives way over cwl-dur-line-replace */
  DraftParagraph.prototype.restore = function (id) {
    var s = this.d.sentences.filter(function (x) { return x.id === id; })[0];
    if (!s || !s.room || this.state.restored[id]) return;
    var span = this.el.querySelector('.cwl-ovn-sent[data-s="' + id + '"] .txt');
    this.state.restored[id] = true;
    if (span) P4.replaceText(span, s.room);
    var self = this;
    CL.later(function () { self.set({}); if (self.o.onRestore) self.o.onRestore(id); }, CL.reduced(this.el) ? 0 : ms("cwl-dur-line-replace") + 80);
  };

  /* ================================================================
     SourcePanel · the words behind the selected sentence. Its sources come forward and their
     words light up; the lens's other sources stay below, quieter.
     ================================================================ */
  function sourceKey(r) { return r.t + ":" + r.id; }
  function allSources(d) {
    var seen = {}, out = [];
    d.sentences.forEach(function (s) { s.src.forEach(function (r) { var k = sourceKey(r); if (!seen[k]) { seen[k] = true; out.push({ t: r.t, id: r.id }); } }); });
    return out;
  }
  function sourceCard(r, lit, o) {
    o = o || {};
    if (r.t === "phone") return '<div class="cwl-ovn-scard' + (lit ? " is-lit" : " is-dim") + '"><div class="meta">' + L("smartphone") + "Phone · Five Lenses: Community · anonymous</div><div>" + hl(S.phone[r.id], lit ? r.hl : null) + "</div></div>";
    if (r.t === "card") {
      var c = cardById(r.id);
      return '<div class="cwl-ovn-scard' + (lit ? " is-lit" : " is-dim") + '"><div class="meta">' + L(S.kinds[c.kind].icon) + "Scribe · " + esc(S.kinds[c.kind].label) + " · " + esc(c.time) + "</div><div" + (c.kind === "quote" ? ' style="font-weight:600"' : "") + ">" + (c.kind === "quote" ? "“" : "") + hl(c.text, lit ? r.hl : null) + (c.kind === "quote" ? "”" : "") + "</div>" + (c.who && o.names !== false ? '<span class="who">' + L("lock") + esc(c.who) + " · for the record, never in the read-back</span>" : "") + "</div>";
    }
    if (r.t === "photo") {
      var p = S.photos[r.id], lines = [];
      if (lit && r.hl) p.lines.forEach(function (t, i) { if (t.toLowerCase().indexOf(r.hl.toLowerCase()) >= 0 || r.hl.toLowerCase().indexOf(t.toLowerCase()) >= 0) lines.push(i); });
      return '<div class="cwl-ovn-scard' + (lit ? " is-lit" : " is-dim") + '"><div class="meta">' + L("camera") + "Easel photo · " + esc(p.label) + " · " + esc(p.time) + "</div>" + photoSVG(r.id, { hi: lit ? lines : [] }) + (o.unreadable && r.id === "easel-2" ? "" : "") + "</div>";
    }
    return "";
  }
  function SourcePanel(host, o) {
    this.o = o || {}; this.d = this.o.data || S.community;
    this.el = h("div", "cwl-ovn-src"); host.appendChild(this.el);
    this.el.innerHTML = '<div class="cwl-ovn-src-h">Sources for the selected sentence</div><div class="cwl-ovn-src-sent"></div><div class="cwl-ovn-srclist"></div>';
    this.list = this.el.querySelector(".cwl-ovn-srclist"); this.sentEl = this.el.querySelector(".cwl-ovn-src-sent");
  }
  SourcePanel.prototype.set = function (sid, o) {
    o = o || {};
    var d = this.d, s = d.sentences.filter(function (x) { return x.id === sid; })[0], self = this;
    if (o.ai0) {
      this.el.querySelector(".cwl-ovn-src-h").textContent = "The room's sentences for this lens";
      this.sentEl.textContent = "AI is off, so there's no draft. Add the room's own sentences, then edit.";
      var items = Object.keys(S.phone).slice(0, 6).map(function (id) { return { k: "phone:" + id, html: '<div class="cwl-ovn-scard is-lit"><div class="meta">' + L("smartphone") + 'Phone · anonymous</div><div>' + esc(S.phone[id]) + '</div><div class="cwl-a-row">' + SB((o.written || []).indexOf(id) >= 0 ? "Added" : "Add to the paragraph", (o.written || []).indexOf(id) >= 0 ? "check" : "plus") + "</div></div>" }; });
      P4.keyed(this.list, items, function () { return h("div"); }, function (el, it) { el.innerHTML = it.html; }, { instant: true });
      CL.icons(); return;
    }
    this.el.querySelector(".cwl-ovn-src-h").textContent = "Sources for sentence " + (d.sentences.indexOf(s) + 1);
    this.sentEl.textContent = s ? (o.text || s.ai) : "";
    var lit = s ? s.src : [], litKeys = lit.map(sourceKey), rest = allSources(d).filter(function (r) { return litKeys.indexOf(sourceKey(r)) < 0; }).slice(0, o.restMax || 3);
    var items = lit.map(function (r) { return { k: sourceKey(r), r: r, lit: true }; });
    if (!lit.length) items.push({ k: "none", none: true });
    items.push({ k: "divider", divider: true });
    rest.forEach(function (r) { items.push({ k: sourceKey(r), r: r, lit: false }); });
    if (o.unreadable) items.push({ k: "photo:easel-2", r: { t: "photo", id: "easel-2" }, unread: true });
    P4.keyed(this.list, items, function () { return h("div"); }, function (el, it) {
      var sig = it.none ? "none" : it.divider ? "div" : (it.lit ? "lit" : "dim") + (it.unread ? "u" : "");
      if (el.getAttribute("data-sig") === sig) return;
      el.setAttribute("data-sig", sig);
      if (it.none) el.innerHTML = '<div class="cwl-a-banner is-warning"><span class="ic">' + L("triangle-alert") + "</span><div><strong>No source.</strong> No phone sentence, scribe card or easel photo supports this sentence.</div></div>";
      else if (it.divider) el.innerHTML = '<div class="cwl-ovn-src-h" style="margin-top:6px">Other sources in this lens</div>';
      else if (it.unread) el.innerHTML = '<div class="cwl-ovn-scard"><div class="meta">' + L("camera") + "Easel photo · " + esc(S.photos["easel-2"].label) + "</div>" + photoSVG("easel-2", { forceBlur: true, unreadable: true }) + '<div class="cwl-a-banner is-warning"><span class="ic">' + L("triangle-alert") + "</span><div><strong>The draft couldn't read this page.</strong> Type what it says so it can count as a source.</div></div>" + SB("Type what it says", "keyboard") + "</div>";
      else el.innerHTML = sourceCard(it.r, it.lit, { names: true });
      var card = el.querySelector(".cwl-ovn-scard.is-lit");
      if (card && !o.instant && !CL.reduced(el)) { card.classList.remove("is-lit"); requestAnimationFrame(function () { requestAnimationFrame(function () { card.classList.add("is-lit"); }); }); }
    }, { instant: o.instant, stagger: 40 });
    CL.icons();
  };

  /* ================================================================
     TrackedChange · inserted words underlined, deleted words struck, readable without color.
     paragraph(text, corrections, states): states[id] = pending | folded | settled.
     words(): word boxes for the TV, keyed so a fold reflows smoothly.
     ================================================================ */
  function segments(text, corrs, states) {
    var segs = [{ t: text, k: "b", off: 0 }];
    (corrs || []).forEach(function (c) {
      var st = states && states[c.id]; if (!st || st === "pending") return;
      var out = [];
      segs.forEach(function (sg) {
        if (sg.k !== "b") { out.push(sg); return; }
        var t = sg.t, i;
        if (c.del && c.at && (i = t.indexOf(c.at)) >= 0) {
          var j = i + c.del.length;
          out.push({ t: t.slice(0, i), k: "b", off: sg.off });
          if (st === "folded") out.push({ t: c.del + " ", k: "del", c: c.id, off: sg.off + i });
          out.push({ t: c.ins, k: st === "folded" ? "ins" : "set", c: c.id });
          out.push({ t: t.slice(j), k: "b", off: sg.off + j });
        } else if (c.after && (i = t.indexOf(c.after)) >= 0) {
          var e = i + c.after.length;
          out.push({ t: t.slice(0, e), k: "b", off: sg.off }); out.push({ t: c.ins, k: st === "folded" ? "ins" : "set", c: c.id }); out.push({ t: t.slice(e), k: "b", off: sg.off + e });
        } else out.push(sg);
      });
      segs = out;
    });
    return segs.filter(function (s) { return s.t; });
  }
  /* Static HTML for phones, the control surface and review */
  function trackedHTML(text, corrs, states) {
    return segments(text, corrs, states).map(function (s) {
      if (s.k === "del") return '<del class="cwl-tc-del">' + esc(s.t) + "</del>";
      if (s.k === "ins") return '<ins class="cwl-tc-ins">' + esc(s.t) + "</ins>";
      return esc(s.t);
    }).join("");
  }
  /* Word boxes for the TV: keys stay stable across states so each word glides to its new place */
  function words(text, corrs, states) {
    var out = [];
    segments(text, corrs, states).forEach(function (s) {
      var re = /\s+|[^\s]+\s*/g, m, n = 0;
      while ((m = re.exec(s.t))) {
        var w = m[0];
        if (/^\s+$/.test(w)) { if (out.length) out[out.length - 1].t += w; continue; }
        var key = s.off != null ? "b" + (s.off + m.index) : s.c + "i" + n;
        out.push({ k: key, t: w, kind: s.k === "set" || s.k === "b" ? "" : s.k, c: s.c });
        n++;
      }
    });
    return out;
  }
  var TrackedChange = { segments: segments, html: trackedHTML, words: words };

  /* ================================================================
     LensProgress · the five lenses in order: settled, current, still to come
     ================================================================ */
  function LensProgress(current, settled, o) {
    o = o || {};
    return '<div class="cwl-lp" role="list" aria-label="Lens progress">' + S.lensOrder.map(function (k, i) {
      var l = P4.lensByKey(k), st = settled.indexOf(k) >= 0 ? "is-settled" : k === current ? "is-current" : "";
      return (i ? '<span class="cwl-lp-sep" aria-hidden="true"></span>' : "") + '<span class="cwl-lp-i ' + st + '" role="listitem" data-lens="' + k + '" aria-label="' + esc(l.name) + (st === "is-settled" ? ", settled" : st ? ", now" : "") + '"><span class="sweep"></span>' + P4.lensIcon(k) + '<span class="ok">' + L("check") + '</span><span class="nm">' + esc(l.name) + "</span></span>";
    }).join("") + "</div>";
  }

  /* ================================================================
     ReadBackTally · live bars for the two answers, pass 3 bars. No leader color:
     the tally shows where the room is and never settles a lens.
     ================================================================ */
  function ReadBackTally(host, o) {
    this.el = h("div", "cwl-rbt"); host.appendChild(this.el);
    this.el.innerHTML = [["yes", "Yes, that's us"], ["change", "It needs a change"]].map(function (r) { return '<div class="cwl-rbt-row" data-r="' + r[0] + '"><div class="cwl-rbt-top"><span>' + r[1] + '</span><b>0</b></div><div class="cwl-rbt-track"><i></i></div></div>'; }).join("");
  }
  /* Each tap grows its bar from where it is (cwl-dur-bar-grow, signature); the count ticks with it */
  ReadBackTally.prototype.set = function (yes, change, o) {
    o = o || {}; var n = Math.max(1, o.of || 8), el = this.el;
    [["yes", yes], ["change", change]].forEach(function (r) {
      var row = el.querySelector('[data-r="' + r[0] + '"]'), bar = row.querySelector("i");
      if (o.instant) { bar.style.transition = "none"; void bar.offsetWidth; }
      bar.style.width = (r[1] / n * 100).toFixed(2) + "%";
      if (o.instant) { void bar.offsetWidth; bar.style.transition = ""; }
      row.querySelector("b").textContent = r[1];
    });
  };
  /* MissingList · "What's missing?" answers arriving, anonymous */
  function MissingList(host, o) {
    this.o = o || {};
    this.el = h("div", "cwl-ml"); host.appendChild(this.el);
    this.el.innerHTML = '<div class="cwl-ml-h">What\'s missing?<span></span></div><div class="cwl-ml-items"></div>';
    this.items = this.el.querySelector(".cwl-ml-items"); this.sub = this.el.querySelector(".cwl-ml-h span");
  }
  MissingList.prototype.set = function (list, o) {
    o = o || {};
    var max = o.max || 4, shown = list.slice(0, max), self = this;
    this.el.style.display = list.length || o.always ? "" : "none";
    this.sub.textContent = o.sub || (list.length > max ? "+ " + (list.length - max) + " more on phones" : list.length ? "" : "Answers appear here as they're sent");
    var items = shown.map(function (t) { return { k: "m" + t.length + t.slice(0, 12), t: t }; });
    P4.keyed(this.items, items, function (it) { return h("div", it.more ? "cwl-ml-more" : "cwl-ml-i"); }, function (el, it) { el.textContent = it.more ? "+ " + it.more + " more on phones" : it.t; el.classList.toggle("is-new", !!(o.newest && it.t === o.newest)); }, { instant: o.instant, anchor: null });
    if (o.newest) CL.later(function () { var n = self.items.querySelector(".is-new"); if (n) n.classList.remove("is-new"); }, ms("cwl-dur-new-hold"));
  };

  /* ================================================================
     ReadBackLens · D2-03. One lens at a time on the TV: lens progress, "Community, 2036",
     the paragraph, the live tally and what's missing. Corrections fold in as tracked changes.
     ================================================================ */
  /* Reflow a paragraph calmly: words that stay on their line slide along it (cwl-dur-make-room);
     words that change line fade out and back in at their new place, so nothing crosses the text. */
  function reflowWords(para, mutate) {
    var red = CL.reduced(para), before = new Map();
    para.querySelectorAll(".w").forEach(function (w) { before.set(w, w.getBoundingClientRect()); });
    mutate();
    if (red) return;
    var scale = para.getBoundingClientRect().width / (para.offsetWidth || 1) || 1, dur = ms("cwl-dur-make-room"), ease = CL.v("cwl-ease-signature");
    para.querySelectorAll(".w").forEach(function (w) {
      var b = before.get(w), a = w.getBoundingClientRect();
      if (!b) { w.animate([{ opacity: 0, transform: "translateY(0.3em)" }, { opacity: 1, transform: "none" }], { duration: ms("cwl-dur-arrive"), easing: CL.v("cwl-ease-arrive"), delay: dur * 0.6, fill: "backwards" }); return; }
      var dx = (b.left - a.left) / scale, dy = (b.top - a.top) / scale;
      if (Math.abs(dy) > 4) w.animate([{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: dur * 1.3, easing: ease });
      else if (dx) w.animate([{ transform: "translateX(" + dx + "px)" }, { transform: "none" }], { duration: dur, easing: ease });
    });
  }

  function ReadBackLens(sh, o) {
    this.o = o || {}; this.sh = sh;
    sh.prompt("", ""); sh.content.querySelector(".p3-head").style.display = "none";
    var g = this.el = h("div", "cwl-rb"); sh.host.appendChild(g);
    g.innerHTML = '<div class="cwl-rb-progress"></div><div class="cwl-rb-main"><div class="cwl-rb-h"></div><div class="cwl-rb-para"></div><div class="cwl-rb-ml"></div></div><div class="cwl-rb-side"><div class="cwl-rb-ask">Did we hear you right?</div><div class="cwl-rb-bars"></div><div class="cwl-rb-changed"></div></div>';
    this.prog = g.querySelector(".cwl-rb-progress"); this.head = g.querySelector(".cwl-rb-h"); this.para = g.querySelector(".cwl-rb-para"); this.changed = g.querySelector(".cwl-rb-changed");
    this.tally = new ReadBackTally(g.querySelector(".cwl-rb-bars"));
    this.ml = new MissingList(g.querySelector(".cwl-rb-ml"));
    this.lens = null; this.settled = []; this.states = {};
  }
  ReadBackLens.prototype.text = function (k) { return this.o.long && k === "community" ? S.community.long : S.readback[k]; };
  ReadBackLens.prototype.corrs = function (k) { return k === "community" ? S.corrections : []; };
  /* The progress updates in place, so the current lens and the settled marks change smoothly */
  ReadBackLens.prototype.progress = function () {
    var items = this.prog.querySelectorAll(".cwl-lp-i"), self = this;
    if (!items.length) { this.prog.innerHTML = LensProgress(this.lens, this.settled); CL.icons(); return; }
    items.forEach(function (it) {
      var k = it.getAttribute("data-lens"), done = self.settled.indexOf(k) >= 0;
      it.classList.toggle("is-settled", done); it.classList.toggle("is-current", !done && k === self.lens); it.classList.remove("is-sweeping");
      var sw = it.querySelector(".sweep"); if (sw) sw.getAnimations().forEach(function (a) { a.cancel(); });
    });
  };
  ReadBackLens.prototype.heading = function (k) { var l = P4.lensByKey(k); this.head.innerHTML = P4.lensDot(k) + "<span><strong>" + esc(l.name) + "</strong>, " + S.Y.future + "</span>"; this.head.setAttribute("aria-label", l.name + ", " + S.Y.future); };
  /* Draw the paragraph's words. Plain update: words glide to new places (FLIP), new words arrive. */
  ReadBackLens.prototype.words = function (states, instant) {
    /* On the TV a folded deletion has already left: only the inserted words stay marked until the lens settles */
    var list = words(this.text(this.lens), this.corrs(this.lens), states).filter(function (w) { return w.kind !== "del"; });
    this.para.classList.toggle("is-floor", this.text(this.lens).length > 340);
    P4.keyed(this.para, list, function () { return h("span", "w"); }, function (el, it) {
      el.textContent = it.t; el.classList.toggle("is-ins", it.kind === "ins"); el.classList.toggle("is-del", it.kind === "del");
      el.classList.toggle("is-trail", /\s$/.test(it.t));
    }, { instant: instant });
  };
  /* st: {lens, settled, states, yes, change, of, missing, newestMissing, close, instant} */
  ReadBackLens.prototype.set = function (st) {
    var inst = !!st.instant;
    if (st.close) return this.closeView(st);
    this.el.classList.remove("is-close");
    this.el.querySelector(".cwl-rb-side").style.display = "";
    if (this.ml.el.parentNode !== this.el.querySelector(".cwl-rb-ml")) this.el.querySelector(".cwl-rb-ml").appendChild(this.ml.el);
    this.head.parentNode.style.display = "";
    var changedLens = st.lens !== this.drawn;
    this.drawn = st.lens;
    this.lens = st.lens; this.settled = st.settled || []; this.states = st.states || {};
    this.progress(); this.heading(this.lens);
    if (changedLens) this.para.innerHTML = "";
    this.words(this.states, inst || changedLens);
    this.para.querySelectorAll(".w.is-ins").forEach(function (w) { w.classList.remove("is-drawing"); });
    this.tally.set(st.yes || 0, st.change || 0, { of: st.of || 8, instant: inst });
    this.ml.set(st.missing || [], { newest: st.newestMissing, instant: inst, max: this.text(this.lens).length > 340 ? 1 : 2, always: true });
    var folded = Object.keys(this.states).filter(function (k) { return this.states[k] !== "pending"; }, this).length;
    var isSettled = this.settled.indexOf(this.lens) >= 0;
    this.changed.innerHTML = isSettled ? '<span class="cwl-rb-settled">' + L("check") + "Settled by the room" + (folded ? " · " + folded + (folded === 1 ? " change" : " changes") : "") + "</span>" : folded ? L("pencil-line") + folded + (folded === 1 ? " change from the room" : " changes from the room") : "";
    CL.icons();
  };
  /* A correction folding in: struck words stay readable, then leave; inserted words arrive underlined */
  ReadBackLens.prototype.fold = function (cid, done) {
    var self = this, red = CL.reduced(this.para);
    var next = {}; for (var k in this.states) next[k] = this.states[k]; next[cid] = "folded";
    var c = this.corrs(this.lens).filter(function (x) { return x.id === cid; })[0];
    var note = function (st) { var f = Object.keys(st).filter(function (k) { return st[k] !== "pending"; }).length; self.changed.innerHTML = L("pencil-line") + f + (f === 1 ? " change from the room" : " changes from the room"); CL.icons(); };
    if (red || !c) { this.states = next; this.words(next, true); note(next); if (done) done(); return; }
    /* 1. the deleted words show struck in place */
    var withDel = words(this.text(this.lens), this.corrs(this.lens), next).filter(function (w) { return w.kind !== "ins"; });
    P4.keyed(this.para, withDel, function () { return h("span", "w"); }, function (el, it) { el.textContent = it.t; el.classList.toggle("is-del", it.kind === "del"); if (it.kind === "del") el.classList.add("is-drawing"); el.classList.toggle("is-trail", /\s$/.test(it.t)); }, { instant: true });
    var leave = c.del ? ms("cwl-delay-tc-leave") : 0;
    CL.later(function () {
      /* 2. struck words leave; the paragraph reflows and inserted words arrive underlined */
      var dels = self.para.querySelectorAll(".w.is-del");
      var go = function () {
        var fin = words(self.text(self.lens), self.corrs(self.lens), next).filter(function (w) { return w.kind !== "del"; });
        reflowWords(self.para, function () {
          self.para.querySelectorAll(".w.is-del").forEach(function (d) { d.remove(); });
          P4.keyed(self.para, fin, function () { return h("span", "w"); }, function (el, it) { el.textContent = it.t; el.classList.toggle("is-ins", it.kind === "ins"); el.classList.toggle("is-trail", /\s$/.test(it.t)); }, { instant: true });
        });
        self.para.querySelectorAll(".w.is-ins").forEach(function (w) { if (w.getAttribute("data-k").indexOf(cid) === 0) { w.classList.remove("is-drawing"); void w.offsetWidth; w.classList.add("is-drawing"); } });
        self.states = next; note(next);
        if (done) CL.later(done, ms("cwl-dur-make-room"));
      };
      if (!dels.length) return go();
      var left = dels.length;
      dels.forEach(function (d) { d.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms("cwl-dur-hide"), easing: CL.v("cwl-ease-exit"), fill: "forwards" }).onfinish = function () { if (--left === 0) go(); }; });
    }, leave);
  };
  ReadBackLens.prototype.tallyTo = function (yes, change, o) { this._yes = yes; this._chg = change; this.tally.set(yes, change, o); };
  /* Settle: a Lime sweep across the lens in the progress, once, then the outlined check */
  ReadBackLens.prototype.settle = function () {
    var k = this.lens, self = this;
    if (this.settled.indexOf(k) < 0) this.settled = this.settled.concat([k]);
    var it = this.prog.querySelector('[data-lens="' + k + '"]');
    var finish = function () { self.progress(); self.para.querySelectorAll(".w.is-ins").forEach(function (w) { w.classList.add("is-settled"); w.classList.remove("is-ins"); }); var f = Object.keys(self.states).filter(function (x) { return self.states[x] !== "pending"; }).length; self.changed.innerHTML = '<span class="cwl-rb-settled">' + L("check") + "Settled by the room" + (f ? " · " + f + (f === 1 ? " change" : " changes") : "") + "</span>"; CL.icons(); };
    if (!it || CL.reduced(this.prog)) return finish();
    var sw = it.querySelector(".sweep"); it.classList.add("is-sweeping"); this.sh.handoff(true);
    sw.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: ms("cwl-dur-outcome-confirm"), easing: CL.v("cwl-ease-signature"), fill: "forwards" }).onfinish = function () {
      CL.later(function () {
        sw.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms("cwl-dur-settle-color"), fill: "forwards" }).onfinish = function () { self.sh.handoff(false); finish(); };
      }, ms("cwl-dur-new-hold") * 0.4);
    };
  };
  /* Next lens: the progress moves on, the paragraph leaves and the next comes in, the bars start again */
  ReadBackLens.prototype.next = function (k, done) {
    var self = this, red = CL.reduced(this.para);
    var main = this.el.querySelector(".cwl-rb-main");
    var go = function () {
      self.set({ lens: k, settled: self.settled, states: {}, yes: 0, change: 0, missing: [], instant: false });
      self.tally.set(0, 0, { instant: false });
      if (!red) main.animate([{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], { duration: ms("cwl-dur-map-field"), easing: CL.v("cwl-ease-calm"), fill: "backwards" });
      if (done) done();
    };
    if (red) return go();
    main.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-12px)" }], { duration: ms("cwl-dur-hide"), easing: CL.v("cwl-ease-exit"), fill: "forwards" }).onfinish = function () { CL.later(go, ms("cwl-delay-make-room-after-hide")); };
    /* the current marker moves to the next lens with the outgoing paragraph (a color transition in place) */
    this.lens = k; this.progress();
  };
  ReadBackLens.prototype.closeView = function (st) {
    this.el.classList.add("is-close");
    this.lens = null; this.drawn = null; this.settled = S.lensOrder.slice();
    this.progress();
    this.head.innerHTML = '<span class="cwl-rb-close-h">Did we <strong>hear you right?</strong></span>';
    this.para.innerHTML = '<span class="w">The 10-year Future, settled by the room. One more question before we move on.</span>';
    this.para.classList.remove("is-floor");
    this.el.querySelector(".cwl-rb-side").style.display = "none";
    this.changed.innerHTML = "";
    if (this.ml.el.parentNode !== this.el.querySelector(".cwl-rb-main")) this.el.querySelector(".cwl-rb-main").appendChild(this.ml.el);
    this.ml.set(st.missing || [], { newest: st.newestMissing, instant: st.instant, max: st.max || 6, always: true });
    CL.icons();
  };

  /* ================================================================
     ReadBackPhone · D2-04. The lens's draft, the team's words underneath, the two answers
     and "What's missing?". Phones can look back at settled lenses, never ahead.
     o: {lens, states, answer: yes|change|null, change text, missing text, sent, settled, look, close}
     ================================================================ */
  function ReadBackPhone(ph, o) {
    o = o || {};
    var k = o.lens || "community", l = P4.lensByKey(k);
    var text = trackedHTML(o.long && k === "community" ? S.community.long : S.readback[k], k === "community" ? S.corrections : [], o.states || {});
    var team = (S.teamWords[k] || []).slice(0, o.teamMax || 3);
    var settled = o.settled || [];
    var html = LensProgress(k, settled);
    if (o.close) {
      html += '<div class="cwl-rb-ph-h">Did we hear you right?</div><div class="cwl-ph-muted">All five lenses are settled. One last question.</div><div class="cwl-ph-prompt">What\'s missing?</div>' + P4.PH.input(o.missing || "", "Anything the 10-year Future leaves out", 3) + P4.PH.anon();
      ph.body.innerHTML = '<div class="cwl-rb-ph">' + html + "</div>"; ph.foot.innerHTML = P4.PH.btn("Send"); CL.icons(); return;
    }
    html += (o.look ? '<div class="cwl-rb-ph-look">' + L("history") + "Looking back · settled by the room</div>" : "") +
      '<div class="cwl-rb-ph-h">' + esc(l.name) + ", " + S.Y.future + '</div><div class="cwl-rb-ph-p">' + text + "</div>";
    if (o.showTeam !== false) html += '<div class="cwl-rb-ph-team"><b>The team\'s words</b>' + team.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "<small>" + (S.teamWords[k].length > team.length ? "Show all " + S.teamWords[k].length : "") + "</small></div>";
    if (!o.look) {
      if (o.down) html += P4.PH.down();
      else {
        html += '<div class="p3-opt' + (o.answer === "yes" ? " is-on" : "") + '"><span class="p3-tick">' + (o.answer === "yes" ? L("check") : "") + '</span><span class="grow">Yes, that\'s us</span></div>' +
          '<div class="p3-opt' + (o.answer === "change" ? " is-on" : "") + '"><span class="p3-tick">' + (o.answer === "change" ? L("check") : "") + '</span><span class="grow">It needs a change</span></div>';
        if (o.answer === "change") html += '<div class="cwl-ph-muted" style="font-weight:600">What should change?</div>' + P4.PH.input(o.change || "", "A few words is enough", 2);
        if (o.showMissing) html += '<div class="cwl-ph-muted" style="font-weight:600">What\'s missing?</div>' + P4.PH.input(o.missing || "", "Optional", 2);
      }
    }
    ph.body.innerHTML = '<div class="cwl-rb-ph">' + html + "</div>";
    ph.foot.innerHTML = o.look ? P4.PH.btn("Back to " + P4.lensByKey(o.current || "community").name, { icon: "arrow-right", cls: "is-secondary" }) : o.down ? "" : o.sent ? P4.PH.sent(o.answer === "change" ? "It needs a change" : "Yes, that's us", o.offline ? "saved" : "sent") : P4.PH.btn("Send");
    CL.icons();
  }

  /* ================================================================
     CorrectionQueue · control and remote. Each correction with the scribe's reason.
     list: [{c: correction, state: waiting|accepted|dismissed}]
     ================================================================ */
  function CorrectionQueue(list, o) {
    o = o || {};
    if (!list.length) return '<div class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro);padding:4px 0">No corrections yet. The scribe sends the wording the room agrees.</div>';
    return '<div class="cwl-cq">' + list.map(function (it) {
      var c = it.c, change = c.del ? "<del class=\"cwl-tc-del\">" + esc(c.del) + "</del> <ins class=\"cwl-tc-ins\">" + esc(c.ins) + "</ins> " + esc(c.at.replace(c.del, "").trim()) : "<ins class=\"cwl-tc-ins\">" + esc(c.ins.trim()) + "</ins>";
      var acts = it.state === "waiting" ? '<div class="cwl-cq-acts">' + B("Accept", "is-primary is-sm", "check") + B("Dismiss", "is-ghost is-sm", "x") + (o.ai === false ? '<span class="cwl-a-muted" style="font-size:var(--cwl-fs-app-micro)">Goes in exactly as written</span>' : "") + "</div>" : '<div class="cwl-cq-acts">' + CHIP(it.state === "accepted" ? "Folded in" : "Dismissed", it.state === "accepted" ? "is-success" : "", it.state === "accepted" ? "check" : "x") + "</div>";
      return '<div class="cwl-cq-i' + (it.state === "accepted" ? " is-accepted" : "") + '"><div class="cwl-cq-change">' + change + '</div><div class="cwl-cq-why">' + L("notebook-pen") + "<span>Scribe: " + esc(c.reason) + "</span></div>" + acts + "</div>";
    }).join("") + "</div>";
  }

  /* ================================================================
     PublishCheck · OVN-03. TV and phone previews, the checklist, Publish.
     st: not-ready | ready | published
     ================================================================ */
  function PublishCheck(el, o) {
    o = o || {};
    var st = o.state || "ready", theme = o.theme || "dark";
    var ok = function (t, sub) { return '<div class="c is-ok"><span class="d">' + L("check") + '</span><div class="t">' + t + (sub ? "<span>" + sub + "</span>" : "") + "</div></div>"; };
    var todo = function (t, sub) { return '<div class="c is-todo"><span class="d"></span><div class="t">' + t + (sub ? "<span>" + sub + "</span>" : "") + "</div></div>"; };
    var flag = function (t, sub) { return '<div class="c is-flag"><span class="d">' + L("triangle-alert") + '</span><div class="t">' + t + (sub ? "<span>" + sub + "</span>" : "") + "</div></div>"; };
    var checks = st === "not-ready" ?
      ok("Congregation, Community and Leadership reviewed") + todo("Operations and Learning", "Jaisy is editing Learning") + flag("Flag not acknowledged: Families find a home here is thin", '<label class="cwl-a-check" style="margin-top:6px;font-weight:600;color:var(--cwl-app-text)"><input type="checkbox" tabindex="-1">Show it in the morning as thin</label>') + todo("3-year Vision, first pass") :
      ok("Five lenses reviewed", "Every sentence has a source") + ok("Provisional Vision Outcomes reviewed") + ok("3-year Vision, first pass reviewed") + ok("1 flag acknowledged", "Families find a home here shows as thin in the morning") + ok("Voices not to lose and tensions kept apart", "They go to the report, not the read-back");
    el.innerHTML = '<div class="cwl-ovn-pub"><div class="cwl-ovn-preview"><span class="cwl-a-eyebrow">TV preview · the first lens</span><div class="pv-tv"></div></div><div class="cwl-ovn-preview"><span class="cwl-a-eyebrow">Phone preview</span><div class="pv-ph"></div></div>' +
      '<div class="cwl-ovn-preview"><span class="cwl-a-eyebrow">Checklist</span><div class="cwl-ovn-check">' + checks + "</div></div></div>";
    /* The previews run inside the review surface: the nesting guard keeps their own theme */
    var tvBox = el.querySelector(".pv-tv"), sh = P4.shell(tvBox, { theme: theme, unit: "answered" });
    var rb = new ReadBackLens(sh); rb.set({ lens: "congregation", settled: [], yes: 0, change: 0, missing: [], instant: true });
    sh.count(0, "answered", true); sh.state({ down: false });
    var phBox = el.querySelector(".pv-ph"), ph = P4.phone(phBox, { head: "live" });
    ReadBackPhone(ph, { lens: "congregation", teamMax: 2 });
    CL.icons();
    return { sh: sh, rb: rb };
  }

  window.ClearwayLivePass5 = {
    photoSVG: photoSVG, photoFigure: photoFigure, ScribeCard: ScribeCard, kindChip: kindChip, CaptureComposer: CaptureComposer, ScribeConsole: ScribeConsole, EaselCapture: EaselCapture,
    ScribeFeed: ScribeFeed, PromotedQuote: PromotedQuote,
    ReviewPresence: ReviewPresence, lockChip: lockChip, DraftStatusList: DraftStatusList, statusChip: statusChip, VoicesAndTensions: VoicesAndTensions, VersionHistory: VersionHistory,
    DraftParagraph: DraftParagraph, SourcePanel: SourcePanel, PublishCheck: PublishCheck,
    TrackedChange: TrackedChange, LensProgress: LensProgress, ReadBackTally: ReadBackTally, MissingList: MissingList, ReadBackLens: ReadBackLens, ReadBackPhone: ReadBackPhone, CorrectionQueue: CorrectionQueue,
    avatar: avatar, fac: fac, sessionTitle: sessionTitle, cardById: cardById
  };
})();
