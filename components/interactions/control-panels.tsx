"use client";
import type { ComponentType } from "react";
import type { InteractionKind } from "@/lib/interactions/kinds";
import type { Room } from "@/components/control/live-controls";
import { BulletsPanel, ConfirmPanel } from "@/components/interactions/outcomes/outcomes-panel";
import { RankingPanel, StatementsPanel } from "@/components/interactions/bars/control-bars";

// A kind's own private panel on the control surface, under the items list (for example
// Add an option's suggestions). It reads the room and calls its kind's own control route.
// Each step adds its kinds here, one line each.
export type ControlPanelProps = { room: Room };
export const controlPanels: Partial<Record<InteractionKind, ComponentType<ControlPanelProps>>> = {
  ranking: RankingPanel,
  statements: StatementsPanel,
  bullets: BulletsPanel,
  confirm: ConfirmPanel,
};
