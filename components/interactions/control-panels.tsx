"use client";
import type { ComponentType } from "react";
import type { InteractionKind } from "@/lib/interactions/kinds";
import type { Room } from "@/components/control/live-controls";
import { BulletsPanel, ConfirmPanel } from "@/components/interactions/outcomes/outcomes-panel";
import { RankingPanel, StatementsPanel } from "@/components/interactions/bars/control-bars";

import { CandidatesPanel } from "@/components/interactions/candidates/candidates-control";
import { GoalsPanel, PremortemPanel } from "@/components/interactions/goals/goals-control";
import { LensSummaryPanel } from "@/components/interactions/lens-summary/summary-panel";

// A kind's own private panel on the control surface, under the items list (for example
// Add an option's suggestions). It reads the room and calls its kind's own control route.
// Each step adds its kinds here, one line each.
export type ControlPanelProps = { room: Room };
export const controlPanels: Partial<Record<InteractionKind, ComponentType<ControlPanelProps>>> = {
  grid: PremortemPanel,
  goals: GoalsPanel,
  lens_summary: LensSummaryPanel,
  candidates: CandidatesPanel,
  ranking: RankingPanel,
  statements: StatementsPanel,
  bullets: BulletsPanel,
  confirm: ConfirmPanel,
};
