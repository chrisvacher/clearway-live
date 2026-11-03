import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aiDisclosureTexts, aiIconCredit, aiInviteParagraph, aiPageParagraphs, aiPagePath, aiPageTitle, aiSignInLine, aiSignInLink, engagementAi } from "../../lib/ai/disclosure";
import { invitationMessages } from "../../lib/setup/invitation";
import { setupInput } from "../../lib/setup/policy";

// Chris's approved words (November 3), as he wrote them. The app sets apostrophes as ’.
const approved = {
  page: [
    "Clearway uses Claude, an AI model made by Anthropic, to help your team see what it's saying while the conversation is happening, and to help us prepare drafts afterward.",
    "During the sessions, Claude groups similar answers, combines answers that say the same thing, brings matching questions together and suggests short labels. Anything it groups or writes is marked as AI on the screen, and your facilitator can undo it, rename it or turn it off. Your answers always reach the screen first, so the room keeps working even if AI is slow.",
    "Between and after the sessions, Claude helps us draft summaries, the read-back and the report from your team's own words. Each drafted sentence links back to what was said, and Clearway reviews every draft before your team sees it.",
    "AI never makes a decision. Your team decides together.",
    "Claude never receives your name, email or role. It does receive your answers and any easel photos as written, so if you name someone in an answer, that name goes with it. Anthropic doesn't train its models on what we send.",
  ],
  credit: "The AI mark is the Generative icon by LAFS from Flaticon.",
  signIn: "We use AI to group similar answers and help draft summaries. It never receives your name or email, and anything it produces is marked as AI. How we use AI",
  invite: "We'll use AI in the room. Claude, an AI model from Anthropic, groups similar answers and helps us draft summaries. It never receives your name or email, everything it produces is marked as AI, and Clearway reviews every draft before your team sees it. You can read more when you sign in.",
};
const plain = (text: string) => text.replace(/’/g, "'");
const dash = /[‐-―−]|\s-\s|--/;

test("The AI disclosure is Chris's approved wording, with no dashes", () => {
  assert.equal(aiPageTitle, "How we use AI");
  assert.deepEqual(aiPageParagraphs.map(plain), approved.page);
  assert.equal(aiIconCredit, approved.credit, "the credit is the page's last line, exactly");
  assert.equal(plain(`${aiSignInLine} ${aiSignInLink}`), approved.signIn);
  assert.equal(aiSignInLink, "How we use AI", "the last three words are the link");
  assert.equal(plain(aiInviteParagraph), approved.invite);
  for (const text of aiDisclosureTexts) assert.doesNotMatch(text, dash, text);
  assert.equal(aiPagePath, "/how-we-use-ai");
});

test("The icon credit appears only on the How we use AI page", () => {
  assert.doesNotMatch(readFileSync("public/marks/ai-generative.svg", "utf8"), /Flaticon|LAFS/, "no credit in the icon file's title");
  for (const file of ["components/interactions/ai/ai-icon.tsx", "components/interactions/ai/ai-panel.tsx", "components/interactions/ai/ai-foot.tsx", "components/room/room-access.tsx", "lib/setup/invitation.ts"])
    assert.doesNotMatch(readFileSync(file, "utf8"), /Flaticon/, file);
  assert.match(readFileSync("components/interactions/ai/ai-disclosure.tsx", "utf8"), /aiIconCredit/);
});

test("The invite carries the AI paragraph only when the engagement has AI on", () => {
  const snapshot = { title: "Wayfinding", church: "Riverside", timezone: "America/Toronto", pre_call_at: null, retreat_start_date: null, retreat_end_date: null,
    consensus: "We decide together.", people: [{ id: "a", name: "Ann", email: "ann@example.org" }] };
  const [on] = invitationMessages("room", snapshot, "https://live.clearway.co", [], true);
  const [off] = invitationMessages("room", snapshot, "https://live.clearway.co", [], false);
  const [unset] = invitationMessages("room", snapshot, "https://live.clearway.co");
  assert.ok(on.text.includes(`\n\n${aiInviteParagraph}\nhttps://live.clearway.co/how-we-use-ai\n\n`), "one paragraph, then the page link");
  assert.equal(on.text.split(aiInviteParagraph).length, 2, "once");
  assert.ok(on.text.indexOf(aiInviteParagraph) > on.text.indexOf("Send me a sign-in code"), "after the sign-in steps");
  for (const text of [off.text, unset.text]) {
    assert.ok(!text.includes("AI"), "AI off: nothing about AI");
    assert.ok(!text.includes("how-we-use-ai"));
  }
  assert.doesNotMatch(on.text, /[–—]/);
  assert.equal(on.text.match(/https:\/\/\S+/)![0], off.text.match(/https:\/\/\S+/)![0], "the room link stays the first link");
});

test("AI is on by default for new engagements; only an explicit setting counts", () => {
  const input = setupInput({ church: { name: "Riverside", timezone: "America/Toronto" }, engagement: { title: "Wayfinding", type: "wayfinding", status: "setup", start_date: "2026-11-01", end_date: "2027-09-01",
    base_year: "", lens_names: ["Congregation", "Community", "Leadership", "Operations", "Learning"], how_the_room_decides: "We decide together." } });
  assert.equal(input.engagement.settings.ai_enabled, true, "no setting given: on");
  const off = setupInput({ church: { name: "Riverside", timezone: "America/Toronto" }, engagement: { title: "Wayfinding", type: "wayfinding", status: "setup", start_date: "2026-11-01", end_date: "2027-09-01",
    base_year: "", lens_names: ["Congregation", "Community", "Leadership", "Operations", "Learning"], how_the_room_decides: "We decide together.", settings: { ai_enabled: false } } });
  assert.equal(off.engagement.settings.ai_enabled, false, "turned off stays off");
  assert.match(readFileSync("app/(facilitator)/(protected)/setup/new/page.tsx", "utf8"), /settings:\{ai_enabled:true,/, "the new engagement form starts with AI on");
  assert.equal(engagementAi({ ai_enabled: true }), true);
  for (const settings of [{ ai_enabled: false }, {}, null, { ai_enabled: "true" }]) assert.equal(engagementAi(settings), false);
});
