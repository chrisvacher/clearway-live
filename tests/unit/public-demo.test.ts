import assert from "node:assert/strict";
import { test } from "node:test";
import { demoFrame, demoItems, demoKinds, demoScripts, demoWordKey, demoDisplay } from "../../lib/public/demo-room";
import { roomCode, shortRoomLink, typedRoomCode } from "../../lib/tv/policy";
import { barsOf, scaleOf } from "../../lib/interactions/bars";

const placedOf = (kind: keyof typeof demoScripts, n: number) => demoScripts[kind].answers.slice(0, n).map((answer, i) => ({ id: `a${i}`, person: i % 8, answer }));

test("The join box takes the code alone, spaced, hyphenated, lowercase or as the whole link", () => {
  for (const typed of ["A7C3E91F", "a7c3e91f", " a7c3 e91f ", "A7C3-E91F", "live.clearway.co/A7C3E91F", "https://live.clearway.co/a7c3e91f", "https://live.clearway.co/r/A7C3E91F?x=1#y"])
    assert.equal(typedRoomCode(typed), "A7C3E91F", typed);
  assert.equal(typedRoomCode(""), ""); assert.equal(typedRoomCode(null), "");
  assert.ok(typedRoomCode("x".repeat(200)).length <= 24);
  assert.equal(shortRoomLink("a7c3e91f"), "https://live.clearway.co/A7C3E91F");
  assert.ok(roomCode(demoDisplay.room_code), "The demo join screen's QR code is a well-formed link");
});

test("Demo word keys follow the server: small words dropped, plurals trimmed, punctuation removed", () => {
  assert.equal(demoWordKey("Our volunteers"), "volunteer");
  assert.equal(demoWordKey("The people!"), "people");
  assert.equal(demoWordKey("Bus"), "bus");
  assert.deepEqual(demoItems("Prayer, generosity, , Worship").map(i => i.key), ["prayer", "generosity", "worship"]);
});

test("The demo word cloud sizes and levels words as the database does", () => {
  const { frame } = demoFrame(demoScripts.word_cloud, "s", placedOf("word_cloud", demoScripts.word_cloud.answers.length), 1);
  const words = frame.state.results.words, leader = words.filter(w => w.level === "leader");
  assert.equal(leader.length, 1);
  assert.equal(leader[0].key, "generosity");
  assert.equal(leader[0].size, 168, "the leader reaches headline size");
  assert.ok(words.filter(w => w.count === 1).every(w => w.size === 56 && w.level === "single"));
  assert.equal(frame.state.results.total, demoScripts.word_cloud.answers.length);
});

test("Demo bars keep one answer per person and order by count, with the leader on top", () => {
  const placed = placedOf("choice", 8);
  placed.push({ id: "you", person: 0, answer: { text: "Care", value: { choices: ["care"] } } });
  const results = demoFrame(demoScripts.choice, "s", placed, 1).frame.state.results, bars = barsOf(results);
  assert.equal(results.people, 8, "the visitor's change replaces person 0's answer");
  assert.equal(bars[0].key, "next"); assert.equal(bars[0].leader, true); assert.equal(bars[0].fraction, 1);
  assert.deepEqual(bars.map(b => b.place), [1, 2, 3, 4]);
  const points = barsOf(demoFrame(demoScripts.points, "s", placedOf("points", 8), 1).frame.state.results);
  assert.equal(points.reduce((sum, b) => sum + (b.points ?? 0), 0), 800);
  const scale = scaleOf(demoFrame(demoScripts.scale, "s", placedOf("scale", 8), 1).frame.state.results)!;
  assert.equal(scale.columns.length, 5); assert.equal(scale.low, 2); assert.equal(scale.high, 4);
});

test("Every demo frame is a live session the TV can draw, and the newest answer arrives as an event", () => {
  for (const kind of demoKinds) {
    const empty = demoFrame(demoScripts[kind], `s-${kind}`, [], 1);
    assert.equal(empty.event, null); assert.equal(empty.frame.state.tv_content, "session");
    assert.equal(empty.frame.session?.interaction, kind); assert.equal(empty.frame.state.live_session_id, `s-${kind}`);
    const one = demoFrame(demoScripts[kind], `s-${kind}`, placedOf(kind, 1), 2);
    assert.equal(one.event?.answer?.id, "a0");
    assert.equal(demoScripts[kind].gaps.length, demoScripts[kind].answers.length);
  }
});
