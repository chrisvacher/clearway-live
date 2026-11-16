import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { actionNames, controlBody, stateLabels } from "../../lib/control/policy";
import { freshMessage, rehearsalBody } from "../../lib/run-of-show/self-paced";
import { stepFinished, workshopEnded } from "../../lib/room/copy";
import { expiredLinkLine } from "../../lib/tv/pair-link";
import { screensFor } from "../../lib/brand/screens";

const id = (n: number) => `57000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const dashes = /[–—]/;

test("Stop answers and Take answers are presses against the live step, with an optional step named", () => {
  assert.deepEqual(controlBody({ id: id(1), action: "stop_answers", from: id(2) }), { id: id(1), action: "stop_answers", p: { from: id(2) } });
  assert.deepEqual(controlBody({ id: id(1), action: "take_answers", from: id(2), session: id(3) }), { id: id(1), action: "take_answers", p: { from: id(2), session: id(3) } });
  assert.equal(controlBody({ id: id(1), action: "take_answers", from: id(2), session: "nope" }), null);
  assert.equal(actionNames.stop_answers, "Stop answers"); assert.equal(actionNames.take_answers, "Take answers");
});

test("A step reads as open or stopped, never closed for late answers", () => {
  assert.equal(stateLabels.open, "Open"); assert.equal(stateLabels.closed, "Stopped");
  const surface = readFileSync("components/control/control-surface.tsx", "utf8");
  assert.doesNotMatch(surface, /goes live read-only until you reopen it/);
  for (const file of ["components/control/live-controls.tsx", "components/control/step-controls.tsx"]) assert.doesNotMatch(readFileSync(file, "utf8"), /press\("reopen"\)/, file);
});

test("Start fresh is one action with its own words, and the practice room keeps its reset", () => {
  assert.deepEqual(rehearsalBody({ id: id(1), action: "fresh" }), { id: id(1), action: "fresh" });
  assert.equal(freshMessage({ status: "ok", answers: 1, sessions: 9 }), "Started fresh. 1 answer deleted and 9 steps back to Ready. The TV and phones stay connected.");
  assert.match(freshMessage({ status: "live", title: "Word cloud" }), /^Word cloud is live\. Choose Home/);
  assert.equal(freshMessage({ status: "practice" }), "The practice room uses Reset practice room.");
  for (const status of ["ok", "live", "practice", "closed", "denied", "unavailable"]) assert.doesNotMatch(freshMessage({ status }), dashes);
});

test("Phones and the TV say what happened in plain words", () => {
  assert.equal(stepFinished, "Answers for this step are finished.");
  assert.equal(workshopEnded, "This workshop has ended. Thank you for taking part.");
  assert.equal(expiredLinkLine, "That link has expired. Type this code in the live room instead.");
  const tv = readFileSync("components/tv/tv-scenes.tsx", "utf8");
  assert.match(tv, /Open this screen from the live room with <strong>Open the TV<\/strong>\. Using a second computer\? Type this code in the live room\./);
  assert.match(tv, /"Workshop ended"/);
  for (const skin of ["clearway", "novetera"] as const) assert.ok(!("closed" in screensFor(skin)), skin);
  assert.doesNotMatch(readFileSync("components/tv/live-mark.tsx", "utf8"), /words\.closed|"closed"|\/>Closed/);
  for (const text of [stepFinished, workshopEnded, expiredLinkLine]) assert.doesNotMatch(text, dashes);
});
