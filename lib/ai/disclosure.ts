// The AI disclosure, approved by Chris on November 3 2026 (docs/prd.md, "AI disclosure").
// The words are his: change them only with his approval. No dashes anywhere.
// The survey intro (milestone 6) is recorded in the PRD only, not built yet.

import { skinOf, type Skin } from "../brand";
import { noveteraAiInvite, noveteraAiPage } from "../brand/copy";

export const aiPagePath = "/how-we-use-ai";
export const aiPageTitle = "How we use AI";

// The "How we use AI" page, a public phone page. The credit is its last line and the
// only place the icon is credited (no credit in the app chrome).
export const aiPageParagraphs = [
  "Clearway uses Claude, an AI model made by Anthropic, to help your team see what it’s saying while the conversation is happening, and to help us prepare drafts afterward.",
  "During the sessions, Claude groups similar answers, combines answers that say the same thing, brings matching questions together and suggests short labels. Anything it groups or writes is marked as AI on the screen, and your facilitator can undo it, rename it or turn it off. Your answers always reach the screen first, so the room keeps working even if AI is slow.",
  "Between and after the sessions, Claude helps us draft summaries, the read-back and the report from your team’s own words. Each drafted sentence links back to what was said, and Clearway reviews every draft before your team sees it.",
  "AI never makes a decision. Your team decides together.",
  "Claude never receives your name, email or role. It does receive your answers and any easel photos as written, so if you name someone in an answer, that name goes with it. Anthropic doesn’t train its models on what we send.",
] as const;
export const aiIconCredit = "The AI mark is the Generative icon by LAFS from Flaticon.";

// Room sign-in, under the sign-in button. The last three words link to the page.
export const aiSignInLine = "We use AI to group similar answers and help draft summaries. It never receives your name or email, and anything it produces is marked as AI.";
export const aiSignInLink = "How we use AI";

// The invite email's paragraph, when the engagement has AI on.
export const aiInviteParagraph = "We’ll use AI in the room. Claude, an AI model from Anthropic, groups similar answers and helps us draft summaries. It never receives your name or email, everything it produces is marked as AI, and Clearway reviews every draft before your team sees it. You can read more when you sign in.";

// The disclosure for a skin. Clearway's texts are the ones above, as approved. Novetera's page paragraphs and invite paragraph are the spec's
// working wording (lib/brand/copy.ts); its room sign-in line names no brand and its icon credit is the page's last line, so both are shared.
export function aiDisclosure(skin: Skin = "clearway") {
  const novetera = skinOf(skin) === "novetera";
  return { title: aiPageTitle, paragraphs: novetera ? noveteraAiPage : aiPageParagraphs, credit: aiIconCredit, signInLine: aiSignInLine, signInLink: aiSignInLink,
    inviteParagraph: novetera ? noveteraAiInvite : aiInviteParagraph, pagePath: aiPagePath };
}

// The engagement has AI on only when its setting says so; the database reads it the same
// way (private.ai_on, private.room_ai). New engagements start with it on.
export function engagementAi(settings: unknown) {
  return typeof settings === "object" && settings !== null && (settings as Record<string, unknown>).ai_enabled === true;
}

// Every disclosure text of one skin, and of both skins together, for the no-dash check.
export const aiDisclosureTextsFor = (skin: Skin): string[] => { const d = aiDisclosure(skin); return [d.title, ...d.paragraphs, d.credit, d.signInLine, d.signInLink, d.inviteParagraph]; };
export const aiDisclosureTexts = [...aiDisclosureTextsFor("clearway"), ...aiDisclosureTextsFor("novetera")];
