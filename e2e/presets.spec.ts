import { expect, test } from "@playwright/test";
import { SCENARIOS } from "../data/scenarios";

/**
 * Click each of the 8 presets, replay its recorded run, and check the
 * outcome banner and the final Proof Trail row match the recording.
 */
test.describe("presets replay end to end (no key)", () => {
  test("health says replay only", async ({ request }) => {
    const h = await (await request.get("/api/health")).json();
    expect(h).toMatchObject({ ok: true, keyConfigured: false, liveAvailable: false });
  });

  for (const s of SCENARIOS) {
    test(`${s.id}: ${s.title} → ${s.recorded}`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: new RegExp(s.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
      await page.getByRole("button", { name: /Replay run/ }).click();
      const card = page.locator("[data-outcome-card]");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toHaveAttribute("data-outcome-card", s.recorded);
      await expect(page.locator('[data-stage="outcome"]')).toHaveAttribute("data-outcome", s.recorded);
      // Every Clocked call row is inspectable.
      const rows = page.locator("[data-step-button]");
      expect(await rows.count()).toBeGreaterThan(3);
      if (s.recorded === "ESCALATED") await expect(page.getByText("Handoff record", { exact: true })).toBeVisible();
    });
  }

  test("a step opens the inspector with recorded credits", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /VPN on macOS/ }).first().click();
    await page.getByRole("button", { name: /Replay run/ }).click();
    await expect(page.locator("[data-outcome-card]")).toBeVisible({ timeout: 30_000 });
    await page.locator("[data-step-button]").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Recorded live/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
