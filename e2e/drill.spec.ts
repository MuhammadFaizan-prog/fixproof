import { expect, test } from "@playwright/test";

/** Outage drills: simulated Clocked failures on a recorded preset, replay only. */
test("Guard down fails closed: later stages blocked, queued for a person", async ({ page }) => {
  await page.goto("/?preset=vpn-macos&fail=guard_down");
  await expect(page.locator('[data-drill="guard_down"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-outcome-card]")).toHaveAttribute("data-outcome-card", "ESCALATED");
  await expect(page.locator('[data-drill-stage="screen"]')).toHaveAttribute("data-drill-status", "error");
  for (const s of ["understand", "retrieve", "reconcile", "draft", "prove", "fixGate"]) await expect(page.locator(`[data-drill-stage="${s}"]`)).toHaveAttribute("data-drill-status", "blocked");
  await expect(page.locator('[data-stage="understand"]')).toHaveAttribute("data-status", "blocked");
  await expect(page.locator("[data-retry-line]")).toContainText("same Idempotency-Key");
  await expect(page.locator("[data-drill]")).toContainText("Clocked unavailable, queued for a person");
});

test("429 is retried and the run finishes; timeout withholds the unverified draft", async ({ page }) => {
  await page.goto("/?preset=vpn-macos&fail=rate_limited");
  await expect(page.locator('[data-drill="rate_limited"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-outcome-card]")).toHaveAttribute("data-outcome-card", "AUTO_RESOLVED");
  await expect(page.locator('[data-drill-stage="retrieve"]')).toHaveAttribute("data-drill-status", "retried");
  await expect(page.locator("[data-retry-line]")).toContainText("answered on attempt 3");

  await page.goto("/?preset=vpn-macos&fail=timeout");
  await expect(page.locator('[data-drill="timeout"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-outcome-card]")).toHaveAttribute("data-outcome-card", "ESCALATED");
  await expect(page.locator('[data-drill-stage="prove"]')).toHaveAttribute("data-drill-status", "error");
  await expect(page.locator('[data-drill-stage="fixGate"]')).toHaveAttribute("data-drill-status", "blocked");
});

test("the drill menu runs a drill from the ticket panel", async ({ page }) => {
  await page.goto("/");
  // Re-select until the client has hydrated and the button reflects the drill.
  await expect(async () => {
    await page.locator("[data-drill-select]").selectOption("timeout");
    await expect(page.getByRole("button", { name: "Run the drill" })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("button", { name: "Run the drill" }).click();
  await expect(page.locator('[data-drill="timeout"]')).toBeVisible({ timeout: 30_000 });
  const text = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("pre, code, script, style, select, [data-raw]").forEach((n) => n.remove());
    return clone.innerText;
  });
  expect(text.match(/\b[a-z]+_[a-z_]+\b|AUTO_RESOLVED|CONFIRM_WITH_USER|ESCALATED/g) ?? []).toEqual([]);
});
