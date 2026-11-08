import { expect, test } from "@playwright/test";

/** Human in the loop: employee says still broken; technician edits, re-verifies, overrides with a reason; team change needs a reason. */
test("still broken escalates with the verified steps as already tried", async ({ page }) => {
  await page.goto("/?preset=vpn-macos");
  const card = page.locator('[data-outcome-card="AUTO_RESOLVED"]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  const backed = await card.locator('ul[aria-label="Reply, sentence by sentence"] li').filter({ hasText: "Backed" }).count();
  await card.getByRole("button", { name: "Still broken" }).click();
  const attempted = card.locator("[data-attempted] li");
  await expect(card.locator("[data-still-broken]")).toContainText("Escalated");
  expect(backed).toBeGreaterThan(0);
  await expect(attempted).toHaveCount(backed);
});

test("technician edit adding an ETA is struck by Verify and send stays blocked until a reason is given", async ({ page }) => {
  await page.goto("/?preset=payroll-eta");
  await expect(page.locator('[data-outcome-card="ESCALATED"]')).toBeVisible({ timeout: 30_000 });
  const desk = page.locator("[data-desk-view]");
  await desk.locator("[data-desk-toggle]").click();
  await desk.getByRole("button", { name: /Try the recorded edit/ }).click();
  const removed = desk.locator('[data-recheck] li[data-kept="false"]');
  await expect(removed).toHaveCount(1, { timeout: 15_000 });
  await expect(removed).toContainText("back by 2pm");
  const send = desk.getByRole("button", { name: "Approve & send" });
  await expect(send).toBeDisabled();
  await desk.getByLabel(/Override reason/).fill("Payroll team confirmed 2pm by phone");
  await expect(send).toBeEnabled();
  await desk.getByRole("button", { name: "Undo edit" }).click();
  await expect(send).toBeEnabled();

  const change = desk.getByRole("button", { name: "Change team" });
  await desk.getByLabel("Change team to").selectOption("Service Desk");
  await expect(change).toBeDisabled();
  await desk.getByLabel("Reason (required)").fill("Payroll access is handled by the service desk this week");
  await change.click();
  await expect(desk.locator("[data-audit-log]")).toContainText("Team changed Identity & Access → Service Desk");
  await expect(desk.locator("[data-audit-log]")).toContainText("Edit re-verified by Verify");
});
