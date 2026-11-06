import type { NoteKind, NoteSource } from "./policy";
import type { ThemeSource } from "./thin";

export type Finding = { id: string; title: string; figure: string; rests_on: number; theme_id: string | null };
export type Note = { id: string; kind: NoteKind; person: string | null; title: string; source_kind: NoteSource; char_count: number; word_count: number; created_at: string };
export type Theme = {
  id: string; source: ThemeSource; label: string; detail: string; rests_on: number; out_of: number | null; quotes: string[];
  status: "draft" | "accepted" | "rejected"; merged_into: string | null; ai: boolean; sources: number;
};
export type DiscoverState = { status: "ok"; survey_respondents: number | null; findings: Finding[]; notes: Note[]; themes: Theme[] };
