import type { NextRequest } from "next/server";
import { phoneQa } from "@/lib/interactions/qa-server";
import { uuid } from "@/lib/room/identity";

export const dynamic = "force-dynamic";
// INT-11 on a phone: everyone's cards for the step, the count on each, and which ones this person wrote or agreed with.
// No name and no author id. The database decides what a phone may read.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, session = request.nextUrl.searchParams.get("session");
  return phoneQa(request, id, async client => {
    if (!uuid(session)) return { data: { status: "invalid_request" }, status: 422 };
    const { data, error } = await client.rpc("four_lists_read", { p_engagement: id, p_session: session });
    if (error) throw error;
    return { data, status: data.status === "ok" ? 200 : data.status === "denied" ? 403 : 404 };
  });
}
