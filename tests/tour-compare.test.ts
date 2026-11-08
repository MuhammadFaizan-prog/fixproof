import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { naiveProblemsFor } from "@/components/console/NaiveCard";
import { TOUR } from "@/data/tour";

/** Clocked product name used in tour copy -> endpoint value in the recorded fixtures. */
const ENDPOINT: Record<string, string> = {
  Rerank: "rerank",
  Verify: "grounding",
  Guard: "injection",
  Protect: "pii",
  Compare: "compare",
  Inspect: "script",
  Fill: "fill",
};

function recordedEndpoints(scenarioId: string): Set<string> {
  const dir = join(process.cwd(), "fixtures", scenarioId);
  const out = new Set<string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("naive-"))) {
    for (const m of readFileSync(join(dir, f), "utf8").matchAll(/"endpoint":\s*"([a-z_]+)"/g)) out.add(m[1]);
  }
  return out;
}

describe("judge tour: naive vs FixProof at every stop", () => {
  for (const stop of TOUR.filter((s) => !s.simulate)) {
    it(`${stop.scenarioId}: has recorded naive problems and a difference line`, () => {
      expect(naiveProblemsFor(stop.scenarioId).length).toBeGreaterThan(0);
      expect(stop.difference?.length ?? 0).toBeGreaterThan(20);
    });
    it(`${stop.scenarioId}: every endpoint named in the difference line was called in the recorded FixProof run`, () => {
      const called = recordedEndpoints(stop.scenarioId);
      const named = Object.keys(ENDPOINT).filter((n) => new RegExp(`\\b${n}\\b`).test(stop.difference ?? ""));
      expect(named.length).toBeGreaterThan(0);
      for (const n of named) expect(called, `${n} in "${stop.difference}"`).toContain(ENDPOINT[n]);
    });
  }
  it("drill stops carry no comparison", () => {
    for (const stop of TOUR.filter((s) => s.simulate)) expect(stop.difference).toBeUndefined();
  });
  it("unknown preset has no naive problems", () => {
    expect(naiveProblemsFor("no-such-preset")).toEqual([]);
  });
});
