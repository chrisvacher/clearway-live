import assert from "node:assert/strict";
import test from "node:test";
import { signInEmail } from "../../lib/email/sign-in";

test("sign-in email preserves leading zeros, escapes church/link content and excludes executable actions", () => {
  const message = signInEmail({ code: "012345", church: '<img src=x onerror="alert(1)"> & church', link: "https://live.clearway.co/confirm?challenge=sample&token=sample" });
  assert.match(message.text, /\n\n012345\n\n/);
  assert.doesNotMatch(message.text, /012345\./);
  assert.match(message.html, />012345<\/p>/);
  assert.match(message.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; church/);
  assert.match(message.html, /challenge=sample&amp;token=sample/);
  assert.doesNotMatch(message.html, /<script|<img|<form|onclick=|var\(--/i);
  assert.throws(() => signInEmail({ code: "12345", church: "Church", link: "https://live.clearway.co/confirm" }));
  assert.throws(() => signInEmail({ code: "012345", church: "Church", link: "javascript:alert(1)" }));
});

test("each skin's sign-in email names its own brand, sends no other, and keeps the facts", () => {
  const link = (skin: string) => `https://live.${skin}.co/room/e/confirm?challenge=c&token=t`;
  const clearway = signInEmail({ code: "012345", church: "Riverside", link: link("clearway") });
  const novetera = signInEmail({ code: "012345", church: "Riverside", link: link("novetera"), skin: "novetera" });
  assert.deepEqual(signInEmail({ code: "012345", church: "Riverside", link: link("clearway"), skin: "clearway" }), clearway, "the default is Clearway");
  assert.match(clearway.text, /^Your Clearway sign-in code\n/); assert.match(clearway.html, />Clearway Live<\/p>/);
  assert.match(novetera.text, /^Your Novetera sign-in code\n/); assert.match(novetera.html, /<title>Your Novetera sign-in code<\/title>/); assert.match(novetera.html, />Novetera<\/p>/);
  for (const m of [clearway, novetera]) { assert.equal(m.subject, "Your sign-in code for Riverside"); assert.match(m.text, /\n\n012345\n\n/); assert.match(m.html, />012345<\/p>/); assert.doesNotMatch(m.html, /<script|<img|var\(--/i); }
  // Novetera's light theme: Oxblood 700 button, Charcoal code panel with Chalk digits, Stone 150 hairline.
  assert.match(novetera.html, /background:#7A1F2B/); assert.match(novetera.html, /background:#1F2328/); assert.match(novetera.html, /color:#F7F6F3/); assert.match(novetera.html, /#E3E0D9/);
  assert.doesNotMatch(novetera.html, /Clearway|clearway/); assert.doesNotMatch(novetera.text, /Clearway|clearway/);
  assert.doesNotMatch(clearway.html, /Novetera/);
});
