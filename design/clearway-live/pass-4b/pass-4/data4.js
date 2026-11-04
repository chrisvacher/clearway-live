/* Clearway Live · design pass 4 · Wayfinding seed data: Riverside Church (fictional).
   Base year 2026, so the 10-year Future is 2036, the 3-year Vision 2029 and the 1-year Outlook 2027.
   Every prompt reads its years from the engagement's base year: D.years(base). */
(function () {
  "use strict";
  var P3D = window.ClearwayLivePass3Data || {};
  var W = {};
  W.church = "Riverside Church";
  W.base = 2026;
  W.years = function (base) { base = base || W.base; return { future: base + 10, vision: base + 3, outlook: base + 1 }; };
  W.Y = W.years();
  W.people = P3D.people || ["Mark Ellison", "Priya Shah", "Daniel Okafor", "Grace Lindqvist", "Tasha Brown", "Sam Whitford", "Ruth Morrison", "Ben Carter"];
  W.first = W.people.map(function (p) { return p.split(" ")[0]; });
  W.more = P3D.more || [];
  W.facilitator = "Chris";
  W.longName = "Margaretha van der Westhuizen-Okonkwo";

  /* Lens names are a setting on the engagement (Customer replaces Congregation for an organization that isn't a church). */
  W.lenses = [
    { key: "congregation", name: "Congregation" },
    { key: "community", name: "Community" },
    { key: "leadership", name: "Leadership" },
    { key: "operations", name: "Operations" },
    { key: "learning", name: "Learning" }
  ];
  W.lensPrompt = function (lens, y) {
    y = y || W.Y.future;
    if (lens.key === "learning") return "It's " + y + ". What will we know then that we <strong>don't know now?</strong>";
    return "It's " + y + ". Describe our <strong>" + lens.name + ".</strong>";
  };
  W.lensPromptPlain = function (lens, y) { return W.lensPrompt(lens, y).replace(/<[^>]+>/g, ""); };

  /* Congregation: seeded since the pre-call (s), then the live burst (l). c is the cluster the AI path proposes. */
  W.congregation = {
    seeded: [
      { id: "s1", text: "Most Sundays someone is baptized or tells the story of how they came to faith.", c: "faith" },
      { id: "s2", text: "Half of our adults are in a group that meets in a home.", c: "homes" },
      { id: "s3", text: "Young families make up a third of the church.", c: "families" },
      { id: "s4", text: "Every generation worships in the same room on a Sunday.", c: "generations" },
      { id: "s5", text: "Newcomers are known by name within their first month.", c: "belong" },
      { id: "s6", text: "Students lead worship and serve on every team.", c: "generations" },
      { id: "s7", text: "Groups multiply into new homes every year.", c: "homes" },
      { id: "s8", text: "People bring their friends because they love this place.", c: "belong" },
      { id: "s9", text: "Our kids' ministry has more volunteers than it needs.", c: "families" }
    ],
    live: [
      { id: "l1", text: "We celebrate a baptism almost every month.", c: "faith" },
      { id: "l2", text: "Grandparents and teenagers serve side by side.", c: "generations" },
      { id: "l3", text: "Our groups are where people get cared for first.", c: "homes" },
      { id: "l4", text: "Parents of toddlers find friends here.", c: "families" },
      { id: "l5", text: "Alpha runs every season and is always full.", c: "faith" },
      { id: "l6", text: "Nobody sits alone on a Sunday.", c: "belong" },
      { id: "l7", text: "New believers are discipled one to one.", c: "faith" },
      { id: "l8", text: "Our worship sounds like the whole neighbourhood.", c: "generations" },
      { id: "l9", text: "We pray for each other by name every week.", c: "homes" },
      { id: "l10", text: "Young adults stay after they finish school.", c: "families" }
    ],
    clusters: { faith: "New faith", homes: "Groups in homes", families: "Young families", generations: "Every generation", belong: "Belonging" },
    long: "Every Sunday the room holds people who found Riverside through a friend, a neighbour, a school pickup line or the food bank, and within a month every one of them can name someone who prays for them and someone they could call at midnight."
  };
  (function () {
    var a = ["Families", "Students", "Seniors", "New believers", "Neighbours", "Our groups", "Young adults", "Volunteers", "Newcomers", "Kids"];
    var b = ["are known by name", "lead worship", "meet in homes", "bring their friends", "serve side by side", "stay after Sunday", "pray for each other", "find a place to belong", "are baptized every season", "grow into leaders"];
    var cl = ["belong", "generations", "homes", "belong", "generations", "belong", "homes", "belong", "faith", "generations"];
    W.congregation.burst = [];
    for (var i = 0; i < 50; i++) { var k = (i * 3 + Math.floor(i / 10)) % b.length; W.congregation.burst.push({ id: "b" + i, text: a[i % a.length] + " " + b[k] + ".", c: cl[k] }); }
  })();

  /* One sentence per other lens, used by lens headings, the seeding panel and the Map. */
  W.lensSamples = {
    community: ["Neighbours call us first when someone on the street needs help.", "The food bank runs out of our building five days a week.", "Two north end schools count us as partners."],
    leadership: ["Every ministry has an apprentice leader ready to step in.", "Elders spend their time on direction, not operations.", "A residency raises two new leaders every year."],
    operations: ["Our building is open seven days a week.", "Giving funds ministry and a three-month reserve.", "Volunteers sign up and get trained in one place."],
    learning: ["We know which first steps help newcomers stay.", "We know how to disciple people online and in person.", "We know what our neighbourhood needs before it asks."]
  };
  W.seedCounts = { congregation: 9, community: 7, leadership: 8, operations: 4, learning: 3 };

  /* INT-13: AI proposes 6 to 10 candidate priorities from all Five Lenses, each with the sentences it came from. */
  W.candidates = [
    { id: "c1", name: "New faith stories", from: 9, lenses: ["congregation", "learning"] },
    { id: "c2", name: "Leaders raised from within", from: 11, lenses: ["leadership", "congregation"] },
    { id: "c3", name: "A church that shows up", from: 10, lenses: ["community", "operations"] },
    { id: "c4", name: "Young families", from: 7, lenses: ["congregation", "community"] },
    { id: "c5", name: "Homes and groups", from: 8, lenses: ["congregation", "leadership"] },
    { id: "c6", name: "Open all week", from: 6, lenses: ["operations", "community"] },
    { id: "c7", name: "Every generation together", from: 5, lenses: ["congregation"] },
    { id: "c8", name: "Generous and resourced", from: 4, lenses: ["operations"] }
  ];
  W.renames = { c4: "Families find a home here", c3: "A church that shows up for the city" };
  W.merge = { from: "c7", into: "c5", name: "Homes and every generation" };
  W.suggestions = [
    { who: "Grace", kind: "Rename", text: "Young families", to: "Families find a home here" },
    { who: "Ben", kind: "Merge", text: "Every generation together", to: "Homes and groups" },
    { who: "Tasha", kind: "New", text: "Prayer that leads" }
  ];
  /* 100 points, steps of 5, eight people. Order matches candidates after the merge (c7 gone). */
  W.pointsOpts = ["New faith stories", "Leaders raised from within", "A church that shows up for the city", "Families find a home here", "Homes and every generation", "Open all week", "Generous and resourced"];
  W.points = [
    [25, 25, 20, 10, 10, 5, 5], [20, 30, 15, 15, 10, 5, 5], [30, 20, 20, 10, 15, 5, 0], [15, 25, 25, 15, 10, 5, 5],
    [20, 20, 15, 20, 15, 5, 5], [25, 15, 20, 15, 15, 5, 5], [20, 25, 20, 10, 15, 10, 0], [25, 20, 15, 15, 10, 10, 5]
  ];
  W.pointsFirst = [[20, 30, 15, 15, 10, 5, 5]];

  /* Provisional Vision Outcomes (marked by the facilitator after 100 points). */
  W.outcomes = [
    { id: "o1", name: "Leaders raised from within", bullets: ["12 apprentice leaders serve alongside a ministry lead", "The leader residency has placed its first 2 residents", "Every staff member has a CORE goal for developing a leader"] },
    { id: "o2", name: "New faith stories", bullets: ["40 people baptized over three years", "Alpha runs three seasons a year, full each time", "Every new believer has someone discipling them"] },
    { id: "o3", name: "A church that shows up for the city", bullets: ["The food bank partnership is open three days a week", "Two north end schools are formal partners"] },
    { id: "o4", name: "Families find a home here", bullets: [] },
    { id: "o5", name: "Homes and every generation", bullets: ["60% of adults are in a group that meets in a home", "Every group has members from at least two generations"] }
  ];
  W.longOutcome = "Every family with children under twelve finds friends, care and a clear next step at Riverside within their first season";

  /* Day 2: outcome confirm. Counts show where the room is. The facilitator records the consensus decision. */
  W.confirm = {
    o1: { c: 8, r: 0, x: 0, decision: "Confirmed", reason: "The whole room said this is the one that makes the rest possible." },
    o2: { c: 6, r: 2, x: 0, decision: "Confirmed", reason: "Kept the name. 'Stories' says we measure people, not programs." },
    o3: { c: 5, r: 3, x: 0, decision: "Renamed", to: "A church that shows up", reason: "Shorter. 'For the city' is already in our mission." },
    o4: { c: 2, r: 2, x: 4, decision: "Renamed", to: "Families belong here", reason: "Challenged as a demographic, not an outcome. Agreed the outcome is belonging, with families as the first focus." },
    o5: { c: 7, r: 0, x: 1, decision: "Confirmed", reason: "One challenge on overlap with families. The room kept them separate." }
  };
  W.confirmedOutcomes = W.outcomes.map(function (o) { var c = W.confirm[o.id]; return { id: o.id, name: c.to || o.name, bullets: o.bullets }; });
  W.lensLines = { congregation: "New faith, groups in homes, young families", community: "Neighbours call us first", leadership: "An apprentice in every ministry", operations: "Open seven days a week", learning: "We know what helps newcomers stay" };
  W.challengeReasons = ["Is this an outcome or an age group?", "Feels like a program, not a result.", "Overlaps with Homes and every generation."];
  W.descriptions = {
    o1: "We raise our next leaders ourselves, in every ministry.",
    o2: "People meet Jesus here and tell the story of it.",
    o3: "Our neighbours know Riverside by what it does for them.",
    o4: "Families find friends, care and a next step here.",
    o5: "Faith grows in homes where every generation shares life."
  };
  W.stops = { o1: "Hiring from outside before we've looked within.", o2: "Running events that don't lead to a next step.", o3: "Saying yes to every partnership request." };

  /* Pre-mortem (INT-08 in its Wayfinding form). x is likelihood, y is impact, 0 to 1. */
  W.premortem = [
    { id: "r1", num: 1, label: "We tried all five at once", places: [[0.82, 0.86], [0.75, 0.9], [0.88, 0.8], [0.8, 0.84]], mit: "Launch outcomes a season apart" },
    { id: "r2", num: 2, label: "Staff burned out by spring", places: [[0.66, 0.78], [0.7, 0.72], [0.6, 0.8]], mit: "One owner and a real end date per goal" },
    { id: "r3", num: 3, label: "The elders never owned the plan", places: [[0.45, 0.82], [0.5, 0.76]], mit: "Elders review CORE every season" },
    { id: "r4", num: 4, label: "Giving dropped in a hard year", places: [[0.32, 0.62], [0.28, 0.58]] },
    { id: "r5", num: 5, label: "We stopped praying for it", places: [[0.4, 0.92], [0.36, 0.88], [0.42, 0.94]], mit: "Prayer for the plan at every staff meeting" },
    { id: "r6", num: 6, label: "No one knew who owned what", places: [[0.58, 0.66]] }
  ];
  W.premortemDupe = { id: "r7", num: 7, label: "Too many priorities at once", places: [[0.8, 0.82]], into: "r1" };
  W.premortemLong = "The congregation never heard the plan in a way they could repeat, so it stayed a staff document";

  /* CORE goal builder: one Vision Outcome at a time. End dates default to a season end. */
  W.seasons = [
    { key: "SEP_DEC", label: "Sep to Dec", end: "Dec 31, 2026" },
    { key: "JAN_APR", label: "Jan to Apr", end: "Apr 30, 2027" },
    { key: "MAY_AUG", label: "May to Aug", end: "Aug 31, 2027" }
  ];
  W.goals = [
    { id: "g1", title: "Launch the apprentice pathway", result: "8 apprentices placed in ministries", owner: "Priya Shah", end: "Apr 30, 2027", risk: 2, confirmed: true },
    { id: "g2", title: "Design the leader residency", result: "", owner: "", end: "Aug 31, 2027", risk: 1 },
    { id: "g3", title: "Develop a leader in every 1:1", result: "Every staff 1:1 sets a leader development goal", owner: "Daniel Okafor", end: "", risk: 2 }
  ];
  W.goalOwnerOutside = { name: "Leah Kim", email: "leah@riverside.church", note: "Not at the retreat. Invited to CORE at publishing." };
  W.longGoal = "Build a twelve-month residency with a curriculum, mentors, a stipend plan and a placement in every ministry";

  /* Commander's intent (INT-16), team-led. One card per Vision Outcome, drafted by a pair. */
  W.intentFields = [
    { key: "intent", label: "Commander's intent", q: "What must be true by " + (W.base + 3) + ", even if every plan changes?" },
    { key: "must", label: "The must-do", q: "What is the one thing we cannot fail to do?" },
    { key: "stop", label: "What we'll stop", q: "What are we giving up to make room for this?" },
    { key: "steps", label: "Next 30 days", q: "What happens first, who owns it, and by when?" }
  ];
  W.intent = [
    { o: "o1", pair: ["Priya", "Sam"], intent: "Every ministry is growing its own next leader.", must: "Name an apprentice in every ministry.", stop: "Hiring from outside before we've looked within.",
      steps: [{ text: "List every ministry lead and a possible apprentice", owner: "Priya Shah", date: "Nov 27" }, { text: "Draft the apprentice role description", owner: "Sam Whitford", date: "Dec 4" }] },
    { o: "o2", pair: ["Mark", "Ruth"], intent: "People meet Jesus here and can tell the story.", must: "Keep Alpha full every season.", stop: "Events with no next step.",
      steps: [{ text: "Book the winter Alpha dates", owner: "Ruth Morrison", date: "Nov 20" }, { text: "Ask three people to share a baptism story", owner: "", date: "" }] },
    { o: "o3", title: "A church that shows up", pair: ["Ben", "Tasha"], intent: "Our neighbours know us by what we do for them.", must: "Open the food bank a third day.", stop: "Saying yes to every partnership request.",
      steps: [{ text: "Meet the food bank board", owner: "Ben Carter", date: "" }] },
    { o: "o4", title: "Families belong here", pair: ["Grace", "Daniel"], intent: "", must: "", stop: "", steps: [] },
    { o: "o5", pair: ["Mark", "Priya"], intent: "Faith grows at kitchen tables.", must: "Train six new group hosts.", stop: "Midweek programs that compete with groups.",
      steps: [{ text: "Invite twelve possible hosts to an evening", owner: "Grace Lindqvist", date: "Dec 1" }] }
  ];
  W.intentTyping = ["Every ministry", "Every ministry is growing", "Every ministry is growing its own", "Every ministry is growing its own next leader."];

  /* Draft Clearway Map. Identity fields come from engagement setup. Empty fields stay empty. */
  W.map = {
    mission: "To help people follow Jesus, together, for the good of our city.",
    purpose: "",
    values: ["We go first in welcome", "We pray before we plan", "We raise leaders, not crowds", "We give our best to our neighbours"],
    strategy: "Sunday worship, groups in homes, Alpha, and partnerships in the north end.",
    rhythms: ["Weekly team meetings", "Monthly 1:1 development", "Seasonal goal setting", "Annual planning and reviews"],
    keyIssues: ["We tried all five at once (risk 1)", "Staff burned out by spring (risk 2)", "Where do young adults fit after school? (scribe question)"]
  };

  W.passages = {
    d1close: { text: "Unless Yahweh builds the house, they labor in vain who build it.", ref: "Psalm 127:1", tr: "World English Bible", bold: "they labor in vain who build it." },
    d2prayer: { text: "Your ears will hear a word behind you, saying, “This is the way. Walk in it.”", ref: "Isaiah 30:21", tr: "World English Bible", bold: "“This is the way. Walk in it.”" },
    precall: { text: "We are only God’s servants through whom you believed the Good News. Each of us did the work the Lord gave us. I planted the seed in your hearts, and Apollos watered it, but it was God who made it grow. It’s not important who does the planting, or who does the watering. What’s important is that God makes the seed grow. The one who plants and the one who waters work together with the same purpose.", ref: "1 Corinthians 3:5-8", tr: "New Living Translation", bold: "What’s important is that God makes the seed grow." }
  };
  W.sensing = ["Peace about leaders first", "Families keep coming up for me", "A sense we need to slow down", "Gratitude for this team", "Isaiah 30 again this morning", "Less is more this year"];

  W.headlines = [
    { n: "45%", text: "named <strong>small groups</strong> as where they feel most connected", src: "Congregational survey · 87 answers" },
    { n: "6 of 87", text: "survey answers came from <strong>people under 30</strong>", src: "Congregational survey · thin data", thin: true },
    { n: "3 of 4", text: "staff interviews named <strong>unclear ownership</strong> as the biggest frustration", src: "Leadership interviews · 4 conversations" }
  ];
  W.measures = ["Baptisms", "People in groups", "Leaders in training", "Weekly attendance", "Volunteers serving", "First-time guests who return", "Giving units"];
  W.measureRank = [[0, 2, 1, 5, 3], [2, 0, 1, 4], [1, 2, 0, 5, 3], [0, 1, 2, 4, 5], [2, 1, 0, 3], [0, 2, 1, 5, 4], [1, 0, 2, 3, 5]];
  window.ClearwayLivePass4Data = W;
})();
