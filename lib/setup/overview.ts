import { brandFor } from "../brand";

export type ReadyState = "ready" | "todo";
type ReadinessKey = "details" | "run" | "people" | "screens";

export function overviewReadiness(input: {
  hasDate: boolean; stepCount: number; draftCount: number; openJoin: boolean; attendeeCount: number; screenCount: number;
}): { key: ReadinessKey; state: ReadyState }[] {
  return [
    { key: "details", state: input.hasDate ? "ready" : "todo" },
    { key: "run", state: input.stepCount > 0 && input.draftCount === 0 ? "ready" : "todo" },
    { key: "people", state: input.openJoin || input.attendeeCount > 0 ? "ready" : "todo" },
    { key: "screens", state: input.screenCount > 0 ? "ready" : "todo" },
  ];
}

export function length(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const hours = h ? `${h} ${h === 1 ? "hour" : "hours"}` : "", mins = m ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
  return [hours, mins].filter(Boolean).join(" ") || "0 minutes";
}

export function runLine(stepCount: number, draftCount: number, minutes: number): string {
  if (!stepCount) return "No steps yet. Start from a template or build your own.";
  const base = `${stepCount} ${stepCount === 1 ? "step" : "steps"}`;
  return draftCount ? `${base}, ${draftCount} still in draft` : `${base}, ${length(minutes)}, all ready`;
}

export function joiningLine(open: boolean, listed: number, signedIn: number): string {
  if (open) return `Open joining by name. ${signedIn === 1 ? "1 person has" : `${signedIn} people have`} joined so far.`;
  return `Email sign-in against your list. ${listed} on the list, ${signedIn} signed in.`;
}

export function inviteText(church: string, title: string, when: string | null, link: string, code: string, host = brandFor("clearway").host): string {
  return [`${church}: ${title}${when ? `, ${when}` : ""}.`, `Join on your phone at ${link}`, `Or go to ${host} and enter the room code ${code}.`].join("\n");
}

export function dayInZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function eventDayOffset(date: string | null, zone: string, now: Date): number | null {
  return date ? (Date.parse(date) - Date.parse(dayInZone(now, zone))) / 86_400_000 : null;
}

export function roomTime(at: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(at)).replace(/\s+(a\.?m\.?|p\.?m\.?)$/i, (_, suffix: string) => ` ${suffix[0].toLowerCase()}.m.`);
}
