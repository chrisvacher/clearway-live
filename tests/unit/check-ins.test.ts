import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { checkInEmail } from "../../lib/email/check-in";
import { followUps, groupRecipients, resultsCsv, roundCounts, shortDate, today, tokenShape, type Owned, type ResultRound } from "../../lib/check-ins/policy";

const owned = (kind: "step" | "goal", id: string, label: string, email: string, name: string | null = null, ord = 0, attendee: string | null = null): Owned => ({ kind, id, label, date: "2026-11-27", email, name, attendee, ord });

test("recipients: one person for each owner email, with only their own steps and goals", () => {
  const people = groupRecipients([
    owned("step", "s1", "List every ministry lead", "priya@riverside.example", "Priya Shah", 0, "a1"),
    owned("goal", "g1", "Launch the apprentice pathway", "Priya@Riverside.example", "Priya Shah", 0, "a1"),
    owned("goal", "g2", "Develop a leader in every 1:1", "daniel@riverside.example", "Daniel Brooks", 1, "a2"),
    owned("step", "s2", "Ask three people for a baptism story", "marcus@riverside.example", "Marcus Webb", 1),
    owned("step", "s3", "Draft the role description", "marcus@riverside.example", "Marcus Webb", 2),
  ]);
  assert.deepEqual(people.map(p => p.email), ["daniel@riverside.example", "marcus@riverside.example", "priya@riverside.example"]);
  const priya = people.find(p => p.email.startsWith("priya"))!;
  assert.deepEqual([priya.steps, priya.goals, priya.attendee], [["s1"], ["g1"], "a1"], "email case does not make a second person");
  assert.deepEqual([people[0].steps, people[0].goals], [[], ["g2"]], "a goal owner who owns no first step still gets an email");
  assert.deepEqual([people[1].steps, people[1].goals, people[1].attendee], [["s2", "s3"], [], null], "a name-and-email owner has no attendee");
  assert.equal(people.flatMap(p => [...p.steps, ...p.goals]).length, 5, "every item goes to exactly one person");
});

test("recipients: nobody without an email, and no one when nothing is owned", () => {
  assert.deepEqual(groupRecipients([]), []);
  assert.deepEqual(groupRecipients([owned("step", "s1", "A step", "  ")]), []);
  assert.equal(groupRecipients([owned("goal", "g1", "A goal", "x@y.example", null)])[0].name, "x@y.example", "a missing name falls back to the address");
});

test("the 30 and 60-day email lists only the person's own items with one link and no dashes", () => {
  const link = "https://live.clearway.co/c/abcDEF1234567890abcdef";
  const message = checkInEmail({ church: "Riverside Church", first: "Priya", day: 30, link, steps: [{ text: "List every ministry lead", due: "2026-11-27" }], goals: [{ title: "Launch the apprentice pathway", end: "2027-04-30" }], nextOn: "2027-01-06" });
  assert.equal(message.subject, "Your 30-day check-in for Riverside Church");
  for (const part of [message.text, message.html]) {
    assert.doesNotMatch(part, /[–—]/, "no em or en dashes");
    assert.match(part, /Hi Priya,/);
    assert.match(part, /List every ministry lead/);
    assert.match(part, /Launch the apprentice pathway/);
    assert.match(part, /The next check-in comes by email on Jan 6\./);
    assert.doesNotMatch(part, /check-ins end here|last check-in/i);
  }
  assert.equal(message.text.split(link).length, 2, "the link is in the text once");
  assert.match(message.text, /\(due Nov 27\)/);
  assert.doesNotMatch(message.html, /<script|<img|<form|onclick=|var\(--|CORE/i);
});

test("the 90-day email thanks them and says the check-ins end here", () => {
  const message = checkInEmail({ church: "Riverside Church", first: "Priya", day: 90, link: "http://localhost:3000/c/abcDEF1234567890abcdef", steps: [], goals: [{ title: "A goal" }], nextOn: null });
  for (const part of [message.text, message.html]) {
    assert.match(part, /Thank you for the work you have put in\. This is the last check-in, so the check-ins end here\./);
    assert.match(part, /for the last time/);
    assert.doesNotMatch(part, /next check-in comes/i);
    assert.doesNotMatch(part, /[–—]/);
  }
  assert.doesNotMatch(message.text, /Your first steps/, "a goal owner with no first step sees no first steps heading");
});

test("the email escapes what people typed and refuses a link that is not https or localhost", () => {
  const message = checkInEmail({ church: "A & B <Church>", first: '<b>"Pri"</b>', day: 60, link: "https://live.clearway.co/c/abcDEF1234567890abcdef?a=1&b=2", steps: [{ text: "<script>alert(1)</script>" }], goals: [] });
  assert.doesNotMatch(message.html, /<script>alert|<b>"Pri"/);
  assert.match(message.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(message.html, /a=1&amp;b=2/);
  assert.throws(() => checkInEmail({ church: "C", first: "P", day: 30, link: "javascript:alert(1)", steps: [], goals: [] }));
  assert.throws(() => checkInEmail({ church: "C", first: "P", day: 30, link: "http://evil.example/c/x", steps: [], goals: [] }));
});

test("the clock follows CLEARWAY_NOW only outside production", () => {
  const now = new Date("2026-12-07T13:07:00Z");
  assert.equal(today({}, now), "2026-12-07");
  assert.equal(today({ CLEARWAY_NOW: "2027-01-06" }, now), "2027-01-06");
  assert.equal(today({ CLEARWAY_NOW: "2027-01-06T09:00:00Z", VERCEL_ENV: "preview" }, now), "2027-01-06");
  assert.equal(today({ CLEARWAY_NOW: "2027-01-06", VERCEL_ENV: "production" }, now), "2026-12-07", "production ignores it");
  assert.equal(today({ CLEARWAY_NOW: "not a date" }, now), "2026-12-07");
});

test("links are shaped like tokens, dates read short, and the middleware leaves /c and /api/check-in public", () => {
  assert.ok(tokenShape("a".repeat(64)) && !tokenShape("short") && !tokenShape("a b".repeat(10)) && !tokenShape(undefined));
  assert.equal(shortDate("2026-11-27"), "Nov 27");
  const matcher = readFileSync("middleware.ts", "utf8").match(/matcher: \[([^\]]*)\]/)![1];
  assert.doesNotMatch(matcher, /"\/c[/":]|\/api\/check-in|\/api\/cron/, "no matcher entry covers the phone page, its save or the cron");
});

