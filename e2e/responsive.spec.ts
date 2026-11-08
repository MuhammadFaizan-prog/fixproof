import { expect, test, type Page } from "@playwright/test";

/**
 * Responsive pass: no horizontal overflow at any width, the outcome near the
 * top on phones, panes switchable from the top bar below 1024 px, and every
 * visible control at least 44 px tall on touch widths.
 */
const SHOTS = process.env.E2E_SHOTS_DIR;

async function replayPrinter(page: Page) {
  await page.getByRole("button", { name: /Tampered printer fix/ }).first().click();
  await page.getByRole("button", { name: /Replay run/ }).click();
  await expect(page.locator("[data-outcome-card]")).toBeVisible({ timeout: 30_000 });
}

async function noOverflow(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button:not(:disabled), [role="tab"], a[href]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && !el.closest("[hidden]");
      })
      .filter((el) => el.getBoundingClientRect().height < 43.5)
      .map((el) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().height)}px`),
  );
}

for (const width of [360, 390]) {
  test(`phone ${width}: tabs, outcome near the top, no overflow, 44 px targets`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.goto("/");
    await noOverflow(page, width);
    await expect(page.locator('[data-pane-tab="tickets"]')).toBeVisible();
    await replayPrinter(page);
    // The run pane takes over and the receipt sits near the top.
    await expect(page.locator("#pane-tickets")).toBeHidden();
    const top = await page.locator("[data-outcome-card]").evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
    // Header + pane tabs + a compact run header: the receipt starts in the top half of the screen.
    expect(top).toBeLessThan(440);
    await noOverflow(page, width);
    expect(await smallTargets(page)).toEqual([]);
    if (SHOTS && width === 390) await page.screenshot({ path: `${SHOTS}/responsive-390-run.png`, fullPage: false });
    // Evidence is its own pane on phones.
    await page.locator('[data-pane-tab="evidence"]').click();
    await expect(page.locator("#pane-evidence")).toBeVisible();
    await expect(page.locator("#pane-run")).toBeHidden();
    await noOverflow(page, width);
    if (SHOTS && width === 390) await page.screenshot({ path: `${SHOTS}/responsive-390-evidence.png`, fullPage: false });
    await page.locator('[data-pane-tab="tickets"]').click();
    await expect(page.locator("#queue")).toBeVisible();
    await page.close();
  });
}

test("tablet 768: two panes, evidence rail stacked under the run", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  await page.goto("/");
  await replayPrinter(page);
  await expect(page.locator('[data-pane-tab="evidence"]')).toBeHidden();
  await expect(page.locator("#pane-run")).toBeVisible();
  await expect(page.locator("#pane-evidence")).toBeVisible();
  const runTop = await page.locator("#pane-run").evaluate((n) => n.getBoundingClientRect().top);
  const railTop = await page.locator("#pane-evidence").evaluate((n) => n.getBoundingClientRect().top);
  expect(railTop).toBeGreaterThan(runTop);
  await noOverflow(page, 768);
  expect(await smallTargets(page)).toEqual([]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/responsive-768-run.png`, fullPage: false });
  await page.close();
});

test("desktop 1024: queue beside the run, no pane tabs, no overflow", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1024, height: 800 } });
  await page.goto("/");
  await expect(page.locator('[data-pane-tab="tickets"]')).toBeHidden();
  await replayPrinter(page);
  await expect(page.locator("#pane-tickets")).toBeVisible();
  await expect(page.locator("#pane-run")).toBeVisible();
  const q = await page.locator("#pane-tickets").boundingBox();
  const m = await page.locator("#pane-run").boundingBox();
  expect(m!.x).toBeGreaterThan(q!.x + q!.width - 1);
  await noOverflow(page, 1024);
  await page.close();
});

test("desktop 1440: three columns, no overflow", async ({ page }) => {
  await page.goto("/");
  await replayPrinter(page);
  await noOverflow(page, 1440);
  const ev = await page.locator("#pane-evidence").boundingBox();
  const m = await page.locator("#pane-run").boundingBox();
  expect(ev!.x).toBeGreaterThan(m!.x + m!.width - 1);
});
