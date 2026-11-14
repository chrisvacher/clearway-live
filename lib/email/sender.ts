import { skinOf, type Skin } from "../brand";

// Who a message is sent as. A Clearway message is sent from EMAIL_FROM or RESEND_FROM_EMAIL, as it always was. A Novetera message is sent from
// NOVETERA_EMAIL_FROM only, with replies to NOVETERA_REPLY_TO (default: the address inside NOVETERA_EMAIL_FROM). With no NOVETERA_EMAIL_FROM a
// Novetera message is never sent from the Clearway address: it fails the way a missing sender fails.
export function sender(skin?: Skin): { from: string; replyTo?: string } | null {
  if (skinOf(skin) !== "novetera") { const from = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL; return from ? { from } : null; }
  const from = process.env.NOVETERA_EMAIL_FROM?.trim();
  if (!from) return null;
  const replyTo = process.env.NOVETERA_REPLY_TO?.trim() || /<([^<>\s]+@[^<>\s]+)>/.exec(from)?.[1] || (/^[^<>\s]+@[^<>\s]+$/.test(from) ? from : undefined);
  return { from, ...(replyTo ? { replyTo } : {}) };
}
