// What the overnight review reads (overnight_state). Speakers ride along only here, from the scribe's own record.
export type SourceKind = "bullet" | "card" | "photo";
export type DraftBullet = { id: string; position: number; text: string; ai_text: string | null; room_text: string | null; origin: "ai" | "room" | "written"; removed: boolean;
  restorable: boolean; flag: null | "none" | "number"; sources: { id: string; kind: SourceKind; ref: string; excerpt: string }[] };
export type DraftNote = { id: string; text: string; source_kind: "bullet" | "card"; source: string };
export type Draft = { id: string; outcome_id: string; name: string; original_name: string; description: string; position: number; tidy: "waiting" | "tidied" | "by_hand"; revision: number; thin: boolean;
  thin_ack: { by: string; at: string } | null; reviewed: { by: string; mine: boolean; at: string } | null; unreadable: string[]; lock: { by: string; mine: boolean } | null; versions: number;
  bullets: DraftBullet[]; voices: DraftNote[]; tensions: DraftNote[]; room_bullets: { id: string; text: string; used: boolean }[] };
export type Round = { id: string; status: "pending" | "drafting" | "ready" | "failed" | "ai_off"; day_closed_at: string; ready_at: string | null; published_at: string | null; published_by: string | null;
  attempts: number; error: string | null; inputs: { bullets?: number; cards?: number; photos?: number }; unreadable: string[] };
export type Check = { total: number; reviewed: number; unreviewed: string[]; editing: { name: string; by: string }[]; thin: { name: string; acknowledged: boolean }[]; thin_open: number; drafting: boolean; ready: boolean };
export type CardFact = { kind: "quote" | "decision" | "tension" | "action" | "question" | "mitigation"; text: string; detail: { why?: string; views?: string[]; risk?: string; owner?: string; date?: string }; step: string; at: string };
export type FileFact = { kind: "photo" | "file"; name: string; type: string; uploaded: boolean; step: string; at: string; typed: string | null };
export type Presence = { user: string; name: string; place: string; editing: boolean; you: boolean };
export type OvernightState =
  | { status: "ok"; server_time: string; me: string; year: number; ai: boolean; lead: boolean; round: Round; check: Check; outcomes: Draft[]; presence: Presence[];
      cards: Record<string, CardFact>; files: Record<string, FileFact>; unplaced: string[]; speakers: Record<string, string> }
  | { status: "none"; server_time: string; year: number; ai: boolean }
  | { status: "denied" | "unavailable" };
export type OvernightSummary = { status: "ok"; round: Round["status"]; day_closed_at: string; ready_at: string | null; published_at: string | null; total: number; tidied: number; reviewed: number; ready: boolean;
  outcomes: { name: string; tidy: string; reviewed: boolean; thin: boolean; editing: boolean }[] } | { status: "none" } | { status: "denied" } | { status: "unavailable" };
export type ActResult = { status: string; by?: string; revision?: number; check?: Check };
