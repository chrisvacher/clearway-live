import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/identity";
import { csvName } from "@/lib/export/csv";
import { fourListsCsv } from "@/lib/export/four-lists-csv";
import type { FourReview } from "@/lib/interactions/four-lists";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Facilitator-only: the Four Helpful Lists review as CSV, every card of the engagement's steps. The database decides who may read it.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  try {
    const { data, error } = await fac.client.rpc("four_lists_review", { p_engagement: id });
    if (error) throw error;
    if (data.status !== "ok") return answer({ status: data.status }, data.status === "denied" ? 403 : 404);
    const review = data as FourReview;
    return privateResponse(new NextResponse(fourListsCsv(review), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${csvName(review.engagement.title, "four helpful lists")}"` } }));
  } catch (error) {
    console.error("Four Helpful Lists export unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}
