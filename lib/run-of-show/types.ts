export const parts = ["Pre-call", "Day 1", "Day 2", "Follow-up"] as const;
export type Part = typeof parts[number];
export type SessionSettings = { anonymous: true; burst_minutes: number; join_strip: boolean };
export type ShowSession = {
  id: string; engagement_id: string; title: string; part: Part; position: number;
  planned_start: string | null; planned_minutes: number; mode: "live" | "self_paced";
  opens_at: string | null; closes_at: string | null;
  interaction: "word_cloud" | "wall" | "content"; prompt: string; phone_depth: string;
  settings: SessionSettings; notes: string; lands_in: string; state: string;
  max_sends: number; max_characters: number; max_words: number; revision: number;
};
export type ShowContext = { id: string; title: string; church: string; timezone: string; base_year: number; closed: boolean };
export type RunOfShow = { context: ShowContext; sessions: ShowSession[]; version: string };
export type SessionInput = Omit<ShowSession, "engagement_id" | "position" | "revision"> & { revision: number | null };
