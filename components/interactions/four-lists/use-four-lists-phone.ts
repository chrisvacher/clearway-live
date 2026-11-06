"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { clockSample } from "@/lib/live/protocol";
import { browserStore, PhoneOutbox } from "@/lib/phone/outbox";
import type { OutboxEntry } from "@/lib/phone/types";
import { agreeState, isAgree, nextAgree, type AgreeRequest, type FourAgree, type FourCard } from "@/lib/interactions/four-lists";

type Snapshot = { entries: OutboxEntry[]; agrees: FourAgree[]; cards: FourCard[] | null; notice: string };

// One Four Helpful Lists agree outbox per engagement on this phone: agrees kept on the phone until the server settles them,
// sent one at a time in the order made, with the same id, revision and times on every retry. A phone outside the live frame
// (a self-paced step) also reads the step's top cards here, because it has no live results to follow.
class FourPhone {
  snap: Snapshot = { entries: [], agrees: [], cards: null, notice: "" };
  private listeners = new Set<() => void>();
  private outbox: PhoneOutbox;
  private settledAgrees = new Map<string, FourAgree>();
  private replies = new Map<string, { id?: string; revision?: number }>();
  private clock = { offsetMs: 0, uncertaintyMs: 60000 };
  private timer?: ReturnType<typeof setTimeout>;
  private server: FourAgree[] = [];
  session: string | null = null;
  constructor(private engagement: string) {
    this.outbox = new PhoneOutbox(`cw-four-outbox-${engagement}`, async request => {
      const r = request as AgreeRequest;
      const body = { id: r.id, card: r.value.card, revision: r.revision, on: r.value.on, sentAt: r.sentAt, queuedAt: r.queuedAt, uncertaintyMs: r.uncertaintyMs };
      const response = await fetch(`/api/live/${engagement}/agree`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status >= 500 || response.status === 403) throw new Error("retry");
      const data = await response.json() as { status: string; id?: string; revision?: number };
      this.replies.set(`${request.id}:${request.revision}`, data);
      return data;
    }, entries => this.update({ entries }), (request, reason) => this.settled(request as AgreeRequest, reason), browserStore, () => navigator.onLine);
    this.snap.entries = this.outbox.entries;
    void this.load();
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<Snapshot>) { this.snap = { ...this.snap, ...patch }; this.listeners.forEach(l => l()); }
  private settled(request: AgreeRequest, reason: string) {
    const reply = this.replies.get(`${request.id}:${request.revision}`); this.replies.delete(`${request.id}:${request.revision}`);
    if (!isAgree(request)) return;
    if (reason) {
      // An agree the room can't count (your own card, gone, or closed) quietly goes back.
      this.outbox.dismiss(request.id, request.revision);
      this.notice("That couldn’t be counted.");
    } else {
      const card = request.value.card, id = reply?.id ?? request.id, revision = reply?.revision ?? request.revision, before = this.settledAgrees.get(card);
      if (!before || before.revision <= revision) this.settledAgrees.set(card, { id, card_id: card, agreed: request.value.on, revision });
      this.update({ agrees: this.merged() });
    }
    this.later();
  }
  private notice(text: string) { this.update({ notice: text }); setTimeout(() => { if (this.snap.notice === text) this.update({ notice: "" }); }, 4000); }
  private merged() {
    const out = new Map(this.server.map(v => [v.card_id, v]));
    this.settledAgrees.forEach((v, q) => { const s = out.get(q); if (!s || (s.id === v.id ? s.revision < v.revision : true)) out.set(q, v); });
    return [...out.values()];
  }
  private later() { clearTimeout(this.timer); this.timer = setTimeout(() => void this.load(), 400); }
  async load() {
    try {
      const sent = Date.now(), response = await fetch(`/api/live/${this.engagement}/agree${this.session ? `?session=${this.session}` : ""}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { status: string; agrees: FourAgree[]; cards?: FourCard[] | null; server_time?: string };
      if (data.server_time) this.clock = clockSample(sent, Date.now(), Date.parse(data.server_time));
      if (data.status !== "ok") return;
      this.server = data.agrees;
      for (const [q, v] of this.settledAgrees) { const s = data.agrees.find(x => x.card_id === q); if (s && (s.id !== v.id || s.revision >= v.revision)) this.settledAgrees.delete(q); }
      this.update({ agrees: this.merged(), ...(this.session ? { cards: data.cards ?? null } : {}) });
    } catch { /* Keep the last agrees while offline. */ }
  }
  private stamp() { return { sentAt: new Date(Date.now() + this.clock.offsetMs).toISOString(), uncertaintyMs: Math.min(60000, Math.round(this.clock.uncertaintyMs)) }; }
  agree(card: string, session: string) {
    const current = agreeState(this.snap.agrees, this.snap.entries).get(card);
    if (current?.pending) return;
    const next = nextAgree(current, () => crypto.randomUUID());
    this.outbox.add({ id: next.id, session, revision: next.revision, action: next.revision ? "change" : "submit", text: "", value: { four: "agree", card, on: next.on }, ...this.stamp() });
  }
  kick() { this.outbox.kick(); void this.load(); }
}

const phones = new Map<string, FourPhone>();
const idle: Snapshot = { entries: [], agrees: [], cards: null, notice: "" }, never = () => () => {};
// Until the room's first frame names the engagement there is nothing to send or show. `poll` is the self-paced step to read
// the top cards of (a live step gets them from the room's frame instead).
export function useFourListsPhone(engagement: string | null, poll: string | null = null) {
  const four = useMemo(() => { if (!engagement) return null; let p = phones.get(engagement); if (!p) { p = new FourPhone(engagement); phones.set(engagement, p); } return p; }, [engagement]);
  useEffect(() => {
    if (!four) return;
    four.session = poll; if (poll) void four.load();
    const resume = () => { if (document.visibilityState === "visible") four.kick(); };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    const timer = poll ? setInterval(() => void four.load(), 5000) : undefined;
    return () => { window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); clearInterval(timer); if (four.session === poll) four.session = null; };
  }, [four, poll]);
  const snap = useSyncExternalStore(four ? four.subscribe : never, () => four?.snap ?? idle, () => four?.snap ?? idle);
  const agrees = useMemo(() => agreeState(snap.agrees, snap.entries), [snap.agrees, snap.entries]);
  return { ...snap, agrees, agree: (card: string, session: string) => four?.agree(card, session), reload: () => void four?.load() };
}
