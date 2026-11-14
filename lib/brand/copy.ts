// The words and documents each skin carries beyond its name and address (brands.ts): email headings, the invite's sign-off,
// the summary file's author and footer, the AI prompts' firm name and voice, and Novetera's AI disclosure.
// Clearway's values are what the code said before skins existed; they are here only so the code can read one table. Clearway's
// AI disclosure stays in lib/ai/disclosure.ts exactly as Chris approved it on November 3.
// Novetera's words are the spec's (docs: novetera-skin-spec.md, Part 1, points 6 and 7) and Novetera's messaging suite (copy standards sheet).
// Canadian spelling, sentence case, no em or en dashes. Safe to import anywhere: no server-only, no env.
import type { Skin } from "./brands";

export type SkinCopy = {
  // The room sign-in email.
  signIn: { codeTitle: string; header: string; footerTagline: string | null; footerName: string | null };
  // The invite email's last line.
  invite: { signOff: string };
  // The workshop summary Word file's author, and the footer line beside the page number.
  summary: { creator: string; footerTagline: string | null; footerName: string | null };
  // The firm the live-room prompts and the workshop summary prompt name.
  prompt: { firm: string; facilitator: string };
};

export const skinCopy: Record<Skin, SkinCopy> = {
  clearway: {
    signIn: { codeTitle: "Your Clearway sign-in code", header: "Clearway Live", footerTagline: null, footerName: null },
    invite: { signOff: "Clearway" },
    summary: { creator: "Clearway Church Solutions", footerTagline: null, footerName: null },
    prompt: { firm: "Clearway Church Solutions", facilitator: "a Clearway Church Solutions facilitator" },
  },
  novetera: {
    // "New tools. Same mission." is Novetera's tagline (messaging suite, core messaging). The canvas sets it as the footer of the email and the summary page.
    signIn: { codeTitle: "Your Novetera sign-in code", header: "Novetera", footerTagline: "New tools. Same mission.", footerName: "Novetera" },
    invite: { signOff: "Novetera" },
    summary: { creator: "Novetera", footerTagline: "New tools. Same mission.", footerName: "Novetera" },
    prompt: { firm: "Novetera", facilitator: "a Novetera facilitator" },
  },
};
export const copyFor = (skin: Skin): SkinCopy => skinCopy[skin === "novetera" ? "novetera" : "clearway"];

// ---------- Novetera's AI disclosure (spec Part 1 point 7, word for word; the app sets apostrophes as ’) ----------
// The room sign-in line and the icon credit are not here: the line names no brand and the credit stays the page's last line, so both are shared.
export const noveteraAiPage = [
  "Novetera uses Claude, an AI model made by Anthropic, to help your team see what it’s saying while the conversation is happening, and to help us prepare a summary afterward.",
  "During the workshop, Claude groups similar answers, combines answers that say the same thing, brings matching questions together and suggests short labels. Anything it groups or writes is marked as AI on the screen, and your facilitator can undo it, rename it or turn it off. Your answers always reach the screen first, so the room keeps working even if AI is slow.",
  "After the workshop, Claude helps us draft a summary from your team’s own words. Novetera reviews every draft before your team sees it.",
  "AI never makes a decision. Your team decides together.",
  "Claude never receives your name, email or role. It does receive your answers and any easel photos as written, so if you name someone in an answer, that name goes with it. Anthropic doesn’t train its models on what we send.",
] as const;
export const noveteraAiInvite = "We’ll use AI in the room. Claude, an AI model from Anthropic, groups similar answers and helps us draft a summary. It never receives your name or email, everything it produces is marked as AI, and Novetera reviews every draft before your team sees it. You can read more when you sign in.";

// ---------- Novetera's copy standards for the AI prompts ----------
// From the messaging suite's copy standards sheet: voice, casing and spelling, language to avoid. The "no em or en dashes" rule is the app's
// (the brief), not the sheet's. This line goes into every Novetera prompt in place of Clearway's own voice lines.
export const noveteraPromptStandards = "Write in Novetera's voice: calm, plain-spoken and practical, in short sentences with a natural spoken rhythm. Use Canadian spelling (centre, colour, practise as a verb, practice as a noun, organization, program) and sentence case. Never use the words revolutionary, unlock, supercharge, game-changing, leverage, empower or transform as hype. Never use sci-fi framing, fear of falling behind, or promises of automatic ministry growth. No exclamation marks, no emoji, no em dashes and no en dashes.";
