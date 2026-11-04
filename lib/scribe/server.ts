import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { facilitatorClient } from "@/lib/auth/client";
import { privateResponse } from "@/lib/auth/response";
import { participantClient } from "@/lib/room/client";
import { uuid } from "@/lib/room/identity";
import { limitedJson } from "@/lib/server/request";
import { roomMutation } from "@/lib/live/mutation";
import { fileTypes } from "./policy";
import { scribeBody, type ScribeBody } from "./body";

const statusCode = (status: string) => ["accepted", "duplicate", "ok", "unchanged"].includes(status) ? 200 : status === "denied" ? 403 : status === "not_found" ? 404
  : ["conflict", "team_led", "missing"].includes(status) ? 409 : 422;

// A scribe's call, under the scribe's own room sign-in; the control surface's feed reads under the facilitator's.
export async function scribeRoute(request: NextRequest, engagement: string, run: (client: SupabaseClient, surface: "scribe" | "control", body: ScribeBody | null) => Promise<{ data: unknown; status: number } | null>) {
  const config = authConfig();
  const response = privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
  const answer = (data: unknown, status = 200) => { const out = privateResponse(NextResponse.json(data, { status })); for (const c of response.cookies.getAll()) out.cookies.set(c); return out; };
  if (!config || !uuid(engagement)) return answer({ status: "invalid_request" }, 400);
  if (request.method !== "GET" && !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const surface = request.nextUrl.searchParams.get("surface") === "control" ? "control" : "scribe";
  if (request.method !== "GET" && surface === "control") return answer({ status: "denied" }, 403);
  try {
    const jar = { getAll: () => request.cookies.getAll(), setAll: (values: { name: string; value: string; options: Parameters<typeof response.cookies.set>[2] }[]) => {
      for (const c of values) { request.cookies.set(c.name, c.value); response.cookies.set(c.name, c.value, c.options); }
    } };
    const client = surface === "control" ? facilitatorClient(jar) : participantClient(jar, engagement);
    if (!client) return answer({ status: "denied" }, 403);
    const { data: { session } } = await client.auth.getSession();
    if (!session) return answer({ status: "denied" }, 403);
    let body: ScribeBody | null = null;
    if (request.method === "POST") {
      let raw: Record<string, unknown>;
      try { raw = await limitedJson(request, 16384); } catch { return answer({ status: "invalid_request" }, 422); }
      body = scribeBody(raw); if (!body) return answer({ status: "invalid_request" }, 422);
    }
    const out = await run(client, surface, body);
    return out ? answer(out.data, out.status) : response;
  } catch (error) {
    console.error("Scribe request unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return response;
  }
}

export async function readScribeState(client: SupabaseClient, engagement: string) {
  const { data, error } = await client.rpc("scribe_state", { p_engagement: engagement });
  if (error) throw error;
  return { data, status: data.status === "ok" ? 200 : data.status === "denied" ? 403 : 404 };
}

export async function writeScribe(client: SupabaseClient, engagement: string, body: ScribeBody) {
  const call = <T extends { error: { code?: string; message?: string } | null; data: { status: string } | null }>(write: () => PromiseLike<T>) => roomMutation(client, engagement, write);
  if (body.action === "capture") {
    const { data, error } = await call(() => client.rpc("scribe_capture", { p_engagement: engagement, p_id: body.id, p_session: body.session, p_kind: body.kind, p_text: body.text, p_detail: body.detail,
      p_speaker: body.speaker || null, p_captured: body.capturedAt, p_queued: body.queuedAt }));
    if (error) throw error;
    return { data, status: statusCode(data.status) };
  }
  if (body.action === "edit") {
    const { data, error } = await call(() => client.rpc("scribe_edit", { p_engagement: engagement, p_id: body.id, p_text: body.text, p_detail: body.detail, p_speaker: body.speaker || null, p_revision: body.revision }));
    if (error) throw error;
    return { data, status: statusCode(data.status) };
  }
  if (body.action === "refile") {
    const { data, error } = await call(() => client.rpc("scribe_refile", { p_engagement: engagement, p_id: body.id, p_session: body.session }));
    if (error) throw error;
    return { data, status: statusCode(data.status) };
  }
  if (body.action === "file_done") {
    const { data, error } = await call(() => client.rpc("scribe_file_done", { p_engagement: engagement, p_id: body.id }));
    if (error) throw error;
    return { data, status: statusCode(data.status) };
  }
  // file_begin: the row first, then a signed address to put the bytes at. The scribe's own session
  // is what Storage checks, against the bucket's policies.
  const { data, error } = await call(() => client.rpc("scribe_file_begin", { p_engagement: engagement, p_id: body.id, p_session: body.session, p_kind: body.fileKind, p_name: body.name,
    p_type: body.contentType, p_bytes: body.bytes, p_captured: body.capturedAt, p_queued: body.queuedAt }));
  if (error) throw error;
  if (!["accepted", "duplicate"].includes(data.status) || data.uploaded) return { data: { status: data.status, uploaded: Boolean(data.uploaded) }, status: statusCode(data.status) };
  const config = authConfig();
  const signed = await client.storage.from("scribe").createSignedUploadUrl(data.path, { upsert: true });
  if (signed.error || !signed.data || !config) throw new Error("Upload address unavailable");
  return { data: { status: data.status, uploaded: false, upload: { url: signed.data.signedUrl, key: config.key } }, status: 200 };
}

// The bytes of a file, served under the caller's own session so the bucket's policies apply.
export async function fileResponse(request: NextRequest, engagement: string, file: string) {
  const config = authConfig();
  const denied = (status: number) => privateResponse(NextResponse.json({ status: "denied" }, { status }));
  if (!config || !uuid(engagement) || !uuid(file)) return denied(404);
  const surface = request.nextUrl.searchParams.get("surface") === "control" ? "control" : "scribe";
  const jar = { getAll: () => request.cookies.getAll(), setAll: () => { /* Cookies are refreshed by the state read. */ } };
  const client = surface === "control" ? facilitatorClient(jar) : participantClient(jar, engagement);
  if (!client) return denied(403);
  try {
    const { data: where, error } = await client.rpc("scribe_file_read", { p_engagement: engagement, p_id: file });
    if (error) throw error;
    if (where.status !== "ok") return denied(where.status === "denied" ? 403 : 404);
    const blob = await client.storage.from("scribe").download(where.path);
    if (blob.error || !blob.data) return denied(404);
    const type = String(where.content_type);
    const image = type.startsWith("image/");
    const out = new NextResponse(blob.data.stream(), { status: 200 });
    out.headers.set("Content-Type", fileTypes[type] ? type : "application/octet-stream");
    out.headers.set("Content-Disposition", `${image ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(String(where.name))}`);
    out.headers.set("Cache-Control", "private, max-age=300");
    out.headers.set("X-Content-Type-Options", "nosniff");
    out.headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
    return out;
  } catch (error) {
    console.error("Scribe file unavailable", { code: typeof error === "object" && error && "code" in error ? error.code : "request_failed" });
    return privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
  }
}
