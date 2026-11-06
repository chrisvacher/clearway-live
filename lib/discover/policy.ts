// Limits and checks for the Discover records. The database enforces the same limits; these give a plain message first.
export const MAX_NOTE_CHARS = 60000;
export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel caps a request body at 4.5 MB (the brief's 10 MB, changed for Chris to confirm)
export const MAX_TITLE = 200;
export const MAX_PERSON = 200;
export const MAX_FINDING_TITLE = 120;
export const MAX_FIGURE = 40;
export const MAX_RESPONDENTS = 1000000;

export const noteKinds = ["interview", "input"] as const;
export type NoteKind = typeof noteKinds[number];
export const noteKindLabel: Record<NoteKind, string> = { interview: "Leadership interview", input: "Input conversation" };
// The church's own word for its governing group (Words in the app), "board" when none is set.
export const governanceWord = (name: unknown) => (typeof name === "string" && name.replace(/\s+/g, " ").trim()) || "board";
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export const noteKindHint = (governance: string): Record<NoteKind, string> => ({ interview: "One-to-one with a leader", input: `${capital(governance)} or staff conversation` });

export const noteSources = ["paste", "docx", "pdf", "txt"] as const;
export type NoteSource = typeof noteSources[number];
export type FileSource = Exclude<NoteSource, "paste">;

// The kind of file, from its extension (browsers report odd types for Word and text files).
export function fileSource(name: string): FileSource | null {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name.trim())?.[1]?.toLowerCase();
  return ext === "docx" ? "docx" : ext === "pdf" ? "pdf" : ext === "txt" ? "txt" : null;
}

export const titleFromFileName = (name: string) => name.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || "Notes";
export const cleanLine = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
export const wordCount = (text: string) => (text.trim().match(/\S+/g) || []).length;

// Text from a file or a paste: one kind of line break, no stray control characters, no run of blank lines.
export function cleanNoteText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// A finding's numbers. Returns the cleaned values or the sentence to show.
export function findingInput(value: unknown): { ok: true; title: string; figure: string; restsOn: number } | { ok: false; message: string } {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const title = cleanLine(v.title, MAX_FINDING_TITLE), figure = cleanLine(v.figure, MAX_FIGURE);
  const restsOn = typeof v.rests_on === "number" ? v.rests_on : typeof v.rests_on === "string" && /^\d{1,7}$/.test(v.rests_on.trim()) ? Number(v.rests_on) : NaN;
  if (!title) return { ok: false, message: "Give the finding a short title." };
  if (typeof v.title === "string" && v.title.replace(/\s+/g, " ").trim().length > MAX_FINDING_TITLE) return { ok: false, message: `Keep the title to ${MAX_FINDING_TITLE} characters.` };
  if (!figure || !/[0-9]/.test(figure)) return { ok: false, message: "Write the number as the report gives it, such as 31% or 27 of 87." };
  if (typeof v.figure === "string" && v.figure.replace(/\s+/g, " ").trim().length > MAX_FIGURE) return { ok: false, message: `Keep the number to ${MAX_FIGURE} characters.` };
  if (!Number.isInteger(restsOn) || restsOn < 1 || restsOn > MAX_RESPONDENTS) return { ok: false, message: "Say how many respondents the finding rests on, as a whole number." };
  return { ok: true, title, figure, restsOn };
}

// Plain sentences for the statuses the Discover functions return.
export function discoverMessage(status: string, extra?: { total?: number; most?: number }): string {
  switch (status) {
    case "denied": return "Only the facilitators of this engagement can use Discover.";
    case "closed": return "This engagement is closed, so Discover can't change.";
    case "exceeds_total": return `A finding can't rest on more people than the survey's total${extra?.total ? ` of ${extra.total}` : ""}. Check the numbers.`;
    case "below_findings": return `The total can't be lower than the biggest finding${extra?.most ? ` (${extra.most} respondents)` : ""}. Change that finding first.`;
    case "not_found": return "That one is already gone. Reload the page.";
    case "conflict": return "That one belongs to another engagement.";
    case "limit": return "That's the most Discover holds. Remove one first.";
    case "empty": return "There is no text to add.";
    case "too_long": return `A note can hold ${MAX_NOTE_CHARS.toLocaleString("en-CA")} characters. Split it into two notes.`;
    case "invalid_request": return "Check the details and try again.";
    default: return "We couldn't save that. Try again.";
  }
}
