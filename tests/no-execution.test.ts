import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** FixProof never runs scripts or grants access: no process execution anywhere in the app, and the UI only talks to its own read-only routes. */
const ROOT = process.cwd();
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
const app = ["app", "components", "lib"].flatMap((d) => files(path.join(ROOT, d)));

describe("no execution path", () => {
  it("no child_process, eval or shell in app code", () => {
    for (const f of app) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/child_process|\bexecSync\b|\bspawn\(|new Function\(|\beval\(/);
    }
  });
  it("client components only call /api/triage, /api/recheck and /api/health", () => {
    for (const f of app.filter((x) => x.includes(`${path.sep}components${path.sep}`) || x.includes(`${path.sep}client${path.sep}`))) {
      const calls = [...readFileSync(f, "utf8").matchAll(/fetch\(\s*["'`]([^"'`]+)/g)].map((m) => m[1]);
      for (const c of calls) expect(["/api/triage", "/api/recheck", "/api/health"], `${f} calls ${c}`).toContain(c);
    }
  });
  it("technician controls are advisory: the desk view has no grant or run endpoint", () => {
    const src = readFileSync(path.join(ROOT, "components/console/DeskView.tsx"), "utf8");
    expect(src).not.toMatch(/sudo|Add-ADGroupMember|Invoke-Command/i);
    expect(src).toMatch(/nothing executes/);
  });
});
