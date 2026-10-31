import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { adoptSnapshot, applyLiveEvent, retryDelay, snapshotDelay } from "./protocol";
import type { LiveEvent, LiveRead, LiveSnapshot, SubmissionRequest } from "./types";

type Mode = "connecting" | "realtime" | "fallback" | "offline" | "denied";
export type StreamOptions = {
  read: (transport: boolean) => Promise<LiveRead>;
  render: (snapshot: LiveSnapshot) => void;
  mode: (mode: Mode) => void;
  subscribe?: (read: LiveRead, event: (event: LiveEvent) => void, rekey: () => void, status: (connected: boolean) => void) => () => void;
};

// Receives only; every write uses the authenticated submission endpoint.
export function subscribeLive(read: LiveRead, event: (event: LiveEvent) => void, rekey: () => void, status: (connected: boolean) => void) {
  if (!read.connection) throw new Error("Missing connection");
  const { url, key, token } = read.connection;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { accessToken: async () => token } });
  let channel: RealtimeChannel | undefined, stopped = false;
  // supabase-js 2.50 starts with the API key as Realtime's token. Joining first
  // would authorize as anon; set the caller's token before the initial join.
  void client.realtime.setAuth(token).then(() => {
    if (stopped) return;
    channel = client.channel(read.topic, { config: { private: true } })
      .on("broadcast", { event: "room" }, message => event(message.payload as LiveEvent))
      .on("broadcast", { event: "rekey" }, rekey)
      .subscribe(value => { if (!stopped) status(value === "SUBSCRIBED"); });
  }).catch(() => { if (!stopped) status(false); });
  return () => { stopped = true; if (channel) void client.removeChannel(channel); };
}

export class RoomStream {
  private value: LiveSnapshot | null = null;
  private stopped = true;
  private connected = false;
  private fetching = false;
  private dirty = false;
  private rekey = false;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private refreshed = 0;
  private retry = 0;
  private wantedVersion = 0;
  private subscription = 0;
  constructor(private options: StreamOptions) {}
  start() { if (!this.stopped) return; this.stopped = false; this.options.mode("connecting"); void this.recover(true); }
  stop() { this.stopped = true; clearTimeout(this.timer); this.unsubscribe?.(); this.unsubscribe = undefined; }
  // Called on online/visibility restoration; resync without clearing the last frame.
  resume() { if (!this.stopped) void this.recover(true); }
  private receive = (event: LiveEvent) => {
    if (this.stopped) return;
    if (Number.isSafeInteger(event?.state?.version)) this.wantedVersion = Math.max(this.wantedVersion, event.state.version);
    if (!this.value) { void this.recover(); return; }
    const next = applyLiveEvent(this.value, event);
    if (next.kind === "snapshot") { void this.recover(); return; }
    if (next.kind === "applied") { this.value = next.value; this.options.render(this.value); }
  };
  private async recover(transport = false) {
    if (this.stopped) return;
    this.rekey ||= transport;
    if (this.fetching) { this.dirty = true; return; }
    clearTimeout(this.timer);
    this.fetching = true;
    try {
      do {
        this.dirty = false;
        const refresh = this.rekey || !this.unsubscribe || Date.now() - this.refreshed > 60000;
        this.rekey = false;
        const next = await this.options.read(refresh);
        if (this.stopped) return;
        const before = this.value;
        const frame = { ...next }; delete frame.connection;
        this.value = adoptSnapshot(this.value, frame);
        if (this.value.version < this.wantedVersion) this.dirty = true;
        if (this.value !== before) this.options.render(this.value);
        if (refresh) {
          this.refreshed = Date.now();
          const generation = ++this.subscription; this.connected = false; this.unsubscribe?.();
          this.unsubscribe = (this.options.subscribe || subscribeLive)(next, this.receive, () => { void this.recover(true); }, connected => {
            if (this.stopped || generation !== this.subscription) return;
            const wasConnected = this.connected;
            this.connected = connected; this.options.mode(connected ? "realtime" : "fallback");
            // Close the gap between the initial read and completed subscription.
            if (connected && !wasConnected || !connected && wasConnected) void this.recover();
          });
        }
        this.retry = 0;
      } while (this.dirty && !this.stopped);
    } catch (error) {
      if (!this.stopped) {
        if (error instanceof Error && error.message === "denied") { this.options.mode("denied"); this.stop(); }
        else { this.connected = false; this.options.mode("offline"); this.retry++; }
      }
    } finally {
      this.fetching = false;
      if (!this.stopped) this.timer = setTimeout(() => { void this.recover(); }, this.retry ? retryDelay(this.retry) : snapshotDelay(this.connected));
    }
  }
}

// The phone's durable outbox (PR 5) supplies these immutable requests. Retrying
// preserves id, revision, timestamps and order; no concurrent sends are allowed.
export async function sendInOrder(queue: SubmissionRequest[], send: (input: SubmissionRequest) => Promise<"settled" | "retry">,
  settled: (input: SubmissionRequest) => void, signal: AbortSignal, wait: (ms: number, signal: AbortSignal) => Promise<void>) {
  let attempt = 0;
  while (queue.length && !signal.aborted) {
    const input = queue[0];
    let outcome: "settled" | "retry";
    try { outcome = await send(input); } catch { outcome = "retry"; }
    if (signal.aborted) return;
    if (outcome === "settled") { settled(input); queue.shift(); attempt = 0; }
    else { try { await wait(retryDelay(attempt++), signal); } catch { return; } }
  }
}
