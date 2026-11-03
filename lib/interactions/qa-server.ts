import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { participantClient } from "@/lib/room/client";
import { uuid } from "@/lib/room/identity";
import { limitedJson } from "@/lib/server/request";
import { roomMutation } from "@/lib/live/mutation";
import { askBody, outboxStatus, voteBody } from "./qa";
import { kickAi } from "@/lib/ai/trigger";

// A phone's Q&A calls (Ask any time, votes, its own votes), under its own room sign-in.
// Every rule is the database's; this only checks the shape and carries the session cookies.
export async function phoneQa(request: NextRequest, engagement: string, run: (client: SupabaseClient, body: Record<string, unknown> | null) => Promise<{ data: unknown; status: number } | null>) {
  const config = authConfig();
  const response = privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
  const answer = (data: unknown, status = 200) => { const out = privateResponse(NextResponse.json(data, { status })); for (const c of response.cookies.getAll()) out.cookies.set(c); return out; };
  if (!config || !uuid(engagement)) return answer({ status: "invalid_request" }, 400);
  if (request.method !== "GET" && !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  try {
    const client = participantClient({ getAll: () => request.cookies.getAll(), setAll: values => { for (const c of values) { request.cookies.set(c.name, c.value); response.cookies.set(c.name, c.value, c.options); } } }, engagement);
    const { data: { session } } = await client.auth.getSession();
    if (!session) return answer({ status: "denied" }, 403);
    let body: Record<string, unknown> | null = null;
    if (request.method === "POST") { try { body = await limitedJson(request, 4096); } catch { return answer({ status: "invalid_request" }, 422); } }
    const out = await run(client, body);
    return out ? answer(out.data, out.status) : response;
  } catch (error) {
    console.error("Q&A request unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return response;
  }
}
const statusCode = (status: string) => ["accepted", "duplicate", "ok"].includes(status) ? 200 : status === "denied" ? 403 : ["closed", "conflict"].includes(status) ? 409 : 422;

export async function askAnyTime(client: SupabaseClient, engagement: string, raw: Record<string, unknown> | null) {
  const input = askBody(raw);
  if (!input) return { data: { status: "invalid_request" }, status: 422 };
  const { data, error } = await roomMutation(client, engagement, () => client.rpc("qa_ask", { p_engagement: engagement, p_id: input.id, p_text: input.text, p_sent: input.sentAt, p_queued: input.queuedAt, p_uncertainty: input.uncertaintyMs }));
  if (error) throw error;
  if (data.status === "accepted" && typeof data.session === "string") kickAi(engagement, data.session);
  return { data, status: statusCode(data.status) };
}
export async function castVote(client: SupabaseClient, engagement: string, raw: Record<string, unknown> | null) {
  const input = voteBody(raw);
  if (!input) return { data: { status: "invalid_request" }, status: 422 };
  const { data, error } = await roomMutation(client, engagement, () => client.rpc("qa_vote", { p_engagement: engagement, p_id: input.id, p_question: input.question, p_revision: input.revision,
    p_on: input.on, p_sent: input.sentAt, p_queued: input.queuedAt, p_uncertainty: input.uncertaintyMs }));
  if (error) throw error;
  const status = outboxStatus(data.status);
  return { data: { ...data, status, reason: data.status }, status: statusCode(status) };
}
export async function myVotes(client: SupabaseClient, engagement: string) {
  const { data, error } = await client.rpc("qa_my_votes", { p_engagement: engagement });
  if (error) throw error;
  return { data, status: data.status === "ok" ? 200 : 403 };
}
