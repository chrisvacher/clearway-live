/* Clearway Live · design pass 7 · seed data: Riverside Church (fictional), base year 2026.
   Milestone 7: Publish to CORE, the report, the visibility plan, check-ins and the read-only copy.
   Every count on a screen is computed from this file. */
(function () {
  "use strict";
  var W = window.ClearwayLivePass4Data;
  var D = {};
  D.church = "Riverside Church";
  D.base = 2026;
  D.Y = W.Y;
  D.lead = "Chris";
  D.coFac = "Jaisy";

  /* Key dates (all in the fictional 2026 to 2027 engagement) */
  D.dates = { retreat: "Nov 12 and 13", publish: "Nov 13, 3:14 pm", signOff: "Nov 24", followUpBy: "Nov 27", visionSunday: "Jan 31, 2027", d30: "Dec 13", d60: "Jan 12", d90: "Feb 11" };

  /* ---------- CORE: what the app would write ---------- */
  D.coreOrg = { name: "Riverside Church", id: "org_riverside", plan: "Client", seats: "Unlimited", linkedBy: "Jaisy", linkedOn: "Oct 21" };
  D.plans = {
    client: { plan: "Client", seatsText: "Unlimited seats", free: 99 },
    small: { plan: "Small team", seatsText: "3 seats, 2 in use", free: 1 }
  };

  /* Vision Outcomes: confirmed names from Day 2. Indicators are the 3-year Vision bullets. */
  D.outcomes = [
    { id: "o1", name: "Leaders raised from within", desc: "We raise our next leaders ourselves, in every ministry.", ind: ["12 apprentice leaders serve alongside a ministry lead", "The leader residency has placed its first 2 residents", "Every staff member has a CORE goal for developing a leader"] },
    { id: "o2", name: "New faith stories", desc: "People meet Jesus here and tell the story of it.", ind: ["40 people baptized over three years", "Alpha runs three seasons a year, full each time", "Every new believer has someone discipling them"] },
    { id: "o3", name: "A church that shows up", desc: "Our neighbours know Riverside by what it does for them.", ind: ["The food bank partnership is open three days a week", "Two north end schools are formal partners"] },
    { id: "o4", name: "Families belong here", desc: "Families find friends, care and a next step here.", ind: ["Every family with children under 12 has a named next step within two weeks"] },
    { id: "o5", name: "Homes and every generation", desc: "Faith grows in homes where every generation shares life.", ind: ["60% of adults are in a group that meets in a home", "Every group has members from at least two generations"] }
  ];
  D.seasonOf = { "Dec 31, 2026": "SEP_DEC", "Apr 30, 2027": "JAN_APR", "Aug 31, 2027": "MAY_AUG" };
  D.seasonLabel = { SEP_DEC: "Sep to Dec", JAN_APR: "Jan to Apr", MAY_AUG: "May to Aug" };
  D.people = {
    "Mark Ellison": { email: "mark@riverside.church", core: "match", role: "Owner" },
    "Priya Shah": { email: "priya@riverside.church", core: "match", role: "Admin" },
    "Daniel Okafor": { email: "daniel@riverside.church", core: "match", role: "Member" },
    "Ruth Morrison": { email: "ruth@riverside.church", core: "match", role: "Member" },
    "Ben Carter": { email: "ben@riverside.church", core: "match", role: "Member" },
    "Tasha Brown": { email: "tasha@riverside.church", core: "invite" },
    "Grace Lindqvist": { email: "grace@riverside.church", core: "invite" },
    "Sam Whitford": { email: "sam@riverside.church", core: "invite" },
    "Leah Kim": { email: "leah@riverside.church", core: "invite", outside: true }
  };
  D.goals = [
    { id: "g1", o: "o1", title: "Launch the apprentice pathway", result: "8 apprentices placed in ministries", owner: "Priya Shah", end: "Apr 30, 2027", risk: 2 },
    { id: "g2", o: "o1", title: "Design the leader residency", result: "A twelve-month residency plan approved by the elders", owner: "Daniel Okafor", end: "Aug 31, 2027", risk: 1 },
    { id: "g3", o: "o1", title: "Develop a leader in every 1:1", result: "Every staff 1:1 sets a leader development goal", owner: "Daniel Okafor", end: "Dec 31, 2026", risk: 2 },
    { id: "g4", o: "o2", title: "Keep Alpha full every season", result: "Alpha runs in winter and spring with 40 or more guests each", owner: "Ruth Morrison", end: "Apr 30, 2027", risk: 1 },
    { id: "g5", o: "o2", title: "Name a discipler for every new believer", result: "Every new believer has a named discipler", owner: "Mark Ellison", end: "Aug 31, 2027", risk: 6 },
    { id: "g6", o: "o3", title: "Open the food bank a third day", result: "The food bank is open three days a week", owner: "Ben Carter", end: "Apr 30, 2027", risk: 2 },
    { id: "g7", o: "o3", title: "Partner formally with two north end schools", result: "Two signed partnership agreements", owner: "Tasha Brown", end: "Aug 31, 2027", risk: 3 },
    { id: "g8", o: "o4", title: "Build a family welcome path", result: "Every new family is invited to a next step within two weeks", owner: "Grace Lindqvist", end: "Dec 31, 2026", risk: 1 },
    { id: "g9", o: "o5", title: "Train six new group hosts", result: "Six hosts trained and leading a group", owner: "Leah Kim", end: "Apr 30, 2027", risk: 1 },
    { id: "g10", o: "o5", title: "Open twelve new groups", result: "Twelve new groups meeting in homes", owner: "Sam Whitford", end: "Aug 31, 2027", risk: 1 }
  ];
  /* First steps (the commander's intent card's Next 30 days). Each becomes a CORE task linked to a goal. */
  D.steps = [
    { id: "s1", o: "o1", g: "g1", text: "List every ministry lead and a possible apprentice", owner: "Priya Shah", date: "Nov 27" },
    { id: "s2", o: "o1", g: "g1", text: "Draft the apprentice role description", owner: "Sam Whitford", date: "Dec 4" },
    { id: "s3", o: "o2", g: "g4", text: "Book the winter Alpha dates", owner: "Ruth Morrison", date: "Nov 20" },
    { id: "s4", o: "o2", g: "g5", text: "Ask three people to share a baptism story", owner: "Mark Ellison", date: "Dec 1" },
    { id: "s5", o: "o3", g: "g6", text: "Meet the food bank board", owner: "Ben Carter", date: "Dec 4" },
    { id: "s6", o: "o4", g: "g8", text: "Ask three families to describe their first Sunday", owner: "Tasha Brown", date: "Dec 4" },
    { id: "s7", o: "o5", g: "g9", text: "Invite twelve possible hosts to an evening", owner: "Grace Lindqvist", date: "Dec 1" }
  ];
  /* What the readiness check finds in the "gaps" state, by id */
  D.gaps = {
    outcomes: { o4: ["Needs at least one indicator"] },
    goals: { g2: ["Needs a clear result"], g3: ["Needs an end date"], g7: ["Needs one named owner, not a team"] },
    steps: { s4: ["Needs an owner"], s5: ["Needs an end date"] }
  };
  /* Where a gap shows the broken value */
  D.gapValues = { g2: { result: "" }, g3: { end: "" }, g7: { owner: "The elders" }, s4: { owner: "" }, s5: { date: "" }, o4: { ind: [] } };

  /* What is already in CORE (the overlap). Shown first, before the readiness check. */
  D.overlap = [
    { id: "x1", kind: "Vision Outcome", mine: "Leaders raised from within", theirs: "Leaders raised from within", detail: "Added in CORE on Sep 8 by Mark. 3 indicators, On track, 2 goals under it.", match: "Same title", pick: "link", options: ["link", "add", "skip"] },
    { id: "x2", kind: "Goal", mine: "Open the food bank a third day", theirs: "Open the food bank on Wednesdays", detail: "Owned by Ben Carter, ends Apr 30, 2027, under A church that shows up. Not started.", match: "Close in meaning", pick: null, options: ["link", "add", "skip"] }
  ];
  D.overlapWords = { link: "Link to it", add: "Add as new", skip: "Skip" };
  D.overlapHelp = { link: "New records attach to the one in CORE. Nothing in it changes.", add: "A second record is created. Both stay in CORE.", skip: "Nothing is created for it. You can publish it later." };

  /* The other church: Sam's email belongs to a CORE user at another church */
  D.otherChurch = { name: "Sam Whitford", email: "sam@riverside.church", church: "Lakeshore Fellowship" };

  /* A second publish (corrections after the retreat) */
  D.second = {
    when: "Nov 24, 10:42 am",
    already: { outcomes: 5, goals: 10, tasks: 7, invitations: 4 },
    fresh: { outcomes: 0, goals: 1, tasks: 1, invitations: 0 },
    newGoal: { title: "Tell the Riverside story on Vision Sunday", owner: "Mark Ellison", end: "Jan 31, 2027" },
    newStep: { text: "Book the Vision Sunday service plan", owner: "Mark Ellison", date: "Dec 8" },
    changed: [{ what: "Design the leader residency", field: "End date", mine: "Sep 30, 2027", core: "Aug 31, 2027" }]
  };

  /* ---------- The report (AFT-01), Clearway's order ---------- */
  D.reportOrder = [
    ["overview", "Overview"], ["participants", "Retreat Participants"], ["celebrations", "Celebrations"], ["today", "The Church Today"], ["process", "The Process"],
    ["heard", "What We Heard"], ["interviews", "Leadership Interviews"], ["metrics", "Key Metrics"], ["tensions", "Strategic Tensions"],
    ["future", "10-year Future"], ["vision", "3-year Vision"], ["risks", "Risks and Roadblocks"], ["outlook", "1-year Outlook"],
    ["intent", "Commander's Intent"], ["decisions", "Decisions"], ["visibility", "Visibility plan"], ["closing", "Closing"]
  ];
  /* Sources the paragraphs cite: k is the kind, label what it is */
  D.src = {
    sv: { k: "survey", label: "Survey · 87 responses", icon: "clipboard-list" },
    iv: { k: "interviews", label: "Leadership interviews · 5", icon: "mic" },
    fl: { k: "lists", label: "Four Helpful Lists · 7 elders", icon: "columns-4" },
    sc: { k: "scribe", label: "Scribe cards", icon: "pen-line" },
    ph: { k: "phones", label: "Phones, anonymous", icon: "smartphone" },
    ls: { k: "lens", label: "Lens summary, signed off Day 1", icon: "badge-check" },
    pm: { k: "premortem", label: "Pre-mortem", icon: "triangle-alert" },
    ic: { k: "intent", label: "Intent cards", icon: "target" },
    ro: { k: "roster", label: "Attendee list", icon: "users" }
  };
  /* Each section: status (drafted, edited, needs, thin, signed), a short summary, paragraphs of {t, s: [source ids], q: verbatim quote, own: Chris's own} */
  D.report = {
    overview: { status: "drafted", paras: [{ t: "Riverside Church asked for a plan its team could own. Over two days in November, eight leaders and a scribe built one together: a 10-year Future described in the present tense, five Vision Outcomes for the next three years and ten goals for the year ahead.", s: ["ro", "sc"] }] },
    participants: { status: "drafted", paras: [{ t: "Eight leaders took part: Mark Ellison, Priya Shah, Daniel Okafor, Grace Lindqvist, Tasha Brown, Sam Whitford, Ruth Morrison and Ben Carter. Jaisy Tam-Harbridge co-facilitated and a scribe captured what the easel couldn't hold.", s: ["ro"] }] },
    celebrations: { status: "drafted", paras: [{ t: "The team opened by naming what God has done here. Baptisms, a full Alpha every season and a food bank that now serves five days a week came up most.", s: ["ph", "sc"] }] },
    today: { status: "drafted", paras: [{ t: "Riverside is a church of people who are known by name, and groups in homes are where that happens. Most of the people who answered the survey rate their sense of belonging at 4 or 5.", s: ["sv"] }] },
    process: { status: "drafted", paras: [{ t: "The team worked in three steps: Discover, a 90-minute pre-call and a two-day retreat. Every decision was made by consensus, and the facilitator marked each one in the room.", s: ["sc"] }] },
    heard: {
      status: "thin", paras: [
        { t: "Small groups came up more than anything else. 45% of the 87 people who answered named small groups as the place they feel most connected.", s: ["sv"] },
        { t: "Newcomers find the first step hard. Several answers asked for a clearer way into groups.", s: ["sv", "fl"], q: "I came for two months before anyone told me groups existed." },
        { t: "Young adults are hard to hear from. Only 6 of the 87 respondents were under 30, so this report doesn't draw conclusions about them.", s: ["sv"], thin: "Thin data: 6 of 87 respondents are under 30" }
      ]
    },
    interviews: { status: "drafted", paras: [{ t: "Three of four staff interviews named unclear ownership as the biggest frustration. The two elders interviewed asked for fewer priorities and clearer end dates.", s: ["iv"] }] },
    metrics: { status: "drafted", paras: [{ t: "The team ranked the measurables that matter most: people baptized, apprentice leaders placed and the share of adults in a home group.", s: ["ph", "sc"] }] },
    tensions: { status: "drafted", paras: [{ t: "The room named one real tension. More services would give newcomers a way in, and more groups would help newcomers be known. The team chose groups, and kept services as a question for the next season.", s: ["sc"] }] },
    future: {
      status: "signed", paras: [
        { t: "Neighbours call us first when someone on the street needs help. The food bank runs out of our building five days a week and two north end schools count us as partners.", s: ["ls"], lens: "community" },
        { t: "Every ministry has an apprentice leader ready to step in. Elders spend their time on direction, not operations, and a residency raises two new leaders every year.", s: ["ls"], lens: "leadership" }
      ]
    },
    vision: { status: "drafted", paras: [{ t: "Five Vision Outcomes shape the next three years: Leaders raised from within, New faith stories, A church that shows up, Families belong here, and Homes and every generation. Each has indicators the team can count.", s: ["sc"] }] },
    risks: {
      status: "needs", paras: [
        { t: "The team imagined 2029 and asked why the plan failed. The most likely and most costly reason was that they tried all five outcomes at once. The next was staff burning out by spring.", s: ["pm"] },
        { t: "Each risk has a mitigation the room named. Launch outcomes a season apart. Give every goal one owner and a real end date.", s: ["pm", "sc"] }
      ]
    },
    outlook: { status: "drafted", paras: [{ t: "Ten goals, each with one owner and an end date, carry the plan through the next three Seasons. Every goal meets CORE: it is connected to an outcome, owned by one person, has a clear result and a date.", s: ["ic"] }] },
    intent: { status: "drafted", paras: [{ t: "Each outcome has a commander's intent, the one thing the team can't fail to do, what they will stop and the first steps for the next 30 days. For Leaders raised from within: every ministry is growing its own next leader.", s: ["ic"] }] },
    decisions: { status: "drafted", paras: [{ t: "The room decided that Families belong here is an outcome about belonging, with families as the first focus. It kept Homes and every generation separate from it.", s: ["sc"] }] },
    visibility: { status: "drafted", paras: [{ t: "The plan reaches the church from the inside out. The lead pastor and the retreat participants know first, then the elders, the team, key leaders and major donors, and the congregation on Vision Sunday.", s: ["sc"] }] },
    closing: { status: "drafted", paras: [{ t: "Riverside leaves with a plan the team wrote in its own words. The next step is the first 30 days.", s: ["ic"] }] }
  };
  D.report.own = { risks: "Chris's read: the team named the risks with a lot of honesty. The one to watch is the elders' ownership of the plan, because the room stopped short of naming who tells them." };
  D.reportLong = "Every Sunday the room holds people who found Riverside through a friend, a neighbour, a school pickup line or the food bank, and within a month every one of them can name someone who prays for them and someone they could call at midnight.";

  /* ---------- The visibility plan (AFT-02) ---------- */
  D.vplanRows = [
    { id: "v1", who: "Mark, the lead pastor", when: "Nov 13", by: "Chris, in the room", hear: "The whole plan, and what you will be asked to say first.", risk: "The lead pastor hears something new from the stage.", src: ["sc"], reviewed: true },
    { id: "v2", who: "The retreat participants", when: "Nov 13", by: "Mark", hear: "The Clearway Map and their own goals. Please hold it until the elders have met.", risk: "Someone repeats the plan before the elders have seen it.", src: ["sc", "ic"], reviewed: true },
    { id: "v3", who: "The elders", when: "Dec 6", by: "Mark and Priya", hear: "The Vision Outcomes, the 10 goals, and where they own a decision.", risk: "The elders never owned the plan.", src: ["pm", "sc"], reviewed: false },
    { id: "v4", who: "The team", when: "Dec 13", by: "Mark", hear: "Their own goals and first steps, and what we are stopping.", risk: "Staff burned out by spring.", src: ["pm", "ic"], reviewed: false },
    { id: "v5", who: "Key leaders and major donors", when: "Jan 10 to 24", by: "Mark and Ruth, one conversation each", hear: "Why the plan is what it is, and what it asks of them.", risk: "Anyone hears the plan from the stage first.", src: ["sc"], reviewed: false },
    { id: "v6", who: "The congregation", when: "Vision Sunday, Jan 31", by: "Mark, with Grace telling a story", hear: "The 10-year Future in one sentence, the five outcomes and the first thing everyone can do.", risk: "The congregation never hears the plan in a way they can repeat.", src: ["pm", "sc"], reviewed: false }
  ];
  D.vplanLong = "Every person who has given more than twice in the last three years, in the order the elders suggest, one conversation each, before the stage";

  /* ---------- Check-ins (AFT-04, AFT-05) ---------- */
  D.checkins = {
    d30: { day: 30, due: "Dec 13", sent: true, answered: 7, of: 8 },
    d60: { day: 60, due: "Jan 12", sent: false },
    d90: { day: 90, due: "Feb 11", sent: false }
  };
  /* One person: Priya, who owns goal g1 and two steps */
  D.person = { name: "Priya", full: "Priya Shah", steps: [{ id: "s1", text: "List every ministry lead and a possible apprentice", date: "Nov 27" }], goals: [{ id: "g1", title: "Launch the apprentice pathway", end: "Apr 30, 2027", status: "on-track" }] };
  D.coreStatus = {
    "not-started": { label: "Not started", icon: "circle-dashed" },
    "on-track": { label: "On track", icon: "check" },
    "at-risk": { label: "At risk", icon: "triangle-alert" },
    "off-track": { label: "Off track", icon: "x" },
    "completed": { label: "Completed", icon: "flag" }
  };
  /* The 30-day results: each step with its answer, and each goal's CORE status */
  D.results30 = [
    { s: "s1", who: "Priya Shah", a: "done", note: "" },
    { s: "s2", who: "Sam Whitford", a: "stuck", note: "I don't know who signs off the role description." },
    { s: "s3", who: "Ruth Morrison", a: "done", note: "Dates are booked." },
    { s: "s4", who: "Mark Ellison", a: "under-way", note: "Two of three have said yes." },
    { s: "s5", who: "Ben Carter", a: "under-way", note: "" },
    { s: "s6", who: "Tasha Brown", a: "stuck", note: "I haven't found three families yet." },
    { s: "s7", who: "Grace Lindqvist", a: "done", note: "" }
  ];
  D.goalStatus30 = { g1: "on-track", g2: "not-started", g3: "at-risk", g4: "on-track", g5: "not-started", g6: "on-track", g7: "not-started", g8: "at-risk", g9: "not-started", g10: "not-started" };
  D.noAnswer = ["Leah Kim"];

  /* ---------- The read-only copy (AFT-03) ---------- */
  D.links = [
    { id: "l1", name: "Elders, December meeting", by: "Chris", made: "Nov 25", opened: "Opened 3 times, last Nov 30", state: "active" },
    { id: "l2", name: "Board chair", by: "Chris", made: "Nov 25", opened: "Not opened yet", state: "active" }
  ];
  D.readonlyUpdated = "Updated from CORE today, 4:10 pm";
  return (window.ClearwayLivePass7Data = D);
})();
