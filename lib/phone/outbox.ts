import { retryDelay } from "../live/protocol";
import type { SubmissionRequest } from "../live/types";
import { settledReason } from "./policy";
import type { OutboxEntry } from "./types";

type Send = (request: SubmissionRequest) => Promise<{ status: string }>;
type Store = { get(key: string): string | null; set(key: string, value: string): void };
export const browserStore: Store = {
  get: key => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* Private mode keeps the queue in memory only. */ } },
};

// The phone's durable outbox. Answers are kept on the phone until the server
// settles them, then sent one at a time in the order written, with the same
// id, revision and times on every retry. Retries back off with jitter, so a
// slow server never gets a pile of requests.
export class PhoneOutbox {
  entries: OutboxEntry[];
  private running = false;
  private stopped = false;
  private attempt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private key: string, private send: Send, private changed: (entries: OutboxEntry[]) => void,
    private settled: (request: SubmissionRequest, reason: string) => void, private store: Store = browserStore, private online = () => true) {
    let saved: OutboxEntry[] = [];
    try { const raw = JSON.parse(store.get(key) || "[]"); if (Array.isArray(raw)) saved = raw.filter(e => e && e.request && typeof e.request.id === "string"); } catch { /* Start empty. */ }
    // A send cut off by a reload is retried; the server deduplicates it.
    this.entries = saved.map(e => e.state === "sending" ? { ...e, state: "saved" } : e);
  }
  add(request: SubmissionRequest) {
    this.entries = [...this.entries, { request: this.online() ? request : { ...request, queuedAt: request.queuedAt ?? request.sentAt }, state: "saved" }];
    this.persist(); this.kick();
  }
  dismiss(id: string, revision: number) { this.entries = this.entries.filter(e => !(e.state === "failed" && e.request.id === id && e.request.revision === revision)); this.persist(); }
  kick() { if (this.stopped) return; clearTimeout(this.timer); this.timer = undefined; this.attempt = 0; void this.run(); }
  stop() { this.stopped = true; clearTimeout(this.timer); }
  private persist() { this.store.set(this.key, JSON.stringify(this.entries)); this.changed(this.entries); }
  private update(target: OutboxEntry, next: Partial<OutboxEntry>) { this.entries = this.entries.map(e => e === target ? { ...e, ...next } : e); this.persist(); return this.entries.find(e => e.request === (next.request ?? target.request))!; }
  private async run() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (!this.stopped) {
        let entry = this.entries.find(e => e.state !== "failed");
        if (!entry) break;
        entry = this.update(entry, { state: "sending" });
        let result: { status: string } | null = null;
        try { result = await this.send(entry.request); } catch { result = null; }
        if (this.stopped) return;
        const reason = result ? settledReason(result.status) : null;
        if (reason === null) {
          // Not settled: keep it, mark it as having waited, and retry later in order.
          this.update(entry, { state: "saved", request: entry.request.queuedAt ? entry.request : { ...entry.request, queuedAt: entry.request.sentAt } });
          this.timer = setTimeout(() => { this.timer = undefined; void this.run(); }, retryDelay(this.attempt++));
          return;
        }
        this.attempt = 0;
        if (reason) this.update(entry, { state: "failed", reason });
        else { this.entries = this.entries.filter(e => e !== entry && e.request !== entry!.request); this.persist(); }
        this.settled(entry.request, reason);
      }
    } finally { this.running = false; }
  }
}
