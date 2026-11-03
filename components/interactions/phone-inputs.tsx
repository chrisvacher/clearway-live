"use client";
import type { ComponentType } from "react";
import type { InteractionKind } from "@/lib/interactions/kinds";
import type { OwnShown, PhoneStep } from "@/lib/phone/types";

// The phone input for each structured kind. Word cloud and open text use the phone's
// text form. An input sends through the phone's outbox (offline queueing, order, ids and
// revisions are the outbox's job) and shows the person's own answer from `mine`.
// One-answer-per-person kinds just send: the server replaces the earlier answer.
export type PhoneInputProps = {
  step: PhoneStep; mine: OwnShown[]; open: boolean;
  send: (answer: { text: string; value?: unknown }) => void;
  change: (id: string, answer: { text: string; value?: unknown }) => void;
  withdraw: (id: string) => void;
};
export const phoneInputs: Partial<Record<InteractionKind, ComponentType<PhoneInputProps>>> = {};
