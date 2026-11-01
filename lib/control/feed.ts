import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { LiveTransport } from "../live/types";
import type { ControlNotice } from "./types";

// Receive-only private notices for facilitators: TV confirmations and presses.
// The topic rotates with the room's channel generation; database RLS admits
// only a current assigned facilitator.
export function subscribeFacilitator(connection: LiveTransport, topic: string, notice: (value: ControlNotice) => void, status: (connected: boolean) => void) {
  const client = createClient(connection.url, connection.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { accessToken: async () => connection.token } });
  let channel: RealtimeChannel | undefined, stopped = false;
  void client.realtime.setAuth(connection.token).then(() => {
    if (stopped) return;
    channel = client.channel(topic, { config: { private: true } })
      .on("broadcast", { event: "fac" }, message => notice(message.payload as ControlNotice))
      .subscribe(value => { if (!stopped) status(value === "SUBSCRIBED"); });
  }).catch(() => { if (!stopped) status(false); });
  return () => { stopped = true; if (channel) void client.removeChannel(channel); client.realtime.disconnect(); };
}
