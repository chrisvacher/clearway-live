import type { Page } from "playwright";

// Samples, on every frame, the image stage's opacity and how much of it its image layers cover. Between two images the old one
// holds under the new, so the cover never drops: that is the "no blank moment" rule for images.
export async function watchStage(page: Page) {
  // Plain script text, so no bundler helper reaches the page.
  await page.evaluate(`(() => {
    window.__img = { min: 1, cover: 1, frames: 0, stop: false };
    const tick = () => {
      if (window.__img.stop) return;
      const stage = document.querySelector(".tv-imgstage");
      if (stage) {
        window.__img.min = Math.min(window.__img.min, Number(getComputedStyle(stage).opacity));
        const layers = [...stage.querySelectorAll(".tv-img-layer")];
        window.__img.cover = Math.min(window.__img.cover, 1 - layers.reduce((x, l) => x * (1 - Number(getComputedStyle(l).opacity)), 1));
      }
      window.__img.frames++; requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  return { stop: () => page.evaluate(`(() => { window.__img.stop = true; return window.__img; })()`) as Promise<{ min: number; cover: number; frames: number }> };
}
