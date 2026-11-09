// The engagement list on /setup (Chris, November 9): name the organization, the event, its date
// and its location when Team Hub has one, so two "Staff AI Workshop" rows can be told apart.
export type ListedEngagement = {
  id: string; title: string; type: string; status: string;
  start_date: string | null; end_date: string | null; retreat_start_date: string | null; retreat_end_date: string | null;
  pre_call_at: string | null; team_hub_client_id: string | null;
  church: { name: string; timezone: string } | null;
};
export type HubPlace = { city: string | null; state_province: string | null; country: string | null };

const typeNames: Record<string, string> = { wayfinding: "Wayfinding", day_and_a_half: "Wayfinding, day and a half", team_workshop: "Team workshop", practice: "Practice" };
export const typeName = (type: string) => typeNames[type] ?? "Engagement";

const day = (iso: string, withYear: boolean) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) }).format(new Date(`${iso}T12:00:00Z`)).replace(/\./g, "");

// The day the room meets: the retreat dates, else the engagement's own dates. A pre-call alone
// shows as the pre-call. Ranges read "Sat, Nov 7 to Sun, Nov 8, 2026", never with a dash.
export function eventDate(e: Pick<ListedEngagement, "start_date" | "end_date" | "retreat_start_date" | "retreat_end_date" | "pre_call_at">, timezone = "America/Toronto"): string | null {
  const start = e.retreat_start_date ?? e.start_date, end = e.retreat_start_date ? e.retreat_end_date : e.end_date;
  if (start) {
    if (!end || end === start) return day(start, true);
    return start.slice(0, 4) === end.slice(0, 4) ? `${day(start, false)} to ${day(end, true)}` : `${day(start, true)} to ${day(end, true)}`;
  }
  if (e.pre_call_at) {
    const when = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(e.pre_call_at)).replace(/\./g, "");
    return `Pre-call ${when}`;
  }
  return null;
}

export function place(hub: HubPlace | null | undefined): string | null {
  if (!hub) return null;
  const parts = [hub.city, hub.state_province].map(v => v?.trim()).filter((v): v is string => Boolean(v));
  if (!parts.length && hub.country?.trim()) parts.push(hub.country.trim());
  return parts.length ? parts.join(", ") : null;
}

export const statusName = (status: string) => ({ setup: "Setup", discover: "Discover", pre_call: "Pre-call", retreat: "Retreat", follow_up: "Follow-up", closed: "Closed" }[status] ?? "Engagement");

// Upcoming first (nearest first), then undated, then past (most recent first), then closed.
// Callers supply today's date in the engagement's own time zone.
export function compareEngagements(a: ListedEngagement, b: ListedEngagement, now = new Date()): number {
  const key = (e: ListedEngagement): [number, string] => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: e.church?.timezone ?? "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const start = e.retreat_start_date ?? e.start_date ?? e.pre_call_at?.slice(0, 10);
    const end = e.retreat_end_date ?? e.end_date ?? start;
    return [e.status === "closed" ? 3 : !start ? 1 : end! >= today ? 0 : 2, start ?? ""];
  };
  const [ag, ad] = key(a), [bg, bd] = key(b);
  return ag - bg || (ag >= 2 ? bd.localeCompare(ad) : ad.localeCompare(bd)) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}
