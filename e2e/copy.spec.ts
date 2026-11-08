import { expect, test } from "@playwright/test";
import { SCENARIOS } from "../data/scenarios";

/** Plain language: no API enum or snake_case value in rendered text (code blocks excluded), on every preset. */
test("no snake_case or outcome enums in rendered copy", async ({ page }) => {
  for (const s of SCENARIOS) {
    await page.goto(`/?preset=${s.id}`);
    await expect(page.locator("[data-outcome-card]")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Expand all|Collapse all/ }).first().click().catch(() => {});
    const text = await page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("pre, code, script, style, [data-raw]").forEach((n) => n.remove());
      return clone.innerText;
    });
    const hits = text.match(/\b[a-z]+_[a-z_]+\b|AUTO_RESOLVED|CONFIRM_WITH_USER|ESCALATED/g) ?? [];
    expect(hits, `${s.id}: ${hits.join(", ")}`).toEqual([]);
  }
});

test("low-confidence routing is flagged on the tampered printer", async ({ page }) => {
  await page.goto("/?preset=tampered-printer");
  await expect(page.locator("[data-outcome-card]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-low-confidence]").first()).toContainText(/Likely Security, low confidence \(\d+%\): please confirm/);
  await expect(page.locator("[data-outcome-card] h2")).toContainText("the article's fix script was blocked: it turns off antivirus");
});
