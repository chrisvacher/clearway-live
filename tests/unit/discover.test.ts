import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { thin, isThin, restsOnLabel } from "../../lib/discover/thin";
import { strength } from "../../lib/discover/strength";
import { cleanNoteText, discoverMessage, governanceWord, noteKindHint, fileSource, findingInput, titleFromFileName, wordCount, MAX_NOTE_CHARS } from "../../lib/discover/policy";
import { extractNoteText, ReadError, unzippedBytes } from "../../lib/discover/extract";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/discover/${name}`, import.meta.url)));

test("a survey finding is thin under 10 respondents", () => {
  assert.equal(thin({ source: "survey", restsOn: 9, outOf: 87 }).thin, true);
  assert.equal(thin({ source: "survey", restsOn: 10, outOf: 87 }).thin, false);
  assert.equal(thin({ source: "survey", restsOn: 6, outOf: 87 }).reason, "6 of 87 respondents, fewer than 10");
  assert.equal(thin({ source: "survey", restsOn: 3 }).reason, "3 respondents, fewer than 10");
  assert.equal(thin({ source: "survey", restsOn: 1 }).reason, "1 respondent, fewer than 10");
});

test("a survey finding is thin under 10 percent of the survey's respondents", () => {
  assert.equal(thin({ source: "survey", restsOn: 40, outOf: 500 }).thin, true);
  assert.equal(thin({ source: "survey", restsOn: 40, outOf: 500 }).reason, "40 of 500 respondents, under 10 percent");
  assert.equal(thin({ source: "survey", restsOn: 50, outOf: 500 }).thin, false, "exactly 10 percent is not under it");
  assert.equal(thin({ source: "survey", restsOn: 49, outOf: 500 }).thin, true);
  assert.equal(thin({ source: "survey", restsOn: 40, outOf: null }).thin, false, "with no total only the count of 10 applies");
  assert.equal(thin({ source: "survey", restsOn: 40, outOf: 0 }).thin, false);
});

test("a conversation theme on one interview is thin", () => {
  assert.equal(thin({ source: "conversations", restsOn: 1, outOf: 5 }).thin, true);
  assert.equal(thin({ source: "conversations", restsOn: 1, outOf: 5 }).reason, "one conversation");
  assert.equal(thin({ source: "conversations", restsOn: 2, outOf: 5 }).thin, false);
  assert.equal(thin({ source: "conversations", restsOn: 0, outOf: 5 }).thin, true);
  assert.equal(isThin({ source: "conversations", restsOn: 4, outOf: 5 }), false, "4 of 5 interviews is not thin although it is under 10");
});

test("a Four Helpful Lists theme on one person is thin", () => {
  assert.equal(thin({ source: "four_lists", restsOn: 1, outOf: 8 }).reason, "one person");
  assert.equal(thin({ source: "four_lists", restsOn: 3, outOf: 8 }).thin, false);
});

test("bad counts never throw or read as strong", () => {
  assert.equal(thin({ source: "survey", restsOn: NaN, outOf: 87 }).thin, true);
  assert.equal(strength({ source: "survey", restsOn: -4, outOf: 87 }).strong, false);
});

test("what a theme rests on reads the way the screens say it", () => {
  assert.equal(restsOnLabel({ source: "survey", restsOn: 27, outOf: 87 }), "27 of 87");
  assert.equal(restsOnLabel({ source: "survey", restsOn: 27 }), "27 respondents");
  assert.equal(restsOnLabel({ source: "conversations", restsOn: 4, outOf: 5 }), "4 of 5 conversations");
  assert.equal(restsOnLabel({ source: "conversations", restsOn: 1, outOf: 1 }), "1 of 1 conversation");
  assert.equal(restsOnLabel({ source: "four_lists", restsOn: 3, outOf: 8 }), "3 of 8 people");
});

test("strong is 40 percent or more and not thin", () => {
  const a = strength({ source: "survey", restsOn: 35, outOf: 87 });
  assert.equal(a.percent, 40); assert.equal(a.strong, true); assert.equal(a.thin, false);
  assert.equal(strength({ source: "survey", restsOn: 34, outOf: 87 }).strong, false, "39 percent is not strong");
  assert.equal(strength({ source: "survey", restsOn: 6, outOf: 10 }).strong, false, "60 percent of 10 respondents is thin, so not strong");
  assert.equal(strength({ source: "conversations", restsOn: 4, outOf: 5 }).strong, true);
  assert.equal(strength({ source: "conversations", restsOn: 1, outOf: 1 }).strong, false, "one interview of one is thin, so not strong");
  assert.equal(strength({ source: "survey", restsOn: 60 }).strong, false, "with no total there is no share to call strong");
  assert.equal(strength({ source: "survey", restsOn: 60 }).share, null);
  assert.equal(strength({ source: "four_lists", restsOn: 4, outOf: 8 }).strong, true);
});

test("a finding needs a title, a number with a digit and a whole number of respondents", () => {
  assert.deepEqual(findingInput({ title: "  Welcoming   culture ", figure: "72%", rests_on: "60" }), { ok: true, title: "Welcoming culture", figure: "72%", restsOn: 60 });
  assert.equal(findingInput({ title: "", figure: "72%", rests_on: 60 }).ok, false);
  assert.equal(findingInput({ title: "x", figure: "most", rests_on: 60 }).ok, false);
  assert.equal(findingInput({ title: "x", figure: "72%", rests_on: 0 }).ok, false);
  assert.equal(findingInput({ title: "x", figure: "72%", rests_on: "6.5" }).ok, false);
  assert.equal(findingInput({ title: "x", figure: "72%", rests_on: 1000001 }).ok, false);
  assert.equal(findingInput({ title: "x".repeat(121), figure: "72%", rests_on: 5 }).ok, false);
  assert.equal(findingInput({ title: "x", figure: "1".repeat(41), rests_on: 5 }).ok, false);
  assert.equal(findingInput(null).ok, false);
});

test("files are told apart by their extension", () => {
  assert.equal(fileSource("Interview 1.DOCX"), "docx");
  assert.equal(fileSource("notes.pdf"), "pdf");
  assert.equal(fileSource("notes.txt"), "txt");
  assert.equal(fileSource("notes.doc"), null);
  assert.equal(fileSource("notes"), null);
  assert.equal(titleFromFileName("Interview_5  notes.docx"), "Interview 5 notes");
  assert.equal(titleFromFileName(".pdf"), "Notes");
});

test("note text is cleaned and counted", () => {
  assert.equal(cleanNoteText("\uFEFFa\r\nb\r\n\r\n\r\n\r\nc  \n"), "a\nb\n\nc");
  assert.equal(cleanNoteText("a\u0000b\u0007c"), "ab c");
  assert.equal(wordCount("  one two\nthree "), 3);
  assert.equal(wordCount(""), 0);
});

test("the messages are plain and carry no dash", () => {
  for (const status of ["denied", "closed", "exceeds_total", "below_findings", "not_found", "conflict", "limit", "empty", "too_long", "invalid_request", "unavailable"]) {
    const text = discoverMessage(status, { total: 87, most: 60 });
    assert.ok(text.length > 10 && !/[\u2013\u2014]/.test(text), status);
  }
  assert.match(discoverMessage("exceeds_total", { total: 87 }), /87/);
  assert.match(discoverMessage("too_long"), new RegExp(MAX_NOTE_CHARS.toLocaleString("en-CA")));
});

test("text is read from a Word file", async () => {
  const text = await extractNoteText("docx", fixture("interview.docx"));
  assert.match(text, /We want a church that sends people out\./);
  assert.match(text, /Small groups are hard to find\./);
});

test("text is read from a PDF", async () => {
  const text = await extractNoteText("pdf", fixture("elders.pdf"));
  assert.match(text, /The elders want a clear plan\./);
});

test("text is read from a text file, without the byte order mark or the extra blank lines", async () => {
  assert.equal(await extractNoteText("txt", fixture("staff.txt")), "Staff are stretched.\n\nLong weeks are normal.");
});

test("files that can't be read say why", async () => {
  await assert.rejects(extractNoteText("docx", new TextEncoder().encode("not a zip")), (e: unknown) => e instanceof ReadError && /Word/.test(e.message));
  await assert.rejects(extractNoteText("pdf", new TextEncoder().encode("not a pdf")), (e: unknown) => e instanceof ReadError && /PDF/.test(e.message));
  await assert.rejects(extractNoteText("txt", new Uint8Array([97, 0, 98])), (e: unknown) => e instanceof ReadError && /text file/.test(e.message));
  await assert.rejects(extractNoteText("txt", new Uint8Array(0)), (e: unknown) => e instanceof ReadError && /empty/.test(e.message));
  await assert.rejects(extractNoteText("txt", new TextEncoder().encode("   \n  ")), (e: unknown) => e instanceof ReadError && /no text/.test(e.message));
  await assert.rejects(extractNoteText("txt", new TextEncoder().encode("a".repeat(MAX_NOTE_CHARS + 1))), (e: unknown) => e instanceof ReadError && /60,000/.test(e.message));
  await assert.rejects(extractNoteText("txt", new Uint8Array(4 * 1024 * 1024 + 1)), (e: unknown) => e instanceof ReadError && /4 MB/.test(e.message));
});

test("a Word file is measured before it is unpacked", () => {
  const docx = fixture("interview.docx");
  const size = unzippedBytes(docx);
  assert.ok(size !== null && size > 300 && size < 5000, `unzipped size ${size}`);
  assert.equal(unzippedBytes(new TextEncoder().encode("plain text, no zip")), null);
});

test("the church's own word for its governing group is used, with board as the fallback", () => {
  assert.equal(governanceWord("Elder board"), "Elder board");
  assert.equal(governanceWord("  "), "board");
  assert.equal(governanceWord(undefined), "board");
  assert.equal(noteKindHint("elders").input, "Elders or staff conversation");
  assert.equal(noteKindHint("board").input, "Board or staff conversation");
});
