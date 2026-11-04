import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/identity";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// How many sentences are waiting per lens. Numbers only: the words stay hidden until each lens opens.
// Facilitator only.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { data, error } = await fac.client.rpc("lens_seed_counts", { p_engagement: id });
  if (error) { console.error("Lens counts unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data?.status === "ok" ? 200 : 403);
}
