import assert from "node:assert/strict";
import { test } from "node:test";
import { ScribeOutbox, memoryBlobs } from "../../lib/scribe/outbox";
import { scribeBody } from "../../lib/scribe/body";
import { canCapture, checkCapture, checkFile, cleanDetail, consoleMode, kindForKey, kindInfo, settledReason, shownCards, shownFiles } from "../../lib/scribe/policy";
import { cardKinds, type CaptureItem, type FileItem, type OutboxEntry, type ScribeState } from "../../lib/scribe/types";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const memory = () => { const data = new Map<string, string>(); return { data, get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => { data.set(k, v); } }; };
const wait = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));
const capture = (n: number, extra: Partial<CaptureItem> = {}): CaptureItem => ({ type: "capture", id: id(n), session: id(900), kind: "quote", text: `Card ${n}`, detail: {}, speaker: "", capturedAt: "2026-11-04T14:00:00.000Z", ...extra });
const state = (over: Partial<ScribeState> = {}): ScribeState => ({ status: "ok", role: "scribe", server_time: "2026-11-04T14:00:00.000Z", version: 1,
  live: { id: id(900), title: "Five Lenses: Congregation", part: "Day 1", state: "live", team_led: false }, sessions: [{ id: id(900), title: "Five Lenses: Congregation", part: "Day 1", team_led: false }], cards: [], files: [], ...over });

test("six kinds, keys 1 to 6, and a kind carries only its own details", () => {
  assert.deepEqual([...cardKinds], ["quote", "decision", "tension", "action", "question", "mitigation"]);
  assert.deepEqual(cardKinds.map(k => kindInfo[k].key), ["1", "2", "3", "4", "5", "6"]);
  assert.equal(kindForKey("6"), "mitigation"); assert.equal(kindForKey("7"), null);
  assert.deepEqual(cleanDetail("action", { owner: " Dana ", date: "", why: "no" }), { owner: "Dana" });
  assert.deepEqual(cleanDetail("tension", { views: ["For", "Against"] }), { views: ["For", "Against"] });
  assert.deepEqual(cleanDetail("mitigation", { risk: "Volunteer burnout", owner: "x" }), { risk: "Volunteer burnout" });
  assert.deepEqual(cleanDetail("quote", { why: "x", risk: "y" }), {});
});

test("words are checked before a card is captured", () => {
  assert.equal(canCapture("   "), false); assert.equal(canCapture("We said yes"), true);
  assert.match(checkCapture("x".repeat(2003)), /3 characters over/);
  assert.equal(canCapture("x".repeat(2001)), false);
  assert.equal(checkFile({ size: 1000, type: "image/jpeg" }), "");
  assert.match(checkFile({ size: 1000, type: "application/zip" }), /can’t be uploaded/);
  assert.match(checkFile({ size: 16 * 1024 * 1024, type: "application/pdf" }), /15 MB/);
  assert.match(checkFile({ size: 0, type: "application/pdf" }), /empty/);
});

test("a request is shaped before the database checks it again", () => {
  const base = { action: "capture", id: id(1), session: id(900), kind: "action", text: "Call the bank", detail: { owner: "Dana", extra: "dropped" }, speaker: "Pat", capturedAt: "2026-11-04T14:00:00.000Z" };
  const ok = scribeBody(base);
  assert.equal(ok?.action, "capture"); assert.deepEqual(ok && "detail" in ok ? ok.detail : null, { owner: "Dana" });
  assert.equal(scribeBody({ ...base, id: "nope" }), null);
  assert.equal(scribeBody({ ...base, kind: "joke" }), null);
  assert.equal(scribeBody({ ...base, text: "  " }), null);
  assert.equal(scribeBody({ ...base, capturedAt: "not a date" }), null);
  assert.equal(scribeBody({ action: "edit", id: id(1), text: "New", detail: {}, speaker: "", revision: 1 })?.action, "edit");
  assert.equal(scribeBody({ action: "edit", id: id(1), text: "New", detail: {}, speaker: "", revision: -1 }), null);
  assert.equal(scribeBody({ action: "file_begin", id: id(2), session: id(900), fileKind: "photo", name: "easel.jpg", contentType: "image/jpeg", bytes: 1000, capturedAt: "2026-11-04T14:00:00.000Z" })?.action, "file_begin");
  assert.equal(scribeBody({ action: "file_begin", id: id(2), session: id(900), fileKind: "photo", name: "easel.exe", contentType: "application/x-msdownload", bytes: 1000, capturedAt: "2026-11-04T14:00:00.000Z" }), null);
  assert.equal(scribeBody({ action: "file_begin", id: id(2), session: id(900), fileKind: "file", name: "big.pdf", contentType: "application/pdf", bytes: 20 * 1024 * 1024, capturedAt: "2026-11-04T14:00:00.000Z" }), null);
  assert.equal(scribeBody({ action: "file_done", id: id(2) })?.action, "file_done");
  assert.equal(scribeBody({ action: "delete", id: id(2) }), null);
});

