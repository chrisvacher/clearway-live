import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import JSZip from "jszip";
import { aiDisclosureTextsFor } from "../../lib/ai/disclosure";
import { aiJobs, noveteraJobs, promptFor } from "../../lib/ai/prompts";
import { workshopSummaryPromptFor } from "../../lib/ai/workshop-summary";
import { noveteraPromptStandards, noveteraAiInvite, noveteraAiPage, skinCopy } from "../../lib/brand/copy";
import { signInEmail } from "../../lib/email/sign-in";
import { sender } from "../../lib/email/sender";
import { buildSummaryDocx } from "../../lib/export/summary-docx";
import { invitationMessages } from "../../lib/setup/invitation";
import { inviteText } from "../../lib/setup/overview";
import { brandFor } from "../../lib/brand";

const fixture = <T>(name: string) => JSON.parse(readFileSync(`tests/fixtures/skin/${name}`, "utf8")) as T;
const clearwayWords = /Clearway|clearway\.co/i;

// ---------- Sender ----------
const withEnv = (env: Record<string, string | undefined>, run: () => void) => {
  const keys = ["EMAIL_FROM", "RESEND_FROM_EMAIL", "NOVETERA_EMAIL_FROM", "NOVETERA_REPLY_TO"], saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try { run(); } finally { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
};
test("a Clearway email is sent from the Clearway address, as before", () => withEnv({ RESEND_FROM_EMAIL: "Clearway <room@clearway.co>" }, () => {
  assert.deepEqual(sender(), { from: "Clearway <room@clearway.co>" });
  assert.deepEqual(sender("clearway"), { from: "Clearway <room@clearway.co>" });
  withEnv({ RESEND_FROM_EMAIL: "a <a@x.co>", EMAIL_FROM: "b <b@x.co>", NOVETERA_EMAIL_FROM: "Novetera <hello@novetera.co>" }, () => assert.equal(sender("clearway")?.from, "b <b@x.co>", "EMAIL_FROM takes precedence"));
}));
test("a Novetera email is sent from NOVETERA_EMAIL_FROM with replies to hello@novetera.co", () => {
  withEnv({ RESEND_FROM_EMAIL: "Clearway <room@clearway.co>", NOVETERA_EMAIL_FROM: "Novetera <hello@novetera.co>" }, () => assert.deepEqual(sender("novetera"), { from: "Novetera <hello@novetera.co>", replyTo: "hello@novetera.co" }));
  withEnv({ NOVETERA_EMAIL_FROM: "hello@novetera.co" }, () => assert.equal(sender("novetera")?.replyTo, "hello@novetera.co", "a bare address replies to itself"));
  withEnv({ NOVETERA_EMAIL_FROM: "Novetera <hello@novetera.co>", NOVETERA_REPLY_TO: "team@novetera.co" }, () => assert.equal(sender("novetera")?.replyTo, "team@novetera.co"));
});
test("a Novetera email never goes out from the Clearway address", () => {
  withEnv({ RESEND_FROM_EMAIL: "Clearway <room@clearway.co>", EMAIL_FROM: "Clearway <room@clearway.co>" }, () => assert.equal(sender("novetera"), null, "no NOVETERA_EMAIL_FROM: it fails like a missing sender"));
  withEnv({ EMAIL_FROM: "Clearway <room@clearway.co>", NOVETERA_EMAIL_FROM: "  " }, () => assert.equal(sender("novetera"), null));
  const source = readFileSync("lib/server/email.ts", "utf8");
  assert.match(source, /if \(!key \|\| !from\) throw new Error\("Email unavailable"\)/); assert.match(source, /reply_to/);
  assert.doesNotMatch(source, /EMAIL_FROM/, "the sender is chosen in one place");
});

// ---------- The Clearway output is unchanged ----------
test("the Clearway sign-in email is byte for byte what it was", () => {
  const now = signInEmail({ code: "012345", church: "Riverside & Co", link: "https://live.clearway.co/room/e/confirm?challenge=c&token=t" });
  assert.deepEqual(now, fixture("clearway-sign-in.json"));
});
const snapshot = { title: "Staff AI workshop", church: "Riverside", timezone: "America/Toronto", pre_call_at: "2026-11-18T19:00:00Z", retreat_start_date: "2026-11-20", retreat_end_date: "2026-11-21", consensus: "We decide together.", people: [{ id: "a", name: "Ann", email: "ann@example.org" }] };
const selfPaced = [{ id: "s1", title: "Before we meet", opens_at: "2026-11-16T15:00:00Z", closes_at: "2026-11-18T15:00:00Z" }];
test("the Clearway invite text is word for word what it was", () => {
  const was = fixture<{ on: unknown; off: unknown }>("clearway-invite.json");
  assert.deepEqual(invitationMessages("room-id", snapshot, "https://live.clearway.co", selfPaced, true), was.on);
  assert.deepEqual(invitationMessages("room-id", snapshot, "https://live.clearway.co"), was.off);
  assert.deepEqual(invitationMessages("room-id", snapshot, "https://live.clearway.co", selfPaced, true, "clearway"), was.on);
});
test("the Clearway summary file is the same file it was (every part, bar the dates)", async () => {
  const parts = async (skin?: "clearway") => { const zip = await JSZip.loadAsync(await buildSummaryDocx({ church: "Riverside", title: "Staff AI workshop", date: "November 20, 2026", paragraphs: ["One paragraph.", "Two & <more>."], ...(skin ? { skin } : {}) }));
    const out: Record<string, string> = {}; for (const name of Object.keys(zip.files).sort()) if (!zip.files[name].dir) out[name] = createHash("sha256").update((await zip.file(name)!.async("string")).replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "DATE")).digest("hex"); return out; };
  const was = fixture<Record<string, string>>("clearway-summary-parts.json");
  assert.deepEqual(await parts(), was); assert.deepEqual(await parts("clearway"), was);
});

