import type { SubmissionRequest } from "../live/types";
import type { InteractionKind, KindInfo } from "../interactions/kinds";
export type { ShownAnswer as OwnShown } from "./policy";

export type PhoneStep = { id: string; title: string; part: string; segment: string; interaction: InteractionKind; state: string; prompt: string; phone_depth: string; options?: Record<string, unknown>; kind?: KindInfo;
  max_sends: number; max_characters: number; max_words: number; closed_at: string | null;
  // A self-paced session: open on phones between two times, outside the live room.
  mode?: "live" | "self_paced"; opens_at?: string | null; closes_at?: string | null; settings?: { anonymous?: boolean } };
export type OwnAnswer = { id: string; session_id: string; text: string; value?: unknown; revision: number; withdrawn: boolean; replaced?: boolean; created_at?: string };
export type PhoneRoom = { status: "ok"; server_time: string; name: string | null; sessions: PhoneStep[]; answers: OwnAnswer[];
  self_paced?: PhoneStep[]; timezone?: string; rehearsal?: boolean };
// One entry per send, change or withdraw, kept on the phone until the server settles it.
export type OutboxEntry = { request: SubmissionRequest; state: "saved" | "sending" | "failed"; reason?: string };
export type Limits = Pick<PhoneStep, "interaction" | "max_sends" | "max_characters" | "max_words">;
