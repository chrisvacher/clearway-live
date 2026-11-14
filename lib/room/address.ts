// Which address a request belongs at (live.clearway.co or live.novetera.co), decided before any page is drawn or cookie is
// set. Facilitator pages and APIs live at Clearway's address only. A room code, link name or room link belongs at its
// engagement's address. A person who already has a session for the engagement where they are stays there: a skin switch
// moves links, not people. No server-only imports, so middleware and unit tests both use it.
import { createClient } from "@supabase/supabase-js";
import { roomOrigin, skinForHost, skinOf, type Skin } from "../brand";
import { authConfig } from "../auth/policy";
import { typedRoomCode, roomCode } from "../tv/policy";
import { hasRoomCookie } from "./client";
import { uuid } from "./identity";
import { practiceId } from "./practice";
import { codeShaped, nameShaped, practice } from "./shape";

export const deviceCookie = (engagement: string) => `cw-device-${engagement}`;

type Env = Record<string, string | undefined>;
export type Rule = { kind: "clearway" } | { kind: "code"; code: string } | { kind: "practice" } | { kind: "engagement"; id: string } | null;
export type Target = { id: string; skin: Skin };
export type Decision = { action: "pass" } | { action: "redirect"; location: string } | { action: "refuse" };

const under = (path: string, base: string) => path === base || path.startsWith(base + "/");
// Facilitator-only pages and APIs. /api/operations/errors is the exception: every page reports client errors there, at its own
// address. The Wayfinding token links (/v, /c, /f and their APIs) are left alone on purpose: they stay public, outside the
// middleware (tests/unit/check-ins.test.ts), nothing links to them at Novetera's address, and their APIs accept APP_ORIGIN only.
const clearwayPaths = ["/sign-in", "/auth", "/setup", "/control", "/remote", "/api/facilitator", "/api/control", "/api/run-of-show",
  "/api/setup", "/api/templates", "/api/operations", "/api/discover", "/api/overnight", "/api/scribe", "/api/tv/control"];
// A link name can't be one of these (the database reserves them), and none of them is a room.
const reserved = new Set(["practice", "setup", "control", "remote", "room", "tv", "api", "auth", "signin", "signout", "admin", "join", "live", "clearway", "help", "about", "privacy", "terms", "howweuseai", "static", "public", "favicon", "robots", "sitemap", "next"]);

export function classify(pathname: string, params: URLSearchParams): Rule {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/api/operations/errors") return null;
  if (clearwayPaths.some(base => under(path, base))) return { kind: "clearway" };
  const parts = path.split("/").slice(1);
  let first: string;
  try { first = decodeURIComponent(parts[0] ?? ""); } catch { return null; }
  if (parts.length === 1 && first.toLowerCase() === "practice") return { kind: "practice" };
  if (path === "/join") return typed(params.get("code"));
  if (parts[0] === "r" && parts.length === 2) { const code = parts[1]; return roomCode(code) ? { kind: "code", code: code.toUpperCase() } : null; }
  if (parts[0] === "room" && (parts.length === 2 || (parts.length === 3 && parts[2] === "confirm"))) return uuid(parts[1]) ? { kind: "engagement", id: parts[1] } : null;
  // /CODE or /linkname, in any letter case, shaped the way the page [code] checks it.
  if (parts.length === 1 && first && !first.includes(".") && !reserved.has(first.toLowerCase())) return codeShaped(first) || nameShaped(first) ? typed(first) : null;
  return null;
}
function typed(raw: string | null): Rule {
  const code = typedRoomCode(raw);
  if (!code) return null;
  if (practice(code)) return { kind: "practice" };
  return roomCode(code) || nameShaped(code) ? { kind: "code", code } : null;
}

// The same path and query at a skin's address.
export const moved = (skin: Skin, pathname: string, search: string, env?: Env) => `${roomOrigin(skin, env)}${pathname}${search}`;

export function hasSession(jar: { getAll(): { name: string }[] }, engagement: string) {
  return hasRoomCookie(jar as Parameters<typeof hasRoomCookie>[0], engagement) || jar.getAll().some(cookie => cookie.name === deviceCookie(engagement));
}

export async function addressDecision(input: { method: string; host: string | null; pathname: string; search: string; cookies: { getAll(): { name: string }[] }; resolve: (rule: NonNullable<Rule>) => Promise<Target | null>; env?: Env }): Promise<Decision> {
  const { method, pathname, search, cookies, resolve, env } = input;
  const here = skinForHost(input.host, env);
  if (!here) return { action: "pass" };
  const rule = classify(pathname, new URLSearchParams(search));
  if (!rule) return { action: "pass" };
  const read = method === "GET" || method === "HEAD";
  if (rule.kind === "clearway") {
    if (here === "clearway") return { action: "pass" };
    return read ? { action: "redirect", location: moved("clearway", pathname, search, env) } : { action: "refuse" };
  }
  if (!read) return { action: "pass" };
  // A person already in this engagement at this address stays, and costs no lookup.
  if (rule.kind === "engagement" && hasSession(cookies, rule.id)) return { action: "pass" };
  let target: Target | null;
  try { target = await resolve(rule); } catch { return { action: "pass" }; }
  if (!target || target.skin === here || hasSession(cookies, target.id)) return { action: "pass" };
  return { action: "redirect", location: moved(target.skin, pathname, search, env) };
}

// The id and skin behind a code or link name, or the skin of an engagement by id. Asked fresh on every request, never
// remembered, so a skin switch is seen at once. Any trouble answers null and the request carries on where it is.
export async function resolveRoom(rule: NonNullable<Rule>, env: Env = process.env): Promise<Target | null> {
  if (rule.kind === "clearway") return null;
  const config = authConfig(env), key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!config || !key) return null;
  const client = createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
  const signal = AbortSignal.timeout(1500);
  if (rule.kind === "code") {
    const { data, error } = await client.rpc("tv_room_resolve", { p_code: rule.code }).abortSignal(signal);
    return error || !data || !uuid(data.id) ? null : { id: data.id, skin: skinOf(data.skin) };
  }
  const id = rule.kind === "practice" ? practiceId : rule.id;
  const { data, error } = await client.rpc("room_public_info", { p_engagement: id }).abortSignal(signal);
  return error || !data ? null : { id, skin: skinOf(data.skin) };
}
