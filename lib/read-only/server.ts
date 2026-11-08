import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hash } from "@/lib/room/policy";
import type { RoAnswer } from "./policy";

// A link's token is 24 random bytes. Only its SHA-256 reaches the database.
export const freshToken = () => randomBytes(24).toString("base64url");
export const tokenHash = (token: string) => hash(token);

// The public page's one read, by the token's hash. Anything but a good link is the same plain answer.
export async function readView(client: SupabaseClient, token: string): Promise<RoAnswer> {
  const { data, error } = await client.rpc("read_only_view", { p_hash: tokenHash(token) });
  if (error) throw error;
  return (data?.status === "ok" ? data : { status: "unavailable" }) as RoAnswer;
}
