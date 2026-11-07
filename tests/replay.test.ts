import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createClockedClient } from "@/lib/clocked/client";
import { createFileFixtureStore } from "@/lib/clocked/fixture-files";
import { FixtureSchema, createMemoryFixtureStore, fixtureFileName, keepUsageHeaders, type Fixture } from "@/lib/clocked/fixtures";
import { createRecordingTransport, createReplayTransport } from "@/lib/clocked/replay";
import { resolveMode } from "@/lib/clocked/mode";
import type { Transport } from "@/lib/clocked/transport";

const FIXTURE_ROOT = path.join(process.cwd(), "fixtures");

function allFixtureFiles(): string[] {
  return readdirSync(FIXTURE_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(path.join(FIXTURE_ROOT, d.name)).map((f) => path.join(FIXTURE_ROOT, d.name, f)));
}

describe("committed fixtures", () => {
  const files = allFixtureFiles();

  it("exist for every endpoint in docs/ and probe/", () => {
    const names = (dir: string) => readdirSync(path.join(FIXTURE_ROOT, dir)).sort();
    const expected = ["compare", "decide", "extract", "fill", "grounding", "injection", "pii", "pipeline", "rerank", "script"].map((n) => `${n}.json`);
    expect(names("docs")).toEqual(expected);
    expect(names("probe")).toEqual(expected);
  });

  it.each(files.map((f) => [path.relative(FIXTURE_ROOT, f), f]))("%s is valid and honestly labelled", (_name, file) => {
    const fixture = FixtureSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    expect(path.basename(file)).toBe(fixtureFileName(fixture.step));
    if (fixture.source === "live") {
      expect(fixture.synthetic).toBe(false);
      expect(fixture.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number(fixture.headers["x-clocked-credits"])).toBeGreaterThanOrEqual(1);
    } else {
      expect(fixture.synthetic).toBe(true);
      expect(fixture.headers["x-clocked-credits"]).toBeUndefined();
    }
    const raw = readFileSync(file, "utf8").toLowerCase();
    expect(raw).not.toContain("\"authorization\":");
    expect(raw).not.toContain("bearer ");
  });
});

describe("replay transport", () => {
  it("replays a live fixture through the client with its recorded usage", async () => {
    const client = createClockedClient({ transport: createReplayTransport({ store: createFileFixtureStore(FIXTURE_ROOT), scenario: "probe" }) });
    const res = await client.rerank({ query: "ignored in replay", documents: ["x"] }, { step: "rerank" });
    expect(client.mode).toBe("replay");
    expect(res.data.results.find((r) => r.id === "vpn-windows")).toMatchObject({ action: "skip", reason: "different_case" });
    expect(res.meta).toMatchObject({ replay: true, synthetic: false, status: 200 });
    expect(res.meta.credits).toBeGreaterThanOrEqual(1);
    expect(res.meta.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("labels doc-derived fixtures as synthetic with no credits", async () => {
    const client = createClockedClient({ transport: createReplayTransport({ store: createFileFixtureStore(FIXTURE_ROOT), scenario: "docs" }) });
    const res = await client.script({ script: "ignored" }, { step: "script" });
    expect(res.data.verdict).toBe("malicious");
    expect(res.meta).toMatchObject({ replay: true, synthetic: true, credits: null });
  });

  it("fails with no_fixture, without retrying, when a step was never recorded", async () => {
    const client = createClockedClient({ transport: createReplayTransport({ store: createMemoryFixtureStore(), scenario: "nope" }), sleep: async () => {} });
    await expect(client.decide({ state: "x", questions: {} }, { step: "decide" })).rejects.toMatchObject({ kind: "no_fixture" });
  });

  it("refuses a fixture recorded for a different endpoint", async () => {
    const store = createFileFixtureStore(FIXTURE_ROOT);
    const client = createClockedClient({ transport: createReplayTransport({ store, scenario: "probe" }) });
    await expect(client.decide({ state: "x", questions: {} }, { step: "rerank" })).rejects.toMatchObject({ kind: "no_fixture" });
  });
});

describe("recording transport", () => {
  it("saves successful exchanges as live fixtures with usage headers only", async () => {
    const store = createMemoryFixtureStore();
    const inner: Transport = {
      kind: "http",
      async send() {
        return {
          status: 200,
          headers: { "x-clocked-credits": "2", "set-cookie": "a=b", "x-clocked-transport": "door:west" },
          json: { model: "clocked-1.0", answers: {} },
        };
      },
    };
    const client = createClockedClient({ transport: createRecordingTransport({ inner, store, scenario: "vpn-macos", today: () => "2026-11-08" }) });
    await client.decide({ state: "VPN", questions: {} }, { step: "understand:decide" });
    const saved = (await store.get("vpn-macos", "understand:decide")) as Fixture;
    expect(saved).toMatchObject({ synthetic: false, source: "live", recorded_at: "2026-11-08", endpoint: "decide", step: "understand:decide" });
    expect(saved.headers).toEqual({ "x-clocked-credits": "2", "x-clocked-transport": "door:west" });
  });

  it("does not save failures", async () => {
    const store = createMemoryFixtureStore();
    const inner: Transport = { kind: "http", send: async () => ({ status: 422, headers: {}, json: { error: "bad" } }) };
    const client = createClockedClient({ transport: createRecordingTransport({ inner, store, scenario: "s" }) });
    await expect(client.decide({ state: "x", questions: {} }, { step: "d" })).rejects.toMatchObject({ kind: "invalid" });
    expect(await store.get("s", "d")).toBeNull();
  });
});

describe("mode and file names", () => {
  const withKey = { CLOCKED_API_KEY: "k" } as unknown as NodeJS.ProcessEnv;
  const noKey = {} as NodeJS.ProcessEnv;

  it("replays without a key, for presets, and on request; goes live only for free text with a key", () => {
    expect(resolveMode({ requested: "live", isPreset: false, env: noKey })).toEqual({ mode: "replay", reason: "no_key" });
    expect(resolveMode({ requested: "live", isPreset: true, env: withKey })).toEqual({ mode: "replay", reason: "preset" });
    expect(resolveMode({ requested: "replay", isPreset: false, env: withKey })).toEqual({ mode: "replay", reason: "requested_replay" });
    expect(resolveMode({ requested: "live", isPreset: false, env: withKey })).toEqual({ mode: "live", reason: "live" });
  });

  it("slugs step names and rejects empty ones", () => {
    expect(fixtureFileName("rerank:expand")).toBe("rerank-expand.json");
    expect(fixtureFileName("Guard (content) #2")).toBe("guard-content-2.json");
    expect(() => fixtureFileName("::")).toThrow();
  });

  it("keeps only usage headers", () => {
    expect(keepUsageHeaders({ "x-clocked-credits": "1", authorization: "Bearer x", "set-cookie": "y" })).toEqual({ "x-clocked-credits": "1" });
  });

  it("rejects path traversal in scenario ids", async () => {
    await expect(createFileFixtureStore(FIXTURE_ROOT).get("../etc", "passwd")).rejects.toThrow();
  });
});
