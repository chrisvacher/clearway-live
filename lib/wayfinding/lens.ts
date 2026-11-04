// The Five Lenses (PRD "The Five Lenses"). They describe the 10-year Future in the present
// tense. The names come from the engagement; these are the defaults when it sends none.
export const lensNumbers = [1, 2, 3, 4, 5] as const;
export type LensNumber = typeof lensNumbers[number];
export const defaultLensNames = ["Congregation", "Community", "Leadership", "Operations", "Learning"] as const;
export const isLens = (value: unknown): value is LensNumber => typeof value === "number" && (lensNumbers as readonly number[]).includes(value);

export function lensName(lens: LensNumber, names?: readonly string[] | null): string {
  const named = names?.[lens - 1];
  return typeof named === "string" && named.trim() ? named.trim() : defaultLensNames[lens - 1];
}
