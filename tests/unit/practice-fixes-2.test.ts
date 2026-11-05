// Milestone 4 practice-room fixes, batch 2: the pure parts (fitting a list to its space, the TVs to name as
// reconnecting, the follow-up phone's words, the printed run of show's detail lines).
import assert from "node:assert/strict";
import { test } from "node:test";
import { fitCount, fitLines } from "../../lib/tv/fit";
import { screensDown, staleScreenMs } from "../../lib/control/policy";
import { followupStatusText, followupTakeText } from "../../lib/interactions/intent";
import { printDetails } from "../../lib/run-of-show/print";
import type { ControlScreen } from "../../lib/control/types";

test("a list keeps the items that fit whole, from the end it counts from", () => {
  // Six bullets, newest last, in 500 px with 18 px gaps: the newest four fit (100+120+80+90 + 3 gaps = 444).
  const heights = [140, 160, 100, 120, 80, 90];
  assert.equal(fitCount(heights, 18, 500, "end"), 4);
  assert.equal(fitCount(heights, 18, 500, "start"), 3, "from the top: 140+160+100 + 2 gaps = 436");
  assert.equal(fitCount(heights, 18, 10_000, "end"), 6, "all of them when there is room");
  assert.equal(fitCount([90, 90], 20, 200, "start"), 2, "exactly full still fits");
  assert.equal(fitCount([300, 90], 20, 200, "end"), 1, "the newest shows");
  assert.equal(fitCount([300], 20, 120, "end"), 1, "one item always shows, even when it is taller than the space");
  assert.equal(fitCount([], 20, 120, "end"), 0);
  assert.equal(fitCount([300, 90], 20, 60, "start", 0), 0, "a side list can show none, leaving its count line room");
  assert.equal(fitCount([30, 30], 20, 60, "start", 0), 1);
});

test("a card's intent line keeps the whole lines that fit, up to three", () => {
  assert.equal(fitLines(170, 54, 3), 3);
  assert.equal(fitLines(120, 54, 3), 2);
  assert.equal(fitLines(53.6, 54, 3), 1, "rounding never costs a line that fits");
  assert.equal(fitLines(40, 54, 3), 0, "no room: the line is left off rather than cut through its letters");
  assert.equal(fitLines(-20, 54, 3), 0);
  assert.equal(fitLines(1000, 54, 3), 3);
});

const at = (min: number) => new Date(Date.UTC(2026, 10, 5, 15, 0) - min * 60_000).toISOString();
const now = Date.UTC(2026, 10, 5, 15, 0);
const screen = (id: string, label: string, connected: boolean, minutesAgo: number | null): ControlScreen => ({ id, label, connected, confirmed_version: 1, last_seen_at: minutesAgo === null ? null : at(minutesAgo) });

test("a TV paired again is named once, and an old pairing is not named at all", () => {
  // Three pairings named Front TV: the live one and two left from earlier runs.
  const live = [screen("a", "Front TV", true, 0), screen("b", "Front TV", false, 90), screen("c", "Front TV", false, 60 * 24)];
  assert.deepEqual(screensDown(live, now), [], "the screen is up: nothing reconnecting");
  // It drops out: one name, once.
  const dropped = [screen("a", "Front TV", false, 0.5), screen("b", "Front TV", false, 90), screen("c", "Front TV", false, 60 * 24)];
  assert.deepEqual(screensDown(dropped, now).map(s => s.id), ["a"]);
  // Another TV is up; an old pairing of a second screen is ignored, a fresh drop is named.
  const two = [screen("a", "Front TV", true, 0), screen("d", "Side TV", false, 40), screen("e", "Back TV", false, 1)];
  assert.deepEqual(screensDown(two, now).map(s => s.label), ["Back TV"]);
  // A pairing that never showed anything is not a TV dropping out.
  assert.deepEqual(screensDown([screen("a", "Front TV", true, 0), screen("f", "Spare TV", false, null)], now), []);
  // No TV up at all, and every pairing is old: the one seen last is named, so the room still hears about it.
  const quiet = [screen("a", "Front TV", false, 30), screen("b", "Front TV", false, 90), screen("d", "Side TV", false, 120)];
  assert.deepEqual(screensDown(quiet, now).map(s => s.id), ["a"]);
  assert.ok(staleScreenMs >= 10 * 60_000, "a short break never hides a TV that dropped out");
});

test("the follow-up phone says why it cannot take the remote", () => {
  assert.equal(followupTakeText("busy", "Chris"), "The room’s own handover is still open. Ask Chris to end it.");
  assert.equal(followupTakeText("busy"), "The room’s own handover is still open. Ask the lead facilitator to end it.");
  assert.equal(followupTakeText("lead_has_it", "Chris"), "Chris has the remote. Ask for it back.");
  assert.equal(followupTakeText("lead_has_it"), followupStatusText.lead_has_it);
  assert.equal(followupTakeText("ended", "Chris"), followupStatusText.ended);
  assert.equal(followupTakeText("something new"), followupStatusText.unavailable);
  assert.doesNotMatch(Object.values(followupStatusText).join(" "), /Someone else already has the remote/);
  assert.doesNotMatch(followupTakeText("busy", "Chris") + followupTakeText("lead_has_it", "Chris"), /[–—]/);
});

test("the printed run of show: no burst for a content screen, one period after a time", () => {
  const date = (v: string | null) => v ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(v)) : "Unscheduled";
  const base = { settings: { burst_minutes: 4 }, max_sends: 3, max_characters: 28, max_words: 3 };
  assert.deepEqual(printDetails({ ...base, mode: "live" }, false, date), [], "a content screen takes no answers");
  assert.deepEqual(printDetails({ ...base, mode: "live" }, true, date), ["4-minute burst · 3 answers · 28 characters · 3 words"]);
  const window = printDetails({ ...base, mode: "self_paced", opens_at: "2026-11-05T16:12:00Z", closes_at: "2026-11-06T14:00:00Z" }, true, date)[1];
  assert.match(window, /^Opens Nov\.? 5, 11:12 a\.m\. Closes Nov\.? 6, 9:00 a\.m\.$/, window);
  assert.doesNotMatch(window, /\.\./);
  assert.equal(printDetails({ ...base, mode: "self_paced" }, true, date)[1], "Opens Unscheduled. Closes Unscheduled.");
});
