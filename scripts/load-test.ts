// The milestone 2 load test: simulated phones join the practice room by name
// and send answers in bursts through the real app endpoints, then the latency
// log reports how many reached the TV in under one second.
//
//   npm run load -- --origin https://<preview> [--phones 50] [--bursts 3] [--gap 15] [--spread 10]
//
// A burst is a time with phones out, as in the PRD: every phone sends one answer
// at a random moment within --spread seconds. --spread 0 is the extreme: all
// phones press Send in the same instant, and answers then queue behind the room
// lock one at a time.
//
// Before running: a TV is paired to the practice room, and a word cloud or wall
// session is live there with at least as many answers allowed as --bursts.
// Optional: LOAD_REPORT_COOKIE (a facilitator's cw-facilitator cookie) prints the
// report here; without it, open the printed link while signed in.
// VERCEL_AUTOMATION_BYPASS_SECRET passes a protected preview deployment.
// It creates practice guests; Reset practice room clears them.
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { percentile, verdict, type LatencyReport } from "../lib/latency/report";

export const practiceRoom = "90000000-0000-4000-8000-000000000010";
const words = ["youth", "alpha", "baptisms", "momentum", "welcome", "families", "prayer", "worship", "hope", "generosity", "kids", "students", "seniors", "music", "outreach", "unity", "care", "joy"];
const sentences = ["Teenagers asking to be baptized", "Young families finding us online", "Small groups meeting in homes again", "Volunteers who show up early", "Newcomers in a group within weeks"];

export type LoadOptions = { origin: string; room?: string; phones?: number; bursts?: number; gapSeconds?: number; spreadSeconds?: number; reportCookie?: string; bypass?: string; log?: (line: string) => void; random?: () => number };
export type LoadResult = { sent: number; accepted: number; refused: Record<string, number>; phoneMs: { p50: number | null; p95: number | null; max: number | null }; from: string; to: string; reportUrl: string; report: LatencyReport | null };

