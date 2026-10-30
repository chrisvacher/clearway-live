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
