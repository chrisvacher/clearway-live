import type { TvAppearance, TvPresence } from "../tv/types";
import type { InteractionKind, KindInfo } from "../interactions/kinds";
import type { QaPublic } from "../interactions/qa";
export type LiveSession = { revision?: number; base_year?: number; settings?: { anonymous: boolean; burst_minutes: number; join_strip: boolean }; id: string; title: string; interaction: InteractionKind; prompt: string; state: string; max_sends: number; max_characters: number; max_words: number;
  options?: Record<string, unknown>; kind?: KindInfo };
export type LiveState = { engagement_id: string; live_session_id: string | null; version: number; tv_content: string; phones_down: boolean; burst_ends_at: string | null;
  spotlight_key?: string | null; neutral_question?: string; hidden_keys?: string[]; hidden_ids?: string[]; show_tv_on_phones?: boolean; phone_refresh_version?: number;
  results: LiveResults; [key: string]: unknown };
// Every kind's results carry total and people, computed once on the server. Each kind adds its own fields.
export type LiveResults = { total: number; people: number; words: { key: string; text: string; count: number; size: number; level: string; order?: number }[]; [key: string]: unknown };
export type LiveAnswer = { id: string; session_id: string; text: string; answers: { text: string; key: string }[]; value?: unknown; revision: number; created_at?: string };
export type LivePatch = LiveAnswer & { withdrawn?: boolean; hidden?: boolean; replaced?: string[] };
// A scribe quote a facilitator put on the TV: the words and the live step's name. Never an id, a speaker or the scribe.
export type PromotedQuote = { text: string; session: string };
export type LiveEvent = { display?: TvAppearance; presence?: TvPresence; state: LiveState; session: LiveSession | null; answer?: LivePatch | null; qa?: QaPublic | null; promoted_quote?: PromotedQuote | null };
export type LiveSnapshot = LiveEvent & { status: "ok"; role: "participant" | "facilitator" | "tv"; topic: string; version: number; answers: LiveAnswer[]; next: string | null; phone_depth: string | null; server_time: string };
export type LiveTransport = { url: string; key: string; token: string };
export type LiveRead = LiveSnapshot & { connection?: LiveTransport };
export type SubmissionRequest = { id: string; session: string; revision: number; action: "submit" | "change" | "withdraw"; text: string; value?: unknown; sentAt: string; queuedAt?: string; uncertaintyMs?: number };
