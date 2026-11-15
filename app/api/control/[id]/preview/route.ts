import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/identity";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Facilitator-only: one step of the run of show as the TV would draw it, for the live room's preview screen.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, session = request.nextUrl.searchParams.get("session");
  if (!uuid(id) || !uuid(session)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("session_preview", { p_engagement: id, p_session: session });
  if (error) { console.error("Session preview unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data.status === "ok" ? 200 : data.status === "missing" ? 404 : 403);
}
