import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/identity";
import { mapMarkdown, type MapDraft } from "@/lib/wayfinding/map";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Facilitator-only: the draft Clearway Map, as JSON or (with ?format=md) a text download.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("map_draft_read", { p_engagement: id });
  if (error) { console.error("Draft Map unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  if (data?.status !== "ok") return answer(data, data?.status === "denied" ? 403 : 404);
  if (request.nextUrl.searchParams.get("format") === "md") {
    return privateResponse(new NextResponse(mapMarkdown(data as MapDraft), { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": 'attachment; filename="clearway-map-draft.md"' } }));
  }
  return answer(data);
}