// One simulated phone: a cookie jar and the real phone endpoints. The acceptance kit
// (tests/browser/acceptance-live.ts) reuses it for every kind.
export class Phone {
  private jar = new Map<string, string>();
  offset = 0; uncertainty = 60000;
  constructor(private origin: string, private bypass?: string) {}
  private stamp() { return { sentAt: new Date(Date.now() + this.offset).toISOString(), uncertaintyMs: Math.min(60000, Math.round(this.uncertainty)) }; }
  // A structured answer (or a change to one, with its id and next revision), as a phone's outbox sends it.
  async sendValue(room: string, session: string, value: unknown, text = "", answer?: { id: string; revision: number }) {
    const body = { id: answer?.id ?? randomUUID(), session, revision: answer?.revision ?? 0, action: answer?.revision ? "change" : "submit", text, value, ...this.stamp() };
    const response = await this.call(`/api/live/${room}`, { method: "POST", body: JSON.stringify(body) });
    return ((await response.json().catch(() => ({ status: `http_${response.status}` }))) as { status: string }).status;
  }
  async vote(room: string, question: string) {
    const response = await this.call(`/api/live/${room}/vote`, { method: "POST", body: JSON.stringify({ id: randomUUID(), question, revision: 0, on: true, ...this.stamp() }) });
    return (await response.json().catch(() => ({ status: `http_${response.status}` }))) as { status: string; reason?: string };
  }
  async call(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Origin", this.origin);
    if (this.jar.size) headers.set("Cookie", [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "));
    if (this.bypass) headers.set("x-vercel-protection-bypass", this.bypass);
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(this.origin + path, { ...init, headers, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";"), at = pair.indexOf("="), name = pair.slice(0, at), value = pair.slice(at + 1);
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(cookie) || !value) this.jar.delete(name); else this.jar.set(name, value);
    }
    return response;
  }
  async join(room: string, name: string) {
    await this.call(`/api/room/${room}/init`, { method: "POST", body: "{}" });
    const joined = await (await this.call(`/api/room/${room}/practice`, { method: "POST", body: JSON.stringify({ name }) })).json();
    if (!["signed_in", "approved"].includes(joined.status)) throw new Error(`Practice join refused: ${joined.status}`);
  }
  async snapshot(room: string) {
    const sent = Date.now(), response = await this.call(`/api/live/${room}?surface=phone`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Snapshot refused: ${response.status}`);
    const data = await response.json(), received = Date.now();
    this.offset = Date.parse(data.server_time) - (sent + received) / 2; this.uncertainty = (received - sent) / 2;
    return data as { session: { id: string; state: string; interaction: string; max_sends: number } | null; state: { phones_down: boolean } };
  }
  async send(room: string, session: string, text: string) {
    const body = { id: randomUUID(), session, revision: 0, action: "submit", text, sentAt: new Date(Date.now() + this.offset).toISOString(), uncertaintyMs: Math.min(60000, Math.round(this.uncertainty)) };
    const t0 = performance.now(), response = await this.call(`/api/live/${room}`, { method: "POST", body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({ status: `http_${response.status}` }));
    return { status: data.status as string, ms: performance.now() - t0 };
  }
}

// Joins phones to a room by name in batches of ten, then gives every phone one clock: the
// fastest of several samples against the server, as NTP does (they share this process's clock).
export async function joinPhones(origin: string, count: number, options: { room?: string; prefix?: string; bypass?: string } = {}) {
  const room = options.room ?? practiceRoom, phones: Phone[] = [];
  for (let start = 0; start < count; start += 10) {
    const batch = Array.from({ length: Math.min(10, count - start) }, () => new Phone(origin, options.bypass));
    await Promise.all(batch.map((p, i) => p.join(room, `${options.prefix ?? "Load phone"} ${String(start + i + 1).padStart(2, "0")}`)));
    phones.push(...batch);
  }
  let best = { offset: 0, uncertainty: Infinity };
  for (let i = 0; i < 7; i++) { await phones[0].snapshot(room); if (phones[0].uncertainty < best.uncertainty) best = { offset: phones[0].offset, uncertainty: phones[0].uncertainty }; }
  for (const p of phones) { p.offset = best.offset; p.uncertainty = best.uncertainty; }
  return phones;
}

export async function runLoad(options: LoadOptions): Promise<LoadResult> {
  const origin = options.origin.replace(/\/$/, ""), room = options.room ?? practiceRoom, log = options.log ?? console.log;
  const count = options.phones ?? 50, bursts = options.bursts ?? 3, gap = (options.gapSeconds ?? 15) * 1000;
  const spread = Math.max(0, (options.spreadSeconds ?? 10) * 1000), random = options.random ?? Math.random;
  log(`Joining ${count} simulated phones to the practice room at ${origin}`);
  const phones: Phone[] = [];
  for (let start = 0; start < count; start += 10) {
    const batch = Array.from({ length: Math.min(10, count - start) }, () => new Phone(origin, options.bypass));
    await Promise.all(batch.map((p, i) => p.join(room, `Load phone ${String(start + i + 1).padStart(2, "0")}`)));
    phones.push(...batch);
  }
  // Every simulated phone shares this process's clock. Measure its offset from
  // the server once, as NTP does: several sequential samples, the fastest wins.
  let first = await phones[0].snapshot(room), best = { offset: phones[0].offset, uncertainty: phones[0].uncertainty };
  for (let i = 0; i < 6; i++) {
    first = await phones[0].snapshot(room);
    if (phones[0].uncertainty < best.uncertainty) best = { offset: phones[0].offset, uncertainty: phones[0].uncertainty };
  }
  for (const p of phones) { p.offset = best.offset; p.uncertainty = best.uncertainty; }
  const live = first.session;
  if (!live || live.state !== "live" || !["word_cloud", "wall", "lens"].includes(live.interaction) || first.state.phones_down)
    throw new Error("Go live on a word cloud, wall or lens session in the practice room, with phones open, before running the load test.");
  if (live.max_sends < bursts) throw new Error(`The live session allows ${live.max_sends} answers per person. Allow at least ${bursts}, or run fewer bursts.`);
  const from = new Date(Date.now() - 1000).toISOString(), refused: Record<string, number> = {}, phoneMs: number[] = [];
  let accepted = 0;
  for (let b = 0; b < bursts; b++) {
    if (b) await delay(gap);
    log(`Burst ${b + 1} of ${bursts}: ${count} answers ${spread ? `over ${spread / 1000} seconds` : "in the same instant"}`);
    const results = await Promise.all(phones.map(async (p, i) => {
      if (spread) await delay(Math.floor(random() * spread));
      return p.send(room, live.id, live.interaction === "wall" || live.interaction === "lens" ? `${sentences[(i + b) % sentences.length]} (${i + 1})` : words[(i * 7 + b * 3) % words.length]);
    }));
    for (const r of results) { if (r.status === "accepted") { accepted++; phoneMs.push(r.ms); } else refused[r.status] = (refused[r.status] ?? 0) + 1; }
  }
  await delay(4000);
  const to = new Date().toISOString(), query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const reportUrl = `${origin}/control/${room}/latency?${query}`;
  let report: LatencyReport | null = null;
  if (options.reportCookie) {
    const response = await fetch(`${origin}/api/control/${room}/latency?${query}`, { headers: { Cookie: options.reportCookie, ...(options.bypass ? { "x-vercel-protection-bypass": options.bypass } : {}) } });
    if (response.ok) report = await response.json(); else log(`The latency report needs a facilitator sign-in (${response.status}).`);
  }
  return { sent: count * bursts, accepted, refused, phoneMs: { p50: percentile(phoneMs, 0.5), p95: percentile(phoneMs, 0.95), max: percentile(phoneMs, 1) }, from, to, reportUrl, report };
}

export function describe(result: LoadResult) {
  const lines = [`Sent ${result.sent} answers, ${result.accepted} accepted.${Object.keys(result.refused).length ? ` Refused: ${JSON.stringify(result.refused)}.` : ""}`,
    `Phone to server accepted: median ${result.phoneMs.p50} ms, 95th ${result.phoneMs.p95} ms, slowest ${result.phoneMs.max} ms.`];
  if (result.report) {
    const r = result.report;
    lines.push(verdict(r).label, `Phone to TV: median ${r.phone_tv.p50} ms, 95th ${r.phone_tv.p95} ms, 99th ${r.phone_tv.p99} ms, slowest ${r.phone_tv.max} ms.`,
      `Server to TV, 95th: ${r.server_tv.p95} ms. Not received by a TV: ${r.missing_tv}. Clock uncertainty up to ${r.uncertainty_ms} ms.`);
  } else lines.push(`Phone to TV, from the latency log: ${result.reportUrl}`);
  return lines.join("\n");
}

if (process.argv[1]?.endsWith("load-test.ts")) {
  const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const origin = arg("origin");
  if (!origin) { console.error("Usage: npm run load -- --origin https://<preview> [--phones 50] [--bursts 3] [--gap 15] [--spread 10]"); process.exit(2); }
  runLoad({ origin, phones: Number(arg("phones") ?? 50), bursts: Number(arg("bursts") ?? 3), gapSeconds: Number(arg("gap") ?? 15), spreadSeconds: Number(arg("spread") ?? 10),
    reportCookie: process.env.LOAD_REPORT_COOKIE, bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET })
    .then(result => { console.log(describe(result)); if (result.accepted < result.sent || (result.report && !verdict(result.report).met)) process.exitCode = 1; })
    .catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
