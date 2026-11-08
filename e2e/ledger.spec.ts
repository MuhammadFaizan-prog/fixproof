import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/** Audit ledger: every Clocked call of the run, hash-chained, exportable as JSON. */
test("audit ledger lists each Clocked call and exports a verifiable JSON file", async ({ page }) => {
  await page.goto("/?preset=tampered-printer");
  await expect(page.locator("[data-outcome-card]")).toHaveAttribute("data-outcome-card", "ESCALATED", { timeout: 30_000 });
  const card = page.locator("[data-ledger-card]");
  await expect(card).toBeVisible();
  await expect(card.getByText("Chain verified")).toBeVisible();
  const n = Number(await card.getAttribute("data-ledger-calls"));
  expect(n).toBeGreaterThan(5);
  await card.getByRole("button", { name: /Audit ledger/ }).click();
  await expect(card.locator("[data-ledger-row]")).toHaveCount(n);
  await expect(card.locator("[data-ledger-row]").first()).toContainText(/[0-9a-f]{12}…/);
  const [dl] = await Promise.all([page.waitForEvent("download"), card.getByRole("button", { name: "Export JSON" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^fixproof-ledger-tampered-printer-[0-9a-f]{8}\.json$/);
  const json = JSON.parse(readFileSync((await dl.path())!, "utf8"));
  expect(json.version).toBe("fixproof-ledger/1");
  expect(json.calls).toHaveLength(n);
  expect(json.headHash).toBe(await card.getAttribute("data-ledger-head"));
  expect(json.run.outcome).toBe("ESCALATED");
  expect(json.calls.every((c: { inputsHash: string }) => /^[0-9a-f]{64}$/.test(c.inputsHash))).toBe(true);
});

test("outage drill ledger marks the failed call", async ({ page }) => {
  await page.goto("/?preset=vpn-macos&fail=guard_down");
  await expect(page.locator("[data-drill]")).toBeVisible({ timeout: 30_000 });
  const card = page.locator("[data-ledger-card]");
  await card.getByRole("button", { name: /Audit ledger/ }).click();
  await expect(card.getByText("Simulated failure").first()).toBeVisible();
});
