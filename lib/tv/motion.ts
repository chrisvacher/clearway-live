// Pure motion rules for the TV, ported from design pass 2 (live-room.js and
// bundle.js). Durations and delays always come from the Clearway Live tokens,
// read from CSS by the caller; nothing here introduces a timing of its own.

export type MotionTiming = { stagger: number; staggerMin: number; maxHold: number; newHold: number };

// One critically damped spring step. A new target bends the motion already
// under way; velocity carries over, so retargeting never restarts an item.
export function springStep(x: number, v: number, target: number, omega: number, dt: number): [number, number] {
  const d = x - target, e = Math.exp(-omega * dt);
  return [target + (d + (v + omega * d) * dt) * e, (v - omega * (v + omega * d) * dt) * e];
}
// The spring settles over a token duration (cwl-dur-regroup for the field).
export const springRate = (durationMs: number) => 6.6 / Math.max(0.001, durationMs / 1000);

// Square root of the count, TV minimum to headline size (matches the server).
export function wordSize(count: number, maxCount: number, minPx: number, maxPx: number) {
  if (maxCount <= 1) return minPx;
  return minPx + (maxPx - minPx) * (Math.sqrt(count) - 1) / (Math.sqrt(maxCount) - 1);
}

// The arrival flow: answers that land together are released cwl-delay-stagger
// apart, compressing toward cwl-delay-stagger-min as the queue grows, so the
// queue clears by 80% of the hold limit. Released answers reach the screen in
// batches no more often than cwl-delay-stagger, and a batch flushes early when
// its oldest answer is within 100ms of the hold limit.
export class ArrivalSchedule<T> {
  private queue: { item: T; at: number }[] = [];
  private buffer: { item: T; at: number }[] = [];
  private lastRelease = -Infinity;
  private lastFlush = -Infinity;
  private lastArrival = -Infinity;
  maxHold = 0;
  constructor(private timing: MotionTiming) {}
  get waiting() { return this.queue.length + this.buffer.length; }
  push(item: T, at: number) { this.queue.push({ item, at }); }
  // Take everything at once: a replay after a reconnect, or a control change.
  drain(now: number) {
    const all = [...this.buffer, ...this.queue];
    this.buffer = []; this.queue = [];
    for (const row of all) this.maxHold = Math.max(this.maxHold, now - row.at);
    if (all.length) this.lastArrival = now;
    return all.map(row => row.item);
  }
  // Called once per frame. Returns the batch to apply now, if any.
  tick(now: number): { items: T[]; holds: number[]; lone: boolean } | null {
    const { stagger, staggerMin, maxHold, newHold } = this.timing;
    if (this.queue.length) {
      const waited = now - this.queue[0].at, budget = Math.max(0, maxHold * 0.8 - waited);
      const interval = Math.max(staggerMin, Math.min(stagger, budget / this.queue.length));
      let go = now - this.lastRelease >= interval ? 1 : 0;
      while (this.queue.length && (go-- > 0 || now - this.queue[0].at >= maxHold - 50)) {
        this.buffer.push(this.queue.shift()!); this.lastRelease = now;
      }
    }
    if (!this.buffer.length) return null;
    if (now - this.lastFlush < stagger && now - this.buffer[0].at < maxHold - 100) return null;
    const batch = this.buffer; this.buffer = []; this.lastFlush = now;
    // Only a lone arrival takes the newest-arrival moment, so Lime never hops.
    const lone = batch.length === 1 && !this.queue.length && now - this.lastArrival > newHold;
    this.lastArrival = now;
    const holds = batch.map(row => now - row.at);
    for (const hold of holds) this.maxHold = Math.max(this.maxHold, hold);
    return { items: batch.map(row => row.item), holds, lone };
  }
}

export type Box = { key: string; w: number; h: number; x?: number; y?: number };
export type Placed = { key: string; x: number; y: number; w: number; h: number };

// The field's plan: nothing overlaps. Larger items are placed first and keep
// their spot if it is still free; anything that no longer fits moves to the
// nearest free spot; a new item takes the free spot nearest the middle. Nothing
// re-sorts by rank. ok is false when some item could not find free space; it
// then keeps its starting spot, and the caller steps every size down and plans again.
export function planField(items: Box[], width: number, height: number, gapX: number, gapY: number): { ok: boolean; placed: Placed[] } {
  const placed: Placed[] = [];
  const fits = (x: number, y: number, w: number, h: number) => {
    if (x - w / 2 < 0 || x + w / 2 > width || y - h / 2 < 0 || y + h / 2 > height) return false;
    return placed.every(p => Math.abs(p.x - x) >= (p.w + w) / 2 + gapX || Math.abs(p.y - y) >= (p.h + h) / 2 + gapY);
  };
  const nearest = (x0: number, y0: number, w: number, h: number): [number, number] | null => {
    if (fits(x0, y0, w, h)) return [x0, y0];
    for (let r = 6; r < Math.max(width, height); r += 6) {
      const steps = Math.max(12, Math.round(r / 4));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2, x = x0 + Math.cos(a) * r * 1.6, y = y0 + Math.sin(a) * r * 0.7;
        if (fits(x, y, w, h)) return [x, y];
      }
    }
    ok = false;
    return null;
  };
  let ok = true;
  const order = items.map((item, i) => ({ item, i })).sort((p, q) => q.item.w * q.item.h - p.item.w * p.item.h || p.i - q.i);
  for (const { item } of order) {
    const start: [number, number] = item.x !== undefined && item.y !== undefined ? [item.x, item.y] : [width / 2, height / 2];
    const at = nearest(start[0], start[1], item.w, item.h) ?? start;
    placed.push({ key: item.key, x: at[0], y: at[1], w: item.w, h: item.h });
  }
  const byKey = new Map(placed.map(p => [p.key, p]));
  return { ok, placed: items.map(item => byKey.get(item.key)!) };
}

// Sizes step down together when the items would crowd the space, never below
// the floor. The first scale comes from area; each failed plan steps 10% down.
export function fitScale(areas: number, width: number, height: number, fill: number) {
  return Math.min(1, Math.sqrt((width * height * fill) / Math.max(1, areas)));
}
