"use client";
import type { ComponentType } from "react";
import type { InteractionKind } from "@/lib/interactions/kinds";
import type { OwnShown, PhoneStep } from "@/lib/phone/types";
import { ChoiceInput, PointsInput, RankingInput, ScaleInput, StatementsInput } from "@/components/interactions/bars/phone-bars";
import { GridInput } from "@/components/interactions/grid-form-sign/grid-input";
import { FormInput } from "@/components/interactions/grid-form-sign/form-input";
import { SignInput } from "@/components/interactions/grid-form-sign/sign-input";
import { GoalsInput } from "@/components/interactions/goals/goals-input";
import type { LiveSnapshot } from "@/lib/live/types";
import { BulletsInput, ConfirmInput } from "@/components/interactions/outcomes/outcomes-phone";
import { IntentInput } from "@/components/interactions/intent/intent-phone";
import { QaPhoneInput } from "@/components/interactions/qa/qa-phone";
import { CandidatesInput } from "@/components/interactions/candidates/candidates-input";
import { LensInput } from "@/components/interactions/lens/lens-input";
import { LensSummaryInput } from "@/components/interactions/lens-summary/summary-phone";
import { FourListsComposer } from "@/components/interactions/four-lists/four-input";

// The phone input for each structured kind. Word cloud and open text use the phone's
// text form. An input sends through the phone's outbox (offline queueing, order, ids and
// revisions are the outbox's job) and shows the person's own answer from `mine`.
// One-answer-per-person kinds just send: the server replaces the earlier answer.
export type PhoneInputProps = {
  step: PhoneStep; mine: OwnShown[]; open: boolean; engagement?: string;
  send: (answer: { text: string; value?: unknown; id?: string }) => void;
  change: (id: string, answer: { text: string; value?: unknown }) => void;
  withdraw: (id: string) => void;
  // The person's own first name, for a named kind (sign together prints it under the line).
  name?: string | null;
  // The room as the phone follows it, for kinds that show the room's answers (Q&A votes on them).
  frame?: LiveSnapshot | null;
};
export const phoneInputs: Partial<Record<InteractionKind, ComponentType<PhoneInputProps>>> = {
  qa: QaPhoneInput,
  lens: LensInput,
  lens_summary: LensSummaryInput,
  candidates: CandidatesInput,
  four_lists: FourListsComposer,
  bullets: BulletsInput,
  confirm: ConfirmInput,
  choice: ChoiceInput,
  scale: ScaleInput,
  ranking: RankingInput,
  points: PointsInput,
  statements: StatementsInput,
  grid: GridInput,
  form: FormInput,
  sign: SignInput,
  goals: GoalsInput,
  intent: IntentInput,
};
