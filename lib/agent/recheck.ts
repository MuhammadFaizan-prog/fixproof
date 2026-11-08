import { createHash } from "node:crypto";
import type { ClockedClient } from "@/lib/clocked/client";
import { splitSentences } from "@/lib/text/sentences";
import type { Passage } from "./steps/retrieve";
import { mapClaims, type ProvenClaim } from "./steps/prove";

/**
 * Technician edit → re-verify. The edited reply goes to Verify against the
 * same passages the original draft was written from, one claim per sentence,
 * with the same instructions as the prove step. Nothing is sent anywhere: the
 * result only decides whether "Approve & send" is enabled in the desk view.
 */

export const MAX_EDIT_CHARS = 2000;

/** Step id for a given edit, so a recorded re-verify replays only for the exact same text. */
export function recheckStep(reply: string): string {
  return `recheck:${createHash("sha256").update(reply.trim()).digest("hex").slice(0, 12)}`;
}

export interface RecheckResult {
  claims: ProvenClaim[];
  grounded: number;
  unsupported: number;
  credits: number;
  recordedAt: string | null;
}

export async function recheckReply(client: ClockedClient, question: string, sources: Pick<Passage, "id" | "text">[], reply: string): Promise<RecheckResult> {
  const sentences = splitSentences(reply.trim());
  const res = await client.grounding(
    {
      question,
      answer: reply.trim(),
      claims: sentences,
      documents: sources.map((p) => ({ id: p.id, text: p.text })),
      evidence: "all",
      threshold: 0.5,
      instructions:
        "These are IT knowledge-base passages. A step, time, date, cause or promise is supported only if a passage states it. A restoration time that no passage states is not stated.",
    },
    { step: recheckStep(reply) },
  );
  const claims = mapClaims(sentences, res.data.claims);
  return {
    claims,
    grounded: res.data.grounded,
    unsupported: claims.filter((c) => !c.kept).length,
    credits: res.meta.credits ?? 0,
    recordedAt: res.meta.replay ? (res.meta.recordedAt ?? null) : null,
  };
}
