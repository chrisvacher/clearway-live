import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { limitedJson } from "@/lib/server/request";
import { serviceClient } from "@/lib/server/supabase";
import { savePhone } from "@/lib/check-ins/server";
import { tokenShape } from "@/lib/check-ins/policy";
import { uuid } from "@/lib/room/identity";

export const dynamic = "force-dynamic";
const answer = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
const isItem = (kind: string) => kind === "step" || kind === "goal";
const code: Record<string, number> = { ok: 200, unknown: 404, ended: 410, read_only: 409, invalid_request: 422 };

// The check-in phone page saves here, on each tap, once when the page has loaded (open), once when the person presses Send my check-in
// (finish), and again from the phone's queue after a dropped signal. The link's token is the only
// key. It is the same save twice, so a replay changes nothing.
export async function POST(request: NextRequest) {
  const config = authConfig();
  if (!config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  let body: Record<string, unknown>;
  try { body = await limitedJson(request); } catch { return answer({ status: "invalid_request" }, 422); }
  const { token, kind, item, answer: pick, note } = body;
  if (!tokenShape(token) || typeof kind !== "string" || !["step", "goal", "help", "open", "finish"].includes(kind)
    || (isItem(kind) && !uuid(item)) || (isItem(kind) && typeof pick !== "string") || (note != null && typeof note !== "string")) return answer({ status: "invalid_request" }, 422);
  try {
    const out = await savePhone(serviceClient(), token, { kind, item: isItem(kind) ? String(item) : null, answer: isItem(kind) ? String(pick) : null, note: (note as string | null | undefined) ?? null });
    return answer({ status: out.status }, code[out.status] ?? 409);
  } catch { return answer({ status: "unavailable" }, 503); }
}
