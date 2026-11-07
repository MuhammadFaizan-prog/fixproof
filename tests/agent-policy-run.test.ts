import { describe, expect, it } from "vitest";
import { decideOutcome, FAILED_AS, type OutcomeInput } from "@/lib/agent/policy";
import { handoff, handoffRequest, localHandoff } from "@/lib/agent/steps/handoff";
import { runTicket } from "@/lib/agent/run";
import { getKbIndex } from "@/lib/kb/index";
import { PERSONAS } from "@/data/personas";
import { fakeContext, finalEvents, shaped } from "./helpers/fake-client";

const good: OutcomeInput = {
  failure: null,
  screen: { canContinue: true, quarantined: false },
  band: "auto",
  bandReason: "auto_resolve is 99% likely and self-service is safe",
  retrievedCount: 2,
  unresolvedConflicts: 0,
  resolvedConflicts: 1,
  prove: { grounded: 0.97, answersQuestion: 0.95, keptShare: 1, removed: 0, replyEmpty: false },
  script: { ran: true, verdict: "benign", runAllowed: true, category: "benign administration", source: "VPN drops on macOS" },
};

describe("decideOutcome", () => {
  it("auto-resolves when every check passes and offers Run fix", () => {
    const d = decideOutcome(good);
    expect(d.outcome).toBe("AUTO_RESOLVED");
    expect(d.runFix).toBe(true);
    expect(d.deciding).toBeNull();
    expect(d.checks.every((c) => c.pass)).toBe(true);
  });

  it.each([
    ["a Clocked failure", { failure: { step: "prove", kind: "rate_limited" } }, "clocked"],
    ["a held ticket", { screen: { canContinue: false, quarantined: true } }, "screen"],
    ["Decide's escalate band", { band: "escalate" as const }, "policy"],
    ["no applicable passage", { retrievedCount: 0 }, "retrieval"],
    ["an unresolved conflict", { unresolvedConflicts: 1 }, "sources"],
    ["an ungrounded reply", { prove: { ...good.prove!, grounded: 0.3 } }, "grounding"],
    ["an empty verified reply", { prove: { ...good.prove!, replyEmpty: true } }, "grounding"],
    ["a malicious script", { script: { ran: true, verdict: "malicious", runAllowed: false, category: "security blinding or EDR evasion" } }, "script"],
  ])("escalates on %s", (_name, patch, id) => {
    const d = decideOutcome({ ...good, ...patch });
    expect(d.outcome).toBe("ESCALATED");
    expect(d.deciding?.id).toBe(id);
    expect(d.runFix).toBe(false);
    expect(d.headline).toContain(FAILED_AS[id as keyof typeof FAILED_AS]);
  });

  it.each([
    ["the confirm band", { band: "confirm" as const }, "policy"],
    ["middling grounding", { prove: { ...good.prove!, grounded: 0.6 } }, "grounding"],
    ["a reply that may not answer", { prove: { ...good.prove!, answersQuestion: 0.3 } }, "answers"],
    ["a suspicious but not malicious script", { script: { ran: true, verdict: "benign", runAllowed: false } }, "script"],
  ])("confirms on %s", (_name, patch, id) => {
    const d = decideOutcome({ ...good, ...patch });
    expect(d.outcome).toBe("CONFIRM_WITH_USER");
    expect(d.deciding?.id).toBe(id);
  });

  it("never offers Run fix on an escalated ticket even with a benign script", () => {
    expect(decideOutcome({ ...good, band: "escalate" }).runFix).toBe(false);
  });

  it("lets escalate outrank confirm", () => {
    expect(decideOutcome({ ...good, band: "confirm", retrievedCount: 0 }).deciding?.id).toBe("retrieval");
  });
});

describe("handoff", () => {
  const persona = PERSONAS[0];
  const input = { maskedTicket: "Print queue stuck on <ASSET>", failed: decideOutcome({ ...good, script: { ran: true, verdict: "malicious", runAllowed: false, category: "security blinding or EDR evasion", source: "Print queue stuck" } }).deciding, attempted: ["screened the ticket"], reply: "1. Cancel all documents." };

  it("gives Fill only masked, known facts and asks it for summary, team and priority", () => {
    const req = handoffRequest(input, persona);
    expect(req.text).toContain("Print queue stuck on <ASSET>");
    expect(req.text).toContain(FAILED_AS.script);
    expect(Object.keys(req.fields)).toEqual(["summary", "assignment_group", "priority"]);
  });

  it("builds the record from Fill and keeps the failed check FixProof already knows", async () => {
    const fill = shaped("handoff", "fill", { fields: { summary: { value: "Stuck queue; script blocked.", source: "generated" }, assignment_group: { value: "Security", probabilities: { Security: 0.8 } }, priority: { value: "P2" } } });
    const { ctx, events } = fakeContext([fill]);
    const h = await handoff(ctx, input);
    expect(h).toMatchObject({ source: "fill", assignmentGroup: "Security", priority: "P2", assignmentConfidence: 0.8, failedCheck: { id: "script" } });
    expect(finalEvents(events).get("handoff")!.effect).toMatch(/Routed to Security at P2/);
  });

  it("has a local fallback that needs no Clocked call", () => {
    expect(localHandoff(input, persona)).toMatchObject({ source: "local", assignmentGroup: "Service Desk", failedCheck: { id: "script" } });
  });
});

describe("runTicket", () => {
  it("ends ESCALATED with a local handoff when Clocked fails, and never throws", async () => {
    const { ctx, events } = fakeContext([]); // no fixtures: the first call fails
    const r = await runTicket(ctx, { text: "VPN down", index: getKbIndex() });
    expect(r.failure).toMatchObject({ step: "screen", kind: "no_fixture" });
    expect(r.outcome.outcome).toBe("ESCALATED");
    expect(r.outcome.deciding?.id).toBe("clocked");
    expect(r.handoff?.source).toBe("local");
    const rows = finalEvents(events);
    expect(rows.get("screen")).toMatchObject({ status: "error" });
    expect(rows.get("handoff")).toMatchObject({ endpoint: "local" });
    expect(rows.get("outcome")).toMatchObject({ verdict: "ESCALATED" });
  });
});
