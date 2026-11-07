import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/server/supabase";
import { runDue } from "@/lib/check-ins/server";
import { today } from "@/lib/check-ins/policy";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const answer = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

function allowed(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? ""), want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

// Vercel calls this once a day (vercel.json). It sends every check-in round that is due, and nothing else. Without CRON_SECRET set,
// or without the right header, it refuses and sends nothing.
export async function GET(request: NextRequest) {
  if (!allowed(request)) return answer({ status: "denied" }, 401);
  try {
    const results = await runDue(serviceClient(), today());
    return answer({ status: "ok", rounds: results.length, sent: results.reduce((n, r) => n + (r.sent ?? 0), 0), practice: results.reduce((n, r) => n + (r.practice ?? 0), 0), failed: results.reduce((n, r) => n + (r.failed ?? 0), 0) });
  } catch { return answer({ status: "unavailable" }, 503); }
}
