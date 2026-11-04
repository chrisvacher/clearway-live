import { NextResponse, type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/identity";
import { overnightBody } from "@/lib/overnight/body";
import { kickOvernight } from "@/lib/ai/trigger";

export const dynamic = "force-dynamic";
// The overnight draft runs after the response that starts it and may take a while.
export const maxDuration = 300;
const answer = (data: unknown, status = 200) => privateResponse(NextResponse.json(data, { status }));
const code = (status: string) => ["ok", "duplicate", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "not_found" || status === "none" ? 404
  : ["invalid_request", "invalid_text"].includes(status) ? 422 : 409;

// The overnight review: facilitators of this engagement only. The state holds the drafts, their sources, who
// is where and who holds a lock. Speaker names come from the scribe's own record and ride along only here.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!uuid(id)) return answer({ status: "missing" }, 404);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  const url = request.nextUrl.searchParams;
  try {
    if (url.get("summary")) {
      const { data, error } = await fac.client.rpc("overnight_summary", { p_engagement: id });
      if (error) throw error;
      kickOvernight(id);
      return answer(data, data.status === "denied" ? 403 : 200);
    }
    const version = url.get("versions");
    if (version) {
      if (!uuid(version)) return answer({ status: "invalid_request" }, 422);
      const { data, error } = await fac.client.rpc("overnight_versions", { p_engagement: id, p_outcome: version });
      if (error) throw error;
      return answer(data, code(data.status));
    }
    if (url.get("published")) {
      const { data, error } = await fac.client.rpc("overnight_published", { p_engagement: id });
      if (error) throw error;
      return answer(data, code(data.status));
    }
    const { data, error } = await fac.client.rpc("overnight_state", { p_engagement: id });
    if (error) throw error;
    if (data.status !== "ok") return answer(data, data.status === "denied" ? 403 : 200);
    kickOvernight(id);
    const speakers = await fac.client.rpc("scribe_speakers", { p_engagement: id });
    return answer({ ...data, speakers: speakers.data?.status === "ok" ? speakers.data.speakers : {} });
  } catch (error) {
    console.error("Overnight review unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}

// Every change is one call, checked again by the database: who, which draft, its revision, who holds the lock.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, config = authConfig();
  if (!uuid(id) || !config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const fac = await getFacilitator(); if (!fac) return answer({ status: "denied" }, 401);
  let body: ReturnType<typeof overnightBody>;
  try { body = overnightBody(await limitedJson(request, 32768)); } catch { body = null; }
  if (!body) return answer({ status: "invalid_request" }, 422);
  const db = fac.client, e = { p_engagement: id };
  try {
    const call = async () => {
      switch (body.action) {
        case "presence": return db.rpc("overnight_presence", { ...e, p_place: body.place, p_editing: body.editing });
        case "edit": return db.rpc("overnight_edit", { ...e, p_outcome: body.outcome, p_revision: body.revision, p: { bullets: body.bullets } });
        case "restore_words": return db.rpc("overnight_restore_words", { ...e, p_outcome: body.outcome, p_bullet: body.bullet, p_revision: body.revision });
        case "remove": return db.rpc("overnight_remove", { ...e, p_outcome: body.outcome, p_bullet: body.bullet, p_removed: body.removed, p_revision: body.revision });
        case "source": return db.rpc("overnight_source", { ...e, p_outcome: body.outcome, p_bullet: body.bullet, p_kind: body.kind, p_ref: body.ref, p_add: body.add, p_revision: body.revision });
        case "add_room_bullet": return db.rpc("overnight_add_room_bullet", { ...e, p_outcome: body.outcome, p_indicator: body.indicator, p_revision: body.revision });
        case "accept": return db.rpc("overnight_accept", { ...e, p_outcome: body.outcome, p_revision: body.revision });
        case "ack_thin": return db.rpc("overnight_ack_thin", { ...e, p_outcome: body.outcome, p_value: body.value });
        case "restore_version": return db.rpc("overnight_restore_version", { ...e, p_outcome: body.outcome, p_version: body.version, p_revision: body.revision });
        case "photo_text": return db.rpc("overnight_photo_text", { ...e, p_file: body.file, p_text: body.text });
        case "start": return db.rpc("overnight_start", e);
        case "by_hand": return db.rpc("overnight_by_hand", e);
        case "publish": return db.rpc("overnight_publish", { ...e, p_id: body.id });
        case "unpublish": return db.rpc("overnight_unpublish", e);
      }
    };
    const { data, error } = await call();
    if (error) throw error;
    // Starting (or asking for another try) runs the draft after this response.
    if (body.action === "start" && data.status === "ok") kickOvernight(id, true);
    return answer(data, code(String(data.status)));
  } catch (error) {
    console.error("Overnight review unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return answer({ status: "unavailable" }, 503);
  }
}
