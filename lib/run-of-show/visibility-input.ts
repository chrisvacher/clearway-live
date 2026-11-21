import { uuid } from "@/lib/room/identity";
import type { Visibility } from "@/lib/interactions/visibility";
export function visibilityInput(input: unknown): { session: string; visibility: Visibility } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose who sees answers.");
  const v = input as Record<string, unknown>;
  if (Object.keys(v).some(key => !["session", "visibility"].includes(key)) || !uuid(v.session) || (v.visibility !== "public" && v.visibility !== "private")) throw new Error("Choose who sees answers.");
  return { session: v.session as string, visibility: v.visibility as Visibility };
}
