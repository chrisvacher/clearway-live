import type { InteractionKind, KindInfo } from "../interactions/kinds";
export const parts = ["Discover", "Pre-call", "Day 1", "Day 2", "Follow-up"] as const;
export type Part = typeof parts[number];
export type SessionSettings = { anonymous: boolean; burst_minutes: number; join_strip: boolean };
export type ShowSession = {
  id: string; engagement_id: string; title: string; part: Part; position: number;
  planned_start: string | null; planned_minutes: number; mode: "live" | "self_paced";
  opens_at: string | null; closes_at: string | null;
  interaction: InteractionKind; prompt: string; phone_depth: string; options: Record<string, unknown>;
  settings: SessionSettings; notes: string; lands_in: string; state: string; segment: string;
  shown_at?: string | null; closed_at?: string | null;
  max_sends: number; max_characters: number; max_words: number; revision: number;
  seeded_from?: string | null;
  // The named section this session sits in (design pass 8, step 5). A label for planning: it changes nothing in the room.
  section?: string;
  // A step the team leads on its own (the second half of Day 2). The scribe console is off while it is live.
  team_led?: boolean;
};
export type ShowContext = { id: string; title: string; church: string; timezone: string; base_year: number; closed: boolean; scripture_translation?: string; lens_names?: string[]; kinds?: KindInfo[] };
export type RunOfShow = { context: ShowContext; sessions: ShowSession[]; version: string };
export type SessionInput = Omit<ShowSession, "engagement_id" | "position" | "revision" | "shown_at" | "closed_at" | "team_led"> & { revision: number | null };
