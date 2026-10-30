import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { serviceClient } from "@/lib/server/supabase";
import { sendEmail } from "@/lib/server/email";
import { limitedJson } from "@/lib/server/request";
import { digest, hash, newCode, newDevice, newLink, normalizedEmail, parseDevice, sessionId, uuid } from "./policy";
import { hasRoomCookie, participantClient } from "./client";
import type { RoomAccessStatus } from "./access";

export type RoomInfo = { id: string; title: string; type: string; church: string; closed: boolean; howTheRoomDecides: string; neutral: boolean };
export async function roomInfo(id: string): Promise<RoomInfo | null> {
  if (!uuid(id)) return null;
  const { data, error } = await serviceClient().rpc("room_public_info", { p_engagement: id });
  if (error) throw new Error("Room connection unavailable");
  if (!data) return null;
  return data as RoomInfo;
}
const deviceCookie = (engagement: string) => `cw-device-${engagement}`;
export function roomClient(request: NextRequest, response: NextResponse, engagement: string) {
  return participantClient({
      getAll: () => request.cookies.getAll(),
      setAll: values => { for (const { name, value, options } of values) { request.cookies.set(name, value); response.cookies.set(name, value, options); } },
  },engagement);
}
export async function roomRpc(action: string, payload: Record<string, unknown>) {
  const { data, error } = await serviceClient().rpc("room_auth", { p_action: action, p: payload });
  if (error) throw new Error("Room connection unavailable");
  return data as Record<string, unknown>;
}
function rateKeys(request: NextRequest, engagement: string, device: string, email: string, action: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;
  // On Vercel this header is overwritten by the platform, not trusted from an arbitrary proxy header.
  const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "local";
  return { rate_email: digest(secret, "rate", action, engagement, email),
    rate_device: digest(secret, "rate", action, engagement, device), rate_ip: digest(secret, "rate", action, engagement, ip) };
}
async function completeClaim(request: NextRequest, response: NextResponse, payload: Record<string, unknown>, engagement: string) {
  const claim = await roomRpc("prepare_claim", payload);
  if (claim.status !== "claim") return { status: "waiting" };
  const client = roomClient(request, response, engagement);
  try {
    // Only an atomically verified code/link or a facilitator's device approval reaches here.
    // generateLink sends no email. Its token is immediately exchanged on the server.
    const { data: generated, error } = await serviceClient().auth.admin.generateLink({ type: "magiclink", email: claim.email as string });
    if (error || !generated.properties?.hashed_token) throw new Error("Sign-in unavailable");
    const type = generated.properties.verification_type;
    if (type !== "magiclink" && type !== "signup") throw new Error("Sign-in unavailable");
    const { data: verified, error: failed } = await client.auth.verifyOtp({ token_hash: generated.properties.hashed_token, type });
    if (failed || !verified.session || !verified.user) throw new Error("Sign-in unavailable");
    const session = sessionId(verified.session.access_token);
    if (!session) throw new Error("Sign-in unavailable");
    const bound = await roomRpc("bind", { ...payload, claim: claim.claim, user: verified.user.id, session });
    if (bound.status !== "signed_in") throw new Error("Sign-in unavailable");
    const attendee=await currentAttendee(client,engagement);
    if(!attendee||attendee.id!==claim.attendee)throw new Error("Sign-in unavailable");
    return { status: "signed_in",name:attendee.name as string,role:attendee.room_role as string };
  } catch {
    await client.auth.signOut({ scope: "local" });
    await roomRpc("release_claim", { ...payload, claim: claim.claim });
    return { status: "unavailable" };
  }
}
async function currentAttendee(client:ReturnType<typeof participantClient>,engagement:string){
  const { data: { user }, error } = await client.auth.getUser();
  if(error&&(!error.status||error.status>=500))throw new Error("Room connection unavailable");
  if(error||!user)return null;
  const { data: attendee,error:denied } = await client.from("attendees").select("id,name,room_role").eq("engagement_id", engagement).eq("auth_user_id", user.id).eq("deleted", false).maybeSingle();
  if(denied)throw new Error("Room connection unavailable");
  return attendee;
}
export async function initialRoomAccess(engagement:string):Promise<RoomAccessStatus>{
  const jar=await cookies();
  if(!hasRoomCookie(jar,engagement))return {status:"ready"};
  try{
    // Middleware persists refreshed cookies. This read uses native Auth and RLS,
    // and never creates a device, exchanges a proof or records presence on GET.
    const attendee=await currentAttendee(participantClient({getAll:()=>jar.getAll(),setAll:()=>{}},engagement),engagement);
    return attendee?{status:"signed_in",name:attendee.name,role:attendee.room_role}:{status:"ready"};
  }catch{return {status:"loading"};}
}
async function signedIn(request: NextRequest, response: NextResponse, engagement: string) {
  if(!hasRoomCookie(request.cookies,engagement))return null;
  const client = roomClient(request, response, engagement);
  const attendee=await currentAttendee(client,engagement);
  if (!attendee) return null;
  const { data: { session } } = await client.auth.getSession();
  const id = session ? sessionId(session.access_token) : null;
  if (id) await serviceClient().from("device_sessions").update({ last_seen_at: new Date().toISOString() }).eq("engagement_id", engagement).eq("attendee_id", attendee.id).eq("auth_session_id", id).is("revoked_at", null);
  return { name: attendee.name as string, role: attendee.room_role as string };
}

