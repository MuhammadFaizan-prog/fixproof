import type { ClaimVerdict, GroundingClaim, GroundingRequest } from "@/lib/clocked/types";
import { splitSentences } from "@/lib/text/sentences";
import { GROUNDED_AUTO } from "../policy";
import { pct, plural, tracedCall } from "../trace";
import type { EvidenceMark, RunContext } from "../types";
import type { DraftResult } from "./draft";

/**
 * Stage 6, prove. Verify checks the draft against the same passages it was
 * written from, one claim per sentence (FixProof splits the sentences, so a
 * failed claim maps to exactly one sentence). Supported sentences stay, each
 * with its source quote; contradicted or not-stated sentences are removed.
 */


export interface ProvenClaim {
  text: string;
  verdict: ClaimVerdict | string;
  supported: number;
  kept: boolean;
  /** Where the sentence is backed. Verify names the passage per claim (`source`); the quote and offsets come only when it returns evidence. */
  source: { passageId: string; quote: string | null; start: number | null; end: number | null } | null;
}

export interface ProveResult {
  grounded: number;
  answersQuestion: number | null;
  claims: ProvenClaim[];
  reply: string;
  removed: ProvenClaim[];
  /** Share of factual sentences that were supported (0–1). */
  keptShare: number;
}

export function proveRequest(question: string, d: DraftResult, claims: string[]): GroundingRequest {
  return {
    question,
    answer: d.text,
    claims,
    documents: d.sources.map((p) => ({ id: p.id, text: p.text })),
    evidence: "all",
    threshold: 0.5,
    instructions:
      "These are IT knowledge-base passages. A step, time, date, cause or promise is supported only if a passage states it. A restoration time that no passage states is not stated.",
  };
}

/** Verify's answer, one entry per sentence we sent (matched by text when the order differs). */
export function mapClaims(sentences: string[], resClaims: GroundingClaim[]): ProvenClaim[] {
  return sentences.map((text, i) => {
    const c = resClaims[i] && resClaims[i].claim.trim() === text.trim() ? resClaims[i] : resClaims.find((x) => x.claim.trim() === text.trim());
    if (!c) return { text, verdict: "not_stated", supported: 0, kept: false, source: null };
    const kept = c.verdict === "supported" || c.verdict === "not_a_claim";
    const ev = c.evidence;
    return {
      text,
      verdict: c.verdict,
      supported: c.supported,
      kept,
      // Evidence with no document (seen live: a quote of the "Document <id>:" header) has offsets
      // that map to no passage, so only the claim's named source is kept.
      source: ev?.document
        ? { passageId: ev.document, quote: ev.quote, start: ev.start, end: ev.end }
        : c.source
          ? { passageId: c.source, quote: null, start: null, end: null }
          : null,
    };
  });
}

export async function prove(ctx: RunContext, question: string, d: DraftResult): Promise<ProveResult> {
  const sentences = splitSentences(d.text);
  const { value } = await tracedCall(
    ctx,
    { id: "prove", stage: "prove", endpoint: "grounding", title: "Verify, claim by claim", runningEffect: `Checking ${plural(sentences.length, "sentence")} against the sources` },
    () => ctx.client.grounding(proveRequest(question, d, sentences), { step: "prove" }),
    (res) => {
      const claims = mapClaims(sentences, res.data.claims);
      const removed = claims.filter((c) => !c.kept);
      const factual = claims.filter((c) => c.verdict !== "not_a_claim");
      const keptShare = factual.length ? factual.filter((c) => c.kept).length / factual.length : 0;
      const reply = claims.filter((c) => c.kept).map((c) => c.text).join("\n");
      const marks: EvidenceMark[] = claims
        .filter((c) => c.kept && c.source?.start != null && c.source.end != null)
        .map((c) => ({ target: "chunk", ref: c.source!.passageId, start: c.source!.start as number, end: c.source!.end as number, kind: "support", label: "supports a sentence" }));
      const supportedCount = factual.filter((c) => c.kept).length;
      const removedText = removed.length
        ? ` Removed ${plural(removed.length, "sentence")} (${removed.map((r) => r.verdict).join(", ")}): "${removed[0].text.slice(0, 80)}${removed[0].text.length > 80 ? "…" : ""}".`
        : " Nothing had to be removed.";
      return {
        value: { grounded: res.data.grounded, answersQuestion: res.data.answers_question ?? null, claims, reply, removed, keptShare },
        summary: {
          count: supportedCount,
          countLabel: `of ${factual.length} supported`,
          verdict: res.data.grounded >= GROUNDED_AUTO ? "grounded" : "weak",
          probability: res.data.grounded,
          probabilityLabel: "grounded",
          effect: `${supportedCount} of ${factual.length} sentences are backed by a source quote (grounded ${pct(res.data.grounded)}).${removedText}`,
          evidence: marks,
          detail: { request: { claims: sentences.length, documents: d.sources.map((p) => p.id) }, response: { grounded: res.data.grounded, answers_question: res.data.answers_question, claims: claims.map((c) => ({ claim: c.text, verdict: c.verdict, supported: Number(c.supported.toFixed(3)) })) } },
        },
      };
    },
  );
  return value;
}
