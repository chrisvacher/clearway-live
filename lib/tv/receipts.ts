import { retryDelay } from "../live/protocol";
import type { TvReceipt } from "./types";
export type Ack = { engagement: string; version: number; received_at: string; uncertainty_ms: number; answers: TvReceipt[] };
// Receipt time is immutable, even when a slow network delays or batches its ack.
// Only versions committed to the TV's DOM can be acknowledged to the remote.
export class TvReceipts {
  private pending = new Map<string, { version: number; receipt: TvReceipt }>();
  private painted = -1;
  private sent = -1;
  private running = false;
  private stopped = false;
  private retry = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private engagement: string, private send: (ack: Ack) => Promise<boolean>, private clock: () => { time: string; uncertainty: number }) {}
  record(version: number, receipt: TvReceipt) { if (!this.stopped) this.pending.set(`${receipt.id}:${receipt.revision}`, { version, receipt }); }
  paint(version: number) { if (this.stopped) return; this.painted = Math.max(this.painted, version); void this.flush(); }
  stop() { this.stopped = true; clearTimeout(this.timer); this.pending.clear(); }
  private async flush() {
    if (this.running || this.stopped || this.timer) return;
    this.running = true;
    try {
      while (!this.stopped) {
        const version = this.painted;
        const rows = [...this.pending.entries()].filter(([, row]) => row.version <= version).slice(0, 500);
        if (version <= this.sent && !rows.length) break;
        const now = this.clock();
        let ok = false; try { ok = await this.send({ engagement: this.engagement, version, received_at: now.time, uncertainty_ms: now.uncertainty, answers: rows.map(([, row]) => row.receipt) }); } catch { /* Back off below. */ }
        if (this.stopped) break;
        if (!ok) { this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, retryDelay(this.retry++)); break; }
        rows.forEach(([key, row]) => { if (this.pending.get(key) === row) this.pending.delete(key); });
        this.sent = Math.max(this.sent, version); this.retry = 0;
      }
    } finally { this.running = false; }
  }
}
