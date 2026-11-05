// The printed run of show's detail lines for one step (SET-03). A step that takes no answers (a
// content screen) has no burst, sends, characters or words to print. A time already ending in a
// period ("11:12 a.m.") is not given a second one.
const sentence = (text: string) => /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

export function printDetails(step: { mode: string; settings: { burst_minutes: number }; max_sends: number; max_characters: number; max_words: number; opens_at?: string | null; closes_at?: string | null },
  takesAnswers: boolean, date: (value: string | null) => string): string[] {
  const out: string[] = [];
  if (takesAnswers) out.push(`${step.settings.burst_minutes}-minute burst · ${step.max_sends} answers · ${step.max_characters} characters · ${step.max_words} words`);
  if (step.mode === "self_paced") out.push(`${sentence(`Opens ${date(step.opens_at ?? null)}`)} ${sentence(`Closes ${date(step.closes_at ?? null)}`)}`);
  return out;
}
