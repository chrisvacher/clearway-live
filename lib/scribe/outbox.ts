import { retryDelay } from "../live/protocol";
import { settledReason } from "./policy";
import type { OutboxEntry, OutboxItem } from "./types";

type Send = (item: OutboxItem) => Promise<{ status: string }>;
type Store = { get(key: string): string | null; set(key: string, value: string): void };
export const browserStore: Store = {
  get: key => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* Private mode keeps the queue in memory only. */ } },
};

// The scribe's durable outbox (FAIL-03). Cards, edits, re-files, photos and files are kept on the
// device until the server settles each one, then sent one at a time in the order they were made,
// with the same id on every retry, so a replay is a duplicate and never a second card. A new item
// never overtakes an older one that is still waiting. Retries back off with jitter.
export class ScribeOutbox {
  entries: OutboxEntry[];
  private running = false;
  private stopped = false;
  private attempt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private key: string, private send: Send, private changed: (entries: OutboxEntry[]) => void,
    private settled: (item: OutboxItem, reason: string) => void, private store: Store = browserStore, private online = () => true) {
    let saved: OutboxEntry[] = [];
    try { const raw = JSON.parse(store.get(key) || "[]"); if (Array.isArray(raw)) saved = raw.filter(e => e && e.item && typeof e.item.id === "string" && typeof e.item.type === "string"); } catch { /* Start empty. */ }
    // A send cut off by a reload is retried; the server deduplicates it.
    this.entries = saved.map(e => e.state === "sending" ? { ...e, state: "saved" } : e);
  }
  add(item: OutboxItem) {
    const stamped = item.type === "capture" || item.type === "file" ? (this.online() ? item : { ...item, queuedAt: item.queuedAt ?? item.capturedAt }) : item;
    this.entries = [...this.entries, { item: stamped, state: "saved" }];
    this.persist(); this.kick();
  }
  dismiss(id: string) { this.entries = this.entries.filter(e => !(e.state === "failed" && e.item.id === id)); this.persist(); }
  kick() { if (this.stopped) return; clearTimeout(this.timer); this.timer = undefined; this.attempt = 0; void this.run(); }
  stop() { this.stopped = true; clearTimeout(this.timer); }
  get waiting() { return this.entries.filter(e => e.state !== "failed").length; }
  private persist() { this.store.set(this.key, JSON.stringify(this.entries)); this.changed(this.entries); }
  private update(target: OutboxEntry, next: Partial<OutboxEntry>) {
    const updated = { ...target, ...next };
    this.entries = this.entries.map(e => e === target ? updated : e); this.persist(); return updated;
  }
  private async run() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (!this.stopped) {
        let entry = this.entries.find(e => e.state !== "failed");
        if (!entry) break;
        entry = this.update(entry, { state: "sending" });
        let result: { status: string } | null = null;
        try { result = await this.send(entry.item); } catch { result = null; }
        if (this.stopped) return;
        const reason = result ? settledReason(result.status) : null;
        if (reason === null) {
          // Not settled: keep it, mark it as having waited, and retry later, still first in line.
          const item = (entry.item.type === "capture" || entry.item.type === "file") && !entry.item.queuedAt ? { ...entry.item, queuedAt: entry.item.capturedAt } : entry.item;
          this.update(entry, { state: "saved", item });
          this.timer = setTimeout(() => { this.timer = undefined; void this.run(); }, retryDelay(this.attempt++));
          return;
        }
        this.attempt = 0;
        if (reason) this.update(entry, { state: "failed", reason });
        else { const done = entry; this.entries = this.entries.filter(e => e !== done); this.persist(); }
        this.settled(entry.item, reason);
      }
    } finally { this.running = false; }
  }
}

// Photo and file bytes wait in IndexedDB (localStorage is too small), keyed by the item's id.
export type BlobStore = { put(id: string, blob: Blob): Promise<void>; get(id: string): Promise<Blob | null>; delete(id: string): Promise<void> };
export function memoryBlobs(): BlobStore {
  const map = new Map<string, Blob>();
  return { put: async (id, blob) => { map.set(id, blob); }, get: async id => map.get(id) ?? null, delete: async id => { map.delete(id); } };
}
export function browserBlobs(name = "cw-scribe-files"): BlobStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("blobs"); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const run = async <T,>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    try { return await new Promise<T>((resolve, reject) => { const request = work(db.transaction("blobs", mode).objectStore("blobs")); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  };
  return {
    put: async (id, blob) => { await run("readwrite", s => s.put(blob, id)); },
    get: async id => (await run<Blob | undefined>("readonly", s => s.get(id))) ?? null,
    delete: async id => { await run("readwrite", s => s.delete(id)); },
  };
}
