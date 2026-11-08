import { expect, test } from "@playwright/test";
import { SCENARIOS } from "../data/scenarios";
import { TOUR } from "../data/tour";

/** The judge tour: one click from /, four recorded runs, captions, Back/Next, Esc exits, no typing. */
test("judge tour plays 4 presets with captions and exits on Esc", async ({ page }) => {
  const t0 = Date.now();
  await page.goto("/");
  await page.getByRole("button", { name: /Take the 90-second tour/ }).click();
  for (let i = 0; i < TOUR.length; i++) {
    const stop = TOUR[i];
    const s = SCENARIOS.find((x) => x.id === stop.scenarioId)!;
    await expect(page.locator(`[data-tour-stop="${stop.scenarioId}"]`)).toBeVisible();
    await expect(page.getByText(`stop ${i + 1} of ${TOUR.length}`)).toBeVisible();
    await expect(page.locator("[data-outcome-card]")).toHaveAttribute("data-outcome-card", stop.simulate ? "ESCALATED" : s.recorded, { timeout: 30_000 });
    if (stop.simulate) await expect(page.locator(`[data-drill="${stop.simulate}"]`)).toBeVisible();
    if (i < TOUR.length - 1) await page.getByRole("button", { name: "Next stop" }).click();
  }
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator(`[data-tour-stop="${TOUR[TOUR.length - 2].scenarioId}"]`)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-tour-stop]")).toHaveCount(0);
  expect(Date.now() - t0).toBeLessThan(120_000);
});

test("/tour and ?preset= deep links work", async ({ page }) => {
  await page.goto("/tour");
  await expect(page.locator('[data-tour-stop="vpn-macos"]')).toBeVisible({ timeout: 15_000 });
  await page.goto("/?preset=tampered-printer");
  await expect(page.locator("[data-outcome-card]")).toHaveAttribute("data-outcome-card", "ESCALATED", { timeout: 30_000 });
});