export async function handleRoom(request: NextRequest, engagement: string, action: string) {
  const response = privateResponse(NextResponse.json({ status: "unavailable" }, { status: 503 }));
  const config = authConfig();
  if (!config || !uuid(engagement)) return response;
  if (request.method !== "GET" && !sameOrigin(request, config.origin)) return privateResponse(NextResponse.json({ status: "unavailable" }, { status: 403 }));
  try {
    const info = await roomInfo(engagement);
    if (!info) return privateResponse(NextResponse.json({ status: "room_missing" }, { status: 404 }));
    if (info.closed) return privateResponse(NextResponse.json({ status: "closed" }));
    const result = async (value: Record<string, unknown>) => {
      const out = privateResponse(NextResponse.json(value));
      for (const cookie of response.cookies.getAll()) out.cookies.set(cookie);
      return out;
    };
    if (action === "status" || action === "init") {
      const attendee = await signedIn(request, response, engagement);
      if (attendee) return result({ status: "signed_in", ...attendee });
    }
    const device = parseDevice(request.cookies.get(deviceCookie(engagement))?.value);
    if (action === "init") {
      if (device) {
        const existing = await roomRpc("status", { engagement, device: device.id, proof: hash(device.secret) });
        if (existing.device_code) return result(existing);
      }
      const created = newDevice();
      const initial = await roomRpc("init", { engagement, device: created.id, proof: hash(created.secret), device_code: created.code,
        ...rateKeys(request, engagement, created.id, "", "init") });
      if (initial.device_code) response.cookies.set(deviceCookie(engagement), JSON.stringify({ id: created.id, secret: created.secret }), { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", maxAge: 60*60*24*365 });
      return result(initial);
    }
    if (!device) return result({ status: "device_missing" });
    const payload = { engagement, device: device.id, proof: hash(device.secret) };
    if (action === "status") return result(await roomRpc("status", payload));
    if (action === "claim") return result(await completeClaim(request, response, payload, engagement));
    const body = await limitedJson(request);
    const email = normalizedEmail(body.email);
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;
    if (action === "practice" && typeof body.name === "string" && body.name.trim().length>0 && body.name.trim().length<=200) {
      const {data,error}=await serviceClient().rpc("practice_guest",{p:{...payload,name:body.name.trim(),...rateKeys(request,engagement,device.id,"","practice")}});
      if(error)throw new Error("Room connection unavailable");
      return result(data.status==="approved" ? await completeClaim(request,response,payload,engagement) : data);
    }
    if (action === "send" && email) {
      const challenge = randomUUID();
      const code = newCode();
      const token = newLink();
      const sent = await roomRpc("send", { ...payload, email, challenge, code_hash: digest(secret, "room-code", engagement, email, code), link_hash: hash(token), ...rateKeys(request, engagement, device.id, email, "send") });
      if (sent.status === "not_listed") return result({ status: info.neutral ? "check_facilitator" : "not_listed" });
      if (sent.status !== "sent") return result({ status: sent.status });
      const link = new URL(`/room/${engagement}/confirm`, config.origin);
      link.searchParams.set("challenge", challenge); link.searchParams.set("token", token);
      try {
        await sendEmail({ to: email, id: challenge, subject: `Your sign-in code for ${info.church}`,
          text: `Your Clearway sign-in code is ${code}.\n\nIt expires in 10 minutes and allows 5 attempts. You can use the code on another device.\n\nOr open this link and tap Confirm sign-in:\n${link}\n\nIf you didn’t ask for this code, you can ignore this email.` });
      } catch {
        await roomRpc("cancel_mail", { ...payload, challenge });
        return result({ status: "email_unavailable" });
      }
      return result({ status: "sent" });
    }
    if (action === "verify" && email && typeof body.code === "string" && /^\d{6}$/.test(body.code)) {
      const verified = await roomRpc("verify", { ...payload, email, code_hash: digest(secret, "room-code", engagement, email, body.code), ...rateKeys(request, engagement, device.id, email, "verify") });
      return result(verified.status === "approved" ? await completeClaim(request, response, payload, engagement) : { status: verified.status });
    }
    if (action === "confirm" && uuid(body.challenge) && typeof body.token === "string" && /^[0-9a-f]{64}$/.test(body.token)) {
      const verified = await roomRpc("verify", { ...payload, challenge: body.challenge, link_hash: hash(body.token), ...rateKeys(request, engagement, device.id, "", "verify") });
      return result(verified.status === "approved" ? await completeClaim(request, response, payload, engagement) : { status: verified.status });
    }
    if (action === "join" && email && typeof body.name === "string" && body.name.trim().length>0 && body.name.trim().length<=200) {
      return result(await roomRpc("join", { ...payload, email, name: body.name.trim(), ...rateKeys(request, engagement, device.id, email, "join") }));
    }
    return result({ status: "invalid_request" });
  } catch { return response; }
}
