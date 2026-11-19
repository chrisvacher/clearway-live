import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PhoneStep } from "../../lib/phone/types";

// Slide images are for the TV only (November 19, replacing D12 and part of D14). A phone's own screens never draw one and never
// ask for one: no image address at all, so no signed address is made for it. The TV view on phones mirrors the TV and is apart.
const image = "8d000000-0000-4000-8000-000000000060", other = "8d000000-0000-4000-8000-000000000061";
const step = (over: Partial<PhoneStep>): PhoneStep => ({ id: "8d000000-0000-4000-8000-000000000062", title: "Where we have been", part: "Day 1", segment: "Opening",
  interaction: "content", state: "live", prompt: "", phone_depth: "", max_sends: 0, max_characters: 0, max_words: 0, closed_at: null, ...over });
// The components are compiled with the classic JSX runtime here, so React is put on the global before they load.
(globalThis as { React?: typeof React }).React = React;
let PhoneContent: typeof import("../../components/room/phone-content").PhoneContent;
test.before(async () => { ({ PhoneContent } = await import("../../components/room/phone-content")); });
const html = (s: PhoneStep) => renderToStaticMarkup(React.createElement(PhoneContent, { step: s }));
const noImage = (out: string) => {
  assert.doesNotMatch(out, /<img|\/api\/images\/|\/api\/media\//, "no image and no image address");
  assert.doesNotMatch(out, /Pinch to zoom/i, "no Pinch to zoom");
};

test("an Image step (Fill) shows its title as a headline and its phone words, with no image", () => {
  const out = html(step({ options: { screen: "image", image: { id: image, display: "fill" } }, phone_depth: "Look at the dates on the left." }));
  noImage(out);
  assert.match(out, /<h1 class="ph-headline">Where we have been<\/h1>/);
  assert.match(out, /Look at the dates on the left\./);
});

test("an untitled Image step with no phone words still says something, and never the greyed Image 1", () => {
  const out = html(step({ title: "Image 1", options: { screen: "image", untitled: true, image: { id: image, display: "fill" } } }));
  noImage(out);
  assert.doesNotMatch(out, /Image 1/);
  assert.match(out, /Watch the screen\./);
});

test("an older page image (media) is TV only too", () => {
  noImage(html(step({ options: { screen: "image", media: other } })));
});

test("an image loop shows the waiting message without the loop image", () => {
  const out = html(step({ title: "Walk-in loop", options: { screen: "loop", images: [image, other], seconds: 8, transition: "fade" } }));
  noImage(out);
  assert.match(out, /Watch the screen\. Your phone will wake when we start\./);
  assert.match(html(step({ options: { screen: "loop", images: [image] }, phone_depth: "Grab a coffee." })), /Grab a coffee\./);
});

test("an image In place on a headline: the phone shows only the step's own phone content", () => {
  const out = html(step({ prompt: "Three things we will **build together**", options: { screen: "headline", image: { id: image, display: "place" } } }));
  noImage(out);
  assert.match(out, /Three things we will build together/);
});
