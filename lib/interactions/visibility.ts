import type { InteractionKind } from "./kinds";

// Who sees answers (November 20): each answering step shows its answers to everyone (TV and phones) or to the facilitators only.
// The setting is options.visibility, "public" (the default, also when absent) or "private". The database enforces it: while a
// private step is live, the TV and phones receive counts only, and the room's public options say "private" for every private step
// (the form always, and a step seeded from a private one), so the surfaces only need to read options.visibility.
export type Visibility = "public" | "private";

// The kinds that can be private, as private.interaction_kinds.private_ok. The form is always private. The Wayfinding boards
// (lens wall, four lists, candidates, intent, goals, outcomes, read-back, lens summary) are built for the room to see, so they
// have no setting.
export const privateKinds: readonly InteractionKind[] = ["before_after", "word_cloud", "wall", "qa", "choice", "scale", "ranking", "points", "statements", "grid", "sign", "form"];
export const canBePrivate = (kind: InteractionKind) => privateKinds.includes(kind);
export const alwaysPrivate = (kind: InteractionKind) => kind === "form";

export function visibilityOf(step: { interaction: InteractionKind; options?: Record<string, unknown> | null }): Visibility {
  return alwaysPrivate(step.interaction) || step.options?.visibility === "private" ? "private" : "public";
}
export const isPrivateStep = (step: { interaction: InteractionKind; options?: Record<string, unknown> | null } | null | undefined) =>
  Boolean(step) && visibilityOf(step!) === "private";

// Options with the setting applied: Everyone drops the key (the default), Facilitators only stores "private".
export function withVisibility(options: Record<string, unknown> | null | undefined, next: Visibility): Record<string, unknown> {
  const { visibility: _v, ...rest } = options ?? {}; void _v;
  return next === "private" ? { ...rest, visibility: "private" } : rest;
}

// The line the TV and phones show under the question on a private step.
export const privateLine = "Only the facilitators will read what you write.";
export const visibilityLabels: Record<Visibility, string> = { public: "Everyone (TV and phones)", private: "Facilitators only" };
