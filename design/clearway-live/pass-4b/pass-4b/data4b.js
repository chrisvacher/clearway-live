/* Clearway Live · design pass 4b · seed data: Riverside Church (fictional), base year 2026.
   The live lens summaries on Day 1, their sign-off, the follow-up access for a team facilitator,
   the revised Day 2 confirm and the revised overnight review. Every year is computed from the
   engagement's base year. Pass 4b replaces two things pass 5 had: the read-back text (now the
   signed-off summaries) and the overnight section list (now outcomes and the 3-year Vision). */
(function () {
  "use strict";
  var W = window.ClearwayLivePass4Data, S = window.ClearwayLivePass5Data, D = {};
  D.Y = W.years(W.base);
  D.church = W.church;
  D.order = S.lensOrder;
  /* TV capacity of one summary screen, checked in code. Past the first line the TV steps down to the floor size; past the second it shows the sentences that fit and says "+ n more on phones". */
  D.fit = { body: 300, floor: 420 };
  D.counts = { congregation: 36, community: 31, leadership: 28, operations: 22, learning: 26 };

  /* Each lens: the AI's first version (v1) as sentences, each with the room's own sentences it came from;
     suggestions that arrive from phones; and the folds the AI makes from them into version 2.
     A fold is {id, del, ins, at} (a replacement) or {id, ins, after} (an addition), as pass 5's corrections. */
  var P = S.phone;
  D.lens = {
    congregation: {
      sentences: [
        { id: "g1", t: "Most Sundays someone is baptized or tells the story of how they came to faith.", src: ["Baptisms happen almost every month.", "People stand up and tell how they came to faith."] },
        { id: "g2", t: "Half of our adults are in a group that meets in a home.", src: ["Half our adults are in a home group.", "Our groups meet around kitchen tables."] },
        { id: "g3", t: "Newcomers are known by name within their first month.", src: ["Nobody is a stranger for more than a month.", "Someone greets every newcomer by name."] },
        { id: "g4", t: "Every generation worships in the same room on a Sunday.", src: ["Teenagers, grandparents and toddlers worship in one room.", "Students lead worship and serve on every team."] }
      ],
      suggestions: ["Young families are missing. They should be the first thing we say."],
      folds: [{ id: "gf1", ins: " Young families find friends here in their first season.", after: "on a Sunday.", suggestion: "Young families are missing. They should be the first thing we say.", src: ["Young families find a home here.", "Young families make friends in their first season."] }]
    },
    community: {
      sentences: [
        { id: "m1", t: "Riverside is woven into the life of the north end.", src: [P.p8, P.p1] },
        { id: "m2", t: "If we weren't here, the city would notice.", src: [P.p4] },
        { id: "m3", t: "We have a few deep partnerships, not many shallow ones.", src: [P.p7] },
        { id: "m4", t: "We run the food bank with our neighbours, not for them, five days a week.", src: [P.p5, P.p2] },
        { id: "m5", t: "Two north end schools count us as partners.", src: [P.p3] },
        { id: "m6", t: "Families who first met us at summer camp now serve beside us.", src: [P.p6] }
      ],
      suggestions: ["Not two schools. It should be every school in the north end by then.", "Our seniors visiting the street is missing.", "Make it all four schools.", "Seniors visit their neighbours. Please add that."],
      folds: [
        { id: "mf1", del: "Two", ins: "All four", at: "Two north end schools", suggestion: "Not two schools. It should be every school in the north end by then.", src: ["Two north end schools count us as partners.", "Every school in the north end counts us as a partner."] },
        { id: "mf2", ins: " Our seniors visit their neighbours every week.", after: "now serve beside us.", suggestion: "Our seniors visiting the street is missing.", src: ["Seniors visit their neighbours."], isNew: true }
      ]
    },
    leadership: {
      sentences: [
        { id: "l1", t: "Every ministry has an apprentice leader ready to step in.", src: ["Every ministry has an apprentice leader ready to step in.", "No ministry depends on one person."] },
        { id: "l2", t: "Our elders spend their time on direction, not operations.", src: ["Elders spend their time on direction, not operations."] },
        { id: "l3", t: "A residency raises two new leaders every year.", src: ["A residency raises two new leaders every year.", "We train leaders before we need them."] }
      ],
      suggestions: [], folds: []
    },
    operations: {
      sentences: [
        { id: "o1", t: "Our building is open seven days a week.", src: ["Our building is open seven days a week.", "The north end uses our building on weekdays."] },
        { id: "o2", t: "Giving funds ministry and a three-month reserve.", src: ["Giving funds ministry and a three-month reserve."] },
        { id: "o3", t: "Volunteers sign up and get trained in one place.", src: ["Volunteers sign up and get trained in one place.", "Nobody has to ask three people how to serve."] }
      ],
      suggestions: [], folds: []
    },
    learning: {
      sentences: [
        { id: "n1", t: "We know which first steps help newcomers stay.", src: ["We know which first steps help newcomers stay."] },
        { id: "n2", t: "We know how to disciple people online and in person.", src: ["We know how to disciple people online and in person.", "We know what works for people who cannot come on Sundays."] },
        { id: "n3", t: "We know what our neighbourhood needs before it asks.", src: ["We know what our neighbourhood needs before it asks."] }
      ],
      suggestions: [], folds: []
    }
  };
  /* A long Community summary, past one screen at the floor size. The TV shows the sentences that fit. */
  D.longCommunity = {
    sentences: D.lens.community.sentences.concat([
      { id: "m7", t: "Our building is the neighbourhood's living room on weekdays, and the arts night fills the hall every month.", src: ["The arts night fills the hall."] },
      { id: "m8", t: "The families we sponsor as refugees are now members, leaders and neighbours who sponsor others.", src: ["We sponsor refugee families."] },
      { id: "m9", t: "On Friday afternoons the youth drop-in is the safest place on the street, and the library asks us for tutors.", src: ["Schools ask us for mentors.", "Tutoring at the library."] }
    ])
  };

  /* Joined text of the first version, and of the signed-off one (every fold applied). */
  function join(list) { return list.map(function (s) { return s.t; }).join(" "); }
  D.text = function (k, long) { return join(long && k === "community" ? D.longCommunity.sentences : D.lens[k].sentences); };
  D.final = function (k) {
    var t = D.text(k), P5 = window.ClearwayLivePass5, st = {};
    D.lens[k].folds.forEach(function (f) { st[f.id] = "settled"; });
    return P5.TrackedChange.segments(t, D.lens[k].folds, st).map(function (s) { return s.t; }).join("");
  };
  /* Pass 5's read-back now reads the signed-off summaries: the confirm on Day 2 is of what the room decided on Day 1. */
  S.readback = {};
  D.order.forEach(function (k) { S.readback[k] = D.final(k); });
  S.community.long = D.text("community", true);
  /* The team's own sentences are no longer shown on Day 2 phones (the confirm is short); keep them for Day 1 only. */
  /* New Day 2 corrections, against the signed-off text. They replace pass 5's (those happened on Day 1 now). */
  S.corrections = [
    { id: "x1", del: "five", ins: "six", at: "five days a week", phone: "Make it six days. Saturday is our busiest.", reason: "The food bank added Saturdays in the spring. The room agreed six days is the true number for 2036." },
    { id: "x2", del: "", ins: " The arts night fills the community centre every month.", after: "every week.", phone: "The arts night is missing.", reason: "Named under What's missing. The room agreed it belongs in 2036." }
  ];
  S.missing = ["The arts night at the community centre.", "The refugee families we sponsor.", "Prayer walks on the street.", "The Friday youth drop-in."];
  S.missingLong = "The way our youth run the summer day camp for the whole neighbourhood, with kids from the apartments joining kids from church, and the parents meeting each other at pickup for the first time.";

  /* The room's progress through the five summaries on Day 1. */
  D.sessions = { start: "2:30", minutes: 25 };

  /* ---------- The follow-up access (day-and-a-half template) ---------- */
  D.followup = {
    block: "Pre-mortem, commander's intent, affirm together",
    sessions: [{ t: "10:00", n: "Pre-mortem" }, { t: "10:45", n: "Commander's intent" }, { t: "12:00", n: "Affirm together" }],
    date: "Tuesday, November 17", start: "10:00", end: "12:30", opens: "9:00", closes: "2:30",
    person: { name: "Priya Shah", first: "Priya", email: "priya@riversidechurch.example" },
    code: "MAPLE 4821", link: "live.clearway.co/f/k7Qm2xW9vTnE4pLb"
  };

  /* ---------- Overnight: the provisional Vision Outcomes and the 3-year Vision first pass ---------- */
  D.ovnCards = {
    k20: { kind: "quote", time: "3:52", text: "Forty people baptized in three years is a number we can pray for." },
    k21: { kind: "decision", time: "3:58", text: "Count baptisms and the people walking with them, not attendance.", why: "The room said stories are measured in people." },
    k22: { kind: "action", time: "4:01", text: "Ask Alpha's leaders what a full season means.", owner: "Priya Shah", date: "Nov 24" },
    k23: { kind: "question", time: "4:03", text: "Is a family a group of people or an outcome?" }
  };
  D.photos = {
    "easel-v1": { id: "easel-v1", label: "3-year Vision, New faith stories", session: "3-year Vision, first pass", time: "3:55", lines: ["NEW FAITH 2029", "40 baptized", "Alpha 3 seasons", "full each time", "someone discipling", "every believer"], hi: [1] },
    "easel-v2": { id: "easel-v2", label: "3-year Vision, Families", session: "3-year Vision, first pass", time: "4:04", lines: ["FAMILIES 2029", "?", "belong not demo", "next step", "friends"], hi: [] }
  };
  Object.keys(D.photos).forEach(function (k) { S.photos[k] = D.photos[k]; });
  /* Each tidied bullet: the tidied wording, the room's own bullet, and what the scribe cards and easel photo add. */
  D.outcomes = [
    { id: "o2", name: "New faith stories", was: "New faith stories", bullets: [
      { id: "b1", ai: "40 people are baptized over three years.", room: "40 people baptized over three years", src: [{ t: "bullet", s: "40 people baptized over three years", hl: "40 people baptized" }, { t: "card", id: "k20", hl: "Forty people baptized in three years" }, { t: "photo", id: "easel-v1", hl: "40 baptized" }] },
      { id: "b2", ai: "Alpha runs three seasons a year, full each time.", room: "Alpha runs three seasons a year, full each time", src: [{ t: "bullet", s: "Alpha runs three seasons a year, full each time", hl: "three seasons a year" }, { t: "photo", id: "easel-v1", hl: "Alpha 3 seasons" }, { t: "card", id: "k22", hl: "Ask Alpha's leaders what a full season means." }] },
      { id: "b3", ai: "Every new believer has someone walking with them.", room: "Every new believer has someone discipling them", src: [{ t: "bullet", s: "Every new believer has someone discipling them", hl: "Every new believer" }, { t: "card", id: "k21", hl: "the people walking with them" }] }
    ] },
    { id: "o4", name: "Families find a home here", was: "Young families", bullets: [], thin: true }
  ];
  /* The five outcomes in the review list, with their state. */
  D.ovnRows = [
    { id: "o1", title: "Leaders raised from within", sub: "3 bullets · 1 number added from a scribe card" },
    { id: "o2", title: "New faith stories", sub: "3 bullets · 2 numbers added from scribe cards and an easel photo" },
    { id: "o3", title: "A church that shows up for the city", sub: "2 bullets" },
    { id: "o4", title: "Families find a home here", sub: "No bullets. The room ran out of time", thin: true },
    { id: "o5", title: "Homes and every generation", sub: "2 bullets · merged from Homes and groups and Every generation together" }
  ];
  D.ovnStates = {
    drafting: { o1: "ready", o2: "drafting", o3: "drafting", o4: "drafting", o5: "drafting" },
    ready: { o1: "ready", o2: "ready", o3: "ready", o4: "flagged", o5: "ready" },
    both: { o1: "reviewed:cv", o2: "editing:cv", o3: "reviewed:jt", o4: "flagged", o5: "editing:jt" },
    done: { o1: "reviewed:cv", o2: "reviewed:cv", o3: "reviewed:jt", o4: "reviewed:cv", o5: "reviewed:jt" }
  };
  D.versions = [
    { n: 3, who: "cv", time: "8:10 pm", what: "Accepted New faith stories", current: true },
    { n: 2, who: "jt", time: "8:04 pm", what: "Restored the room's words in bullet 3" },
    { n: 1, who: "ai", time: "4:31 pm", what: "Tidied from 14 bullets, 12 scribe cards and 3 easel photos" }
  ];
  D.dayClosed = "4:20 pm"; D.draftsReady = "4:46 pm";

  window.ClearwayLivePass4bData = D;
})();
