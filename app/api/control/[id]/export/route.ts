import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { privateResponse } from "@/lib/auth/response";
import { uuid } from "@/lib/room/identity";
import { allSessionsCsv, csvName, sessionCsv, type SessionExport } from "@/lib/export/csv";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));

// Facilitator-only: one session's input as CSV, or every reached session's (?session=all).
// The database decides who may export and which rows carry names.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const session = request.nextUrl.searchParams.get("session");
  if (session !== "all" && !uuid(session)) return answer({ status: "invalid_request" }, 422);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const { client } = fac;
  const read = async (sid: string) => {
    const { data, error } = await client.rpc("session_export", { p_engagement: id, p_session: sid });
    if (error) throw error;
    return data as SessionExport | { status: string };
  };
  try {
    let body: string, name: string;
    if (session === "all") {
      const { data, error } = await client.rpc("results_recap", { p_engagement: id });
      if (error) throw error;
      if (data.status !== "ok") return answer({ status: data.status }, 403);
      const list: SessionExport[] = [];
      for (const entry of data.sessions as { session: { id: string } }[]) { const out = await read(entry.session.id); if (out.status === "ok") list.push(out as SessionExport); }
      body = allSessionsCsv(list); name = csvName(list[0]?.church ?? "", list[0]?.engagement ?? "", "all answers");
    } else {
      const out = await read(session as string);
      if (out.status !== "ok") return answer({ status: out.status }, out.status === "denied" ? 403 : 404);
      const data = out as SessionExport;
      body = sessionCsv(data); name = csvName(data.church ?? "", data.session.title);
    }
    return privateResponse(new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } }));
  } catch (error) {
    console.error("Export unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}
