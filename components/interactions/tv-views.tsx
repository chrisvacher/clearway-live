"use client";
import type { ComponentType } from "react";
import type { InteractionKind } from "@/lib/interactions/kinds";
import type { LiveSnapshot } from "@/lib/live/types";
import type { TvFlow } from "@/lib/tv/flow";
import { LiveBoard } from "@/components/tv/live-board";
import { LiveBars, LiveScale } from "@/components/interactions/bars/tv-bars";

// The TV view for each kind that takes input. A view draws from the server's results and
// animates from what is on screen to what arrives: it never redraws, never resets a bar to
// zero after its first appearance and never waits for a reveal. Before anyone answers a
// structured kind shows its empty structure; text kinds show "Waiting for answers".
// Each step of milestone 3 adds its own kinds here, one line each.
export type TvViewProps = { session: string; frame: LiveSnapshot; flow?: TvFlow | null };
export const tvViews: Partial<Record<InteractionKind, ComponentType<TvViewProps>>> = {
  word_cloud: props => <LiveBoard kind="word_cloud" {...props} />,
  wall: props => <LiveBoard kind="wall" {...props} />,
  choice: props => <LiveBars kind="choice" {...props} />,
  scale: props => <LiveScale {...props} />,
  ranking: props => <LiveBars kind="ranking" {...props} />,
  points: props => <LiveBars kind="points" {...props} />,
  statements: props => <LiveBars kind="statements" {...props} />,
};
