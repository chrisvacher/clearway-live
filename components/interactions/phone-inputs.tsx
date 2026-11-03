"use client";
import type { ComponentType } from "react";
import type { InteractionKind } from "@/lib/interactions/kinds";
import type { OwnShown, PhoneStep } from "@/lib/phone/types";
import { ChoiceInput, PointsInput, RankingInput, ScaleInput, StatementsInput } from "@/components/interactions/bars/phone-bars";
import { GridInput } from "@/components/interactions/grid-form-sign/grid-input";
import { FormInput } from "@/components/interactions/grid-form-sign/form-input";
import { SignInput } from "@/components/interactions/grid-form-sign/sign-input";
import type { LiveSnapshot } from "@/lib/live/types";
import { QaPhoneInput } from "@/components/interactions/qa/qa-phone";

// The phone input for each structured kind. Word cloud and open text use the phone's
// text form. An input sends through the phone's outbox (offline queueing, order, ids and
// revisions are the outbox's job) and shows the person's own answer from `mine`.
// One-answer-per-person kinds just send: the server replaces the earlier answer.
export type PhoneInputProps = {
  step: PhoneStep; mine: OwnShown[]; open: boolean; engagement?: string;
  send: (answer: { text: string; value?: unknown }) => void;
  change: (id: string, answer: { text: string; value?: unknown }) => void;
  withdraw: (id: string) => void;
  // The person's own first name, for a named kind (sign together prints it under the line).
  name?: string | null;
  // The room as the phone follows it, for kinds that show the room's answers (Q&A votes on them).
  frame?: LiveSnapshot | null;
};
export const phoneInputs: Partial<Record<InteractionKind, ComponentType<PhoneInputProps>>> = {
  qa: QaPhoneInput,
  choice: ChoiceInput,
  scale: ScaleInput,
  ranking: RankingInput,
  points: PointsInput,
  statements: StatementsInput,
  grid: GridInput,
  form: FormInput,
  sign: SignInput,
};
