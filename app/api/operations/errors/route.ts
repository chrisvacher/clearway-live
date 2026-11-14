import { after, type NextRequest, NextResponse } from "next/server";
import { authConfig, sameAddress } from "@/lib/auth/policy";
import { limitedJson } from "@/lib/server/request";
import { safeEvent } from "@/lib/operations/telemetry";
import { recordError, sendOperationsAlert } from "@/lib/operations/server";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const answer = (status: number) => new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: NextRequest) {
  const config = authConfig();
  if (!config || !sameAddress(request) || (request.headers.get("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return answer(403);
  let body: Record<string, unknown>;
  try { body = await limitedJson(request, 4096); } catch { return answer(400); }
  const event = safeEvent(body);
  if (!event) return answer(400);
  try {
    // Vercel overwrites x-vercel-forwarded-for at its edge. Raw addresses are never stored or logged.
    const network = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "local";
    const status = await recordError(event, network, body.release);
    if (status === "limited") return answer(429);
    if (status !== "recorded") return answer(400);
    after(async () => { try { await sendOperationsAlert(); } catch { console.error("Operational alert unavailable"); } });
    return answer(202);
  } catch { console.error("Client error capture unavailable"); return answer(503); }
}
