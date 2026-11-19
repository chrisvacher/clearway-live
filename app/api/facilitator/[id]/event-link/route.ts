import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/policy";

// An event's admin link (November 19): read it, make it, or replace it with a new code. People only; the database refuses a
// link guest and anyone who doesn't facilitate the event.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const config = authConfig(); if (!config || !sameOrigin(request, config.origin)) return privateResponse(NextResponse.json({ ok: false }, { status: 403 }));
  const facilitator = await getFacilitator(); if (!facilitator) return privateResponse(NextResponse.json({ ok: false }, { status: 401 }));
  const { id } = await params; if (!uuid(id)) return privateResponse(NextResponse.json({ ok: false }, { status: 400 }));
  if (facilitator.profile.kind !== "person") return privateResponse(NextResponse.json({ ok: false }, { status: 403 }));
  try {
    const body = await limitedJson(request);
    const action = typeof body.action === "string" && ["read", "create", "cycle"].includes(body.action) ? body.action : null;
    if (!action) return privateResponse(NextResponse.json({ ok: false }, { status: 400 }));
    const { data, error } = await facilitator.client.rpc("event_link", { p_engagement: id, p_action: action });
    if (error || data?.status !== "ok") return privateResponse(NextResponse.json({ ok: false }, { status: data?.status === "denied" ? 403 : 400 }));
    return privateResponse(NextResponse.json({ ok: true, code: data.code ?? null, url: data.code ? `${config.origin}/a/${data.code}` : null }));
  } catch { return privateResponse(NextResponse.json({ ok: false }, { status: 400 })); }
}
