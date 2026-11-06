"use client";
import type { ComponentType } from "react";
import type { InteractionKind } from "@/lib/interactions/kinds";
import type { Room } from "@/components/control/live-controls";
import { FormAnswers, GridItems, SignNames } from "@/components/interactions/grid-form-sign/control";
import { IntentCards } from "@/components/interactions/intent/intent-control";
import { QaPanel } from "@/components/interactions/qa/qa-panel";
import { LensPanel } from "@/components/interactions/lens/lens-panel";
import { FourListsItems } from "@/components/interactions/four-lists/four-lists-control";
import { AiWallPanel, AiWordsPanel } from "@/components/interactions/ai/ai-panel";

// The control surface's item list for a kind that needs its own (merging grid items,
// reading private answers, closing signing). Kinds not listed use the general list of
// items with Spotlight and Hide. One line per kind.
export type ControlItemsProps = { room: Room; onClose?: () => void };
export const controlItems: Partial<Record<InteractionKind, ComponentType<ControlItemsProps>>> = {
  grid: GridItems,
  form: FormAnswers,
  sign: SignNames,
  intent: IntentCards,
  qa: QaPanel,
  word_cloud: AiWordsPanel,
  wall: AiWallPanel,
  lens: LensPanel,
  four_lists: FourListsItems,
};
