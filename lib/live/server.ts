import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { tvClient } from "@/lib/tv/client";
import { facilitatorClient } from "@/lib/auth/client";
import { privateResponse } from "@/lib/auth/response";
import { participantClient } from "@/lib/room/client";
import { uuid } from "@/lib/room/policy";
import { limitedJson } from "@/lib/server/request";
import { submissionRequest } from "./protocol";
import type { LiveSnapshot } from "./types";
import { roomMutation } from "./mutation";

export async function handleLive(request: NextRequest, engagement: string) {
  const config = authConfig();
  const response = privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
  const result = (body: unknown, status = 200) => {
    const out = privateResponse(NextResponse.json(body, { status }));
    for (const cookie of response.cookies.getAll()) out.cookies.set(cookie);
    return out;
  };
  if (!config || !uuid(engagement)) return result({ status: "invalid_request" }, 400);
  if (request.method !== "GET" && !sameOrigin(request, config.origin)) return result({ status: "denied" }, 403);
  const surface = request.nextUrl.searchParams.get("surface") || "phone";
  if (!["phone", "control", "tv"].includes(surface) || (request.method === "POST" && surface !== "phone")) return result({ status: "denied" }, 403);
  const jar = { getAll: () => request.cookies.getAll(), setAll: (values: { name: string; value: string; options: Parameters<typeof response.cookies.set>[2] }[]) => {
    for (const { name, value, options } of values) { request.cookies.set(name, value); response.cookies.set(name, value, options); }
  } };
  const client = surface === "control" ? facilitatorClient(jar) : surface === "tv"
    ? tvClient(jar)
    : participantClient(jar, engagement);
  if (!client) return result({ status: "denied" }, 403);
  try {
    // Presence is only an early unsigned-request guard. Database RPCs still check
    // the current native session and role; getSession is never authorization.
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (sessionError || !session) return result({ status: "denied" }, 403);
    if (request.method === "POST") {
      let body: Record<string, unknown>;
      try { body = await limitedJson(request); } catch { return result({ status: "invalid_request" }, 422); }
      const input = submissionRequest(body);
      if (!input) return result({ status: "invalid_request" }, 422);
      const { data, error } = await roomMutation(client, engagement, () => client.rpc("live_submit", { p_engagement: engagement, p_id: input.id, p_session: input.session, p_revision: input.revision,
        p_action: input.action, p_text: input.text, p_sent: input.sentAt, p_queued: input.queuedAt || null, p_uncertainty: input.uncertaintyMs || 0 }));
      if (error) throw error;
      return result(data, ["accepted", "duplicate"].includes(data.status) ? 200 : data.status === "denied" ? 403 : ["closed", "conflict"].includes(data.status) ? 409 : 422);
    }
    // Every page uses the same room version. Restart if a concurrent commit moved it.
    // No partial response, no 1,000-row truncation and no mix of different versions.
    for (let attempt = 0; attempt < 3; attempt++) {
      let page: string | null = null, version: number | null = null, snapshot: LiveSnapshot | null = null;
      let changed = false;
      do {
        const { data, error } = await client.rpc("live_snapshot", { p_engagement: engagement, p_after: page, p_version: version });
        if (error) throw error;
        if (data.status === "changed") { changed = true; break; }
        if (data.status !== "ok") return result(data, data.status === "denied" ? 403 : 404);
        const next = data as LiveSnapshot;
        const expected = surface === "control" ? "facilitator" : surface === "phone" ? "participant" : "tv";
        if (next.role !== expected) return result({ status: "denied" }, 403);
        if (!snapshot) snapshot = { ...next, answers: [] };
        snapshot.answers.push(...next.answers);
        version = next.version;
        if (next.next && next.next === page) throw new Error("Repeated page");
        page = next.next;
      } while (page);
      if (changed || !snapshot) continue;
      snapshot.next = null;
      if (request.nextUrl.searchParams.get("transport") === "1") {
        // The caller's own current token is kept in browser memory for receive-only
        // Realtime. Authorization was performed above by native Auth-bound RLS.
        return result({ ...snapshot, connection: { url: config.url, key: config.key, token: session.access_token } });
      }
      return result(snapshot);
    }
    return result({ status: "changed" }, 409);
  } catch (error) {
    console.error("Live room request unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return response;
  }
}
