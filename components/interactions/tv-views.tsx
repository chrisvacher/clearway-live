"use client";
import type { ComponentType } from "react";
import type { InteractionKind } from "@/lib/interactions/kinds";
import type { LiveSnapshot } from "@/lib/live/types";
import type { TvFlow } from "@/lib/tv/flow";
import { LiveBoard } from "@/components/tv/live-board";
import { LiveBars, LiveScale } from "@/components/interactions/bars/tv-bars";
import { GridView } from "@/components/interactions/grid-form-sign/grid-view";
import { FormView, SignView } from "@/components/interactions/grid-form-sign/sign-view";
import { QaTv } from "@/components/interactions/qa/qa-tv";
import { WallView } from "@/components/interactions/ai/wall-view";

// The TV view for each kind that takes input. A view draws from the server's results and
// animates from what is on screen to what arrives: it never redraws, never resets a bar to
// zero after its first appearance and never waits for a reveal. Before anyone answers a
// structured kind shows its empty structure; text kinds show "Waiting for answers".
// Each step of milestone 3 adds its own kinds here, one line each.
export type TvViewProps = { session: string; frame: LiveSnapshot; flow?: TvFlow | null };
export const tvViews: Partial<Record<InteractionKind, ComponentType<TvViewProps>>> = {
  word_cloud: props => <LiveBoard kind="word_cloud" {...props} />,
  wall: WallView,
  choice: props => <LiveBars kind="choice" {...props} />,
  scale: props => <LiveScale {...props} />,
  ranking: props => <LiveBars kind="ranking" {...props} />,
  points: props => <LiveBars kind="points" {...props} />,
  statements: props => <LiveBars kind="statements" {...props} />,
  grid: GridView,
  form: FormView,
  sign: SignView,
  qa: props => <QaTv {...props} />,
};
