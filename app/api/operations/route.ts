import { type NextRequest, NextResponse } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig, sameOrigin } from "@/lib/auth/policy";
import { limitedJson } from "@/lib/server/request";
import { runFileBackups, verifyFileRecovery } from "@/lib/operations/backups";
import { sendOperationsAlert } from "@/lib/operations/server";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const answer = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  const facilitator = await getFacilitator();
  if (!facilitator?.profile.is_admin) return answer({ status: "denied" }, 403);
  const { data, error } = await facilitator.client.rpc("ops_state");
  return error ? answer({ status: "unavailable" }, 503) : answer(data);
}
export async function POST(request: NextRequest) {
  const config = authConfig();
  if (!config || !sameOrigin(request, config.origin)) return answer({ status: "denied" }, 403);
  const facilitator = await getFacilitator();
  if (!facilitator?.profile.is_admin) return answer({ status: "denied" }, 403);
  try {
    const { action } = await limitedJson(request, 1024);
    if (action === "verify") return answer({ status: "ok", ...await verifyFileRecovery() });
    if (action !== "backup") return answer({ status: "invalid" }, 400);
    const result = await runFileBackups();
    await sendOperationsAlert();
    return answer({ status: result.failed ? "attention" : "ok", ...result }, result.failed ? 503 : 200);
  } catch { console.error("Operational check unavailable"); return answer({ status: "unavailable" }, 503); }
}
