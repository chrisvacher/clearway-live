import { expect, type Locator } from "playwright/test";

export async function checkTabAppearance(tablist: Locator) {
  await expect(tablist).toHaveClass(/\bcwl-ui-tabs\b/);
  const selected = tablist.getByRole("tab", { selected: true });
  await expect(selected).toHaveCount(1);
  const primary = await selected.evaluate(button => {
    const sample = document.createElement("span");
    sample.style.color = "var(--cwl-app-primary)";
    button.append(sample);
    const color = getComputedStyle(sample).color;
    sample.remove();
    return color;
  });

  for (const button of await tablist.getByRole("tab").all()) {
    await expect(button).toHaveCSS("appearance", "none");
    await expect(button).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(button).toHaveCSS("box-shadow", "none");
    await expect(button).toHaveCSS("border-top-width", "0px");
    await expect(button).toHaveCSS("border-left-width", "0px");
    await expect(button).toHaveCSS("border-right-width", "0px");
    await expect(button).toHaveCSS("border-radius", "0px");
  }
  await expect(selected).toHaveCSS("border-bottom-width", "2px");
  await expect(selected).toHaveCSS("border-bottom-color", primary);
}