// ---------- Novetera: its own words, and never Clearway's ----------
const textOf = async (file: Buffer) => { const zip = await JSZip.loadAsync(file); const out: string[] = [];
  for (const name of Object.keys(zip.files)) if (/^(word\/(document|footer\d|header\d|styles|settings|fontTable)|docProps\/(core|app|custom))\.xml$/.test(name)) out.push(await zip.file(name)!.async("string")); return out.join("\n"); };
test("the Novetera summary document: its design, its author, its fonts, its palette", async () => {
  const buffer = await buildSummaryDocx({ church: "Pickering Pentecostal", title: "Staff AI workshop", date: "November 20, 2026", paragraphs: ["Twenty-four people took part.", "Most felt curious."], skin: "novetera" });
  const zip = await JSZip.loadAsync(buffer), xml = await textOf(buffer);
  assert.match(await zip.file("docProps/core.xml")!.async("string"), /<dc:creator>Novetera<\/dc:creator>/);
  assert.doesNotMatch(xml, clearwayWords); assert.doesNotMatch(xml, /Plus Jakarta/);
  const doc = await zip.file("word/document.xml")!.async("string"), footer = await zip.file("word/footer1.xml")!.async("string");
  assert.match(doc, /NOVETERA/); assert.match(doc, /PICKERING PENTECOSTAL/); assert.match(doc, /Public Sans/);
  assert.match(footer, /New tools\. Same mission\./); assert.match(footer, /Source Serif 4/); assert.match(footer, /Novetera · /);
  for (const hex of ["1F2328", "7A1F2B", "454B54", "E3E0D9"]) assert.ok(doc.includes(hex) || footer.includes(hex), hex);
  assert.match(doc, /w:w="12240"/, "Letter");
  const table = await zip.file("word/fontTable.xml")!.async("string");
  assert.match(table, /w:name="Public Sans"[\s\S]*embedRegular[\s\S]*embedBold/); assert.match(table, /w:name="Source Serif 4"[\s\S]*embedItalic/);
  assert.equal(Object.keys(zip.files).filter(n => /^word\/fonts\/.*\.odttf$/.test(n)).length, 4, "the three faces are inside the file");
  assert.match(await zip.file("word/settings.xml")!.async("string"), /embedTrueTypeFonts/);
});

test("nothing a Novetera engagement's people read says Clearway or clearway.co", async () => {
  const texts: Record<string, string> = {};
  const nv = brandFor("novetera", {});
  const mail = signInEmail({ code: "012345", church: "Pickering Pentecostal", link: `${nv.origin}/room/e/confirm?challenge=c&token=t`, skin: "novetera" });
  Object.assign(texts, { "sign-in subject": mail.subject, "sign-in text": mail.text, "sign-in html": mail.html });
  for (const ai of [true, false]) for (const [i, m] of invitationMessages("room-id", snapshot, nv.origin, selfPaced, ai, "novetera").entries()) Object.assign(texts, { [`invite ${ai} ${i} subject`]: m.subject, [`invite ${ai} ${i}`]: m.text });
  texts["copyable invite"] = inviteText("Riverside", "Staff AI workshop", "Fri, Nov 20", `${nv.origin}/riverside`, "A1B2C3D4", nv.host);
  aiDisclosureTextsFor("novetera").forEach((t, i) => { texts[`disclosure ${i}`] = t; });
  for (const job of aiJobs) { const p = promptFor(job, "novetera"); if (noveteraJobs.includes(job)) texts[`prompt ${job}`] = `${p.version}\n${p.system}`; }
  texts["summary prompt"] = workshopSummaryPromptFor("novetera").system + workshopSummaryPromptFor("novetera").version;
  texts["summary document"] = await textOf(await buildSummaryDocx({ church: "Pickering Pentecostal", title: "Staff AI workshop", date: "November 20, 2026", paragraphs: ["One."], skin: "novetera" }));
  texts["copy table"] = JSON.stringify(skinCopy.novetera) + noveteraPromptStandards + noveteraAiInvite + noveteraAiPage.join(" ");
  for (const [name, text] of Object.entries(texts)) assert.doesNotMatch(text, clearwayWords, name);
  assert.ok(Object.keys(texts).length > 20);
});

test("every Novetera prompt carries Novetera's standards and has no em or en dashes", () => {
  for (const job of noveteraJobs) {
    const p = promptFor(job, "novetera");
    assert.ok(p.system.includes(noveteraPromptStandards), job); assert.match(p.system, /run by Novetera/);
    assert.doesNotMatch(p.system, /[—–]/);
    assert.ok(p.system.trimEnd().split("\n").pop()!.startsWith("Reply as"), `${job}: the reply format stays last`);
  }
  assert.doesNotMatch(noveteraPromptStandards, /[—–]/);
  for (const [job, version] of noveteraJobs.map(j => [j, promptFor(j, "novetera").version])) assert.match(version, /-novetera@\d+$/, job);
});
