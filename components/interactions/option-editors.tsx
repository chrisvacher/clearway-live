"use client";
import type { ComponentType } from "react";
import type { InteractionKind } from "@/lib/interactions/kinds";
import type { ShowContext, ShowSession } from "@/lib/run-of-show/types";
import { ContentOptions } from "@/components/run-of-show/content-options";
import { barDefaults, ChoiceOptions, PointsOptions, RankingOptions, ScaleOptions, StatementsOptions } from "@/components/interactions/bars/bar-options";
import { FormOptionsEditor, GridOptionsEditor, SignOptionsEditor } from "@/components/interactions/grid-form-sign/options";
import { gridPresets } from "@/lib/interactions/grid-form-sign";
import { QaOptions } from "@/components/interactions/qa/qa-options";
import { WallOptions, WordCloudOptions } from "@/components/interactions/ai/ai-options";
import { LensOptions } from "@/components/interactions/lens/lens-options";

// Per-interaction settings in the run of show (SET-07). Each kind's editor writes only
// session.options; the database's options_<kind> normalizes and checks it on Save.
export type OptionsEditorProps = { session: ShowSession; value: Record<string, unknown>; context: ShowContext; fresh: boolean; locked: boolean;
  onChange: (options: Record<string, unknown>) => void };
export const optionEditors: Partial<Record<InteractionKind, ComponentType<OptionsEditorProps>>> = {
  content: ContentOptions,
  word_cloud: WordCloudOptions,
  wall: WallOptions,
  choice: ChoiceOptions,
  scale: ScaleOptions,
  ranking: RankingOptions,
  points: PointsOptions,
  statements: StatementsOptions,
  grid: GridOptionsEditor,
  form: FormOptionsEditor,
  sign: SignOptionsEditor,
  qa: QaOptions,
  lens: LensOptions,
};
// Each kind's starting options and limits when it is chosen.
export type KindDefaults = Partial<Pick<ShowSession, "max_sends" | "max_characters" | "max_words" | "options">>;
export const kindDefaults: Partial<Record<InteractionKind, KindDefaults>> = {
  word_cloud: { max_sends: 3, max_characters: 28, max_words: 3, options: {} },
  wall: { max_sends: 3, max_characters: 280, max_words: 50, options: {} },
  content: { options: { screen: "headline" } },
  choice: barDefaults.choice,
  scale: barDefaults.scale,
  ranking: barDefaults.ranking,
  points: barDefaults.points,
  statements: barDefaults.statements,
  grid: { options: { preset: "custom", ...gridPresets.custom, items: [] } },
  form: { options: { questions: [{ key: "q1", text: "What would make this time a win for you?" }] } },
  sign: { options: { text: "" } },
  bullets: { max_sends: 12, max_characters: 200, max_words: 50, options: {} },
  confirm: { max_sends: 1, max_characters: 280, max_words: 50, options: {} },
  qa: { max_sends: 10, max_characters: 200, max_words: 50, options: { any_time: false } },
  lens: { max_sends: 8, max_characters: 200, max_words: 50, options: { lens: 1 } },
};
