import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { sendEmail } from "@/lib/server/email";
import { codeHash, linkFor, newFollowupCode, newFollowupToken, showCode, statusCode, tokenHash } from "@/lib/interactions/intent-server";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// The follow-up link and code, from the lead facilitator only. The server makes both, hands the
// database their hashes, and shows them once. The link goes by email; the code is told in person.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: Record<string, unknown>;
  try { body = await limitedJson(request); } catch { return answer({ status: "invalid_request" }, 422); }
  const action = body.action;
  if (typeof action !== "string" || !["status", "issue", "extend", "reissue", "revoke"].includes(action)) return answer({ status: "invalid_request" }, 422);
  try {
    let p: Record<string, unknown> = {}, token = "", code = "";
    if (action === "issue" || action === "reissue") {
      token = newFollowupToken(); code = newFollowupCode();
      p = { token_hash: tokenHash(token), code_hash: codeHash(token, code) };
      if (action === "issue") {
        if (!uuid(body.attendee) || !Array.isArray(body.sessions) || !body.sessions.every(uuid) || typeof body.opens_at !== "string" || typeof body.closes_at !== "string") return answer({ status: "invalid_request" }, 422);
        p = { ...p, attendee: body.attendee, sessions: body.sessions, opens_at: body.opens_at, closes_at: body.closes_at };
      }
    }
    const { data, error } = await fac.client.rpc("followup_manage", { p_engagement: id, p_action: action, p });
    if (error) throw error;
    if (data.status !== "ok" || !token) return answer(data, statusCode(data.status));
    const link = linkFor(config.origin, token);
    let emailed = false;
    const to = typeof data.email === "string" ? data.email : "";
    if (to) {
      try {
        await sendEmail({ to, id: `followup-${token.slice(0, 16)}`, subject: "Your follow-up link for the retreat",
          text: `Hi ${data.first ?? "there"},\n\nThis link opens your follow-up. You will pair the shared TV view and take the remote from it. It works only for the follow-up block, from ${data.opens_at} until ${data.closes_at}.\n\n${link}\n\nYour facilitator will tell you the code that goes with it.\n` });
        emailed = true;
      } catch { emailed = false; }
    }
    return answer({ status: "ok", link, code: showCode(code), emailed, first: data.first, opens_at: data.opens_at, closes_at: data.closes_at });
  } catch { return answer({ status: "unavailable" }, 503); }
}
