import { eventFromError, type ErrorKind } from "./telemetry";
const seen = new Map<string, number>();
let started = false;
let sent = 0;
let windowStart = 0;

export async function reportClientError(error: unknown, kind: ErrorKind = "error"): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    const now = Date.now();
    if (now - windowStart > 60000) { sent = 0; windowStart = now; seen.clear(); }
    const event = eventFromError(error, kind, window.location.pathname, window.location.origin);
    const key = JSON.stringify(event);
    if (sent >= 10 || (kind !== "test" && seen.has(key))) return false;
    seen.set(key, now); sent++;
    const release = document.querySelector('meta[name="clearway-release"]')?.getAttribute("content") ?? "unknown";
    const response = await fetch("/api/operations/errors", { method: "POST", credentials: "same-origin", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...event, release }) });
    return response.ok;
  } catch { return false; } // Monitoring failure must never disrupt the room.
}
export function startClientMonitoring() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("error", event => { void reportClientError(event.error, "error"); });
  window.addEventListener("unhandledrejection", event => { void reportClientError(event.reason, "rejection"); });
}
