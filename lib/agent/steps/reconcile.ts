import type { CompareRequest } from "@/lib/clocked/types";
import { plural, tracedCall } from "../trace";
import type { EvidenceMark, RunContext } from "../types";
import type { Passage } from "./retrieve";

/**
 * Stage 4, reconcile. When two or more passages survive retrieval, Compare
 * reads every pair. A conflict between articles with different dates is
 * resolved for the newer one (the older passage is removed before drafting,
 * and both quotes are shown). A conflict with no date to break it is left
 * unresolved, which the outcome policy will not auto-resolve. A passage
 * Compare calls the same as a better one is dropped to keep the draft short.
 */

export interface ConflictSide {
  passageId: string;
  title: string;
  updated: string;
  quote: string;
  start: number;
  end: number;
}

export interface Conflict {
  kind: string;
  confidence: number;
  a: ConflictSide;
  b: ConflictSide;
  /** passageId of the side that wins, or null when nothing breaks the tie. */
  winner: string | null;
  rule: "newer" | null;
}

export interface ReconcileResult {
  ran: boolean;
  used: Passage[];
  conflicts: Conflict[];
  unresolved: number;
  removed: { passageId: string; title: string; why: "older_conflicting" | "duplicate" }[];
}

export function compareRequest(passages: Passage[]): CompareRequest {
  return {
    documents: passages.map((p) => ({ id: p.id, text: p.text })),
    instructions:
      "These are IT knowledge-base passages that may be shown to the same employee. Report a conflict only when following one passage would mean breaking the other.",
    evidence: "flagged",
    kinds: true,
  };
}

export async function reconcile(ctx: RunContext, passages: Passage[]): Promise<ReconcileResult> {
  if (passages.length < 2) {
    return { ran: false, used: passages, conflicts: [], unresolved: 0, removed: [] };
  }
  const byId = new Map(passages.map((p) => [p.id, p]));

  const { value } = await tracedCall(
    ctx,
    { id: "reconcile:compare", stage: "reconcile", endpoint: "compare", title: "Compare", runningEffect: `Checking ${passages.length} passages against each other` },
    () => ctx.client.compare(compareRequest(passages), { step: "reconcile:compare" }),
    (res) => {
      const conflicts: Conflict[] = [];
      const removed: ReconcileResult["removed"] = [];
      const drop = new Set<string>();

      for (const pair of res.data.pairs) {
        const pa = byId.get(pair.a);
        const pb = byId.get(pair.b);
        if (!pa || !pb) continue;
        if (pair.relation === "conflicting" && pair.conflicts.length) {
          const newer = pa.updated === pb.updated ? null : pa.updated > pb.updated ? pa : pb;
          const older = newer ? (newer === pa ? pb : pa) : null;
          // One conflict card per pair, built from its strongest finding.
          const f = [...pair.conflicts].sort((x, y) => (y.confidence ?? 0) - (x.confidence ?? 0))[0];
          conflicts.push({
            kind: f.kind ?? "conflict",
            confidence: f.confidence ?? pair.probabilities.conflicting ?? 0,
            a: { passageId: pa.id, title: pa.title, updated: pa.updated, quote: f.a.quote, start: f.a.start, end: f.a.end },
            b: { passageId: pb.id, title: pb.title, updated: pb.updated, quote: f.b.quote, start: f.b.start, end: f.b.end },
            winner: newer?.id ?? null,
            rule: newer ? "newer" : null,
          });
          if (older && !drop.has(older.id)) {
            drop.add(older.id);
            removed.push({ passageId: older.id, title: older.title, why: "older_conflicting" });
          }
        } else if (pair.relation === "same") {
          const weaker = pa.relevance >= pb.relevance ? pb : pa;
          if (!drop.has(weaker.id)) {
            drop.add(weaker.id);
            removed.push({ passageId: weaker.id, title: weaker.title, why: "duplicate" });
          }
        }
      }

      const used = passages.filter((p) => !drop.has(p.id));
      const unresolved = conflicts.filter((c) => !c.winner).length;
      const marks: EvidenceMark[] = conflicts.flatMap((c) => [
        { target: "chunk" as const, ref: c.a.passageId, start: c.a.start, end: c.a.end, kind: "conflict" as const, label: c.kind },
        { target: "chunk" as const, ref: c.b.passageId, start: c.b.start, end: c.b.end, kind: "conflict" as const, label: c.kind },
      ]);
      const first = conflicts[0];
      let effect: string;
      if (!conflicts.length) {
        effect = removed.length ? `No conflicts. Dropped ${plural(removed.length, "duplicate passage")}.` : `The ${passages.length} passages agree.`;
      } else if (unresolved) {
        effect = `${plural(conflicts.length, "conflict")}, ${unresolved} with no newer source to break the tie, so FixProof will not answer on its own.`;
      } else {
        const winner = byId.get(first.winner!)!;
        const loser = removed.find((r) => r.why === "older_conflicting");
        effect = `"${winner.title}" (${winner.updated}) overrides "${loser?.title}": the older rule is removed before drafting.`;
      }
      return {
        value: { conflicts, removed, used, unresolved },
        summary: {
          count: conflicts.length,
          countLabel: conflicts.length === 1 ? "conflict" : "conflicts",
          verdict: !conflicts.length ? "agree" : unresolved ? "unresolved" : "resolved",
          probability: first ? first.confidence : (res.data.pairs[0]?.related ?? 0),
          probabilityLabel: first ? "conflict" : "related",
          effect,
          evidence: marks,
          detail: { request: { documents: passages.map((p) => p.id) }, response: { verdict: res.data.verdict, pairs: res.data.pairs.map((p) => ({ a: p.a, b: p.b, relation: p.relation, conflicts: p.conflicts.length })) } },
        },
      };
    },
  );

  return { ran: true, ...value };
}
