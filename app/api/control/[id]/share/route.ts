import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { freshToken, tokenHash } from "@/lib/read-only/server";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const code = (status: unknown) => status === "ok" || status === "already" ? 200 : status === "denied" ? 403 : status === "invalid_request" ? 422 : status === "not_found" ? 404 : 409;

// Facilitator only. GET reads the Share page's state. POST makes a link (the token comes back once, here, and is never stored), turns one off,
// marks the retreat closed or undoes the mark. Every rule is in the database function the call reaches.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("share_state", { p_engagement: id });
  if (error) { console.error("Share unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, code(data.status));
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
        if (typeof body.name !== "string") return answer({ status: "invalid_request" }, 422);
        const token = freshToken();
        const { data, error } = await fac.client.rpc("share_link_create", { p_engagement: id, p_name: body.name, p_hash: tokenHash(token) });
        if (error) throw error;
        // Wayfinding only: a Novetera workshop has no shared results page (/v/), so this link stays on live.clearway.co (APP_ORIGIN) for every engagement.
        return answer(data.status === "ok" ? { status: "ok", id: data.id, link: `${config.origin}/v/${token}` } : data, code(data.status));
      }
      case "revoke": {
        if (!uuid(body.link)) return answer({ status: "invalid_request" }, 422);
        const { data, error } = await fac.client.rpc("share_link_revoke", { p_engagement: id, p_link: body.link });
        if (error) throw error;
        return answer(data, code(data.status));
      }
      case "mark_closed": case "reopen": {
        const { data, error } = await fac.client.rpc(body.action === "mark_closed" ? "retreat_mark_closed" : "retreat_reopen", { p_engagement: id });
        if (error) throw error;
        return answer(data, code(data.status));
      }
      default: return answer({ status: "invalid_request" }, 422);
    }
  } catch (error) { console.error("Share action failed", { code: (error as { code?: string })?.code }); return answer({ status: "unavailable" }, 503); }
}
