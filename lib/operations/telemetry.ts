export type ErrorKind = "error" | "rejection" | "boundary" | "server" | "test";
export type SafeEvent = { kind: ErrorKind; name: string; route: string; frames: string[]; digest?: string };
const kinds = new Set(["error", "rejection", "boundary", "server", "test"]);
const names = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError"]);
const segments = new Set(["setup", "operations", "new", "users", "templates", "door", "tv", "discover", "four-lists", "run-of-show", "print", "control", "after", "check-ins", "recap", "share", "report", "plan", "map", "review", "latency", "scribe", "room", "confirm", "remote", "followup", "practice", "sign-in", "how-we-use-ai"]);

// Dynamic ids, bearer links, query strings, fragment and messages never enter telemetry.
export function errorRoute(path: string): string {
  const parts = path.split("?")[0].split("#")[0].split("/").filter(Boolean).slice(0, 5);
  if (parts[0] === "v" || parts[0] === "c" || parts[0] === "f") return "/" + parts[0] + "/:id";
  return "/" + parts.map(p => segments.has(p) ? p : ":id").join("/");
}
export function safeEvent(raw: unknown): SafeEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== "string" || !kinds.has(r.kind) || typeof r.route !== "string" || r.route.length > 500) return null;
  const frames = Array.isArray(r.frames) ? r.frames.filter((s): s is string => typeof s === "string" &&
    /^\/_next\/static\/[a-zA-Z0-9_./%()[\]-]+\.js:\d{1,8}:\d{1,8}$/.test(s) && s.length <= 240 && !s.includes("..")).slice(0, 4) : [];
  return { kind: r.kind as ErrorKind, name: typeof r.name === "string" && names.has(r.name) ? r.name : "Error",
    route: errorRoute(r.route), frames, ...(typeof r.digest === "string" && /^\d{1,20}$/.test(r.digest) ? { digest: r.digest } : {}) };
}
export function eventFromError(error: unknown, kind: ErrorKind, path: string, origin: string): SafeEvent {
  const value = error && typeof error === "object" ? error as { name?: unknown; stack?: unknown; digest?: unknown } : {};
  const frames: string[] = [];
  if (typeof value.stack === "string") {
    for (const match of value.stack.slice(0, 16000).matchAll(/https?:\/\/[^\s)]+\.js:\d+:\d+/g)) {
      if (match[0].startsWith(origin + "/_next/static/")) frames.push(match[0].slice(origin.length));
    }
  }
  return safeEvent({ kind, name: value.name, route: path, frames, digest: value.digest })!;
}
