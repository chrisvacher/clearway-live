import { emailToken as token } from "./tokens";
import { shortDate } from "@/lib/check-ins/policy";

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export type CheckInEmailInput = {
  church: string; first: string; day: 30 | 60 | 90; link: string;
  steps: { text: string; due?: string | null }[]; goals: { title: string; end?: string | null }[];
  nextOn?: string | null;
};

// One person's check-in email: their own first steps and goals, one button, no sign-in. The 90-day email thanks them and says
// the check-ins end here. Built from the same tokens as the sign-in email, with inline values because mail clients ignore variables.
export function checkInEmail({ church, first, day, link, steps, goals, nextOn }: CheckInEmailInput) {
  const url = new URL(link);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Invalid check-in link");
  const last = day === 90;
  const font = `font-family:${token("--font-sans")};font-size:${token("--cwl-fs-phone-body")};line-height:${token("--lh-body")};color:${token("--cwl-text-on-card")}`;
  const gap = token("--space-6"), smallGap = token("--space-4");
  const hello = first.trim() ? `Hi ${first.trim()},` : "Hello,";
  const intro = `It has been ${day} days since the Wayfinding retreat. Two minutes is all this takes: tell us how your own first steps and goals are going${last ? ", for the last time" : ""}.`;
  const outro = last ? "Thank you for the work you have put in. This is the last check-in, so the check-ins end here." : nextOn ? `The next check-in comes by email on ${shortDate(nextOn)}.` : "";
  const stepLine = (s: { text: string; due?: string | null }) => `${s.text}${s.due ? ` (due ${shortDate(s.due)})` : ""}`;
  const goalLine = (g: { title: string; end?: string | null }) => `${g.title}${g.end ? ` (ends ${shortDate(g.end)})` : ""}`;
  const subject = `Your ${day}-day check-in for ${church}`;
  const text = [
    subject, "", hello, "", intro, "",
    ...(steps.length ? ["Your first steps:", ...steps.map(s => `* ${stepLine(s)}`), ""] : []),
    ...(goals.length ? ["Your goals:", ...goals.map(g => `* ${goalLine(g)}`), ""] : []),
    "Open your check-in:", link, "",
    "This link is yours. It needs no sign-in, so please keep it to yourself. Your answers go to your Clearway facilitator.",
    ...(outro ? ["", outro] : []),
  ].join("\n");
  const list = (title: string, items: string[]) => items.length
    ? `<p style="margin:0 0 ${token("--space-2")};font-weight:${token("--fw-bold")}">${title}</p><ul style="margin:0 0 ${gap};padding-left:${gap}">${items.map(i => `<li style="margin:0 0 ${token("--space-2")}">${escape(i)}</li>`).join("")}</ul>` : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;background:${token("--cwl-surface-card")};${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:${gap}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td style="${font}">
<p style="margin:0 0 ${gap};font-weight:${token("--fw-bold")}">Clearway Live</p>
<h1 style="margin:0 0 ${smallGap};font-size:${token("--cwl-fs-phone-prompt")};line-height:${token("--lh-heading")}">Your ${day}-day check-in</h1>
<p style="margin:0 0 ${smallGap}">${escape(hello)}</p>
<p style="margin:0 0 ${gap}">${escape(intro)}</p>
${list("Your first steps", steps.map(stepLine))}${list("Your goals", goals.map(goalLine))}<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${token("--cwl-button-primary")};border-radius:${token("--cwl-radius-button")}"><a href="${escape(link)}" style="display:inline-block;padding:${smallGap} ${gap};color:${token("--cwl-on-accent")};font-weight:${token("--fw-semibold")};text-decoration:none">Open my ${day}-day check-in</a></td></tr></table>
<p style="margin:${gap} 0 ${smallGap};font-size:${token("--cwl-fs-phone-label")}">This link is yours. It needs no sign-in, so please keep it to yourself. Your answers go to your Clearway facilitator.</p>
${outro ? `<p style="margin:0;font-size:${token("--cwl-fs-phone-label")}">${escape(outro)}</p>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
