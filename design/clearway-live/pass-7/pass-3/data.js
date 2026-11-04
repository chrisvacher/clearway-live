/* Clearway Live · design pass 3 · seed data: Riverside Church (fictional). */
(function () {
  "use strict";
  var D = {};
  D.church = "Riverside Church";
  D.people = ["Mark Ellison", "Priya Shah", "Daniel Okafor", "Grace Lindqvist", "Tasha Brown", "Sam Whitford", "Ruth Morrison", "Ben Carter"];
  D.first = D.people.map(function (p) { return p.split(" ")[0]; });
  D.more = ["Jaisy", "Chris", "Elena", "Tom", "Abby", "Marcus", "Hannah", "Joel", "Nadia", "Pete", "Lydia", "Owen", "Ivy", "Caleb", "Rosa", "Femi", "Wes", "Mina", "Theo", "Ana", "Kofi", "Lena", "Gabe", "Noor", "Jude", "Isla", "Reuben", "Tess", "Ola", "Sean", "Maya", "Eli", "Zara", "Luke", "Ines", "Paul", "Ruby", "Dev", "Hugo", "Amara", "Will", "June"];
  D.longName = "Margaretha van der Westhuizen-Okonkwo";

  D.cloud = {
    eyebrow: "Celebration", headline: "One word for what God is doing <strong>at Riverside</strong>", prompt: "One word for what God is doing at Riverside",
    typical: [["youth", 4], ["young people", 2], ["alpha", 3], ["baptisms", 3], ["momentum", 2], ["welcome", 2], ["families", 1], ["prayer", 1], ["worship", 1], ["hope", 1], ["generosity", 1], ["neighbours", 1], ["joy", 1], ["students", 1], ["seniors", 1], ["kids", 1], ["music", 1], ["outreach", 1], ["groups", 1], ["unity", 1], ["care", 1]],
    merge: { "young people": "youth" },
    first: [["momentum", 1]],
    long: [["neighbourhood partnerships", 3], ["intergenerational worship", 2], ["youth", 4], ["alpha", 3], ["discipleship", 2], ["generosity", 1], ["hospitality", 1], ["reconciliation", 1]],
    burst: ["youth", "alpha", "momentum", "baptisms", "youth", "welcome", "families", "alpha", "youth", "prayer", "momentum", "worship", "generosity", "youth", "alpha", "baptisms", "hope", "community", "momentum", "welcome", "young people", "kids", "joy", "alpha", "students", "baptisms", "seniors", "youth", "care", "momentum", "welcome", "alpha", "groups", "young people", "prayer", "unity", "baptisms", "neighbours", "momentum", "alpha", "youth", "music", "families", "welcome", "outreach", "youth", "momentum", "hope", "alpha", "baptisms"]
  };

  D.wall = {
    eyebrow: "Celebration", headline: "What is God doing that's <strong>worth celebrating?</strong>", prompt: "What is God doing that's worth celebrating?",
    seed: ["Teenagers asking to be baptized", "Alpha full three seasons running", "Young families finding us online", "Seniors' lunch serving the whole street", "Worship team doubled since spring", "Three baptisms at Easter", "Kids' ministry has a waiting list", "More young families every month", "New believers in Alpha asking real questions", "The food bank partnership with St. Mark's", "Small groups starting in homes again", "Our youth leading worship once a month", "Prayer team meeting on Wednesday nights", "Generous giving through a hard year"],
    themes: [["Baptisms", /baptiz|baptism/i], ["Alpha", /alpha|new believers|real questions/i], ["Young families", /famil/i], ["Next generation", /teen|youth|kids|students/i], ["Small groups", /small group|homes/i], ["Worship", /worship/i], ["Prayer", /prayer/i], ["Serving neighbours", /serving|neighbour|street|food bank/i], ["Volunteers", /volunteer|showing up|show up/i], ["Welcome", /coffee|newcomer|welcom|finding us/i], ["Seniors", /senior/i], ["Generosity", /giv|generous/i]],
    summary: "New faith leads: baptisms, teenagers and Alpha come up again and again. Young families finding Riverside online is the next strongest thread.",
    summary2: "Baptisms and new believers still lead. Young families and the kids' waiting list point the same way: Riverside is growing younger.",
    long: "We've watched three generations of one family come back to faith this year, starting with a grandmother who came to the seniors' lunch and stayed for Alpha, then her daughter, then two grandchildren who asked to be baptized together at Easter."
  };
  (function () {
    var a = ["Teenagers", "Young families", "Seniors", "New believers", "Volunteers", "Our youth", "Small groups", "The prayer team", "Newcomers", "Kids' ministry"];
    var b = ["asking to be baptized", "finding us online", "serving the whole street", "staying for coffee", "leading worship", "meeting in homes again", "showing up early", "inviting their neighbours", "growing every season", "asking real questions"];
    D.wall.burst = []; for (var i = 0; i < 50; i++) D.wall.burst.push(a[i % a.length] + " " + b[(i * 3 + Math.floor(i / 10)) % b.length]);
  })();

  D.qa = {
    eyebrow: "What we heard · Questions", headline: "What do you want to <strong>ask about the results?</strong>", prompt: "Ask about the survey, board or interview results",
    qs: [
      { id: "q1", text: "Did staff turnover come up in the interviews?", askers: 2, votes: 3, ai: true, t: 9 },
      { id: "q2", text: "What did people under 30 say about Sunday?", askers: 1, votes: 4, t: 8 },
      { id: "q3", text: "Will the congregation see these results?", askers: 1, votes: 2, t: 7 },
      { id: "q4", text: "Is the building really the main issue?", askers: 1, votes: 2, t: 6 },
      { id: "q5", text: "Where do small groups fit in all this?", askers: 1, votes: 1, t: 5 },
      { id: "q6", text: "How many people answered the survey?", askers: 1, votes: 1, t: 4 },
      { id: "q7", text: "Who decides what goes in the final plan?", askers: 1, votes: 0, t: 3 }
    ],
    folded: { id: "q8", text: "Was staff turnover mentioned by the leaders you interviewed?", into: "q1" },
    long: "When the survey says people want more connection beyond Sunday, does that mean more small groups, more midweek events, or something we haven't thought of yet, like serving together?"
  };

  D.choice = {
    eyebrow: "Next season", headline: "Where should our next season of <strong>investment go?</strong>", prompt: "Where should our next season of investment go?",
    opts: ["Small groups", "Next generation", "Welcome and first visits", "Prayer", "Serving the city"],
    typical: [3, 2, 2, 1, 0], first: [0, 1, 0, 0, 0],
    anyPrompt: "Which of these have you served in this year? Pick any.",
    any: [5, 4, 2, 6, 3],
    long: ["Small groups that meet in homes across the north end", "Next generation, including kids, students and young adults", "Welcome and first visits", "Prayer", "Serving the city with our neighbourhood partners"]
  };

  D.scale = {
    eyebrow: "Check-in", headline: "How clear is <strong>our current direction?</strong>", prompt: "How clear is our current direction?",
    lo: "Not clear at all", hi: "Completely clear", typical: [0, 1, 2, 3, 2], first: [0, 0, 0, 1, 0],
    tenPrompt: "How ready is the team for a second campus?", tenLo: "Not ready", tenHi: "Ready now", ten: [0, 1, 1, 2, 1, 2, 0, 1, 0, 0]
  };

  /* Statements (INT-17): each statement rated 1 to 5 for agreement. Counts per statement, Strongly disagree to Strongly agree. */
  D.statements = {
    eyebrow: "Statements", headline: "How true is each of these <strong>for us today?</strong>", prompt: "How true is each of these for us today?",
    lo: "Strongly disagree", hi: "Strongly agree",
    stmts: ["Our Sunday gathering helps people take a next step.", "We know who we are trying to reach.", "Our leaders have room to lead, not just manage.", "Our systems help more than they get in the way.", "We celebrate wins together often enough."],
    typical: [[0, 1, 2, 3, 2], [1, 2, 3, 2, 0], [2, 3, 2, 1, 0], [3, 3, 1, 1, 0], [0, 1, 1, 4, 2]],
    crowded: [[3, 7, 15, 17, 8], [6, 12, 16, 12, 4], [10, 16, 14, 8, 2], [16, 18, 9, 6, 1], [2, 5, 8, 22, 13]],
    divided: [3, 1, 0, 1, 3],
    first: [4, 3, 2, 2, 5], mine: [4, 2, 3, 2, 5],
    long: ["Our Sunday gathering helps people who are new to faith take a clear next step toward following Jesus.", "We know who we are trying to reach.", "Our leaders have room to lead, not just manage the week.", "Our systems help more than they get in the way.", "We celebrate wins together often enough."]
  };

  D.rank = {
    eyebrow: "Priorities", headline: "Rank these by <strong>what matters most</strong> this season", prompt: "Rank these by what matters most this season",
    opts: ["Leader formation", "Next generation", "Second campus and facility", "Reaching new people", "Systems and data"],
    typical: [[0, 1, 3, 2, 4], [0, 2, 1, 3], [1, 0, 3, 2, 4], [0, 3, 1], [2, 0, 1, 3, 4], [0, 1, 2], [3, 0, 1, 2, 4]],
    first: [[0, 1, 3]],
    added: "Prayer and discernment", dupe: "Prayer",
    long: ["Leader formation through a residency for emerging staff and volunteers", "Next generation", "Second campus and facility, including the north end site", "Reaching new people", "Systems and data"]
  };

  D.points = {
    eyebrow: "100 points", headline: "Spend 100 points on <strong>where we should focus</strong>", prompt: "Spend 100 points on where we should focus",
    opts: ["Leader formation", "Next generation", "Second campus and facility", "Reaching new people", "Systems and data"],
    typical: [[35, 25, 15, 15, 10], [30, 25, 10, 25, 10], [25, 15, 30, 15, 15], [40, 20, 15, 15, 10], [25, 20, 20, 25, 10], [30, 10, 15, 30, 15], [30, 20, 15, 20, 15]],
    partial: [20, 15, 10, 0, 20],
    long: ["Leader formation", "Next generation, from nursery to young adults, as one connected ministry", "Second campus and facility", "Reaching new people", "Systems and data"]
  };

  D.grid = {
    eyebrow: "Ideas", headline: "Place each idea by <strong>effort and impact</strong>", prompt: "Place each idea by effort and impact",
    items: [
      { id: "g1", num: 1, label: "Online newcomer path", places: [[0.25, 0.8], [0.3, 0.7], [0.2, 0.85], [0.35, 0.75]] },
      { id: "g2", num: 2, label: "Second Sunday service", places: [[0.6, 0.55], [0.7, 0.4], [0.55, 0.5]] },
      { id: "g3", num: 3, label: "Leader residency", places: [[0.75, 0.85], [0.8, 0.9], [0.7, 0.8], [0.85, 0.82], [0.78, 0.88]] },
      { id: "g4", num: 4, label: "Café renovation", places: [[0.65, 0.25], [0.7, 0.2]] },
      { id: "g5", num: 5, label: "Data dashboard", places: [[0.32, 0.72], [0.28, 0.65]] },
      { id: "g6", num: 6, label: "Prayer room", places: [[0.2, 0.45]] }
    ],
    dupe: { id: "g7", num: 7, label: "Newcomer path online", places: [[0.3, 0.78]], into: "g1" },
    longLabel: "A twelve-month leader residency for emerging staff and volunteers"
  };

  D.form = {
    eyebrow: "Before we start", headline: "A few questions <strong>just for the facilitators</strong>", prompt: "A few questions just for the facilitators",
    qs: ["What would make this retreat a win for you?", "Is there anything you'd find hard to say in the room?", "How are you doing, honestly?"]
  };

  D.sign = {
    eyebrow: "Sign together", title: "Our shared commitment", headline: "Our <strong>shared commitment</strong>",
    sections: [["We will pray", "We will pray for this plan and for each other every week this season, by name."], ["We will speak with one voice", "We'll talk about the plan the same way in every room, and bring disagreement to this team first."], ["We will start small and finish", "Each of us owns one first step and will finish it in the next 30 days."]],
    sigs: ["M10 70 C 40 20, 60 20, 70 60 S 110 90, 130 40 S 170 30, 190 60 L 230 50", "M10 60 Q 40 10 70 60 T 130 60 T 190 50 Q 220 40 260 70", "M20 80 C 30 30 60 30 70 70 C 80 40 120 30 140 60 S 200 70 250 40", "M15 50 L 45 70 L 75 30 L 105 70 L 135 40 C 170 30 200 80 240 60", "M10 70 C 30 40 50 40 60 60 C 70 80 100 20 130 50 C 150 70 190 40 230 55", "M20 40 Q 60 90 100 40 T 180 50 Q 210 60 250 45", "M10 60 C 60 0 80 100 120 50 S 200 30 240 60", "M15 65 C 35 25 75 25 95 65 L 140 35 C 170 25 210 70 245 50"]
  };

  D.content = {
    depth: { n: "45%", headline: "named <strong>quality preaching</strong> as a strength", src: "Congregational survey · 87 answers" },
    passage: "Yahweh answered me, “Write the vision, and make it plain on tablets, <strong>that he who runs may read it.</strong>”",
    passagePlain: "Yahweh answered me, “Write the vision, and make it plain on tablets, that he who runs may read it.”",
    ref: "Habakkuk 2:2", translation: "World English Bible"
  };
  window.ClearwayLivePass3Data = D;
})();
