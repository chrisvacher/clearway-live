import "server-only";
import { createHash, createHmac } from "node:crypto";
import { serviceClient } from "@/lib/server/supabase";
import { authConfig } from "@/lib/auth/policy";
import { sendEmail } from "@/lib/server/email";
import { eventFromError, type SafeEvent } from "./telemetry";

export function releaseId(value: unknown) { return typeof value === "string" && /^[a-f0-9]{7,40}$/.test(value) ? value : "unknown"; }
export async function recordError(event: SafeEvent, network: string, release: unknown) {
  const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Monitoring unavailable");
  const hash = createHmac("sha256", secret).update(new Date().toISOString().slice(0, 10) + ":" + network).digest("hex");
  const fingerprint = createHash("sha256").update(JSON.stringify(event)).digest("hex");
  const { data, error } = await serviceClient().rpc("ops_record_error", { p_event: event, p_fingerprint: fingerprint,
    p_client_hash: hash, p_release: releaseId(release) });
  if (error) throw new Error("Monitoring unavailable");
  if (data === "recorded") console.error("Clearway operational event", { fingerprint, kind: event.kind, name: event.name, route: event.route, release: releaseId(release) });
  return String(data);
}
export async function sendOperationsAlert() {
  const db = serviceClient();
  const { data, error } = await db.rpc("ops_alert_claim");
  if (error) throw new Error("Alert status unavailable");
  if (data?.status !== "send") return false;
  const origin = authConfig()?.origin || "https://live.clearway.co";
  const to = process.env.OPERATIONS_ALERT_EMAIL || "chris@clearway.co";
  // Snapshot and id stay identical across a retry, including one after Resend accepted the first request.
  await sendEmail({ to, id: "clearway-operations-" + data.hour, subject: "Check Clearway Live",
    text: "Clearway Live recorded operational issues.\n\nClient or server events: " + data.snapshot.errors +
      "\nFailed file backup runs: " + data.snapshot.backup_failures + "\n\nOpen the private operations page:\n" + origin + "/setup/operations\n\nNo answers, error messages or participant details are included in this alert." });
  const marked = await db.rpc("ops_alert_claim", { p_sent: data.hour });
  if (marked.error) throw new Error("Alert receipt unavailable");
  return true;
}
export async function recordServerError(error: unknown, route: string) {
  const event = eventFromError(error, "server", route, authConfig()?.origin || "https://live.clearway.co");
  await recordError(event, "server", process.env.VERCEL_GIT_COMMIT_SHA);
  await sendOperationsAlert();
}
