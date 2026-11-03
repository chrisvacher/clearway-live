import "server-only";
import { after } from "next/server";
import { serviceClient } from "@/lib/server/supabase";
import { aiConfig } from "./config";
import { aiClient } from "./client";
import { workSessions } from "./worker";

// Schedules AI work to run after the response has been sent (Vercel keeps the function
// alive for it with waitUntil), so it can never delay an answer reaching the TV. With no
// session named, it asks the database which sessions may have work (the live one and the
// Questions any time pool): the control surface's poll does this, which is how a summary
// refreshes after 75 seconds with nobody answering.
const lastKick = new Map<string, number>();
export function kickAi(engagement: string, session?: string | null) {
  const ai = aiClient();
  if (!ai) return;
  if (!session) {
    const now = Date.now();
    if (now - (lastKick.get(engagement) ?? 0) < 2000) return;
    lastKick.set(engagement, now);
  }
  try {
    after(async () => {
      try {
        const db = serviceClient();
        let sessions = session ? [session] : [];
        if (!session) {
          const { data, error } = await db.rpc("ai_due", { p_engagement: engagement });
          if (error || !Array.isArray(data)) return;
          sessions = data.filter((x): x is string => typeof x === "string");
        }
        if (sessions.length) await workSessions(db, ai, sessions, aiConfig());
      } catch (error) {
        console.error("AI work unavailable", { code: error instanceof Error ? error.name : "failed" });
      }
    });
  } catch { /* Outside a request (tests): nothing to schedule. */ }
}
