import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Accessibility: axe-core with the WCAG 2.0/2.1/2.2 A and AA rule tags on the
 * desk (idle, a resolved preset, an escalated preset, an outage drill), the
 * judge tour and /proof, at 1440 and 390 px. Zero serious or critical
 * violations is the bar; any other finding is printed.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PAGES: { name: string; url: string; ready: (p: Page) => Promise<void> }[] = [
  { name: "desk, idle", url: "/", ready: async (p) => void (await expect(p.locator("#presets-h")).toBeVisible()) },
  { name: "resolved preset", url: "/?preset=vpn-macos", ready: async (p) => void (await expect(p.locator("[data-outcome-card]")).toBeVisible({ timeout: 30_000 })) },
  { name: "escalated preset", url: "/?preset=tampered-printer", ready: async (p) => void (await expect(p.locator("[data-outcome-card]")).toBeVisible({ timeout: 30_000 })) },
  { name: "outage drill", url: "/?preset=vpn-macos&fail=guard_down", ready: async (p) => void (await expect(p.locator("[data-drill]")).toBeVisible({ timeout: 30_000 })) },
  { name: "judge tour", url: "/?tour=1", ready: async (p) => void (await expect(p.locator("[data-outcome-card]")).toBeVisible({ timeout: 30_000 })) },
  { name: "proof", url: "/proof", ready: async (p) => void (await expect(p.locator("#proof-h")).toBeVisible()) },
];

for (const width of [1440, 390]) {
  for (const pg of PAGES) {
    test(`axe: ${pg.name} at ${width}px has no serious or critical violations`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(pg.url);
      await pg.ready(page);
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const summary = (vs: typeof results.violations) => vs.map((v) => `${v.impact} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      if (results.violations.length) console.log(`${pg.name} @${width}:`, summary(results.violations).join("\n  "));
      expect(summary(bad)).toEqual([]);
    });
  }
}

test("keyboard only: pick a preset, replay it, hear the steps and the outcome", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#presets-h")).toBeVisible();
  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    await page.keyboard.press("Tab");
    found = await page.evaluate(() => document.activeElement?.tagName === "BUTTON" && /Tampered printer fix/.test(document.activeElement.textContent ?? ""));
  }
  expect(found).toBe(true);
  // The focused control shows a visible focus ring.
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  found = false;
  for (let i = 0; i < 40 && !found; i++) {
    await page.keyboard.press("Tab");
    found = await page.evaluate(() => document.activeElement?.tagName === "BUTTON" && (document.activeElement.textContent ?? "").includes("Replay run"));
  }
  expect(found).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-outcome-card]")).toHaveAttribute("data-outcome-card", "ESCALATED", { timeout: 30_000 });
  await expect(page.locator("[data-outcome-status]")).toContainText("Outcome: Handed to a person");
  await expect(page.locator("[data-trail-live]")).toContainText(/Step \d of 8/);
});
