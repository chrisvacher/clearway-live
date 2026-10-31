import "server-only";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { digest, hash, newCode, newDevice, parseDevice, sessionId } from "@/lib/room/policy";
import { serviceClient } from "@/lib/server/supabase";
import { tvClient } from "./client";
import type { TvBinding } from "./types";

const proofCookie = "cw-tv-device";
async function rpc(action: string, payload: Record<string, unknown>) {
  const { data, error } = await serviceClient().rpc("tv_device", { p_action: action, p: payload });
  if (error) throw new Error("TV connection unavailable"); return data;
}
export async function initialTv() {
  const jar = await cookies();
  if (!jar.getAll().some(c => c.name === "cw-tv" || c.name.startsWith("cw-tv."))) return null;
  try {
    const client = tvClient({ getAll: () => jar.getAll(), setAll: () => {} });
    const { data: { user }, error } = await client.auth.getUser(); if (error || !user) return null;
    const { data, error: denied } = await client.rpc("tv_current"); return denied ? null : data as TvBinding | null;
  } catch { return null; }
}
export async function syncTv(request: NextRequest) {
  const config = authConfig();
  const response = privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
  const answer = (data: unknown, status = 200) => {
    const out = privateResponse(NextResponse.json(data, { status })); for (const c of response.cookies.getAll()) out.cookies.set(c); return out;
  };
  if (!config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret) return response;
  const original = request.cookies.get(proofCookie)?.value;
  const parsed = parseDevice(original), device = parsed || newDevice();
  let previousCode: string | null = null;
  try { const old = JSON.parse(original || "{}"); if (/^\d{6}$/.test(old.code)) previousCode = old.code; } catch { /* New device. */ }
  const code = newCode(), proof = hash(device.secret);
  const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "local";
  const ua = request.headers.get("user-agent") || "";
  const browser = `${/Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser"} on ${/Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "this computer"}`;
  const payload = { device: device.id, proof, code_hash: digest(secret, "tv-pair", code), rate: digest(secret, "tv-init", ip), browser };
  const client = tvClient({ getAll: () => request.cookies.getAll(), setAll: values => {
    for (const { name, value, options } of values) { request.cookies.set(name, value); response.cookies.set(name, value, options); }
  } });
  try {
    const state = await rpc("sync", payload);
    if (["denied", "invalid_request"].includes(state.status)) return answer({ status: "unavailable" }, 403);
    if (state.status === "closed") return answer({status:"closed"});
    if (state.status === "limited") return answer({ status: "limited" }, 429);
    if (state.status === "pair") {
      // The short code is held only in an HttpOnly cookie and displayed on this TV.
      const visible = state.code_hash === payload.code_hash ? code : previousCode && state.code_hash === digest(secret, "tv-pair", previousCode) ? previousCode : null;
      if (!visible) return answer({ status: "opening" });
      response.cookies.set(proofCookie, JSON.stringify({ id: device.id, secret: device.secret, code: visible }), { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge: 31536000 });
      return answer({ status: "pair", code: visible, expires_at: state.expires_at });
    }
    response.cookies.set(proofCookie, JSON.stringify({ id: device.id, secret: device.secret }), { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge: 31536000 });
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const current = await client.rpc("tv_current");
      if (current.error) throw new Error("TV connection unavailable");
      if (current.data?.engagement === state.engagement) {
        const beat = await client.rpc("tv_heartbeat", { p_engagement: current.data.engagement }); if (beat.error || !beat.data) throw new Error("TV connection unavailable");
        return answer(current.data);
      }
    }
    const claim = await rpc("prepare", payload);
    if (claim.status !== "claim") return answer({ status: "opening" });
    try {
      const { data: generated, error } = await serviceClient().auth.admin.generateLink({ type: "magiclink", email: claim.email });
      if (error || !generated.properties?.hashed_token) throw new Error("TV connection unavailable");
      const type = generated.properties.verification_type; if (type !== "magiclink" && type !== "signup") throw new Error("TV connection unavailable");
      // No email is sent. This exchange is allowed only after facilitator approval.
      const { data: verified, error: failed } = await client.auth.verifyOtp({ token_hash: generated.properties.hashed_token, type });
      if (failed || !verified.session || !verified.user) throw new Error("TV connection unavailable");
      const native = sessionId(verified.session.access_token); if (!native) throw new Error("TV connection unavailable");
      const bound = await rpc("bind", { ...payload, claim: claim.claim, user: verified.user.id, session: native });
      if (bound.status !== "paired") throw new Error("TV connection unavailable");
      const current = await client.rpc("tv_current"); if (current.error || !current.data) throw new Error("TV connection unavailable");
      return answer(current.data);
    } catch {
      await client.auth.signOut({ scope: "local" }); await rpc("release", { ...payload, claim: claim.claim }); throw new Error("TV connection unavailable");
    }
  } catch { return answer({ status: "unavailable" }, 503); }
}