test("FAIL-03: wifi off, then back on, sends every card once and in order", async () => {
  const store = memory();
  const server: string[] = [];
  let up = false, calls = 0;
  const send = async (item: { id: string }) => { calls++; if (!up) throw new Error("offline"); if (!server.includes(item.id)) server.push(item.id); return { status: server.filter(x => x === item.id).length > 1 ? "duplicate" : "accepted" }; };
  const box = new ScribeOutbox("k", send, () => {}, () => {}, store, () => up);
  [1, 2, 3].forEach(n => box.add(capture(n)));
  await wait(20);
  assert.equal(box.entries.length, 3, "all three stay on the device");
  assert.ok(box.entries.every(e => e.item.type === "capture" && e.item.queuedAt), "each knows it waited");
  assert.deepEqual(server, []);
  up = true; box.kick();
  await wait(40);
  assert.deepEqual(server, [id(1), id(2), id(3)], "in the order they were made, once each");
  assert.equal(box.entries.length, 0);
  box.stop();
  assert.ok(calls >= 3);
});

test("a reload mid-send replays the same id, which the server counts as a duplicate", async () => {
  const store = memory();
  const server = new Map<string, number>();
  let up = false;
  const send = async (item: { id: string }) => { if (!up) throw new Error("offline"); const seen = server.get(item.id) ?? 0; server.set(item.id, seen + 1); return { status: seen ? "duplicate" : "accepted" }; };
  const first = new ScribeOutbox("reload", send, () => {}, () => {}, store, () => up);
  first.add(capture(1)); first.add(capture(2));
  await wait(10); first.stop();
  // The page reloads: a new outbox reads the same store.
  const second = new ScribeOutbox("reload", send, () => {}, () => {}, store, () => up);
  assert.equal(second.entries.length, 2); assert.ok(second.entries.every(e => e.state === "saved"));
  up = true; second.kick(); await wait(40);
  assert.deepEqual([...server.entries()], [[id(1), 1], [id(2), 1]]);
  // A card whose first send reached the server but whose reply was lost is sent again with the same id.
  const third = new ScribeOutbox("again", send, () => {}, () => {}, memory(), () => up);
  third.add(capture(1)); await wait(40); third.stop();
  assert.equal(server.get(id(1)), 2, "the server saw the same id twice");
  assert.equal(server.size, 2, "and still holds two cards");
});

test("a new card never overtakes an older one that is waiting", async () => {
  const order: string[] = [];
  let failFirst = true;
  const send = async (item: { id: string }) => { if (item.id === id(1) && failFirst) { failFirst = false; throw new Error("blip"); } order.push(item.id); return { status: "accepted" }; };
  const box = new ScribeOutbox("order", send, () => {}, () => {}, memory(), () => true);
  box.add(capture(1)); await wait(5); box.add(capture(2));
  await wait(1500);
  assert.deepEqual(order, [id(1), id(2)]);
  box.stop();
});

