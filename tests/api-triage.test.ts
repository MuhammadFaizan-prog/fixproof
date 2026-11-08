import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/triage/route";
import { GET } from "@/app/api/health/route";
import { planTriage, TriageInputError, TriageRequestSchema } from "@/lib/agent/triage";
import { createSseParser, encodeSse, type SseEvent } from "@/lib/sse";
import { getScenario } from "@/data/scenarios";

const NO_KEY = {} as NodeJS.ProcessEnv;
const KEY = { CLOCKED_API_KEY: "test-key" } as unknown as NodeJS.ProcessEnv;

describe("sse", () => {
  it("round-trips events split across arbitrary chunks", () => {
    const wire = encodeSse("step", { id: "screen", n: 1 }) + encodeSse("result", { ok: true });
    const parse = createSseParser();
    const got: SseEvent[] = [];
    for (let i = 0; i < wire.length; i += 7) got.push(...parse(wire.slice(i, i + 7)));
    expect(got).toEqual([{ event: "step", data: { id: "screen", n: 1 } }, { event: "result", data: { ok: true } }]);
  });
  it("skips a malformed frame", () => {
    expect(createSseParser()("event: step\ndata: {oops\n\n")).toEqual([]);
  });
});

describe("planTriage", () => {
  const req = (o: object) => TriageRequestSchema.parse({ personaId: "priya-us-design", ...o });

  it("replays a preset with no key, using the preset's own text and persona", () => {
    const s = planTriage(req({ scenarioId: "tampered-printer", text: "something else", personaId: "priya-us-design" }), NO_KEY);
    expect(s.mode).toEqual({ mode: "replay", reason: "no_key" });
    expect(s.text).toBe(getScenario("tampered-printer")!.text);
    expect(s.persona.id).toBe("hannah-uk-finance");
  });

  it("replays presets even when a key exists, so judging never spends credits", () => {
    expect(planTriage(req({ scenarioId: "vpn-macos", mode: "live" }), KEY).mode).toEqual({ mode: "replay", reason: "preset" });
  });

  it("runs free text live only when a key exists", () => {
    expect(planTriage(req({ text: "VPN down", mode: "live" }), KEY).mode.mode).toBe("live");
    expect(() => planTriage(req({ text: "VPN down", mode: "live" }), NO_KEY)).toThrow(TriageInputError);
  });

  it("rejects empty text, unknown presets and unknown personas", () => {
    expect(() => planTriage(req({ text: "   " }), KEY)).toThrow(/Write a ticket/);
    expect(() => planTriage(req({ scenarioId: "nope" }), KEY)).toThrow(/Unknown preset/);
    expect(() => planTriage(TriageRequestSchema.parse({ personaId: "ghost", text: "x" }), KEY)).toThrow(/Unknown employee/);
    expect(TriageRequestSchema.safeParse({ personaId: "p", text: "x".repeat(4001) }).success).toBe(false);
  });
});

async function readStream(res: Response): Promise<SseEvent[]> {
  const parse = createSseParser();
  const out: SseEvent[] = [];
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out.push(...parse(dec.decode(value, { stream: true })));
  }
  return out;
}

const post = (body: unknown) => POST(new Request("http://x/api/triage", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe("POST /api/triage", () => {
  it("streams start, step rows and the result for a preset", async () => {
    const res = await post({ scenarioId: "vpn-conflict", personaId: "hannah-uk-finance", mode: "replay" });
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const events = await readStream(res);
    expect(events[0]).toMatchObject({ event: "start", data: { mode: "replay", scenarioId: "vpn-conflict" } });
    const steps = events.filter((e) => e.event === "step");
    expect(steps.length).toBeGreaterThan(10);
    expect(steps.some((e) => (e.data as { status: string }).status === "running")).toBe(true);
    const result = events.find((e) => e.event === "result")!.data as { outcome: { outcome: string }; credits: number; reconcile: { conflicts: unknown[] } };
    expect(result.outcome.outcome).toBe("AUTO_RESOLVED");
    expect(result.reconcile.conflicts).toHaveLength(1);
    expect(result.credits).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toMatch(/bearer|authorization|CLOCKED_API_KEY/i);
  });

  it("answers 400 with a reason for bad input, before streaming", async () => {
    const bad = await post({ personaId: "priya-us-design", scenarioId: "nope" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "unknown_scenario" });
    const notJson = await POST(new Request("http://x/api/triage", { method: "POST", body: "nope" }));
    expect(notJson.status).toBe(400);
  });
});

describe("GET /api/health", () => {
  it("reports whether live mode is available without exposing the key", async () => {
    const body = await (await GET()).json();
    expect(Object.keys(body).sort()).toEqual(["dailyCapReached", "keyConfigured", "liveAvailable", "liveBudget", "ok"]);
    expect(JSON.stringify(body)).not.toContain(process.env.CLOCKED_API_KEY ?? "@@never@@");
  });
});
