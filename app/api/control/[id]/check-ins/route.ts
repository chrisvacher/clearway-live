import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { serviceClient } from "@/lib/server/supabase";
import { uuid } from "@/lib/room/identity";
import { freshToken, sendRound, tokenHash } from "@/lib/check-ins/server";
import { resultsCsv, today, type CheckInState } from "@/lib/check-ins/policy";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const code = (status: unknown) => status === "ok" || status === "unchanged" ? 200 : status === "denied" ? 403 : status === "invalid_request" ? 422 : status === "not_found" ? 404 : 409;

// Facilitator only. GET reads the results (or the CSV). POST makes the rounds, switches them on or off, sends one now,
// marks a follow-up and opens a practice address's phone page. Every rule is in the database function the call reaches.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("check_in_state", { p_engagement: id });
  if (error) { console.error("Check-ins unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  if (data.status !== "ok") return answer(data, code(data.status));
  if (request.nextUrl.searchParams.get("format") === "csv") {
    return privateResponse(new NextResponse(resultsCsv((data as CheckInState).rounds), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="check-ins.csv"' } }));
  }
  return answer(data);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: Record<string, unknown>;
  try { body = await limitedJson(request); } catch { return answer({ status: "invalid_request" }, 422); }
  try {
    switch (body.action) {
      case "create": {
        const base = typeof body.base === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.base) ? body.base : null;
        const { data, error } = await fac.client.rpc("check_in_create", { p_engagement: id, p_base: base });
        if (error) throw error;
        return answer(data, code(data.status));
      }
      case "switch": {
        if (typeof body.on !== "boolean") return answer({ status: "invalid_request" }, 422);
        const { data, error } = await fac.client.rpc("check_in_switch", { p_engagement: id, p_on: body.on });
        if (error) throw error;
        return answer(data, code(data.status));
      }
      case "follow_up": {
        if (!uuid(body.answer) || typeof body.done !== "boolean") return answer({ status: "invalid_request" }, 422);
        const { data, error } = await fac.client.rpc("check_in_follow_up", { p_engagement: id, p_answer: body.answer, p_done: body.done });
        if (error) throw error;
        return answer(data, code(data.status));
      }
      case "send": {
        if (!uuid(body.round)) return answer({ status: "invalid_request" }, 422);
        const guard = await fac.client.rpc("check_in_send_guard", { p_engagement: id, p_round: body.round });
        if (guard.error) throw guard.error;
        if (guard.data.status !== "ok") return answer(guard.data, code(guard.data.status));
        const sent = await sendRound(serviceClient(), body.round, String(guard.data.by ?? "schedule"), today(), true);
        return answer(sent.status === "ok" ? { status: "ok", sent: sent.sent, practice: sent.practice, failed: sent.failed } : { status: sent.status }, code(sent.status));
      }
      case "open_as": {
        if (!uuid(body.recipient)) return answer({ status: "invalid_request" }, 422);
        const token = freshToken();
        const { data, error } = await fac.client.rpc("check_in_open_as", { p_engagement: id, p_recipient: body.recipient, p_hash: tokenHash(token) });
        if (error) throw error;
        // Wayfinding only: a Novetera workshop has no check-in (/c/), so this link stays on live.clearway.co (APP_ORIGIN) for every engagement.
        return answer(data.status === "ok" ? { status: "ok", link: `${config.origin}/c/${token}` } : data, code(data.status));
      }
      default: return answer({ status: "invalid_request" }, 422);
    }
  } catch (error) { console.error("Check-ins action failed", { code: (error as { code?: string })?.code }); return answer({ status: "unavailable" }, 503); }
}
