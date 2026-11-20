import type { Attendee } from "./types";

export type PeopleAttendee = Attendee & { created_at: string };
export type AttendeePresence = {
  attendee_id: string;
  present: boolean;
  last_seen_at?: string | null;
  invited?: boolean;
  manual?: boolean;
};
export type WaitingRequest = { id: string; name: string; email: string };
export type PeopleFilter = "all" | "in-the-room" | "invited" | "duplicates";
export type PeopleData = {
  attendees: PeopleAttendee[];
  presence: AttendeePresence[];
  requests: WaitingRequest[];
  mergeAvailable: boolean;
  changesAvailable: boolean;
  teamFacilitator: string | null;
  facilitatorEmails: string[];
};

export const guestEmail = (value: string) => /@(?:guest|practice)\.clearway\.invalid$/i.test(value);
export const personNameKey = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export const mergeOrder = (a: PeopleAttendee, b: PeopleAttendee) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
