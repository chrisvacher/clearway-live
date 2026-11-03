import { clockSample } from "../live/protocol";

// A pairing code lives for exactly as long as the database says. The TV keeps
// its own estimate of the server's clock from every pairing poll and never
// shows a code past the moment the server could refuse it, whatever the TV
// computer's own clock says and however late its next poll is.
export type PairClock = { offsetMs: number; uncertaintyMs: number };

// The app server stamps the time; the database decides expiry. This covers the
// difference between their clocks, which are both kept by network time.
export const pairSkewMs = 250;
// Unpaired TVs ask every second, so an approval lands at once.
export const pairPollMs = 1000;
// Never ask faster than this, even right at expiry.
export const pairRetryMs = 200;
// How long past expiry the TV keeps asking at that quicker pace.
export const pairOverdueMs = 2000;

export const unknownPairClock: PairClock = { offsetMs: 0, uncertaintyMs: 0 };

// One poll's measurement. A response without a usable server time falls back
// to the TV's own clock, with the round trip as its uncertainty.
export function pairSample(sent: number, received: number, serverTime: unknown): PairClock {
  const at = typeof serverTime === "string" ? Date.parse(serverTime) : NaN;
  try { return clockSample(sent, received, at); } catch { return { offsetMs: 0, uncertaintyMs: Math.max(0, (received - sent) / 2) }; }
}

// Milliseconds until the code must leave the screen: the latest the server's
// clock could read, plus the database allowance, must still be before expiry.
export function pairShowMs(expires: string, now: number, clock: PairClock) {
  const at = Date.parse(expires);
  if (!Number.isFinite(at) || !Number.isFinite(now) || !Number.isFinite(clock.offsetMs) || !Number.isFinite(clock.uncertaintyMs)) return 0;
  return at - (now + clock.offsetMs) - clock.uncertaintyMs - pairSkewMs;
}

// What the TV shows now. The countdown reaches 0:00 as the code leaves.
export function pairCodeView(expires: string, now: number, clock: PairClock) {
  const ms = pairShowMs(expires, now, clock);
  return { shown: ms > 0, seconds: ms > 0 ? Math.ceil(ms / 1000) : 0 };
}

// When to look again for the screen to change: at the next countdown second,
// or the moment the code leaves, whichever is first.
export function pairTickDelay(expires: string, now: number, clock: PairClock) {
  const ms = pairShowMs(expires, now, clock);
  if (ms <= 0) return pairPollMs;
  return Math.max(16, Math.min(ms, ms % 1000 || 1000));
}

// When to poll next. The server issues the replacement on the first poll that
// reaches it after expiry, so the TV asks just after the earliest moment the
// database's clock can have passed expiry, and keeps its usual cadence before.
export function pairPollDelay(expires: string, now: number, clock: PairClock) {
  const ms = pairShowMs(expires, now, clock);
  if (!Number.isFinite(Date.parse(expires))) return pairPollMs;
  const due = ms + 2 * clock.uncertaintyMs + 2 * pairSkewMs;
  // Long overdue means the server is not replacing it yet: keep the usual pace.
  if (due < -pairOverdueMs) return pairPollMs;
  return Math.round(Math.min(pairPollMs, Math.max(pairRetryMs, due)));
}

// The server's reply to an unpaired TV. The database holds only the current
// code's hash: the TV sees the code this request offered, or the one its
// cookie still carries, when it matches. The reply carries the server's time
// so the TV can count down and retire the code on the server's clock.
export type PairState = { code_hash: string; expires_at: string };
export type PairOffer = { code: string; hash: string };
export function pairReply(state: PairState, offered: PairOffer, previous: PairOffer | null, serverNow: number) {
  const visible = state.code_hash === offered.hash ? offered.code : previous && state.code_hash === previous.hash ? previous.code : null;
  if (!visible) return { status: "opening" as const };
  return { status: "pair" as const, code: visible, expires_at: state.expires_at, server_time: new Date(serverNow).toISOString() };
}