const round = (day: 30 | 60 | 90): ResultRound => ({ id: "r" + day, day, due_on: "2027-01-06", status: "sent", superseded: false, sent_at: null, sent_by: "schedule", recipients: [
  { id: "p1", name: "Priya Shah", email: "p@x.example", send_result: "sent", sent_at: null, opened_at: null, answered_at: "2027-01-07", help: null, practice: false,
    steps: [{ id: "s1", text: "Step one", due: null, answer: "stuck", note: "Need a sign off, \"soon\"", answer_id: "a1", followed_up_at: null, answered_at: null }],
    goals: [{ id: "g1", title: "Goal one", end: null, answer: "off_track", note: null, answer_id: "a2", followed_up_at: "2027-01-08", answered_at: null }] },
  { id: "p2", name: "Daniel Brooks", email: "d@x.example", send_result: "practice_address", sent_at: null, opened_at: null, answered_at: null, help: null, practice: true,
    steps: [{ id: "s2", text: "=SUM(A1)", due: null, answer: null, note: null, answer_id: null, followed_up_at: null, answered_at: null }], goals: [] }] });

test("follow-ups are stuck steps and goals at risk or off track, and counts say who answered", () => {
  const list = followUps(round(30));
  assert.deepEqual(list.map(f => [f.kind, f.who, f.answer, f.done]), [["step", "Priya Shah", "stuck", false], ["goal", "Priya Shah", "off_track", true]]);
  assert.deepEqual(roundCounts(round(30)), { people: 2, sent: 1, practice: 1, failed: 0, answered: 1, opened: 0 });
});

test("the CSV quotes notes and keeps a formula from running", () => {
  const csv = resultsCsv([round(30)]);
  assert.match(csv, /"Need a sign off, ""soon"""/);
  assert.match(csv, /'=SUM\(A1\)/);
  assert.match(csv, /No answer/);
  assert.equal(csv.split("\r\n").length, 5);
});

test("the email says the round's day after the retreat, with no day count and no Wayfinding, and the same input makes the same email", () => {
  const input = { church: "Riverside Church", first: "Priya", day: 60 as const, link: "https://live.clearway.co/c/abcDEF1234567890abcdef", steps: [{ text: "A step", due: "2026-11-27" }], goals: [{ title: "A goal", end: null }], nextOn: "2027-03-06" };
  const a = checkInEmail(input), b = checkInEmail({ ...input });
  assert.match(a.text, /This is your 60-day check-in after the retreat\./);
  for (const part of [a.text, a.html]) assert.doesNotMatch(part, /days since|Wayfinding|It has been/);
  assert.deepEqual(a, b, "a resumed send builds the identical subject, text and html");
  assert.notEqual(checkInEmail({ ...input, nextOn: "2027-03-07" }).text, a.text, "the next date is in the body, so it must come from the round's snapshot");
});
