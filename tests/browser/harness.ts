// Local-only harness for the browser failure kit and the load script's CI run.
// It refuses non-loopback services, sends no real email (a local mailbox
// stands in for Resend) and never touches Team Hub or CORE.
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

export type Env = Record<string, string>;
export function localEnv(): Env {
  const status = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env = Object.fromEntries([...status.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(m => [m[1], m[2]]));
  for (const key of ["API_URL", "DB_URL"]) assert.equal(new URL(env[key]).hostname, "127.0.0.1", `${key} must be loopback`);
  return env;
}
export async function freePort() {
  return new Promise<number>((resolve, reject) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const a = s.address(); s.close(() => typeof a === "object" && a ? resolve(a.port) : reject(new Error("No port"))); }); });
}

// Stands in for Resend so sign-in codes can be read without sending email.
export async function mailbox() {
  const messages: { to: string[]; text: string }[] = [];
  const server: Server = createHttpServer((req, res) => {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", () => {
      const data = JSON.parse(body || "{}"), list = Array.isArray(data) ? data : [data];
      for (const m of list) messages.push({ to: m.to, text: m.text });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(Array.isArray(data) ? { data: list.map(() => ({ id: randomUUID() })) } : { id: randomUUID() }));
    });
  });
  const port = await freePort(); await new Promise<void>(r => server.listen(port, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${port}`,
    async code(email: string, after = 0) {
      for (let i = 0; i < 100; i++) {
        const hit = messages.slice(after).reverse().find(m => m.to.includes(email));
        const code = hit?.text.match(/\b(\d{6})\b/)?.[1]; if (code) return code;
        await delay(100);
      }
      throw new Error(`No sign-in code for ${email}`);
    },
    get count() { return messages.length; },
    close: () => new Promise<void>(r => server.close(() => r())),
  };
}

// The production build, served against the local stack.
export async function startApp(env: Env, mailUrl?: string) {
  const port = await freePort(), origin = `http://localhost:${port}`;
  let output = "";
  const child: ChildProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env,
    APP_ORIGIN: origin, SUPABASE_URL: env.API_URL, SUPABASE_PUBLISHABLE_KEY: env.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY, NEXT_TELEMETRY_DISABLED: "1",
    ...(mailUrl ? { RESEND_API_KEY: "local-test", RESEND_FROM_EMAIL: "Clearway <room@clearway.test>", RESEND_API_URL: mailUrl } : {}) } });
  child.stdout?.on("data", c => { output += c; }); child.stderr?.on("data", c => { output += c; });
  // Next starts a worker; stopping the whole process group lets the test exit.
  const stop = () => { try { process.kill(-child.pid!, "SIGTERM"); } catch { /* Already stopped. */ } child.stdout?.destroy(); child.stderr?.destroy(); };
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(origin + "/tv")).status < 500) return { origin, secret: env.SERVICE_ROLE_KEY, stop, output: () => output }; } catch { /* Starting. */ }
    await delay(150);
  }
  stop(); throw new Error(`The app did not start:\n${output}`);
}

export const db = (env: Env) => { const client = new pg.Client({ connectionString: env.DB_URL }); return client; };

