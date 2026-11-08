import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/triage/route";
import { hashInputs } from "@/lib/clocked/client";
import { buildLedger, GENESIS, verifyLedger, type Ledger } from "@/lib/agent/ledger";
import type { StepEvent } from "@/lib/agent/types";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const post = (body: object, ip: string) =>
  POST(new Request("http://x/api/triage", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));

describe("audit ledger", () => {
  it("hashInputs is SHA-256 of the JSON body", () => {
    expect(hashInputs({ a: 1 })).toBe(sha('{"a":1}'));
  });

  it("JSON API returns a hash-chained ledger: one row per Clocked call, credits sum to the run", async () => {
    const j = await (await post({ personaId: "x", scenarioId: "tampered-printer" }, "203.0.113.41")).json();
    const l = j.ledger as Ledger;
    expect(l.version).toBe("fixproof-ledger/1");
    expect(l.run).toMatchObject({ mode: "replay", scenarioId: "tampered-printer", outcome: "ESCALATED", decidingCheck: "script" });
    expect(l.calls.length).toBe(j.calls.length);
    expect(l.calls.map((c) => c.seq)).toEqual(l.calls.map((_, i) => i + 1));
    expect(l.calls[0].prevHash).toBe(GENESIS);
    expect(l.calls.reduce((n, c) => n + (c.credits ?? 0), 0)).toBe(l.run.credits);
    for (const c of l.calls) {
      expect(c.inputsHash).toMatch(/^[0-9a-f]{64}$/);
      expect(c.at && !Number.isNaN(Date.parse(c.at))).toBe(true);
      expect(c.source).toBe("replay");
      expect(c.decision.length).toBeGreaterThan(0);
    }
    expect(await verifyLedger(l, sha)).toBeNull();
    // No ticket text or body in the ledger.
    expect(JSON.stringify(l)).not.toContain("board papers");
  });

  it("on a replay, each inputs hash equals the hash of the recorded request in the fixture", async () => {
    const j = await (await post({ personaId: "x", scenarioId: "tampered-printer" }, "203.0.113.42")).json();
    const l = j.ledger as Ledger;
    const screen = l.calls.find((c) => c.step === "screen")!;
    const fx = JSON.parse(readFileSync(join(process.cwd(), "fixtures/tampered-printer/screen.json"), "utf8"));
    expect(screen.inputsHash).toBe(sha(JSON.stringify(fx.request)));
  });

  it("an edited or dropped row breaks the chain at that row", async () => {
    const j = await (await post({ personaId: "x", scenarioId: "vpn-macos" }, "203.0.113.43")).json();
    const l = j.ledger as Ledger;
    const edited: Ledger = { ...l, calls: l.calls.map((c, i) => (i === 2 ? { ...c, credits: (c.credits ?? 0) + 1 } : c)) };
    expect(await verifyLedger(edited, sha)).toBe(3);
    const dropped: Ledger = { ...l, calls: l.calls.filter((_, i) => i !== 1) };
    expect(await verifyLedger(dropped, sha)).toBe(3);
  });

  it("an outage drill records the failed call and no rows for blocked stages", async () => {
    const j = await (await post({ personaId: "x", scenarioId: "vpn-macos", simulate: "guard_down" }, "203.0.113.44")).json();
    const l = j.ledger as Ledger;
    expect(l.run.simulated).toBe("guard_down");
    expect(l.calls.length).toBeGreaterThan(0);
    const failed = l.calls.filter((c) => c.status === "error");
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0].decision).toMatch(/^failed \(/);
    expect(await verifyLedger(l, sha)).toBeNull();
  });

  it("leaves local steps and running rows out", async () => {
    const ev = (id: string, endpoint: StepEvent["endpoint"], status: StepEvent["status"]): StepEvent => ({ id, stage: "screen", endpoint, title: id, status, effect: "e" });
    const l = await buildLedger([ev("a", "local", "ok"), ev("b", "pii", "running"), ev("c", "pii", "ok")], { mode: "replay", scenarioId: null, personaId: "p", simulated: null, outcome: null, decidingCheck: null, credits: 0 }, sha);
    expect(l.calls.map((c) => c.step)).toEqual(["c"]);
    expect(l.headHash).toBe(l.calls[0].rowHash);
  });
});
