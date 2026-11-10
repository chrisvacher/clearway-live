import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const answer = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

// Only the fixed practice room can be reset. The database owns the clock,
// active-room guard, transaction and once-per-UTC-day record.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return answer({ status: "denied" }, 401);
  const given = Buffer.from(request.headers.get("authorization") ?? ""), want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return answer({ status: "denied" }, 401);
  try {
    const { data, error } = await serviceClient().rpc("nightly_practice_reset");
    if (error || !data) throw error ?? new Error("Missing reset result");
    return answer(data, data.status === "missing" ? 503 : 200);
  } catch (error) {
    console.error("Practice reset unavailable", { code: (error as { code?: string })?.code });
    return answer({ status: "unavailable" }, 503);
  }
}
