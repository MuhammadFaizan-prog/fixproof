import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke in replay mode: the server starts with no Clocked key, so every
 * preset replays its recorded run and nothing spends credits.
 * Run after `pnpm build`:  pnpm e2e
 * Uses Playwright's Chromium, or a system one via CHROMIUM_PATH (or /usr/bin/chromium if present).
 */
const PORT = Number(process.env.E2E_PORT ?? 3210);
const systemChromium = process.env.CHROMIUM_PATH ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const launchOptions = systemChromium ? { executablePath: systemChromium, args: ["--no-sandbox"] } : {};

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions } },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    // Replay mode: blank key so no run can spend credits.
    env: { CLOCKED_API_KEY: "", NODE_ENV: "production" },
  },
});
