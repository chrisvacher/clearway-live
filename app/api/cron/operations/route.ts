import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { runFileBackups } from "@/lib/operations/backups";
import { sendOperationsAlert } from "@/lib/operations/server";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const answer = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") || ""), want = Buffer.from("Bearer " + secret);
  if (!secret || given.length !== want.length || !timingSafeEqual(given, want)) return answer({ status: "denied" }, 401);
  try {
    const result = await runFileBackups();
    await sendOperationsAlert();
    return answer({ status: result.failed ? "attention" : "ok", ...result }, result.failed ? 503 : 200);
  } catch { console.error("Operational sweep unavailable"); return answer({ status: "unavailable" }, 503); }
}
