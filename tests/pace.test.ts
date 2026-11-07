import { describe, expect, it } from "vitest";
import { PACE, paceDelays, stepDelay } from "@/lib/client/pace";
import type { StepEvent } from "@/lib/agent/types";

const meta = (modelMs: number | null) => ({ credits: 1, modelMs, attempts: 1, idempotencyKeyPrefix: "x", transport: null, roundTripMs: 1, replay: true, synthetic: false, recordedAt: null });
const ev = (status: StepEvent["status"], modelMs: number | null = 100): StepEvent => ({ id: "s", stage: "screen", endpoint: "pipeline", title: "s", status, effect: "x", meta: meta(modelMs) });

describe("replay pacing", () => {
  it("running events show at once; finished ones wait 80–150 ms by model time", () => {
    expect(stepDelay(ev("running"))).toBe(0);
    expect(stepDelay(ev("ok", 0))).toBe(PACE.min);
    expect(stepDelay(ev("ok", 10_000))).toBe(PACE.max);
    const mid = stepDelay(ev("ok", 200));
    expect(mid).toBeGreaterThan(PACE.min);
    expect(mid).toBeLessThan(PACE.max);
    expect(stepDelay({ ...ev("ok"), meta: undefined })).toBe(PACE.min);
  });
  it("keeps a long run inside the budget", () => {
    const events = Array.from({ length: 40 }, (_, i) => ev(i % 2 ? "ok" : "running", 1000));
    const d = paceDelays(events);
    const total = d.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(PACE.budget + 20 * 1);
    expect(d.filter((x, i) => i % 2 === 0 && x !== 0)).toHaveLength(0);
  });
  it("leaves a short run untouched", () => {
    const events = [ev("running"), ev("ok", 0), ev("running"), ev("ok", 400)];
    expect(paceDelays(events)).toEqual([0, PACE.min, 0, PACE.max]);
  });
});
