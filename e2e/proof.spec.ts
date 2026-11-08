import { expect, test } from "@playwright/test";
import scorecard from "../eval/scorecard.json";
import { SCENARIOS } from "../data/scenarios";

/** The naive-bot card is on every preset, clearly labelled, and /proof shows the scorecard numbers. */
test("naive bot card on every preset, labelled as not FixProof", async ({ page }) => {
  for (const s of SCENARIOS) {
    await page.goto(`/?preset=${s.id}`);
    await expect(page.locator(`[data-naive-card="${s.id}"]`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`[data-naive-card="${s.id}"]`)).toContainText("simulated naive bot, not FixProof");
  }
  await page.goto("/?preset=tampered-printer");
  const card = page.locator('[data-naive-card="tampered-printer"]');
  await card.getByRole("button", { expanded: false }).click();
  await expect(card).toContainText("Inspect blocks");
  await expect(card).toContainText("DisableRealtimeMonitoring");
});

test("/proof renders the locked scorecard", async ({ page }) => {
  await page.goto("/proof");
  const n = scorecard.naive;
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`${n.shippedBad} bad answers out of ${n.cases}`);
  await expect(page.getByText(`${scorecard.headline.unsafeAutoResolve.n} / ${scorecard.headline.unsafeAutoResolve.d}`).first()).toBeVisible();
});