test("a settled refusal is shown on the card and never retried", async () => {
  const seen: string[] = []; let calls = 0;
  const box = new ScribeOutbox("refused", async () => { calls++; return { status: "team_led" }; }, () => {}, (_i, reason) => seen.push(reason), memory(), () => true);
  box.add(capture(1)); await wait(20);
  assert.equal(calls, 1);
  assert.equal(box.entries[0].state, "failed"); assert.match(box.entries[0].reason ?? "", /team had the room/);
  assert.equal(seen.length, 1);
  box.dismiss(id(1)); assert.equal(box.entries.length, 0);
  box.stop();
  assert.equal(settledReason("duplicate"), ""); assert.equal(settledReason("unavailable"), null); assert.equal(settledReason("denied"), null);
});

test("the screen overlays what is waiting on what the server holds", () => {
  const held = { id: id(10), session_id: id(900), kind: "decision" as const, text: "Meet monthly", detail: {}, has_speaker: true, captured_at: "2026-11-04T13:59:00.000Z", received_at: "2026-11-04T13:59:01.000Z", seq: "10", revision: 0, refiled: false };
  const entries: OutboxEntry[] = [{ item: capture(1), state: "saved" }, { item: capture(2), state: "sending" }, { item: capture(10), state: "sending" }];
  const offline = shownCards(state({ cards: [held] }), entries, false, "2026-11-04T14:00:05.000Z");
  assert.deepEqual(offline.map(c => [c.id, c.state, c.order]), [[id(2), "queued", 2], [id(1), "queued", 1], [id(10), "synced", undefined]], "newest waiting first, numbered in send order; a held card is never doubled");
  const online = shownCards(state({ cards: [held] }), entries, true, "2026-11-04T14:00:05.000Z");
  assert.equal(online.find(c => c.id === id(2))?.state, "syncing");
  assert.equal(online.find(c => c.id === id(1))?.state, "queued");
  const failed = shownCards(null, [{ item: capture(3), state: "failed", reason: "x" }], true, "2026-11-04T14:00:05.000Z");
  assert.equal(failed[0].state, "failed");
});

test("files wait by name, then show once uploaded", () => {
  const file: FileItem = { type: "file", id: id(20), session: id(900), fileKind: "photo", name: "easel.jpg", contentType: "image/jpeg", bytes: 2000, capturedAt: "2026-11-04T14:00:00.000Z" };
  const waiting = shownFiles(state(), [{ item: file, state: "saved" }], false, "2026-11-04T14:00:01.000Z");
  assert.equal(waiting.length, 1); assert.equal(waiting[0].uploaded, false); assert.equal(waiting[0].state, "queued");
  const done = shownFiles(state({ files: [{ id: id(20), session_id: id(900), kind: "photo", name: "easel.jpg", content_type: "image/jpeg", bytes: 2000, uploaded: true, captured_at: file.capturedAt, received_at: file.capturedAt, seq: "1", refiled: false }] }),
    [{ item: file, state: "sending" }], true, "2026-11-04T14:00:01.000Z");
  assert.deepEqual(done.map(f => [f.id, f.state, f.uploaded]), [[id(20), "synced", true]]);
});

test("the console follows the run of show and is off for the team-led block", () => {
  assert.equal(consoleMode(null), "signed_out");
  assert.equal(consoleMode(state({ live: null })), "nothing");
  assert.equal(consoleMode(state()), "ready");
  assert.equal(consoleMode(state({ live: { ...state().live!, team_led: true } })), "team_led");
});

test("the speaker never appears in anything the screens read", () => {
  const entries: OutboxEntry[] = [{ item: capture(1, { speaker: "Pat Alder" }), state: "saved" }];
  const shown = shownCards(state(), entries, true, "2026-11-04T14:00:05.000Z");
  assert.equal(shown[0].has_speaker, true);
  assert.equal(JSON.stringify(shown).includes("Pat Alder"), false);
});

test("file bytes wait on the device until they are sent", async () => {
  const blobs = memoryBlobs();
  await blobs.put("a", new Blob(["x"]));
  assert.equal((await blobs.get("a"))?.size, 1);
  await blobs.delete("a");
  assert.equal(await blobs.get("a"), null);
});

