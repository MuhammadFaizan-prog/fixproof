import { describe, expect, it } from "vitest";
import { draft, draftRequest, draftSource } from "@/lib/agent/steps/draft";
import { prove, proveRequest } from "@/lib/agent/steps/prove";
import type { Passage } from "@/lib/agent/steps/retrieve";
import { splitSentences } from "@/lib/text/sentences";
import { PERSONAS } from "@/data/personas";
import { fakeContext, finalEvents, shaped } from "./helpers/fake-client";

const passage: Passage = {
  id: "payroll-portal-status#1-2", articleId: "payroll-portal-status", title: "Payroll portal outage: current status", section: "Status + Workaround",
  text: "## Status\nThe payroll portal shows SSO authentication failed. No restoration time has been committed.\n\n## Workaround\nEmail expense claims to the finance shared mailbox.\n```powershell\nGet-Service\n```",
  updated: "2026-11-07", os: ["any"], region: ["any"], script: null, relevance: 0.9, widened: true, chunkIds: ["payroll-portal-status#1", "payroll-portal-status#2"],
};
const QUESTION = "When will the payroll portal be back?";
const DRAFT = "The portal will be restored by 2pm today.\n1. Email expense claims to the finance shared mailbox.\n2. Hello there!";

describe("sentence splitting", () => {
  it("keeps list markers with their sentence and splits on sentence ends and new lines", () => {
    expect(splitSentences("Reset the profile. Then reconnect.\n1. Click Disconnect.\n2) Choose Reset profile.")).toEqual([
      "Reset the profile.", "Then reconnect.", "1. Click Disconnect.", "2) Choose Reset profile.",
    ]);
  });
  it("does not split version numbers or Settings > menus", () => {
    expect(splitSentences("Install macOS 15.1 first. Choose Settings > Reset profile.")).toEqual(["Install macOS 15.1 first.", "Choose Settings > Reset profile."]);
  });
  it("stays within Verify's 30-claim limit", () => {
    expect(splitSentences(Array.from({ length: 40 }, (_, i) => `Step ${i}.`).join(" "))).toHaveLength(30);
  });
});

describe("draft step", () => {
  it("writes only from the kept passages, with scripts left out", () => {
    const src = draftSource(QUESTION, [passage]);
    expect(src).toContain("[1] Payroll portal outage: current status · Status + Workaround (updated 2026-11-07)");
    expect(src).not.toContain("Get-Service");
    const req = draftRequest(QUESTION, [passage], PERSONAS[0]);
    expect(req.fields.reply).toMatchObject({ type: "generate", max_tokens: 220 });
    expect(req.instructions).toMatch(/Never invent times/);
  });

  it("returns the generated reply and reports what it was drafted from", async () => {
    const { ctx, events } = fakeContext([shaped("draft", "fill", { fields: { reply: { value: `  ${DRAFT} `, source: "generated", confidence: 0.9 } } })]);
    const d = await draft(ctx, QUESTION, [passage]);
    expect(d.text).toBe(DRAFT);
    expect(finalEvents(events).get("draft")!.effect).toMatch(/Not shown to the employee until Verify/);
  });

  it("fails loudly on an empty draft", async () => {
    const { ctx, events } = fakeContext([shaped("draft", "fill", { fields: { reply: { value: "" } } })]);
    await expect(draft(ctx, QUESTION, [passage])).rejects.toThrow(/no reply/);
    expect(finalEvents(events).get("draft")).toMatchObject({ status: "error" });
  });
});

describe("prove step", () => {
  const sentences = splitSentences(DRAFT);
  const claim = (claimText: string, verdict: string, supported: number, quote?: string) => ({
    claim: claimText, kind: "fact", counted: verdict !== "not_a_claim", weight: 1, supported, contradicted: 0, not_stated: 1 - supported, not_a_claim: verdict === "not_a_claim" ? 1 : 0, verdict,
    evidence: quote ? { document: passage.id, quote, start: 10, end: 10 + quote.length, confidence: 1 } : undefined,
  });
  const grounding = shaped("prove", "grounding", {
    grounded: 0.55, ungrounded: 0.45, verdict: "ungrounded", threshold: 0.5, instructions_used: "custom", documents: [], answers_question: 0.8,
    claims: [
      claim(sentences[0], "not_stated", 0.02),
      claim(sentences[1], "supported", 0.99, "Email expense claims to the finance shared mailbox."),
      claim(sentences[2], "not_a_claim", 0),
    ] as never,
  });

  it("sends FixProof's own sentences as the claims, with the draft's sources", () => {
    const req = proveRequest(QUESTION, { text: DRAFT, sources: [passage] }, sentences);
    expect(req.claims).toEqual(sentences);
    expect(req.documents).toEqual([{ id: passage.id, text: passage.text }]);
    expect(req.evidence).toBe("all");
  });

  it("removes the not-stated restoration time and keeps supported steps with their quotes", async () => {
    const { ctx, events } = fakeContext([grounding]);
    const r = await prove(ctx, QUESTION, { text: DRAFT, sources: [passage] });
    expect(r.removed.map((c) => c.text)).toEqual(["The portal will be restored by 2pm today."]);
    expect(r.reply).toBe("1. Email expense claims to the finance shared mailbox.\n2. Hello there!");
    expect(r.claims[1].source).toMatchObject({ passageId: passage.id, quote: "Email expense claims to the finance shared mailbox." });
    expect(r.keptShare).toBe(0.5);
    expect(r.answersQuestion).toBe(0.8);
    const row = finalEvents(events).get("prove")!;
    expect(row).toMatchObject({ verdict: "weak", count: 1, countLabel: "of 2 supported" });
    expect(row.effect).toMatch(/Removed 1 sentence \(not_stated\): "The portal will be restored by 2pm today\."/);
  });

  it("treats a claim Verify did not return as not stated", async () => {
    const partial = structuredClone(grounding);
    (partial.response as { claims: unknown[] }).claims = [];
    const { ctx } = fakeContext([partial]);
    const r = await prove(ctx, QUESTION, { text: DRAFT, sources: [passage] });
    expect(r.claims.every((c) => !c.kept)).toBe(true);
    expect(r.reply).toBe("");
  });
});
