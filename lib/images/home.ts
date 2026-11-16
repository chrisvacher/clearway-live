"use client";
// The engagement's Home screen (LP-1): one of its image loops, or the usual holding screen.
export type HomeLoop = { id: string; title: string; images: string[]; seconds: number; transition: string };
export type HomeList = { home: string | null; loops: HomeLoop[] };
export async function chooseHome(engagement: string, session: string | null): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch("/api/setup/home", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engagement, session }) });
    const data = await response.json().catch(() => ({})) as { status?: string; message?: string };
    return response.ok && data.status === "ok" ? { ok: true } : { ok: false, message: data.message || "We couldn’t change the Home screen. Please try again." };
  } catch { return { ok: false, message: "We couldn’t reach the room. Please try again." }; }
}
export async function readHome(engagement: string): Promise<HomeList | null> {
  try {
    const response = await fetch(`/api/setup/home?engagement=${engagement}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { status?: string } & Partial<HomeList>;
    return response.ok && data.status === "ok" ? { home: data.home ?? null, loops: data.loops ?? [] } : null;
  } catch { return null; }
}
