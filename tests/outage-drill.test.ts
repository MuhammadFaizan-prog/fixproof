import { describe, expect, it } from "vitest";
import { planTriage, retryNote, runTriage, TriageInputError, TriageRequestSchema } from "@/lib/agent/triage";
import type { StepEvent } from "@/lib/agent/types";

/** Outage drills: a recorded preset replayed with a simulated Clocked failure, through the real client and policy. */
const drill = async (simulate: "guard_down" | "rate_limited" | "timeout") => {
  const start = planTriage(TriageRequestSchema.parse({ personaId: "x", scenarioId: "vpn-macos", simulate }), { CLOCKED_API_KEY: "" } as unknown as NodeJS.ProcessEnv);
  const events: StepEvent[] = [];
  const result = await runTriage(start, (e) => events.push(e), { CLOCKED_API_KEY: "" } as unknown as NodeJS.ProcessEnv);
  const final = new Map(events.filter((e) => e.status !== "running").map((e) => [e.id, e]));
  return { start, result, final };
};

describe("outage drills (replay, 0 credits)", () => {
  it("only replays a preset, never live", () => {
    expect(() => planTriage(TriageRequestSchema.parse({ personaId: "priya-us-design", text: "vpn", simulate: "timeout", mode: "live" }), { CLOCKED_API_KEY: "k-123456789012" } as unknown as NodeJS.ProcessEnv)).toThrow(TriageInputError);
    const s = planTriage(TriageRequestSchema.parse({ personaId: "x", scenarioId: "vpn-macos", simulate: "timeout", mode: "live" }), { CLOCKED_API_KEY: "k-123456789012" } as unknown as NodeJS.ProcessEnv);
    expect(s.mode.mode).toBe("replay");
  });

  it("Guard down: retried with the same key, then fail-closed; nothing after screening runs", async () => {
    const { result, final } = await drill("guard_down");
    expect(result.simulated?.id).toBe("guard_down");
    expect(result.outcome.outcome).toBe("ESCALATED");
    expect(result.outcome.headline).toMatch(/^Clocked unavailable, queued for a person/);
    expect(result.failure).toEqual({ step: "screen", kind: "server" });
    expect(final.get("screen")?.status).toBe("error");
    expect(final.get("screen")?.retries).toHaveLength(3);
    expect(final.get("screen")?.effect).toMatch(/Gave up after 4 attempts \(503, 503, 503, …\).*same Idempotency-Key/);
    expect([...final.keys()].some((k) => k.startsWith("understand") || k.startsWith("retrieve") || k === "draft" || k === "prove")).toBe(false);
    expect(result.reply).toBeNull();
    expect(result.handoff?.priority).toBe("P3");
    expect(result.credits).toBe(0);
  });

  it("429: waits Retry-After, retries the same attempt, answers on attempt 3, same outcome as recorded", async () => {
    const { result, final } = await drill("rate_limited");
    expect(result.failure).toBeNull();
    expect(result.outcome.outcome).toBe("AUTO_RESOLVED");
    const rr = final.get("retrieve:rerank")!;
    expect(rr.status).toBe("ok");
    expect(rr.meta?.attempts).toBe(3);
    expect(rr.retries).toEqual([
      { attempt: 1, status: 429, waitMs: 1000 },
      { attempt: 2, status: 429, waitMs: 1000 },
    ]);
    expect(rr.effect).toMatch(/Retried 2 times \(429, 429\), waiting 1 s, 1 s, with the same Idempotency-Key each time; answered on attempt 3\./);
  });

  it("Verify timeout: the unverified draft is withheld and the script is never inspected", async () => {
    const { result, final } = await drill("timeout");
    expect(result.outcome.outcome).toBe("ESCALATED");
    expect(result.failure).toEqual({ step: "prove", kind: "timeout" });
    expect(final.get("draft")?.status).toBe("ok");
    expect(final.get("prove")?.status).toBe("error");
    expect(final.has("fixGate")).toBe(false);
    expect(result.reply).toBeNull();
    expect(result.outcome.runFix).toBe(false);
    expect(result.outcome.deciding?.detail).toMatch(/during verification \(Verify\)/);
  });

  it("retry notes read plainly", () => {
    expect(retryNote([{ attempt: 1 }], "ok")).toBeNull();
    expect(retryNote([{ attempt: 1, status: 429, waitMs: 1500 }], "ok")).toBe("Retried once (429), waiting 1.5 s, with the same Idempotency-Key each time; answered on attempt 2.");
  });
});
