import { NextResponse, type NextRequest } from "next/server";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { tvClient } from "@/lib/tv/client";
import { receiptInput } from "@/lib/tv/policy";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const config = authConfig();
  const response = privateResponse(NextResponse.json({ ok: false }, { status: 503 }));
  const answer = (ok: boolean, status = 200) => { const out = privateResponse(NextResponse.json({ ok }, { status })); for (const c of response.cookies.getAll()) out.cookies.set(c); return out; };
  if (!config || !sameOrigin(request, config.origin)) return answer(false, 403);
  let input; try { input = receiptInput(await limitedJson(request, 131072)); } catch { return answer(false, 422); }
  if (!input) return answer(false, 422);
  try {
    const client = tvClient({ getAll: () => request.cookies.getAll(), setAll: values => { for (const c of values) { request.cookies.set(c.name, c.value); response.cookies.set(c.name, c.value, c.options); } } });
    const { data, error } = await client.rpc("live_ack", { p_engagement: input.engagement, p_version: input.version, p_received: input.received_at, p_uncertainty: input.uncertainty_ms, p_answers: input.answers });
    return error ? response : answer(data === true, data ? 200 : 403);
  } catch { return response; }
}
