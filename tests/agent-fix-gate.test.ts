import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixGate, scriptRequest } from "@/lib/agent/steps/fixGate";
import type { Passage } from "@/lib/agent/steps/retrieve";
import { FixtureSchema } from "@/lib/clocked/fixtures";
import { getKbIndex } from "@/lib/kb/index";
import { PERSONAS } from "@/data/personas";
import { fakeContext, finalEvents, shaped } from "./helpers/fake-client";

const index = getKbIndex();
const hannah = PERSONAS.find((p) => p.id === "hannah-uk-finance")!;
const toPassage = (id: string): Passage => {
  const c = index.get(id)!;
  return { id: c.id, articleId: c.articleId, title: c.title, section: c.section, text: c.text, updated: c.updated, os: c.os, region: c.region, script: c.script, relevance: 0.9, widened: false, chunkIds: [c.id] };
};
const printerScript = index.articleChunks("printer-queue-recovery").find((c) => c.script)!;
const probe = FixtureSchema.parse(JSON.parse(readFileSync("fixtures/probe/script.json", "utf8")));

describe("fix gate", () => {
  it("checks the script against the employee's approved scope", () => {
    const req = scriptRequest(printerScript.script!, hannah);
    expect(req.script).toContain("Set-MpPreference -DisableRealtimeMonitoring $true");
    expect(req.instructions).toContain("Endpoint protection must remain enabled");
    expect(req.instructions).toContain("NW-LT-2207");
    expect(req.evidence).toBe(true);
  });

  it("skips Inspect when no kept article has a script", async () => {
    const { ctx, events } = fakeContext([]);
    const r = await fixGate(ctx, [toPassage("vpn-policy-2026#0")]);
    expect(r).toMatchObject({ ran: false, runAllowed: false });
    expect(finalEvents(events).get("fixGate")).toMatchObject({ status: "skipped", endpoint: "local" });
  });

  it("blocks the tampered printer script at the Defender line (live probe response)", async () => {
    const { ctx, events } = fakeContext([{ ...probe, scenario: "unit", step: "fixGate" }], "hannah-uk-finance");
    const r = await fixGate(ctx, [toPassage("printer-queue-recovery#1"), toPassage(printerScript.id)]);
    expect(r).toMatchObject({ ran: true, verdict: "malicious", runAllowed: false, passageId: printerScript.id });
    expect(r.evidence[0].line).toBe("Set-MpPreference -DisableRealtimeMonitoring $true");
    const row = finalEvents(events).get("fixGate")!;
    expect(row.effect).toMatch(/^The article.s fix script was blocked: it turns off antivirus \(flagged line `Set-MpPreference/);
    expect(row.evidence![0]).toMatchObject({ target: "script", kind: "script" });
  });

  it("offers Run fix for a benign in-scope script", async () => {
    const mac = index.articleChunks("vpn-macos-drops").find((c) => c.script)!;
    const benign = shaped("fixGate", "script", { malicious: 0.01, suspicious: 0.02, verdict: "benign", threshold: 0.5, instructions_used: "custom", category: "benign administration", categories: {}, evidence: [] });
    const { ctx, events } = fakeContext([benign]);
    const r = await fixGate(ctx, [toPassage(mac.id)]);
    expect(r.runAllowed).toBe(true);
    expect(finalEvents(events).get("fixGate")!.effect).toMatch(/Run fix is offered/);
  });

  it("does not offer Run fix when a benign verdict is still suspicious", async () => {
    const mac = index.articleChunks("vpn-macos-drops").find((c) => c.script)!;
    const borderline = shaped("fixGate", "script", { malicious: 0.3, suspicious: 0.6, verdict: "benign", threshold: 0.5, instructions_used: "custom", category: "benign administration", categories: {}, evidence: [] });
    const { ctx } = fakeContext([borderline]);
    expect((await fixGate(ctx, [toPassage(mac.id)])).runAllowed).toBe(false);
  });
});
