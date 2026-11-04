/* Clearway Live · design pass 5 · seed data: Riverside Church (fictional), base year 2026.
   The scribe's cards from Day 1, the overnight drafts with their sources, and the Day 2 read-back.
   Every year is computed from the engagement's base year (W.years). Speaker names are stored for
   the record and only ever shown on the facilitators' review screens. */
(function () {
  "use strict";
  var W = window.ClearwayLivePass4Data;
  var S = {};
  S.Y = W.years(W.base);
  S.church = W.church;
  S.facilitators = [{ id: "cv", name: "Chris Vacher", first: "Chris", initials: "CV" }, { id: "jt", name: "Jaisy Tam-Harbridge", first: "Jaisy", initials: "JT" }];

  /* Card kinds. Keys 1 to 6 pick a kind on the console; photos come from the scribe's phone, files are uploaded. */
  S.kinds = {
    quote: { label: "Quote", icon: "quote", key: "1", lands: "The lens or section's pull quote, the report" },
    decision: { label: "Decision", icon: "gavel", key: "2", lands: "Decisions" },
    tension: { label: "Tension", icon: "zap", key: "3", lands: "Strategic Tensions" },
    action: { label: "Action", icon: "square-check", key: "4", lands: "Communication, next steps" },
    question: { label: "Question", icon: "circle-help", key: "5", lands: "Key Issues" },
    mitigation: { label: "Mitigation", icon: "shield-check", key: "6", lands: "Risks and Roadblocks, linked to the risk" },
    photo: { label: "Photo", icon: "camera", key: "", lands: "Attached to the session, read by the overnight draft" },
    file: { label: "File", icon: "paperclip", key: "U", lands: "Attached to the session" },
    correction: { label: "Correction", icon: "pencil-line", key: "7", lands: "The read-back, as a tracked change once accepted" }
  };
  S.kindOrder = ["quote", "decision", "tension", "action", "question", "mitigation"];

  /* Day 1 run of show. The console follows it: a card attaches to whatever session is live. */
  S.runOfShow = [
    { id: "d1-welcome", time: "9:00", title: "Welcome and prayer" },
    { id: "d1-celebrate", time: "9:15", title: "Celebration, short" },
    { id: "d1-congregation", time: "9:35", title: "Five Lenses: Congregation", lens: "congregation" },
    { id: "d1-break1", time: "10:30", title: "Break", nothing: true },
    { id: "d1-community", time: "10:45", title: "Five Lenses: Community", lens: "community" },
    { id: "d1-lunch", time: "11:45", title: "Lunch", nothing: true },
    { id: "d1-leadership", time: "12:30", title: "Five Lenses: Leadership", lens: "leadership" },
    { id: "d1-outcomes", time: "2:45", title: "Provisional Vision Outcomes" },
    { id: "d1-close", time: "3:50", title: "Day 1 close" }
  ];
  S.live = "d1-community";
  S.next = "d1-lunch";

  /* The scribe's cards in Five Lenses: Community. who is stored for the record only. */
  S.cards = [
    { id: "k1", kind: "quote", time: "11:24", text: "If we weren't here, the city would notice.", who: "Tasha Brown" },
    { id: "k2", kind: "decision", time: "11:31", text: "A few deep partnerships, not many shallow ones.", why: "The room agreed depth is what our neighbours notice." },
    { id: "k3", kind: "tension", time: "11:38", text: "Growth: more services or more groups?", views: ["More services, so newcomers have a way in.", "More groups, so newcomers are known."], who: "Daniel Okafor and Ruth Morrison" },
    { id: "k4", kind: "action", time: "11:42", text: "List our current community partners before the report.", owner: "Sam Whitford", date: "Nov 20" },
    { id: "k5", kind: "question", time: "11:47", text: "Does the food bank belong to Community or Operations?" },
    { id: "k6", kind: "photo", time: "11:50", text: "Easel, Community, page 1", photo: "easel-1" },
    { id: "k7", kind: "file", time: "11:52", text: "North end partners map.pdf", size: "2.4 MB" }
  ];
  S.mitigation = { id: "k8", kind: "mitigation", time: "10:24", day: 2, text: "Launch outcomes a season apart.", risk: "Risk 1 · We tried all five at once", session: "Pre-mortem" };
  S.typing = { kind: "quote", text: "Our building is the north end's living room.", who: "Grace Lindqvist" };
  S.longCard = { id: "kl", kind: "decision", time: "11:58", text: "We agreed that the food bank partnership will grow from two days to five only when the north end association co-leads it, so that every new day is run with our neighbours and not for them, and Ben will bring the association's answer to the elders in January.", why: "The room said capacity, not willingness, is what holds us back." };
  S.burst = (function () {
    var t = ["Neighbours know our names.", "The food bank is a two-way table.", "Our youth run the summer camp.", "We pray on the street every month.", "We show up at council meetings.", "The arts night fills the hall.", "We sponsor refugee families.", "Seniors visit their neighbours.", "Schools ask us for mentors.", "Our parking lot hosts the market."];
    var k = ["quote", "decision", "action", "question", "quote", "tension", "action", "quote", "decision", "question"];
    var out = [];
    for (var i = 0; i < 50; i++) { var m = 11 * 60 + 2 + Math.floor(i * 0.9); out.push({ id: "kb" + i, kind: k[i % k.length], time: Math.floor(m / 60) + ":" + ("0" + (m % 60)).slice(-2), text: t[i % t.length], views: k[i % k.length] === "tension" ? ["Say yes to the city.", "Protect our capacity."] : null, owner: k[i % k.length] === "action" ? "Ben Carter" : null }); }
    return out;
  })();

  /* Photos: easel pages and the wall, drawn as simple illustrations (no real photos in the design files). */
  S.photos = {
    "easel-1": { id: "easel-1", label: "Community, page 1", session: "Five Lenses: Community", time: "11:50", lines: ["COMMUNITY 2036", "north end living room", "food bank WITH neighbours", "few deep partners", "2 schools", "summer camp families"], hi: [2] },
    "easel-2": { id: "easel-2", label: "Community, page 2", session: "Five Lenses: Community", time: "11:56", lines: ["IF WE LEFT?", "city would notice", "seniors visiting", "council asks us"], hi: [], unreadable: true },
    "easel-0": { id: "easel-0", label: "Congregation, page 1", session: "Five Lenses: Congregation", time: "10:22", lines: ["CONGREGATION 2036", "baptisms monthly", "homes", "every generation"], hi: [] }
  };

  /* Phone sentences written in Five Lenses: Community. Always anonymous. */
  S.phone = {
    p1: "Neighbours call us first when someone on the street needs help.",
    p2: "The food bank runs out of our building five days a week.",
    p3: "Two north end schools count us as partners.",
    p4: "Our city would miss us if we left.",
    p5: "We run the food bank with our neighbours, not for them.",
    p6: "Families from summer camp now serve beside us.",
    p7: "We have a few partners we know deeply.",
    p8: "Our building is the north end's living room.",
    p9: "We are the church people cross the street to visit, not avoid."
  };

  /* The overnight draft for Community. Each sentence: the AI wording, the room's exact words where the
     sentence came from one place, and its sources (phone sentences, scribe cards, photos) with the words used. */
  S.community = {
    lens: "community",
    sentences: [
      { id: "s1", ai: "Riverside is woven into the life of the north end.", src: [{ t: "phone", id: "p8", hl: "the north end's living room" }, { t: "phone", id: "p1", hl: "Neighbours call us first" }, { t: "photo", id: "easel-1", hl: "north end living room" }] },
      { id: "s2", ai: "If we weren't here, the city would notice.", room: "If we weren't here, the city would notice.", src: [{ t: "card", id: "k1", hl: "If we weren't here, the city would notice." }, { t: "phone", id: "p4", hl: "Our city would miss us" }] },
      { id: "s3", ai: "We invest in a small number of deep partnerships rather than many shallow ones.", room: "We have a few deep partnerships, not many shallow ones.", src: [{ t: "card", id: "k2", hl: "A few deep partnerships, not many shallow ones." }, { t: "phone", id: "p7", hl: "a few partners we know deeply" }, { t: "photo", id: "easel-1", hl: "few deep partners" }] },
      { id: "s4", ai: "The food bank operates alongside our neighbours rather than on their behalf.", room: "We run the food bank with our neighbours, not for them.", src: [{ t: "phone", id: "p5", hl: "We run the food bank with our neighbours, not for them." }, { t: "phone", id: "p2", hl: "food bank" }, { t: "photo", id: "easel-1", hl: "food bank WITH neighbours" }] },
      { id: "s5", ai: "Two north end schools count us as partners.", room: "Two north end schools count us as partners.", src: [{ t: "phone", id: "p3", hl: "Two north end schools count us as partners." }, { t: "photo", id: "easel-1", hl: "2 schools" }] },
      { id: "s6", ai: "Families who first met us at summer camp now serve beside us.", src: [{ t: "phone", id: "p6", hl: "Families from summer camp now serve beside us." }, { t: "photo", id: "easel-1", hl: "summer camp families" }] },
      { id: "s7", ai: "Our community garden feeds forty households each summer.", src: [] }
    ],
    voices: [{ text: "We are the church people cross the street to visit, not avoid.", from: "One phone · anonymous" }],
    tensions: [{ text: "Growth: more services or more groups?", views: ["More services, so newcomers have a way in.", "More groups, so newcomers are known."], card: "k3" }],
    long: "Riverside is woven into the life of the north end, and if we weren't here the city would notice, because our building is the neighbourhood's living room on weekdays, the food bank is run with our neighbours rather than for them five days a week, two north end schools count us as partners, and families who first met us at summer camp now serve beside us in every ministry."
  };

  /* Every version of the Community draft is kept. */
  S.versions = [
    { n: 4, who: "cv", time: "8:10 pm", what: "Accepted the lens", current: true },
    { n: 3, who: "jt", time: "8:04 pm", what: "Removed sentence 7: it had no source" },
    { n: 2, who: "cv", time: "7:52 pm", what: "Restored the room's words in sentence 3" },
    { n: 1, who: "ai", time: "4:31 pm", what: "Drafted from 23 phone sentences, 7 scribe cards and 2 easel photos" }
  ];

  /* The five lens paragraphs as published for the read-back. */
  S.readback = {
    congregation: "Most Sundays someone is baptized or tells the story of how they came to faith. Half of our adults are in a group that meets in a home. Newcomers are known by name within their first month. Every generation worships in the same room on a Sunday.",
    community: "Riverside is woven into the life of the north end. If we weren't here, the city would notice. We have a few deep partnerships, not many shallow ones. We run the food bank with our neighbours, not for them. Two north end schools count us as partners. Families who first met us at summer camp now serve beside us.",
    leadership: "Every ministry has an apprentice leader ready to step in. Our elders spend their time on direction, not operations. A residency raises two new leaders every year.",
    operations: "Our building is open seven days a week. Giving funds ministry and a three-month reserve. Volunteers sign up and get trained in one place.",
    learning: "We know which first steps help newcomers stay. We know how to disciple people online and in person. We know what our neighbourhood needs before it asks."
  };
  /* The team's own sentences shown under each lens on phones (anonymous). */
  S.teamWords = {
    congregation: ["Most Sundays someone is baptized or tells the story of how they came to faith.", "Half of our adults are in a group that meets in a home.", "Nobody sits alone on a Sunday."],
    community: [S.phone.p4, S.phone.p5, S.phone.p7, S.phone.p3, S.phone.p6, S.phone.p8],
    leadership: W.lensSamples.leadership,
    operations: W.lensSamples.operations,
    learning: W.lensSamples.learning
  };

  /* Corrections in the Community read-back. The scribe records the wording the room agrees and why;
     the facilitator accepts each one, and it folds into the paragraph as a tracked change. */
  S.corrections = [
    { id: "x1", del: "Two", ins: "All four", at: "Two north end schools", phone: "Not two schools. It should be every school in the north end by then.", reason: "Two schools is today. The room agreed that by 2036 all four north end schools count us as partners." },
    { id: "x2", del: "", ins: " Our seniors visit their neighbours every week.", after: "now serve beside us.", phone: "Our seniors visiting the street is missing.", reason: "Named under What's missing. The room agreed it belongs in 2036." }
  ];
  S.missing = ["Our seniors visit their neighbours every week.", "The arts night at the community centre.", "The refugee families we sponsor.", "Prayer walks on the street."];
  S.missingLong = "The way our youth run the summer day camp for the whole neighbourhood, with kids from the apartments joining kids from church, and the parents meeting each other at pickup for the first time.";
  S.tally = {
    empty: { yes: 0, change: 0 },
    first: { yes: 1, change: 0 },
    agreeing: { yes: 8, change: 0 },
    split: { yes: 5, change: 3 },
    crowded: { yes: 41, change: 9 }
  };
  S.lensOrder = ["congregation", "community", "leadership", "operations", "learning"];

  /* Overnight review: every section and its state. */
  S.dayClosed = "4:05 pm";
  S.draftsReady = "4:31 pm";
  S.sections = [
    { id: "congregation", lens: "congregation", title: "Congregation, " + S.Y.future, kind: "lens", sentences: 6 },
    { id: "community", lens: "community", title: "Community, " + S.Y.future, kind: "lens", sentences: 7 },
    { id: "leadership", lens: "leadership", title: "Leadership, " + S.Y.future, kind: "lens", sentences: 5 },
    { id: "operations", lens: "operations", title: "Operations, " + S.Y.future, kind: "lens", sentences: 3, note: "Built mostly from easel photos: 4 phone sentences" },
    { id: "learning", lens: "learning", title: "Learning, " + S.Y.future, kind: "lens", sentences: 4 },
    { id: "outcomes", title: "Provisional Vision Outcomes", kind: "outcomes", sentences: 5, note: "Families find a home here has no bullets" },
    { id: "vision", title: "3-year Vision, first pass", kind: "vision", sentences: 13 }
  ];
  /* Review states by board state. s: drafting | ready | editing | reviewed | flagged; by: facilitator id. */
  S.reviewStates = {
    drafting: { congregation: "ready", community: "ready", leadership: "drafting", operations: "drafting", learning: "drafting", outcomes: "drafting", vision: "drafting" },
    ready: { congregation: "ready", community: "ready", leadership: "ready", operations: "ready", learning: "ready", outcomes: "flagged", vision: "ready" },
    both: { congregation: "reviewed:cv", community: "editing:cv", leadership: "reviewed:jt", operations: "ready", learning: "editing:jt", outcomes: "flagged", vision: "ready" },
    done: { congregation: "reviewed:cv", community: "reviewed:cv", leadership: "reviewed:jt", operations: "reviewed:jt", learning: "reviewed:jt", outcomes: "reviewed:cv", vision: "reviewed:cv" }
  };

  window.ClearwayLivePass5Data = S;
})();
