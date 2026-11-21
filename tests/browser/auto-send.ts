// Isolated real-browser input checks. The pass 11 room kit covers transport and RLS.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

export async function testAutoSend() {
  const result = await build({ entryPoints: ["tests/browser/auto-send-fixture.tsx"], bundle: true, write: false, outdir: "/tmp/clearway-auto-send", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const js = result.outputFiles.find(f => f.path.endsWith(".js"))!.text;
  const browser = await chromium.launch({ channel: process.env.KIT_CHROME_CHANNEL });
  try {
    for (const skin of ["clearway", "novetera"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.route("http://auto-send.test/**", route => route.fulfill({ contentType: "text/html", body: `<style>.gfs-phplot{position:relative;width:300px;height:220px}</style><div id="root"></div><script>${js}</script>` }));
      await page.goto(`http://auto-send.test/?skin=${skin}`);
      const count = () => page.evaluate(() => window.autoLog.length);
      await page.getByRole("radio", { name: "First", exact: true }).click();
      assert.equal(await count(), 1); await page.getByRole("radio", { name: "First", exact: true }).click(); assert.equal(await count(), 1);
      await page.getByRole("radio", { name: "Second", exact: true }).click(); assert.equal(await count(), 2);
      assert.equal(await page.getByRole("button", { name: "Send", exact: true }).count(), 0);
      assert.match(await page.locator(".ph-note").innerText(), /Sent\. Tap another to change it\./);
      await page.getByLabel("Interaction").selectOption("multiple");
      await page.getByRole("checkbox", { name: "First", exact: true }).click(); await page.getByRole("checkbox", { name: "Second", exact: true }).click();
      assert.equal(await count(), 0); await page.waitForTimeout(700); assert.equal(await count(), 1);
      assert.deepEqual(await page.evaluate(() => window.autoLog[0].value), { choices: ["o1", "o2"] });
      await page.getByLabel("Interaction").selectOption("ranking");
      await page.getByRole("button", { name: "First", exact: true }).click(); await page.getByRole("button", { name: "Second", exact: true }).click();
      await page.getByRole("button", { name: "Move Second up", exact: true }).click();
      assert.equal(await count(), 0); await page.waitForTimeout(700); assert.equal(await count(), 1);
      assert.deepEqual(await page.evaluate(() => window.autoLog[0].value), { order: ["o2", "o1"] });
      await page.getByLabel("Interaction").selectOption("statements");
      await page.getByRole("radiogroup", { name: "First" }).getByRole("radio").nth(1).click();
      await page.getByRole("radiogroup", { name: "Second" }).getByRole("radio").nth(3).click();
      await page.waitForTimeout(700); assert.equal(await count(), 1);
      assert.deepEqual(await page.evaluate(() => window.autoLog[0].value), { ratings: { o1: 2, o2: 4 } });
      await page.getByLabel("Interaction").selectOption("points");
      await page.getByRole("slider", { name: "First", exact: true }).focus(); await page.keyboard.press("PageUp");
      await page.waitForTimeout(700); assert.equal(await count(), 0, "partial points do not send");
      await page.keyboard.press("End"); await page.waitForTimeout(700); assert.equal(await count(), 1);
      await page.getByLabel("Interaction").selectOption("scale");
      await page.getByRole("radio", { name: "3", exact: true }).click(); await page.getByRole("radio", { name: "3", exact: true }).click(); assert.equal(await count(), 1);
      await page.getByLabel("Interaction").selectOption("grid");
      const plot = await page.getByRole("application").boundingBox();
      assert.ok(plot);
      await page.mouse.move(plot.x + 60, plot.y + 70);
      await page.mouse.down();
      await page.mouse.move(plot.x + 110, plot.y + 90);
      await page.waitForTimeout(700);
      assert.equal(await count(), 0, "a held grid drag does not send");
      await page.mouse.up();
      await page.getByText("Sent. Drag a dot to move it.").waitFor();
      assert.equal(await count(), 1, "releasing a grid drag sends the completed placement once");
      await page.close();
    }
  } finally { await browser.close(); }
  console.log("ok · auto-send inputs in both skins");
}
if (process.argv[1]?.endsWith("/auto-send.ts")) testAutoSend().catch(error => { console.error(error); process.exitCode = 1; });
