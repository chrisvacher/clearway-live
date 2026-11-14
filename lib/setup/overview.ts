import { brandFor } from "../brand";
// What the Overview page says about an engagement's readiness, in plain words.
export type OverviewSessions = { count: number; minutes: number; notReady: number; sections: number };
export type ReadyState = "ready" | "todo" | "optional";

export function length(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const hours = h ? `${h} ${h === 1 ? "hour" : "hours"}` : "", mins = m ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
  return [hours, mins].filter(Boolean).join(" ") || "0 minutes";
}

export function runLine(s: OverviewSessions): { state: ReadyState; text: string } {
  if (!s.count) return { state: "todo", text: "No sessions yet. Start from a template or build your own." };
  const base = `${s.count} ${s.count === 1 ? "session" : "sessions"}, ${length(s.minutes)}`;
  return s.notReady
    ? { state: "todo", text: `${base}. ${s.notReady} not marked Ready yet` }
    : { state: "ready", text: `${base}, all marked Ready` };
}

export function joiningLine(open: boolean, listed: number, signedIn: number): { state: ReadyState; text: string } {
  if (open) return { state: "ready", text: "Open joining. Anyone with the link or room code joins with their name" };
  if (!listed) return { state: "todo", text: "Email sign-in against your list. No one is on the list yet" };
  return { state: "ready", text: `Email sign-in against your list. ${listed} on the list, ${signedIn} signed in` };
}

export function inviteText(church: string, title: string, when: string | null, link: string, code: string, host = brandFor("clearway").host): string {
  return [`${church}: ${title}${when ? `, ${when}` : ""}.`, `Join on your phone at ${link}`, `Or go to ${host} and enter the room code ${code}.`].join("\n");
}
