import { emailToken } from "./tokens";
import { skinOf, type Skin } from "../brand";
import { copyFor } from "../brand/copy";

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

// The Clearway email is the one the app always sent. A Novetera email changes the words, the colours (the Novetera light theme) and the header (the
// wordmark over a rule, as the canvas draws it, with the tagline as the footer); the layout and the facts it states are the same.
export function signInEmail({ code, church, link, skin: given }: { code: string; church: string; link: string; skin?: Skin }) {
  const skin = skinOf(given), words = copyFor(skin).signIn, nv = skin === "novetera";
  const token = (name: string) => emailToken(name, skin);
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid sign-in code");
  const url = new URL(link);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Invalid sign-in link");
  const font = `font-family:${token("--font-sans")};font-size:${token("--cwl-fs-phone-body")};line-height:${token("--lh-body")};color:${token("--cwl-text-on-card")}`;
  const gap = token("--space-6");
  const smallGap = token("--space-4");
  const text = `${words.codeTitle}\n\n${code}\n\nEnter this code to sign in to ${church}. You can use it on another device.\n\nUse your newest code. It expires in 10 minutes and allows 5 attempts.\n\nOr open this link and tap Confirm sign-in:\n${link}\n\nIf you didn’t ask for this code, you can ignore this email.`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${words.codeTitle}</title></head>
<body style="margin:0;background:${token("--cwl-surface-card")};${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:${gap}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td style="${font}">
${nv ? `<p style="margin:0 0 ${gap};padding-bottom:${smallGap};border-bottom:3px solid ${token("--cwl-text")};font-size:${token("--cwl-fs-phone-prompt")};font-weight:${token("--fw-bold")};letter-spacing:${token("--tracking-eyebrow")};text-transform:uppercase">${words.header}</p>` : `<p style="margin:0 0 ${gap};font-weight:${token("--fw-bold")}">${words.header}</p>`}
<h1 style="margin:0 0 ${smallGap};font-size:${token("--cwl-fs-phone-prompt")};line-height:${token("--lh-heading")}">Your sign-in code</h1>
<p style="margin:0 0 ${gap}">Sign in to ${escape(church)}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${token(nv ? "--cwl-surface-panel" : "--cwl-surface")};border-radius:${token("--cwl-radius-card")}"><tr><td align="center" style="padding:${gap}">
<p id="sign-in-code" style="margin:0;color:${token(nv ? "--cwl-text-on-panel" : "--cwl-text")};font-size:${token("--fs-h1")};font-weight:${token("--fw-bold")};line-height:${token("--lh-heading")};letter-spacing:${token("--tracking-eyebrow")};white-space:nowrap">${code}</p>
</td></tr></table>
<p style="margin:${gap} 0 ${smallGap}">Enter this code in the room. You can use it on another device.</p>
<p style="margin:0 0 ${gap}">Use your newest code. It expires in 10 minutes and allows 5 attempts.</p>
<p style="margin:0 0 ${smallGap}">Or sign in on this device:</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${token("--cwl-button-primary")};border-radius:${token("--cwl-radius-button")}"><a href="${escape(link)}" style="display:inline-block;padding:${smallGap} ${gap};color:${token("--cwl-on-accent")};font-weight:${token("--fw-semibold")};text-decoration:none">Confirm sign-in</a></td></tr></table>
<p style="margin:${gap} 0 0;font-size:${token("--cwl-fs-phone-label")}">If you didn’t ask for this code, you can ignore this email.</p>${nv ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:${gap};border-top:1px solid ${token("--cwl-border")}"><tr><td style="padding-top:${smallGap};font-family:${token("--cwl-font-editorial")};font-style:italic;font-size:${token("--cwl-fs-phone-body")}">${words.footerTagline}</td><td align="right" style="padding-top:${smallGap};font-size:${token("--cwl-fs-phone-label")};color:${token("--cwl-text-muted")}">${words.footerName}</td></tr></table>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  return { subject: `Your sign-in code for ${church}`, text, html };
}
