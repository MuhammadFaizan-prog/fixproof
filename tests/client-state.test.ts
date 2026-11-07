import { describe, expect, it } from "vitest";
import { initialTriage, triageReducer } from "@/lib/client/useTriage";
import { HISTORY_KEY, HISTORY_MAX, pushHistory, readHistory } from "@/lib/client/history";
import type { StepEvent } from "@/lib/agent/types";

const ev = (id: string, status: StepEvent["status"], effect = "x"): StepEvent => ({ id, stage: "screen", endpoint: "pipeline", title: id, status, effect });

describe("triage reducer", () => {
  it("replaces a running row in place and keeps first-seen order", () => {
    let s = triageReducer(initialTriage, { type: "begin", at: 1 });
    s = triageReducer(s, { type: "step", data: ev("screen", "running"), at: 2 });
    s = triageReducer(s, { type: "step", data: ev("understand:extract", "running"), at: 3 });
    s = triageReducer(s, { type: "step", data: ev("screen", "ok", "done"), at: 9 });
    expect(s.order).toEqual(["screen", "understand:extract"]);
    expect(s.rows.screen).toMatchObject({ status: "ok", effect: "done", startedAt: 2, endedAt: 9 });
    expect(s.status).toBe("running");
  });
  it("ends on error and clears on a new run", () => {
    let s = triageReducer(initialTriage, { type: "begin", at: 1 });
    s = triageReducer(s, { type: "error", data: { code: "network", message: "down" }, at: 5 });
    expect(s).toMatchObject({ status: "error", error: { code: "network" }, endedAt: 5 });
    s = triageReducer(s, { type: "begin", at: 6 });
    expect(s).toMatchObject({ status: "running", error: null, order: [] });
  });
});

describe("history", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  const entry = (i: number) => ({ id: String(i), createdAt: "2026-11-08T00:00:00Z", personaId: "p", scenarioId: null, maskedText: `<PERSON> ticket ${i}`, outcome: "AUTO_RESOLVED" as const, credits: 1 });

  it("keeps newest first, de-duplicates and caps at 50", () => {
    const s = store();
    for (let i = 0; i < HISTORY_MAX + 5; i++) pushHistory(entry(i), s);
    pushHistory(entry(54), s);
    const h = readHistory(s);
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h[0].id).toBe("54");
    expect(h.filter((e) => e.id === "54")).toHaveLength(1);
  });
  it("survives corrupt storage", () => {
    const s = store();
    s.setItem(HISTORY_KEY, "{not json");
    expect(readHistory(s)).toEqual([]);
  });
});
