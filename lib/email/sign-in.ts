import { emailToken as token } from "./tokens";

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function signInEmail({ code, church, link }: { code: string; church: string; link: string }) {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid sign-in code");
  const url = new URL(link);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Invalid sign-in link");
  const font = `font-family:${token("--font-sans")};font-size:${token("--cwl-fs-phone-body")};line-height:${token("--lh-body")};color:${token("--cwl-text-on-card")}`;
  const gap = token("--space-6");
  const smallGap = token("--space-4");
  const text = `Your Clearway sign-in code\n\n${code}\n\nEnter this code to sign in to ${church}. You can use it on another device.\n\nUse your newest code. It expires in 10 minutes and allows 5 attempts.\n\nOr open this link and tap Confirm sign-in:\n${link}\n\nIf you didn’t ask for this code, you can ignore this email.`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your Clearway sign-in code</title></head>
<body style="margin:0;background:${token("--cwl-surface-card")};${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:${gap}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td style="${font}">
<p style="margin:0 0 ${gap};font-weight:${token("--fw-bold")}">Clearway Live</p>
<h1 style="margin:0 0 ${smallGap};font-size:${token("--cwl-fs-phone-prompt")};line-height:${token("--lh-heading")}">Your sign-in code</h1>
<p style="margin:0 0 ${gap}">Sign in to ${escape(church)}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${token("--cwl-surface")};border-radius:${token("--cwl-radius-card")}"><tr><td align="center" style="padding:${gap}">
<p id="sign-in-code" style="margin:0;color:${token("--cwl-text")};font-size:${token("--fs-h1")};font-weight:${token("--fw-bold")};line-height:${token("--lh-heading")};letter-spacing:${token("--tracking-eyebrow")};white-space:nowrap">${code}</p>
</td></tr></table>
<p style="margin:${gap} 0 ${smallGap}">Enter this code in the room. You can use it on another device.</p>
<p style="margin:0 0 ${gap}">Use your newest code. It expires in 10 minutes and allows 5 attempts.</p>
<p style="margin:0 0 ${smallGap}">Or sign in on this device:</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${token("--cwl-button-primary")};border-radius:${token("--cwl-radius-button")}"><a href="${escape(link)}" style="display:inline-block;padding:${smallGap} ${gap};color:${token("--cwl-on-accent")};font-weight:${token("--fw-semibold")};text-decoration:none">Confirm sign-in</a></td></tr></table>
<p style="margin:${gap} 0 0;font-size:${token("--cwl-fs-phone-label")}">If you didn’t ask for this code, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: `Your sign-in code for ${church}`, text, html };
}
