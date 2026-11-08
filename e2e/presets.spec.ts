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
      // Every stage resolved and every Clocked call row is inspectable (rows sit collapsed under their stage).
      await expect(page.locator('[data-stage][data-status="pending"]')).toHaveCount(0);
      const rows = page.locator("[data-step-button]");
      expect(await rows.count()).toBeGreaterThan(3);
      await page.getByRole("button", { name: "Expand all" }).click();
      await expect(rows.first()).toBeVisible();
      if (s.recorded === "ESCALATED") await expect(page.getByText("Handoff record", { exact: true })).toBeVisible();
    });
  }

  test("replay is paced: steps arrive over time, not in one burst", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /VPN on macOS/ }).first().click();
    await page.getByRole("button", { name: /Replay run/ }).click();
    // Mid-run some stages are still pending while others have landed.
    await expect(page.locator('[data-stage][data-status="ok"]').first()).toBeVisible({ timeout: 10_000 });
    const pendingMidRun = await page.locator('[data-stage][data-status="pending"]').count();
    expect(pendingMidRun).toBeGreaterThan(0);
    await expect(page.locator("[data-outcome-card]")).toBeVisible({ timeout: 10_000 });
  });

  test("mobile 390: the outcome comes first after a run", async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto("/");
    await page.getByRole("button", { name: /Tampered printer fix/ }).first().click();
    await page.getByRole("button", { name: /Replay run/ }).click();
    const card = page.locator("[data-outcome-card]");
    await expect(card).toBeVisible({ timeout: 30_000 });
    // The run pane replaces the queue on phones (responsive.spec.ts covers the rest).
    await expect(page.locator("#queue")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.close();
  });

  test("a step opens the inspector with recorded credits", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /VPN on macOS/ }).first().click();
    await page.getByRole("button", { name: /Replay run/ }).click();
    await expect(page.locator("[data-outcome-card]")).toBeVisible({ timeout: 30_000 });
    // Stages start collapsed: open the first one, then its first Clocked call.
    const stage = page.locator("[data-stage] button[aria-expanded]").first();
    await expect(stage).toHaveAttribute("aria-expanded", "false");
    await stage.click();
    await expect(stage).toHaveAttribute("aria-expanded", "true");
    await page.locator("[data-step-button]:visible").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Recorded live/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
