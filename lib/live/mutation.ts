import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authConfig } from "../auth/policy";

type RpcResult = { error: { code?: string; message?: string } | null };
type Connection = () => Promise<void>;

// Hosted Realtime creates its daily message partitions when a WebSocket client
// first joins. Pairing/planning can happen before the first display subscribes,
// including after a long idle period. Warm through the caller's existing private
// room access, never by changing Supabase's managed tables or using a service key.
async function connectRoom(client: SupabaseClient, engagement: string): Promise<Connection> {
  const config = authConfig();
  const { data: frame, error } = await client.rpc("live_snapshot", { p_engagement: engagement });
  const { data: { session } } = await client.auth.getSession();
  if (!config || error || frame?.status !== "ok" || !session) throw new Error("Room connection unavailable");
  const socket = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { accessToken: async () => session.access_token },
  });
  const close = async () => { await socket.removeAllChannels(); socket.realtime.disconnect(); };
  try {
    await socket.realtime.setAuth(session.access_token);
    for (let attempt = 0; attempt < 2; attempt++) {
      const channel = socket.channel(frame.topic, { config: { private: true } });
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Room connection timed out")), 8000);
          channel.subscribe((status, cause) => {
            if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timer); reject(new Error(cause?.message || "Room connection unavailable")); }
          });
        });
        return close;
      } catch (cause) {
        await socket.removeChannel(channel);
        // The very first join may initialize the partitions and still return
        // MissingPartition. A fresh authenticated join then starts its consumer.
        if (attempt || !(cause instanceof Error) || !cause.message.includes("MissingPartition")) throw cause;
      }
    }
    throw new Error("Room connection unavailable");
  } catch (cause) { await close(); throw cause; }
}

export async function roomMutation<T extends RpcResult>(client: SupabaseClient, engagement: string,
  write: () => PromiseLike<T>, connect = connectRoom): Promise<T> {
  const result = await write();
  // Only this explicit database exception guarantees the entire RPC rolled
  // back. Never retry a timeout, ambiguous network failure or successful write.
  if (result.error?.code !== "P0001" || result.error.message !== "Room broadcast unavailable") return result;
  let close: Connection;
  try { close = await connect(client, engagement); } catch { return result; }
  try { return await write(); } finally { try { await close(); } catch { /* The committed result must survive socket cleanup. */ } }
}

// A write that queues behind the room lock (a phone's answer or agree) can be cancelled by the database's own
// statement time limit while it waits, when a whole room sends at once. Nothing has been written then, and the
// write is keyed by the phone's own id and revision, so sending it again stores it once: a second send of a stored
// answer comes back as a duplicate. The same bounded repeat the phone's outbox makes, made here so the room never
// shows a card as unavailable for waiting its turn. Only code 57014 is repeated, never another failure.
export const QUEUE_RETRIES = 2;
export async function queuedWrite<T extends RpcResult>(write: () => PromiseLike<T>, options: { retries?: number; budgetMs?: number; now?: () => number; log?: (line: Record<string, unknown>) => void } = {}): Promise<T> {
  const retries = options.retries ?? QUEUE_RETRIES, budget = options.budgetMs ?? 24000, now = options.now ?? Date.now, log = options.log ?? (line => console.warn("Room lock wait", line));
  const started = now();
  for (let attempt = 0; ; attempt++) {
    const result = await write();
    if (result.error?.code !== "57014") return result;
    const waited = now() - started;
    log({ code: "57014", attempt: attempt + 1, waited_ms: waited });
    if (attempt >= retries || waited > budget) return result;
  }
}
