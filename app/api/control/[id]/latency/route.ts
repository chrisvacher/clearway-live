import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/identity";
import { reportWindow } from "@/lib/latency/report";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Facilitator-only: the latency log's percentiles for a window (load test and acceptance).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const window = reportWindow(request.nextUrl.searchParams.get("from"), request.nextUrl.searchParams.get("to"));
  const { data, error } = await fac.client.rpc("latency_report", { p_engagement: id, p_from: window.from, p_to: window.to });
  if (error) { console.error("Latency report unavailable", { code: error.code }); return answer({ status: "unavailable" }, 503); }
  return answer(data, data.status === "ok" ? 200 : 403);
}