// A native facilitator: current Google-style session, allowlisted and assigned.
export async function facilitator(env: Env, sql: pg.Client, engagement: string) {
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `kit-${randomUUID().slice(0, 8)}@clearway.co`;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email }); assert.equal(link.error, null);
  const verified = await client.auth.verifyOtp({ token_hash: link.data.properties!.hashed_token, type: link.data.properties!.verification_type as "magiclink" });
  assert.equal(verified.error, null);
  const session = verified.data.session!, user = verified.data.user!;
  const sid = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString()).session_id;
  await sql.query("insert into auth.identities(user_id,provider,provider_id,identity_data,created_at,updated_at,last_sign_in_at) values($1::uuid,'google',$1::uuid::text,jsonb_build_object('email',$2::text,'email_verified',true),now(),now(),now())", [user.id, email]);
  await sql.query("insert into auth.mfa_amr_claims(id,session_id,created_at,updated_at,authentication_method) values(gen_random_uuid(),$1,now(),now(),'oauth')", [sid]);
  const id = randomUUID();
  await sql.query("insert into public.clearway_users(id,auth_user_id,name,email,team_hub_team_member_id) values($1,$2,'Chris Kit',$3,gen_random_uuid())", [id, user.id, email]);
  // The first facilitator leads; a later one (repeat runs in the practice room) co-facilitates.
  await sql.query(`insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) select $1,$2,case when exists(select 1 from public.engagement_facilitators
    where engagement_id=$1 and role='lead' and not deleted) then 'co_facilitator'::facilitator_role else 'lead'::facilitator_role end`, [engagement, id]);
  return { client, session, cookies: (origin: string) => sessionCookies(session, origin) };
}
// @supabase/ssr's cookie format, chunked the way the SDK chunks it.
export function sessionCookies(session: Session, origin: string, name = "cw-facilitator") {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url = new URL(origin);
  const base = { domain: url.hostname, path: "/", httpOnly: true, secure: false, sameSite: "Lax" as const };
  if (value.length <= 3180) return [{ ...base, name, value }];
  const chunks: string[] = []; for (let i = 0; i < value.length; i += 3180) chunks.push(value.slice(i, i + 3180));
  return chunks.map((chunk, i) => ({ ...base, name: `${name}.${i}`, value: chunk }));
}

// One engagement with listed attendees and a short run of show.
export async function engagement(sql: pg.Client, people: string[]) {
  const church = randomUUID(), id = randomUUID();
  await sql.query("insert into public.churches(id,name,timezone) values($1,'Riverside Church','America/Toronto')", [church]);
  await sql.query("insert into public.engagements(id,church_id,title,status) values($1,$2,'Wayfinding','pre_call')", [id, church]);
  const attendees: { id: string; name: string; email: string }[] = [];
  for (const name of people) {
    const a = { id: randomUUID(), name, email: `${name.toLowerCase()}-${randomUUID().slice(0, 6)}@example.org` };
    await sql.query("insert into public.attendees(id,engagement_id,name,email,room_role) values($1,$2,$3,$4,'participant')", [a.id, id, a.name, a.email]);
    attendees.push(a);
  }
  const session = async (title: string, interaction: string, prompt: string, position: number, extra: { segment?: string; maxSends?: number; maxChars?: number } = {}) =>
    (await sql.query(`insert into public.sessions(engagement_id,title,part,position,interaction,prompt,state,segment,max_sends,max_characters,max_words)
      values($1,$2,'Day 1',$3,$4,$5,'ready',$6,$7,$8,$9) returning id`, [id, title, position, interaction, prompt, extra.segment ?? "", extra.maxSends ?? 10, extra.maxChars ?? (interaction === "wall" ? 280 : 28), interaction === "wall" ? 50 : 3])).rows[0].id as string;
  return { id, attendees, session };
}

// Pairs a TV page by its on-screen code, exactly as the facilitator would.
export async function pairTv(fac: { client: SupabaseClient }, room: string, secret: string, code: string, label = "Practice TV") {
  const code_hash = createHmac("sha256", secret).update(JSON.stringify(["tv-pair", code])).digest("hex");
  const { data, error } = await fac.client.rpc("tv_manage", { p_engagement: room, p_action: "pair", p: { code_hash, label } });
  assert.equal(error, null); assert.equal(data.status, "ok", JSON.stringify(data));
}
// A press from "the laptop", made against where the room is now.
export async function press(fac: { client: SupabaseClient }, sql: pg.Client, room: string, action: string, p: Record<string, unknown> = {}) {
  const from = (await sql.query("select live_session_id from public.room_states where engagement_id=$1", [room])).rows[0]?.live_session_id ?? null;
  const { data, error } = await fac.client.rpc("room_control", { p_engagement: room, p_id: randomUUID(), p_action: action, p: { from, ...p } });
  assert.equal(error, null); assert.ok(["ok", "unchanged"].includes(data.status), `${action}: ${JSON.stringify(data)}`);
  return data;
}
export async function until<T>(check: () => Promise<T | null | undefined | false> | T | null | undefined | false, label: string, ms = 5000): Promise<T> {
  const end = Date.now() + ms; let last: unknown;
  while (Date.now() < end) { try { const v = await check(); if (v) return v as T; } catch (e) { last = e; } await delay(50); }
  throw new Error(`Timed out: ${label}${last ? ` (${last})` : ""}`);
}
