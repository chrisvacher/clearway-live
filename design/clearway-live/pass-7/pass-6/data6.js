/* Clearway Live · design pass 6 · seed data: Riverside Church (fictional), base year 2026.
   Discover: the congregational survey read from Team Hub (the Wayfinding template, 87 responses,
   6 of them under 30), 5 leadership interviews and two input conversations, the Four Helpful Lists
   with Riverside's elders (7 people), What We Heard and the alignment signal.
   Every number on screen is computed from these values, never fixed text. */
(function () {
  "use strict";
  var W = window.ClearwayLivePass4Data;
  var D = {};
  D.church = W.church;
  D.Y = W.years(W.base);
  D.short = "Riverside";

  /* ---------- The thin data rule (Default, PRD): fewer than 10 responses, under 10 percent of
     respondents, or one interview. Segments under 5 respondents are hidden. Code, not AI. ---------- */
  D.THIN_MIN = 10; D.THIN_PCT = 0.10; D.HIDE_UNDER = 5;
  D.isThin = function (n, of, kind) {
    if (kind === "interviews") return n <= 1;
    return n < D.THIN_MIN || (of ? n / of < D.THIN_PCT : false);
  };
  D.pct = function (n, of) { return of ? Math.round(n / of * 100) : 0; };

  /* ---------- The linked Team Hub survey ---------- */
  D.teamHub = "team.clearway.co";
  D.survey = {
    id: "srv_rv", title: "Riverside Wayfinding Congregational Survey", template: "Wayfinding Congregational Survey",
    code: "rv7k2m", status: "open", opened: "Oct 5", closes: "Nov 14", closesLong: "Friday, November 14",
    lockedAt: "Oct 5, 11:42 am", collectsEmail: false, responses: 87, lastRead: "4:12 pm", lastReadDay: "today"
  };
  D.surveyUrl = function () { return D.teamHub + "/surveys/" + D.survey.code; };
  /* Other Team Hub surveys linked to this engagement, offered when linking */
  D.otherSurveys = [
    { id: "srv_rv", title: "Riverside Wayfinding Congregational Survey", status: "open", responses: 87, closes: "Nov 14" },
    { id: "srv_rv_staff", title: "Riverside staff pulse", status: "draft", responses: 0, closes: "No close date" }
  ];

  /* ---------- Questions, as in Team Hub's Wayfinding template, with [Church] filled in ---------- */
  var Q = [];
  function q(o) { o.id = "q" + (Q.length + 1); Q.push(o); return o; }
  q({ sec: "Your commitment", type: "linear_scale", title: "How committed are you personally to the ministry of Riverside?", min: 1, max: 5, lo: "Not at all committed", hi: "Fully committed", counts: [2, 5, 14, 31, 35] });
  q({ sec: "Your commitment", type: "single_choice", title: "Compared to two years ago, how has your commitment to Riverside changed?", options: ["Much less", "Less", "About the same", "More", "Much more"], counts: [3, 7, 38, 26, 13] });
  q({ sec: "Your commitment", type: "long_text", title: "What's changed? (optional)", answered: 41 });
  q({ sec: "Your church", type: "long_text", title: "What is one thing Riverside does really well?", answered: 87 });
  q({ sec: "Your church", type: "long_text", title: "What makes Riverside feel like home to you?", answered: 87 });
  q({ sec: "Your church", type: "long_text", title: "What is one thing Riverside could improve?", answered: 87 });
  q({ sec: "Your church", type: "long_text", title: "If you could start one new thing at Riverside, what would you start?", answered: 87 });
  q({ sec: "Your church", type: "long_text", title: "If you could stop one current thing at Riverside, what would you stop?", answered: 87 });
  q({ sec: "Your church", type: "long_text", title: "What's one thing about Riverside that feels unclear or confusing to you?", answered: 87 });
  q({ sec: "Your church", type: "long_text", title: "What ministry, program or event at Riverside is making the most impact right now, and why?", answered: 87 });
  q({ sec: "Your church", type: "long_text", title: "Can you share a story of Riverside at its best?", answered: 29 });
  q({ sec: "Our community and looking ahead", type: "long_text", title: "If Riverside closed tomorrow, who in our community would notice, and why?", answered: 87 });
  q({ sec: "Our community and looking ahead", type: "long_text", title: "Imagine Riverside ten years from now at its best. What do you see? (optional)", answered: 52 });
  q({ sec: "Our community and looking ahead", type: "long_text", title: "Are there any verses, passages of scripture, images or words the Spirit is bringing to mind as you pray about the future of Riverside?", answered: 18 });
  q({ sec: "About you", type: "single_choice", seg: "age", segName: "Age band", title: "How old are you?", options: ["Under 18", "18 to 29", "30 to 44", "45 to 59", "60 to 74", "75 and over"], counts: [2, 4, 19, 24, 27, 11] });
  q({ sec: "About you", type: "single_choice", seg: "years", segName: "Years attending", title: "How long have you been attending Riverside?", options: ["Less than 1 year", "1 to 3 years", "4 to 7 years", "8 to 15 years", "16 to 25 years", "More than 25 years"], counts: [6, 14, 18, 21, 16, 12] });
  q({ sec: "About you", type: "multi_choice", seg: "involvement", segName: "Involvement", title: "How are you involved at Riverside? Check all that apply.", options: ["I attend", "I'm in a group", "I serve", "I lead a ministry or group", "I give regularly"], counts: [84, 39, 46, 17, 58] });
  D.questions = Q;
  D.q = function (id) { for (var i = 0; i < Q.length; i++) if (Q[i].id === id) return Q[i]; return null; };
  /* Riverside meets in one place, so the template's location question was deleted in Team Hub. */
  D.noLocation = true;

  /* Question types Team Hub offers beyond the template (QuestionResult covers each) */
  D.extraTypes = [
    { id: "x1", type: "enps", title: "How likely are you to recommend Riverside to a friend?", counts: [1, 0, 1, 2, 3, 6, 7, 14, 21, 17, 15] },
    { id: "x2", type: "slider", title: "How connected do you feel, from 0 to 100?", buckets: ["0 to 19", "20 to 39", "40 to 59", "60 to 79", "80 to 100"], counts: [4, 9, 21, 30, 23] },
    { id: "x3", type: "date", title: "When did you first visit Riverside?", answered: 71 },
    { id: "x4", type: "pdf_upload", title: "Upload anything you'd like us to read", answered: 3 },
    { id: "x5", type: "dropdown", title: "Which service do you usually attend?", options: ["9:00", "11:00"], counts: [33, 54] },
    { id: "x6", type: "short_text", title: "One word for Riverside today", answered: 80 }
  ];

  /* ---------- Survey themes from open-text answers. AI drafts; the facilitator accepts, renames,
     merges or rejects. Only accepted themes reach What We Heard and the signal. ---------- */
  D.themes = [
    { id: "t1", q: "q6", label: "A clear way into groups", n: 27, quotes: ["I've been here a year and still don't know how to join a group.", "Groups feel full, or invisible to newcomers.", "Tell new people where to start."] },
    { id: "t2", q: "q6", label: "Space and parking on Sunday", n: 18, quotes: ["The 11:00 is packed and parking spills onto the street.", "We leave early to beat the lot."] },
    { id: "t3", q: "q6", label: "Communication", rename: "Hearing what's happening", n: 14, quotes: ["I find out about events after they happen.", "One place to see what's on would help."] },
    { id: "t4", q: "q6", label: "Things for young adults", n: 6, quotes: ["After youth group there's nothing for us.", "Most of my friends my age stopped coming."] },
    { id: "t5", q: "q6", label: "The coffee", n: 3, quotes: ["Better coffee, honestly."] },
    { id: "t6", q: "q4", label: "Preaching rooted in Scripture", n: 39, quotes: ["The teaching opens the Bible and applies it.", "I bring notes home every week."] },
    { id: "t7", q: "q4", label: "A welcome that feels real", n: 33, quotes: ["Someone remembered my name on my second Sunday.", "People actually talk to you after the service."] },
    { id: "t8", q: "q4", label: "Praying together", n: 15, quotes: ["The prayer team after the service.", "We pray for each other by name."] },
    { id: "t9", q: "q9", label: "Who makes decisions", n: 22, quotes: ["I don't know who decides what we spend on.", "Is it the elders or the staff?"] },
    { id: "t10", q: "q9", label: "What elders and staff each do", n: 11, quotes: ["The roles of elders and staff overlap.", "Who do I ask about a new ministry?"] }
  ];
  D.theme = function (id) { for (var i = 0; i < D.themes.length; i++) if (D.themes[i].id === id) return D.themes[i]; return null; };
  /* Themes while the survey was still at 61 responses (drafting as answers arrive) */
  D.draftAt = { responses: 61, counts: { t1: 17, t2: 20, t3: 9, t4: 4, t5: 2 } };
  /* A past engagement's total, for the crowded state */
  D.big = { responses: 360, scale: [6, 19, 61, 128, 146], choice: [11, 30, 157, 108, 54], themes: { t1: 112, t2: 74, t3: 61, t4: 23, t5: 9 }, under30: 31 };
  /* Open-text answers listed for grouping by hand when AI is off */
  D.answers = {
    q6: ["I've been here a year and still don't know how to join a group.", "Parking on Sunday mornings.", "Groups feel full, or invisible to newcomers.", "I find out about events after they happen.", "After youth group there's nothing for us.", "The 11:00 is packed.", "Tell new people where to start.", "Better coffee, honestly.", "One place to see what's on would help."]
  };
  /* Possible duplicates: Team Hub stores a hashed network address, not a device id. Flagged, never removed. */
  D.duplicates = [
    { id: "d1", a: 41, b: 42, network: true, gap: "3 minutes apart", same: 12, of: 14 },
    { id: "d2", a: 63, b: 64, network: true, gap: "1 minute apart", same: 14, of: 14 }
  ];
  D.sameNetwork = 23; /* responses that share a network with at least one other: church wifi */
  /* An imported survey run elsewhere */
  D.csv = { file: "riverside-survey-export.csv", rows: 87, columns: 17, matched: 16, unmatched: ["Timestamp"], importedAt: "Oct 28, 9:30 am" };

  /* ---------- Leadership interviews and input conversations ---------- */
  D.files = [
    { id: "f1", name: "Interview 1 notes.docx", kind: "interview", state: "read", words: 1840 },
    { id: "f2", name: "Interview 2 notes.docx", kind: "interview", state: "read", words: 2110 },
    { id: "f3", name: "Interview 3 transcript.txt", kind: "interview", state: "read", words: 6420 },
    { id: "f4", name: "Interview 4 notes.pdf", kind: "interview", state: "read", words: 1290 },
    { id: "f5", name: "Interview 5, pasted notes", kind: "interview", state: "read", words: 960 },
    { id: "f6", name: "Elders input conversation.pdf", kind: "board", state: "read", words: 3305 },
    { id: "f7", name: "Staff input conversation.docx", kind: "staff", state: "read", words: 2780 }
  ];
  D.badFile = { id: "fx", name: "Interview 4 scan.pdf", kind: "interview", state: "unreadable", reason: "It's a scanned image with no text. Paste the notes or upload a typed copy." };
  D.kinds = { interview: "Leadership interview", board: "Elders conversation", staff: "Staff conversation" };
  D.interviewThemes = [
    { id: "i1", label: "Small groups are hard to find", n: 4, of: 5, also: ["board"], quotes: ["Newcomers don't know where to start.", "Our group leaders are full and nobody is ready to start a new one."] },
    { id: "i2", label: "Staff capacity is stretched", n: 4, of: 5, also: ["staff"], quotes: ["Long weeks have become normal.", "We said yes to everything last year."] },
    { id: "i3", label: "The building limits Sunday", n: 3, of: 5, also: [], quotes: ["Two rooms make Sunday feel split.", "The 11:00 has no room left."] },
    { id: "i4", label: "Budget approval is unclear", n: 2, of: 5, also: ["board"], quotes: ["Staff and elders describe the process differently."] },
    { id: "i5", label: "Succession for the lead pastor", n: 1, of: 5, also: [], quotes: ["Nobody has asked what happens in five years."] }
  ];

  /* ---------- The Four Helpful Lists with Riverside's elders (7 people) ---------- */
  D.listsGroup = "Elders"; D.listsPeople = 7;
  D.cols = [
    { key: "right", q: "What's right?" },
    { key: "wrong", q: "What's wrong?" },
    { key: "missing", q: "What's missing?" },
    { key: "confused", q: "What's confused?" }
  ];
  D.listCards = [
    { id: "c1", col: "right", text: "Preaching is strong", agree: 5 },
    { id: "c2", col: "right", text: "We pray together", agree: 3 },
    { id: "c3", col: "right", text: "Teens getting baptized", agree: 3 },
    { id: "c4", col: "right", text: "Our volunteers show up", agree: 2 },
    { id: "c5", col: "wrong", text: "Two-room Sundays feel split", agree: 4 },
    { id: "c6", col: "wrong", text: "Staff stretched thin", agree: 2 },
    { id: "c7", col: "missing", text: "A path into groups", agree: 4 },
    { id: "c8", col: "missing", text: "Young adults", agree: 2 },
    { id: "c9", col: "confused", text: "Who approves the budget?", agree: 3 },
    { id: "c10", col: "confused", text: "Elder and staff roles", agree: 2 }
  ];
  /* A similar card that folds into c7 (AI), and a card with the same words (folds with AI off) */
  D.similar = { id: "c11", col: "missing", text: "A clear way to join a group", agree: 0, into: "c7" };
  D.sameWords = { id: "c12", col: "right", text: "preaching is strong", agree: 0, into: "c1" };
  D.longCard = { id: "c13", col: "confused", text: "Whether the elders or the staff decide which ministries get new money, and who we're supposed to ask when we want to start something", agree: 1 };
  D.crowdMissing = ["A path into groups", "Young adults", "A prayer room", "Parking help", "Men's ministry", "Childcare for midweek", "A youth pastor", "Church-wide retreat", "Recovery ministry", "Newcomer lunch", "Mentoring", "Worship team training", "A food pantry partner", "Sermon discussion guides", "Better signage", "A deacon role"];
  /* Accepted from the Four Helpful Lists into What We Heard and Strategic Tensions */
  D.listAccept = { c1: "heard", c5: "tension", c7: "heard", c9: "heard" };

  /* ---------- What We Heard headlines from accepted themes ---------- */
  D.heard = [
    { id: "h1", n: "31%", text: "named <strong>a clear way into groups</strong> as what Riverside could improve", plain: "31% named a clear way into groups as what Riverside could improve", detail: "27 of 87 survey answers asked for a clear way into a group. Four of five leadership interviews said the same, and the elders put \"A path into groups\" on their What's missing list.", src: [{ k: "survey", t: "Survey", c: "27 of 87" }, { k: "interviews", t: "Interviews", c: "4 of 5" }, { k: "lists", t: "Four Helpful Lists", c: "4 of 7 agree" }], themes: ["t1", "i1", "c7"] },
    { id: "h2", n: "38%", text: "said <strong>who makes decisions</strong> is unclear", plain: "38% said who makes decisions is unclear", detail: "33 of 87 survey answers named decision making as unclear (two themes merged). The elders listed the budget and elder and staff roles under What's confused.", src: [{ k: "survey", t: "Survey", c: "33 of 87" }, { k: "lists", t: "Four Helpful Lists", c: "3 of 7 agree" }], themes: ["t9", "c9"] },
    { id: "h3", n: "4 of 5", text: "interviews named <strong>staff capacity</strong> as stretched", plain: "4 of 5 interviews named staff capacity as stretched", detail: "Four of five leadership interviews and the staff conversation said long weeks have become normal.", src: [{ k: "interviews", t: "Interviews", c: "4 of 5" }, { k: "staff", t: "Staff conversation", c: "1" }], themes: ["i2"] },
    { id: "h4", n: "6 of 87", text: "survey answers came from <strong>people under 30</strong>", plain: "6 of 87 survey answers came from people under 30", detail: "Read this one carefully. Six answers can't speak for every young adult at Riverside.", src: [{ k: "survey", t: "Survey", c: "6 of 87" }], thin: "6 of 87 respondents", themes: ["t4"] }
  ];

  /* ---------- The alignment signal in Five Lenses: Congregation (Day 1) ---------- */
  D.signalSession = "Five Lenses: Congregation";
  D.signals = [
    { id: "g1", kind: "silent", theme: "A clear way into groups", line: "27 of 87 in the survey and 4 of 5 interviews. Not raised yet today.",
      ev: [{ k: "survey", t: "Survey, what could improve", c: "27 of 87 · 31%" }, { k: "interviews", t: "Leadership interviews", c: "4 of 5" }, { k: "lists", t: "Four Helpful Lists, What's missing?", c: "\"A path into groups\" · 4 of 7 agree" }],
      room: { sentences: 0, cards: 0, text: [] }, ask: "What would help someone new find their people here?" },
    { id: "g2", kind: "divergent", theme: "A third Sunday service", line: "The room leans toward a third service. The survey names connection beyond Sunday.",
      ev: [{ k: "survey", t: "Survey, what could improve", c: "\"A clear way into groups\" · 27 of 87" }, { k: "survey", t: "Survey answers asking for another service", c: "0 of 87" }, { k: "interviews", t: "Leadership interviews", c: "\"The building limits Sunday\" · 3 of 5" }],
      room: { sentences: 3, cards: 1, text: ["We run three services every Sunday.", "A third service makes room for guests.", "There's a service time for every family."] }, ask: "What would change for people if we added a service?" },
    { id: "g3", kind: "aligned", theme: "A welcome that feels real", line: "33 of 87 in the survey. 3 sentences today say the same.",
      ev: [{ k: "survey", t: "Survey, what we do well", c: "33 of 87 · 38%" }, { k: "interviews", t: "Leadership interviews", c: "2 of 5" }],
      room: { sentences: 3, cards: 0, text: ["Newcomers are known by name within their first month.", "Nobody sits alone on a Sunday.", "People bring their friends because they love this place."] }, ask: "What makes a welcome feel real here?" },
    { id: "g4", kind: "thin", theme: "People under 30", line: "The room leans on young adults. They're 6 of 87 respondents.",
      ev: [{ k: "survey", t: "Survey respondents under 30", c: "6 of 87 · thin" }, { k: "survey", t: "Survey theme, things for young adults", c: "6 of 87 · thin" }],
      room: { sentences: 2, cards: 0, text: ["Young adults stay after they finish school.", "Students lead worship and serve on every team."] }, ask: "Whose voices are we hearing least today?" }
  ];
  D.signal = function (id) { for (var i = 0; i < D.signals.length; i++) if (D.signals[i].id === id) return D.signals[i]; return null; };
  D.longSignal = { id: "g5", kind: "divergent", theme: "Moving every ministry to Sunday afternoons so families can attend one longer gathering", line: "The room leans toward one long Sunday afternoon gathering. Survey answers name midweek groups and the 11:00 service as what keeps people connected.", ev: [{ k: "survey", t: "Survey, what makes Riverside feel like home", c: "\"Groups in homes midweek\" · 21 of 87" }], room: { sentences: 4, cards: 1, text: ["Every ministry meets on Sunday afternoon."] }, ask: "What would we lose if everything moved to Sunday?" };
  /* Sentences on the Congregation wall that lean toward a third service */
  D.serviceSentences = [
    { id: "v1", text: "We run three services every Sunday.", c: "services" },
    { id: "v2", text: "A third service makes room for guests.", c: "services" },
    { id: "v3", text: "There's a service time for every family.", c: "services" }
  ];
  D.wallLabels = (function () { var o = {}, c = W.congregation.clusters; for (var k in c) o[k] = c[k]; o.services = "More Sunday services"; return o; })();
  D.citation = "Welcome that feels real · 33 of 87 survey answers · 3 sentences in Five Lenses: Congregation";

  window.ClearwayLivePass6Data = D;
})();
