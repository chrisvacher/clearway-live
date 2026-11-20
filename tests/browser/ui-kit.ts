import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import { chromium, expect as playwrightExpect } from "playwright/test";
import { checkTabAppearance } from "./tab-appearance";

const origin = "http://clearway-ui-kit.test";
const stylesheet = [
  "design/clearway-base/colors_and_type.css",
  "design/clearway-live/live_tokens.css",
  "app/globals.css",
  "components/ui/ui.css",
];

async function main() {
  const sourceFiles = (await readdir("components/ui")).filter(file => /\.(tsx|css)$/.test(file));
  for (const file of sourceFiles) {
    assert.doesNotMatch(await readFile(`components/ui/${file}`, "utf8"), /#[0-9a-f]{3,8}\b/i, `${file} uses tokens for colors`);
  }

  const { outputFiles } = await build({
    entryPoints: ["tests/browser/ui-kit-fixture.tsx"],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    banner: { js: "globalThis.process = { env: {} };" },
    define: { "process.env.NODE_ENV": '"production"' },
    write: false,
  });
  const css = (await Promise.all(stylesheet.map(file => readFile(file, "utf8"))))
    .join("\n").replace(/^@(import|tailwind)\b.*$/gm, "");
  const browser = await chromium.launch({ channel: process.env.KIT_CHROME_CHANNEL });
  const errors: string[] = [];
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    page.setDefaultTimeout(6000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route(`${origin}/**`, route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/kit.js") return route.fulfill({ contentType: "text/javascript", body: outputFiles[0].text });
      if (/^\/fonts\/PlusJakartaSans-[a-z]+\.ttf$/i.test(path)) return route.fulfill({ path: `design/clearway-base${path}` });
      if (path === "/next") return route.fulfill({ contentType: "text/html", body: "<h1>Next page</h1>" });
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><meta charset="utf-8"><title>Facilitator UI kit</title><style>${css}</style><div id="root"></div><script src="/kit.js" defer></script></html>`,
      });
    });
    await page.goto(origin);

    const more = page.getByRole("button", { name: "More actions" });
    await page.getByRole("heading", { name: "Workshop at Pickering" }).waitFor();
    await page.getByRole("button", { name: "Edit event" }).focus();
    await page.keyboard.press("Tab");
    await playwrightExpect(more).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByText("Print run of show", { exact: true }).waitFor();
    await page.keyboard.press("Escape");

    const stage = page.getByRole("button", { name: /Setup/ });
    await stage.click();
    await page.getByText("Mark as done", { exact: true }).waitFor();
    await playwrightExpect(page.getByRole("menu").getByText("Discover", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    const tabs = page.getByRole("tablist", { name: "People and access" });
    await tabs.getByRole("tab", { name: /^People/ }).focus();
    await page.keyboard.press("ArrowRight");
    await playwrightExpect(tabs.getByRole("tab", { name: "Access" })).toBeFocused();
    await playwrightExpect(tabs.getByRole("tab", { name: "Access" })).toHaveAttribute("aria-selected", "true");
    await playwrightExpect(tabs.getByRole("tab", { name: "Access" })).toHaveCSS("outline-width", "2px");
    await playwrightExpect(tabs.getByRole("tab", { name: "Access" })).toHaveCSS("outline-offset", "2px");
    const tablists = [tabs, ...["Engagements by date", "Room admin tabs"].map(name => page.getByRole("tablist", { name, exact: true }))];
    for (const tablist of tablists) await checkTabAppearance(tablist);

    const zone = page.getByRole("combobox", { name: "Time zone" });
    await zone.fill("can");
    await page.getByRole("option", { name: /Toronto/ }).waitFor();
    await page.keyboard.press("ArrowDown");
    await playwrightExpect(zone).toHaveAttribute("aria-activedescendant", /.+/);
    await page.keyboard.press("Enter");
    await playwrightExpect(page.getByRole("listbox")).toHaveCount(0);
    await playwrightExpect(zone).toHaveValue("Eastern Time · Toronto");

    const selectRow = page.getByRole("table", { name: "Attendees" }).getByRole("row", { name: /Ruth/ }).getByRole("checkbox");
    await selectRow.check();
    await page.getByText("1 selected", { exact: true }).waitFor();

    const close = page.getByRole("button", { name: "Close engagement" });
    await close.click();
    const dialog = page.getByRole("dialog", { name: "Close this engagement?" });
    await playwrightExpect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await playwrightExpect(dialog).toBeHidden();
    await playwrightExpect(close).toBeFocused();

    await page.keyboard.press("Control+k");
    const jump = page.getByPlaceholder("Jump to an event, page or action");
    await playwrightExpect(jump).toBeFocused();
    await jump.fill("pick live");
    await page.getByText("Live room · Pickering workshop", { exact: true }).waitFor();
    await page.keyboard.press("Enter");
    await page.getByText("Picked the live room", { exact: true }).waitFor();

    const title = page.getByRole("textbox", { name: "Event title" });
    await title.fill("Pickering workshop");
    await playwrightExpect(page.getByText("1 unsaved change: Event title", { exact: true })).toBeVisible();
    await page.keyboard.press("Control+s");
    await playwrightExpect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await playwrightExpect(page.getByRole("button", { name: "Save changes" })).toBeHidden();

    await title.fill("Unavailable title");
    await page.keyboard.press("Control+s");
    await playwrightExpect(page.getByRole("alert")).toHaveText("That title is unavailable.");
    await playwrightExpect(title).toHaveValue("Unavailable title");

    await title.fill("Another title");
    await page.getByRole("link", { name: "Open another page" }).click();
    const leave = page.getByRole("dialog", { name: "Leave without saving?" });
    await leave.getByRole("button", { name: /Cancel|Keep editing/ }).click();
    await playwrightExpect(title).toHaveValue("Another title");
    await page.getByRole("button", { name: "Discard" }).click();
    await playwrightExpect(title).toHaveValue("Pickering workshop");

    await page.getByRole("button", { name: "Hide response" }).click();
    const hidden = page.getByRole("status").filter({ hasText: "Response hidden" });
    await hidden.getByRole("button", { name: "Show again" }).click();
    await playwrightExpect(page.getByRole("status").filter({ hasText: "Response restored" })).toBeVisible();
    await playwrightExpect(hidden).toBeHidden();

    const goLive = page.getByRole("button", { name: /Go live/ });
    const size = await goLive.boundingBox();
    assert.ok(size && size.height === 64, "large Go live is 64 pixels tall");
    await playwrightExpect(goLive).toHaveCSS("background-color", "rgb(3, 41, 78)");
    await playwrightExpect(goLive.locator("svg")).toHaveCSS("background-color", "rgb(241, 80, 37)");
    await close.focus();
    await page.keyboard.press("Tab");
    await playwrightExpect(goLive).toBeFocused();
    await playwrightExpect(goLive).toHaveCSS("outline-offset", "3px");

    for (const width of [1280, 1440, 1512, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `the kit fits at ${width}px`);
    }
    for (const tablist of tablists) {
      for (const tab of await tablist.getByRole("tab").all()) {
        assert.ok((await tab.boundingBox())!.height >= 44, "each tab keeps a 44px phone touch target");
      }
    }
    await page.getByRole("button", { name: "More for Ruth" }).click();
    await page.getByRole("menuitem", { name: "Edit Ruth" }).click();
    await playwrightExpect(page.getByRole("status").filter({ hasText: "Opened Ruth" })).toBeVisible();

    await title.fill("Title to leave behind");
    await page.getByRole("link", { name: "Open another page" }).click();
    await leave.getByRole("button", { name: "Leave without saving", exact: true }).click();
    await playwrightExpect(page.getByRole("heading", { name: "Next page" })).toBeVisible();

    assert.deepEqual(errors, []);
    console.log("Shared facilitator components pass focus, keyboard, selection, save and layout checks.");
  } catch (error) {
    if (errors.length) console.error(errors.join("\n"));
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
