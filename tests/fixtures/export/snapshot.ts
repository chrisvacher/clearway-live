// A sign-off snapshot as report_signed_for_view returns it (sources stripped, cells resolved to text), for the export tests. Riverside Church, fictional.
// It holds what the cleaner must handle: em and en dashes and semicolons in written words, an em dash inside the room's quote, a thin data label, the
// facilitator's own words, and a source marker lookalike that must never appear.
type S = { id: string; position: number; text: string; origin: string; quote: boolean; thin_label: string | null };
const sid = (n: number) => `5e000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let n = 0;
const sent = (text: string, o: Partial<S> = {}): S => ({ id: sid(++n), position: n, text, origin: "ai", quote: false, thin_label: null, ...o });
const prose = (key: string, position: number, heading: string, sentences: S[]) => ({ key, position, heading, kind: "prose", blocks: null, sentences });

const lens = ["Congregation", "Community", "Leadership", "Operations", "Learning"].map((title, i) => {
  const lines = [sent(`Riverside is a church where ${title.toLowerCase()} shows up in how people live Monday to Saturday.`, { origin: "record" }), sent(`People say so, and mean it${i === 1 ? " — even the newest neighbours" : ""}.`, { origin: "record" })];
  return { title, lines };
});
const futureSentences = lens.flatMap(l => l.lines);
const future = { key: "future", position: 7, heading: "The 10-year Future", kind: "record",
  blocks: { kind: "future", columns: [], rows: lens.map((l, i) => ({ title: l.title, lens: i + 1, empty: false, cells: [], parts: l.lines.map(x => ({ role: "line", sentence_id: x.id })) })) },
  sentences: [sent("This is the Future the room signed off on Day 1; it is written as if it is already true.", { origin: "ai" }), ...futureSentences, sent("Chris's own read: the Operations lens is the one to watch.", { origin: "facilitator" })] };

const o1 = sent("Small groups are where people feel known.", { origin: "record" }), o1i = sent("Three in four regular attenders belong to a group.", { origin: "record" }), o1s = sent("We will stop starting groups without a trained host.", { origin: "record" });
const o2 = sent("Every family has a way to serve.", { origin: "record" }), o2i = sent("Serving teams have a named lead.", { origin: "record" });
const m1 = sent("Group attendance", { origin: "record" }), m2 = sent("Volunteer retention", { origin: "record" });
const vision = { key: "vision", position: 8, heading: "The 3-year Vision", kind: "record",
  blocks: { kind: "vision", columns: [], rows: [
    { title: "Known in small groups", cells: [], parts: [{ role: "description", sentence_id: o1.id }, { role: "indicator", sentence_id: o1i.id }, { role: "stop", sentence_id: o1s.id }] },
    { title: "Everyone serves", cells: [], parts: [{ role: "description", sentence_id: o2.id }, { role: "indicator", sentence_id: o2i.id }] },
    { title: "What the team will measure", group: "metrics", cells: [], parts: [{ role: "metric", sentence_id: m1.id }, { role: "metric", sentence_id: m2.id }] }] },
  sentences: [sent("The 3-year Vision names two outcomes the team will hold itself to.", { origin: "ai" }), o1, o1i, o1s, o2, o2i, m1, m2] };

const r1 = sent("Volunteers burn out before the fall launch", { origin: "record" }), r1m = sent("Share the load across two leads", { origin: "record" }), r1n = sent("Rest the team for one week in August", { origin: "record" });
const r2 = sent("The building project pulls attention from groups", { origin: "record" });
const risks = { key: "risks", position: 9, heading: "Risks and Roadblocks", kind: "record",
  blocks: { kind: "risks", columns: ["Risk", "Likelihood", "Impact", "What we will do"], rows: [
    { title: "", cells: [r1.text, "High", "Medium", `${r1m.text}\n${r1n.text}`], parts: [{ role: "risk", sentence_id: r1.id }, { role: "mitigation", sentence_id: r1m.id }, { role: "mitigation", sentence_id: r1n.id }] },
    { title: "", cells: [r2.text, "Medium", "High", ""], parts: [{ role: "risk", sentence_id: r2.id }] }] },
  sentences: [sent("Two risks matter most; the first is already visible.", { origin: "ai" }), r1, r1m, r1n, r2] };

const g1 = sent("Launch twelve new groups: each with a trained host", { origin: "record" }), g2 = sent("Name a lead for every serving team", { origin: "record" });
const outlook = { key: "outlook", position: 10, heading: "The 1-year Outlook", kind: "record",
  blocks: { kind: "outlook", columns: ["Vision Outcome", "Goal", "Owner", "Ends", "Season"], rows: [
    { title: "", cells: ["Known in small groups", g1.text, "Dana Reyes", "Sep 30, 2027", "Fall"], parts: [{ role: "goal", sentence_id: g1.id, owner: "Dana Reyes", due: "Sep 30, 2027" }] },
    { title: "", cells: ["Everyone serves", g2.text, "Sam Ortiz", "Jun 15, 2027", "Spring"], parts: [{ role: "goal", sentence_id: g2.id, owner: "Sam Ortiz", due: "Jun 15, 2027" }] }] },
  sentences: [sent("Two 1-year goals carry the work from here.", { origin: "ai" }), g1, g2] };

const i1 = sent("Make groups the front door.", { origin: "record" }), i1m = sent("Train hosts before the fall.", { origin: "record" }), i1s = sent("Stop adding new programs.", { origin: "record" }), i1f = sent("Book the host training weekend", { origin: "record" });
const intent = { key: "intent", position: 11, heading: "Commander's Intent", kind: "record",
  blocks: { kind: "intent", columns: [], rows: [{ title: "Known in small groups", cells: [], parts: [{ role: "intent", sentence_id: i1.id }, { role: "must_do", sentence_id: i1m.id }, { role: "stop", sentence_id: i1s.id }, { role: "step", sentence_id: i1f.id, owner: "Dana Reyes", due: "Feb 14, 2027" }] }] },
  sentences: [i1, i1m, i1s, i1f] };

const d1 = sent("Groups come before new programs: the room agreed", { origin: "record" });
const decisions = { key: "decisions", position: 12, heading: "Decisions", kind: "record",
  blocks: { kind: "decisions", columns: ["Decision", "Why"], rows: [{ title: "", cells: [d1.text, "People said they feel known in groups."], parts: [{ role: "decision", sentence_id: d1.id }] }] }, sentences: [d1] };

const v1 = sent("We are trusting groups to carry the church.", { origin: "record" }), a1 = sent("Ask Dana to call the elders", { origin: "record" });
const visibility = { key: "visibility", position: 13, heading: "Make the Vision Visible", kind: "record",
  blocks: { kind: "visibility", columns: ["Who", "When", "Who tells them", "What they hear", "The risk it answers"], rows: [
    { title: "", cells: ["Elders", "Within a week", "Dana", v1.text, "Elders feel surprised"], parts: [{ role: "plan", sentence_id: v1.id }] },
    { title: "", group: "actions", cells: ["", "", "", a1.text, ""], parts: [{ role: "action", sentence_id: a1.id }] }] },
  sentences: [sent("The plan starts with the people closest to the work.", { origin: "ai" }), v1, a1] };

export const fixtureSections = () => build();
function build() {
  const quote1 = "I came for two months before anyone told me groups existed — that is the whole story";
  return [
    prose("overview", 1, "Overview", [sent("Riverside Church met for two days to name its future; the room was honest and hopeful."), sent("Groups came up more than anything else – again and again."), sent("The team leaves with a clear 1-year Outlook.")]),
    prose("church_today", 2, "The Church Today", [sent("Riverside has a clear mission and a growing set of neighbours."), sent("Chris adds: this is a church that listens.", { origin: "facilitator" })]),
    prose("process", 3, "The Process", [sent("Eight people took part over two days.")]),
    prose("heard", 4, "What We Heard", [sent("45% of the 87 people who answered named small groups as the place they feel most connected.", { thin_label: "Thin data: 6 of 87 respondents are under 30" }),
      sent(`“${quote1}”`, { origin: "room", quote: true }), sent("That line came from one person; it shows what many said.")]),
    prose("interviews", 5, "Leadership Interviews", [sent("Leaders described a church that is ready for its next step.")]),
    prose("tensions", 6, "Strategic Tensions", [sent("Growth and depth pull in different directions.")]),
    future, vision, risks, outlook, intent, decisions, visibility,
    prose("closing", 14, "Closing", [sent("We are grateful for the room's honesty and look forward to the next ninety days.")]),
  ];
}
export const fixtureQuote = "I came for two months before anyone told me groups existed";
