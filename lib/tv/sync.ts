import { retryDelay } from "../live/protocol";
import { pairCodeView, pairPollDelay, pairPollMs, pairSample, pairTickDelay, unknownPairClock, type PairClock } from "./pair-clock";
import type { TvStatus } from "./types";

// What the TV page shows from its pairing connection. A pairing code appears
// only while the server will still accept it; past that the code is null and
// the TV asks for its replacement.
export type TvSyncView = { status: TvStatus; code: string | null; seconds: number; offline: boolean };
export type TvSyncReply = { ok: boolean; data: unknown };
type Timers = { set: (run: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

export const pairedPollMs = 5000;
// An unpaired TV keeps asking at least this often while its connection fails,
// so a fresh code follows the network back within a couple of seconds. Before
// this cap, failures backed off to 16 and 32 seconds and the TV held its last
// code all that time, after the server had stopped accepting it.
export const pairFailureCapMs = 2000;
// A request that hangs is abandoned and counted as a failure, so one stalled
// request never stops the TV asking.
export const pairRequestMs = 5000;

const realTimers: Timers = { set: (run, ms) => setTimeout(run, ms), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };

export class TvSync {
  private clock: PairClock = unknownPairClock;
  private offline = false;
  private failures = 0;
  private running = false;
  private again = false;
  private stopped = true;
  private pollTimer: unknown;
  private tickTimer: unknown;
  private last = "";
  constructor(private status: TvStatus, private request: () => Promise<TvSyncReply>, private listener: (view: TvSyncView) => void,
    private now: () => number = () => Date.now(), private timers: Timers = realTimers) {}
  start() { if (!this.stopped) return; this.stopped = false; this.emit(); void this.poll(); }
  stop() { this.stopped = true; this.timers.clear(this.pollTimer); this.timers.clear(this.tickTimer); }
  // The room refused this TV: show the opening screen and ask again at once.
  reopen() { if (this.stopped) return; this.status = { status: "opening" }; this.emit(); void this.poll(); }
  view(): TvSyncView {
    const status = this.status;
    if (status.status !== "pair") return { status, code: null, seconds: 0, offline: this.offline };
    const shown = pairCodeView(status.expires_at, this.now(), this.clock);
    return { status, code: shown.shown ? status.code : null, seconds: shown.seconds, offline: this.offline };
  }
  async poll() {
    if (this.stopped) return;
    // A page coming back into view may have slept past expiry: check first.
    this.emit();
    if (this.running) { this.again = true; return; }
    this.running = true; this.timers.clear(this.pollTimer);
    try {
      const sent = this.now(), reply = await this.request(), received = this.now();
      if (this.stopped) return;
      const next = parseStatus(reply.data);
      if (!reply.ok || !next || next.status.status === "unavailable" || next.status.status === "limited") throw new Error("unavailable");
      if (next.status.status === "pair") this.clock = pairSample(sent, received, next.serverTime);
      this.status = next.status; this.offline = false; this.failures = 0;
    } catch { if (!this.stopped) { this.offline = true; this.failures++; } }
    finally {
      this.running = false;
      if (!this.stopped) {
        this.emit();
        if (this.again) { this.again = false; void this.poll(); } else this.schedule();
      }
    }
  }
  private schedule() {
    const status = this.status, paired = status.status === "paired";
    const delay = this.failures ? (paired ? retryDelay(this.failures) : Math.min(pairFailureCapMs, retryDelay(this.failures)))
      : status.status === "pair" ? pairPollDelay(status.expires_at, this.now(), this.clock) : paired ? pairedPollMs : pairPollMs;
    this.pollTimer = this.timers.set(() => void this.poll(), delay);
  }
  // Every change of what is on screen, including each countdown second and the
  // moment a code leaves, reaches the listener once. This runs on its own timer,
  // so a slow or failed poll can delay the replacement code but never keeps an
  // expired one on screen.
  private emit() {
    this.timers.clear(this.tickTimer);
    const view = this.view(), key = JSON.stringify(view);
    if (key !== this.last) { this.last = key; this.listener(view); }
    const status = this.status;
    if (!this.stopped && status.status === "pair") this.tickTimer = this.timers.set(() => this.emit(), pairTickDelay(status.expires_at, this.now(), this.clock));
  }
}

function parseStatus(data: unknown): { status: TvStatus; serverTime: unknown } | null {
  if (!data || typeof data !== "object") return null;
  const { server_time: serverTime, ...rest } = data as Record<string, unknown>;
  const status = rest as TvStatus;
  if (status.status === "pair") {
    if (typeof status.code !== "string" || !/^\d{6}$/.test(status.code) || typeof status.expires_at !== "string") return null;
    return { status: { status: "pair", code: status.code, expires_at: status.expires_at }, serverTime };
  }
  if (status.status === "paired") return typeof status.engagement === "string" && typeof status.tv === "string" ? { status, serverTime } : null;
  return ["opening", "limited", "unavailable", "closed"].includes(String(status.status)) ? { status: { status: status.status }, serverTime } : null;
}
