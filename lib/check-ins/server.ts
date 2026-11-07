import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/auth/policy";
import { digest, hash } from "@/lib/room/policy";
import { sendEmail } from "@/lib/server/email";
import { checkInEmail } from "@/lib/email/check-in";
import { fictionalEmail, groupRecipients, type Owned } from "./policy";

const secret = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Server connection unavailable");
  return key;
};
// A person's link is made from their recipient id and the server's secret, so a send that stopped half way
// makes the same link again when it resumes. The database keeps only the hash.
export const linkToken = (recipient: string) => digest(secret(), "check-in-link", recipient);
export const tokenHash = (token: string) => hash(token);
export const freshToken = () => randomBytes(24).toString("base64url");

type Recipient = { id: string; email: string; name: string; items: { steps: { id: string; text: string; due?: string | null }[]; goals: { id: string; text: string; due?: string | null }[] } };
export type RoundResult = { status: string; sent?: number; practice?: number; failed?: number };

// Sends one round: one email a person, never to a practice address, the recipient id as the idempotency key.
// Safe to run twice: a round already sent, or held by another run, sends nothing.
export async function sendRound(client: SupabaseClient, round: string, by: string, today: string, force: boolean): Promise<RoundResult> {
  const config = authConfig(); if (!config) throw new Error("Server connection unavailable");
  const begun = await client.rpc("check_in_round_begin", { p_round: round, p_by: by, p_today: today, p_force: force });
  if (begun.error) throw begun.error;
  const b = begun.data as { status: string; practice_room: boolean; church: string; day: 30 | 60 | 90; next_on: string | null; recipients: Recipient[]; owned: Record<string, unknown>[] | null };
  if (b.status !== "ok") return { status: b.status };
  let recipients = b.recipients;
  if (b.owned) {
    const owned: Owned[] = b.owned.map(o => ({ kind: o.kind as "step" | "goal", id: String(o.id), label: String(o.label), date: (o.date as string | null) ?? null, email: String(o.email), name: (o.name as string | null) ?? null, attendee: (o.attendee as string | null) ?? null, ord: Number(o.ord) }));
    const people = groupRecipients(owned).map(p => { const id = randomUUID(); return { id, email: p.email, name: p.name, attendee: p.attendee, steps: p.steps, goals: p.goals, token_hash: tokenHash(linkToken(id)) }; });
    const saved = await client.rpc("check_in_round_save", { p_round: round, p_people: people });
    if (saved.error) throw saved.error;
    if (saved.data.status !== "ok") return { status: saved.data.status };
    recipients = saved.data.recipients;
  }
  for (const r of recipients) {
    let result: "sent" | "practice_address" | "failed";
    if (b.practice_room || fictionalEmail(r.email)) result = "practice_address";
    else {
      try {
        const message = checkInEmail({ church: b.church, first: r.name.split(/\s+/)[0] ?? "", day: b.day, link: `${config.origin}/c/${linkToken(r.id)}`,
          steps: r.items.steps.map(s => ({ text: s.text, due: s.due })), goals: r.items.goals.map(g => ({ title: g.text, end: g.due })), nextOn: b.next_on });
        await sendEmail({ to: r.email, id: r.id, ...message });
        result = "sent";
      } catch { result = "failed"; }
    }
    const saved = await client.rpc("check_in_recipient_result", { p_recipient: r.id, p_result: result });
    if (saved.error) throw saved.error;
  }
  const done = await client.rpc("check_in_round_finish", { p_round: round });
  if (done.error) throw done.error;
  return { status: done.data.status, sent: done.data.sent, practice: done.data.practice, failed: done.data.failed };
}

// Every round due today. Several due rounds of one engagement send only the latest (the database puts the rest away).
export async function runDue(client: SupabaseClient, today: string) {
  const claimed = await client.rpc("check_in_claim_due", { p_today: today });
  if (claimed.error) throw claimed.error;
  const results: RoundResult[] = [];
  for (const due of (claimed.data.rounds ?? []) as { round: string }[]) {
    try { results.push(await sendRound(client, due.round, "schedule", today, false)); } catch { results.push({ status: "failed" }); }
  }
  return results;
}

// The phone page's read, by the token's hash. The token is the only key, so nothing here says whether an engagement exists.
export async function readPhone(client: SupabaseClient, token: string) {
  const { data, error } = await client.rpc("check_in_phone_read", { p_hash: tokenHash(token) });
  if (error) throw error;
  return data as import("./policy").PhoneView;
}
export async function savePhone(client: SupabaseClient, token: string, save: { kind: string; item: string | null; answer: string | null; note: string | null }) {
  const { data, error } = await client.rpc("check_in_phone_save", { p_hash: tokenHash(token), p_kind: save.kind, p_item: save.item, p_answer: save.answer, p_note: save.note });
  if (error) throw error;
  return data as { status: string };
}
