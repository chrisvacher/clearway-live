import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { digest, hash } from "@/lib/room/policy";
import { roomMutation } from "@/lib/live/mutation";
import { isId, phoneIntent, showCode } from "./intent";

// What the server does for the handover and the follow-up that a browser must not: make the
// link and the code, hash them with the service secret, hold the grant in an HttpOnly cookie.
const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export function newFollowupCode() {
  let out = "";
  for (let i = 0; i < 5; i++) out += letters[randomInt(letters.length)];
  for (let i = 0; i < 4; i++) out += String(randomInt(10));
  return out;
}
export const newFollowupToken = () => randomBytes(24).toString("base64url");
export const newGrantSecret = () => randomBytes(32).toString("hex");
const secret = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Server connection unavailable");
  return key;
};
export const tokenHash = (token: string) => hash(token);
export const codeHash = (token: string, code: string) => digest(secret(), "followup-code", hash(token), code);
export const grantHash = (value: string) => hash(`followup-grant:${value}`);
export const grantCookie = (role: "tv" | "remote") => `cw-fu-${role}`;
export const tokenShape = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(value);

export function statusCode(status: unknown) {
  return typeof status !== "string" ? 503 : ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : ["invalid_request", "invalid"].includes(status) ? 422 : status === "limited" ? 429 : 409;
}
export const linkFor = (origin: string, token: string) => `${origin}/f/${token}`;
export { showCode };

// A signed-in phone's intent call: join or leave a card, edit a field, or (for the person who holds
// the remote) a press. The database holds every rule; this checks the shape.
export async function phoneIntentCall(client: SupabaseClient, engagement: string, body: Record<string, unknown> | null) {
  const call = phoneIntent(body);
  if (!call) return { data: { status: "invalid_request" }, status: 422 };
  const { data, error } = await roomMutation(client, engagement, () => client.rpc(call.rpc, { p_engagement: engagement, ...call.args }));
  if (error) throw error;
  return { data, status: statusCode(data.status) };
}
export async function phoneIntentView(client: SupabaseClient, engagement: string) {
  const [view, remote] = await Promise.all([client.rpc("intent_view", { p_engagement: engagement }), client.rpc("team_remote_state", { p_engagement: engagement })]);
  if (view.error || remote.error) throw view.error ?? remote.error;
  return { data: { status: view.data.status === "ok" ? "ok" : view.data.status, view: view.data, remote: remote.data }, status: view.data.status === "ok" ? 200 : 403 };
}
export const wantsId = isId;
export const originOf = (request: NextRequest) => request.nextUrl.origin;
