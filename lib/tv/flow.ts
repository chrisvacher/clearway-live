import type { LiveEvent, LiveSnapshot } from "../live/types";
import { ArrivalSchedule, type MotionTiming } from "./motion";

// What the TV's animated layer shows now. Counts and sizes are always the
// server's own, from the version being shown.
export type Shown = { frame: LiveSnapshot; fresh: string[]; lone: boolean; replay: boolean };
type Arrival = { frame: LiveSnapshot; id: string };

// Everything about the room except the answers and their results. When any of
// it changes, the event is a control and lands at once.
export function controlsOf(frame: LiveSnapshot) {
  const s = frame.state;
  return JSON.stringify([s.live_session_id, s.tv_content, s.phones_down, s.burst_ends_at, s.spotlight_key ?? null, s.hidden_keys ?? [], s.hidden_ids ?? [],
    s.show_tv_on_phones ?? false, frame.session?.revision ?? null, frame.session?.state ?? null, frame.display ?? null]);
}

// An answer event (submit, change or withdraw) waits its turn in the steady
// flow. Controls, snapshots and replays after a reconnect bring everything
// waiting with them in one pass, so the TV never falls behind the room.
export class TvFlow {
  current: Shown | null = null;
  private schedule: ArrivalSchedule<Arrival>;
  private listeners = new Set<(shown: Shown) => void>();
  constructor(timing: MotionTiming, private now: () => number = () => performance.now()) { this.schedule = new ArrivalSchedule(timing); }
  get maxHold() { return this.schedule.maxHold; }
  get waiting() { return this.schedule.waiting; }
  subscribe(listener: (shown: Shown) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  offer(frame: LiveSnapshot, event?: LiveEvent) {
    const before = this.latest;
    this.latest = frame;
    const arrival = Boolean(event?.answer && !event.answer.hidden && before && controlsOf(before) === controlsOf(frame));
    if (arrival) this.schedule.push({ frame, id: event!.answer!.id }, this.now());
    else {
      const waiting = this.schedule.drain(this.now()).map(item => item.id);
      this.emit({ frame, fresh: event?.answer ? [...waiting, event.answer.id] : waiting, lone: false, replay: true });
    }
  }
  tick() {
    const batch = this.schedule.tick(this.now());
    if (batch) this.emit({ frame: batch.items[batch.items.length - 1].frame, fresh: batch.items.map(item => item.id), lone: batch.lone, replay: false });
  }
  // A hidden page can't animate, so it shows everything waiting at once.
  settle() {
    if (!this.schedule.waiting || !this.latest) return;
    this.emit({ frame: this.latest, fresh: this.schedule.drain(this.now()).map(item => item.id), lone: false, replay: true });
  }
  private latest: LiveSnapshot | null = null;
  private emit(shown: Shown) { this.current = shown; this.listeners.forEach(listener => listener(shown)); }
}