test("a card that has just been sent stays on the screen, as Synced, until the server's state shows it", () => {
  const sent: OutboxEntry[] = [{ item: capture(7, { kind: "mitigation", detail: { risk: "Volunteer burnout" } }), state: "sent" }];
  const waiting: OutboxEntry[] = [{ item: capture(8), state: "saved" }];
  const shown = shownCards(state(), [...sent, ...waiting], true, "2026-11-04T14:00:05.000Z");
  assert.deepEqual(shown.map(c => [c.id, c.state, c.order]), [[id(8), "queued", 1], [id(7), "synced", undefined]], "the waiting card is still number 1");
  assert.deepEqual(shown[1].detail, { risk: "Volunteer burnout" });
  const once = shownCards(state({ cards: [{ id: id(7), session_id: id(900), kind: "mitigation", text: "Card 7", detail: { risk: "Volunteer burnout" }, has_speaker: false, captured_at: "2026-11-04T14:00:00.000Z", received_at: "2026-11-04T14:00:01.000Z", seq: "7", revision: 0, refiled: false }] }), sent, true, "2026-11-04T14:00:05.000Z");
  assert.equal(once.length, 1, "never doubled once the server holds it");
});

test("an edit the server refused stays on the card with its reason, and shows the server's words after Dismiss", async () => {
  const held = { id: id(30), session_id: id(900), kind: "decision" as const, text: "Rae's wording", detail: {}, has_speaker: false, captured_at: "2026-11-04T14:00:00.000Z", received_at: "2026-11-04T14:00:01.000Z", seq: "30", revision: 1, refiled: false };
  const edit: OutboxEntry = { item: { type: "edit", id: id(30), text: "Thomas's wording", detail: {}, speaker: "", revision: 0 }, state: "failed", reason: settledReason("conflict") ?? "" };
  const refused = shownCards(state({ cards: [held] }), [edit], true, "2026-11-04T14:00:05.000Z");
  assert.equal(refused.length, 1);
  assert.equal(refused[0].state, "failed", "the refusal reaches the card, not Saved on this laptop");
  assert.match(refused[0].reason ?? "", /changed somewhere else/);
  assert.equal(refused[0].text, "Thomas's wording", "his words stay in view so they can be copied");
  const waiting = shownCards(state({ cards: [held] }), [{ ...edit, state: "saved", reason: undefined }], false, "2026-11-04T14:00:05.000Z");
  assert.equal(waiting[0].state, "queued"); assert.equal(waiting[0].reason, undefined);
  // The real outbox: the server refuses the edit, the entry fails, and Dismiss takes it away.
  const box = new ScribeOutbox("edit-refused", async () => ({ status: "conflict" }), () => {}, () => {}, memory(), () => true);
  box.add(edit.item); await wait(20);
  assert.equal(box.entries[0].state, "failed");
  const failed = shownCards(state({ cards: [held] }), box.entries, true, "2026-11-04T14:00:05.000Z");
  assert.equal(failed[0].state, "failed");
  box.dismiss(id(30)); assert.equal(box.entries.length, 0);
  const after = shownCards(state({ cards: [held] }), box.entries, true, "2026-11-04T14:00:05.000Z");
  assert.deepEqual([after[0].state, after[0].text, after[0].reason], ["synced", "Rae's wording", undefined]);
  box.stop();
});

test("a refused re-file leaves the card where the server holds it", () => {
  const held = { id: id(31), session_id: id(900), kind: "quote" as const, text: "Words", detail: {}, has_speaker: false, captured_at: "2026-11-04T14:00:00.000Z", received_at: "2026-11-04T14:00:01.000Z", seq: "31", revision: 0, refiled: false };
  const shown = shownCards(state({ cards: [held] }), [{ item: { type: "refile", id: id(31), session: id(901) }, state: "failed", reason: "The team had the room, so this didn’t go in." }], true, "2026-11-04T14:00:05.000Z");
  assert.deepEqual([shown[0].state, shown[0].session_id, shown[0].refiled], ["failed", id(900), false]);
});
