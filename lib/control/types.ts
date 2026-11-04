export const controlActions = ["go_live", "next", "back", "nothing_live", "reopen", "start_burst", "extend_burst", "end_burst", "phones_down", "open_phones",
  "spotlight", "clear_spotlight", "hide", "unhide", "refresh_phones", "tv_on_phones", "room_size", "close_part"] as const;
export type ControlAction = typeof controlActions[number];
export type RoomSize = "very_small" | "small" | "medium" | "large" | "very_large";
export type ControlPress = { id: string; action: ControlAction; from?: string | null; session?: string; minutes?: 3 | 4 | 5; item?: string; on?: boolean; size?: RoomSize; part?: string };
export type ControlResult = { status: string; version?: number; title?: string | null; by?: string; live_session_id?: string | null };
export type ControlScreen = { id: string; label: string; confirmed_version: number; last_seen_at: string | null; connected: boolean };
export type ControlItem = { key: string; text: string; count: number; hidden: boolean };
export type ControlLogEntry = { id: string; action: string; version: number; at: string; by: string };
export type ControlStatus = {
  status: "ok"; server_time: string; version: number; fac_topic: string | null; screens: ControlScreen[];
  counts: { signed_in: number; answered: number; answers: number; hidden: number; latency_p95_ms: number | null };
  items: ControlItem[]; controls: ControlLogEntry[];
  // Step 6a: self-paced sessions with their state worked out from their times, and the rehearsal.
  self_paced?: ControlSelfPaced[]; rehearsal?: ControlRehearsal;
};
export type ControlSelfPaced = { id: string; title: string; part: string; interaction: string; state: string; opens_at: string | null; closes_at: string | null; answered: number };
export type ControlRehearsal = { since: string | null; test_answers: number; last_clear: { at: string; answers: number; sessions: number; by: string | null } | null };
// Private notices on the facilitator topic. Hints only: the status read is authoritative.
export type ControlNotice = { kind: "ack"; screen: string; version: number; at: string } | { kind: "scribe"; what: string } | { kind: "overnight"; what: string } | { kind: "control"; id?: string; action: string; by?: string | null; version: number; changed?: boolean; at: string };
