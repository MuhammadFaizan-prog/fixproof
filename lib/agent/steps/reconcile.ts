import type { CompareRequest } from "@/lib/clocked/types";
import { plural, tracedCall } from "../trace";
import type { EvidenceMark, RunContext } from "../types";
import type { Passage } from "./retrieve";
import type { Persona } from "@/data/personas";

/**
 * Stage 4, reconcile. When two or more passages survive retrieval, Compare
 * reads every pair, and FixProof decides which article governs for this
 * employee: precedence over recency.
 *
 * - Same scope (same OS and office/region lists): the newer article wins and
 *   the older passage is removed before drafting.
 * - Different scope: the article written for this employee's office, region,
 *   device or OS beats a company-wide one, even when the company-wide one is
 *   newer ("scope" rule). Compare calling the pair "overlapping" is enough
 *   when one side is written for the employee's office and the other is
 *   company-wide: an office procedure replaces the global one in that office.
 * - Nothing breaks the tie (same scope and same date): left unresolved, which
 *   the outcome policy will not auto-resolve.
 * A passage Compare calls the same as a better one is dropped as a duplicate.
 *
 * The rule in force at the run-1 eval lock was "newer" only; it is kept as
 * `conflictRule: "newer"` so the locked run replays byte for byte.
 */

export type ConflictRule = "newer" | "scope";
export const DEFAULT_CONFLICT_RULE: ConflictRule = "scope";

type ScopeSide = Pick<Passage, "os" | "region">;

/** How specifically a passage is written for this employee: -1 does not apply, 0 company-wide, +1 per matching OS / region. */
export function scopeRank(p: ScopeSide, persona: Pick<Persona, "os" | "region">): number {
  const dim = (list: readonly string[], mine: string) => (list.includes(mine) && !list.includes("any") ? 1 : list.includes("any") || list.includes(mine) ? 0 : -1);
  const os = dim(p.os, persona.os);
  const region = dim(p.region, persona.region);
  return os < 0 || region < 0 ? -1 : os + region;
}

const sameScope = (a: ScopeSide, b: ScopeSide) => [...a.os].sort().join() === [...b.os].sort().join() && [...a.region].sort().join() === [...b.region].sort().join();

/** Which side of a conflicting pair governs for this employee, and by which rule. */
export function precedence(a: Passage, b: Passage, persona: Pick<Persona, "os" | "region">, rule: ConflictRule): { winner: Passage | null; rule: Conflict["rule"] } {
  if (rule === "scope" && !sameScope(a, b)) {
    const ra = scopeRank(a, persona);
    const rb = scopeRank(b, persona);
    if (ra !== rb) return { winner: ra > rb ? a : b, rule: "scope" };
  }
  if (a.updated === b.updated) return { winner: null, rule: null };
  return { winner: a.updated > b.updated ? a : b, rule: "newer" };
}

/** The office/region-specific side of an overlapping pair whose other side is company-wide, if any. */
export function officeOverride(a: Passage, b: Passage, persona: Pick<Persona, "os" | "region">): { winner: Passage; loser: Passage } | null {
  const local = (p: Passage) => p.region.includes(persona.region) && !p.region.includes("any");
  const global = (p: Passage) => p.region.includes("any");
  if (scopeRank(a, persona) < 0 || scopeRank(b, persona) < 0) return null;
  if (local(a) && global(b)) return { winner: a, loser: b };
  if (local(b) && global(a)) return { winner: b, loser: a };
  return null;
}

/** First sentence of a passage body (after its heading), with offsets into the passage text, for the override card. */
function leadSentence(text: string): { quote: string; start: number; end: number } {
  const cps = Array.from(text);
  const joined = cps.join("");
  const nl = joined.startsWith("#") ? joined.indexOf("\n") + 1 : 0;
  const body = Array.from(joined.slice(nl));
  const startCp = Array.from(joined.slice(0, nl)).length;
  let endCp = body.findIndex((ch, i) => ch === "." && (i === body.length - 1 || /\s/.test(body[i + 1] ?? "")));
  endCp = endCp < 0 ? body.length : endCp + 1;
  return { quote: body.slice(0, endCp).join(""), start: startCp, end: startCp + endCp };
}

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
  /** newer: same scope, later date wins. scope: the article written for this employee's office/OS beats a company-wide one. */
  rule: "newer" | "scope" | null;
  /** "conflict": Compare found contradicting quotes. "overlap": Compare called the pair overlapping and the office-specific article governs. */
  basis?: "conflict" | "overlap";
}

export interface ReconcileResult {
  ran: boolean;
  used: Passage[];
  conflicts: Conflict[];
  unresolved: number;
  removed: { passageId: string; title: string; why: "older_conflicting" | "out_of_scope" | "duplicate" }[];
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
  const rule = ctx.conflictRule ?? DEFAULT_CONFLICT_RULE;

  const { value } = await tracedCall(
    ctx,
    { id: "reconcile:compare", stage: "reconcile", endpoint: "compare", title: "Compare, kept passages", runningEffect: `Checking ${passages.length} passages against each other` },
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
          const pr = precedence(pa, pb, ctx.persona, rule);
          const newer = pr.winner;
          const older = newer ? (newer === pa ? pb : pa) : null;
          // One conflict card per pair, built from its strongest finding.
          const f = [...pair.conflicts].sort((x, y) => (y.confidence ?? 0) - (x.confidence ?? 0))[0];
          conflicts.push({
            kind: f.kind ?? "conflict",
            confidence: f.confidence ?? pair.probabilities.conflicting ?? 0,
            a: { passageId: pa.id, title: pa.title, updated: pa.updated, quote: f.a.quote, start: f.a.start, end: f.a.end },
            b: { passageId: pb.id, title: pb.title, updated: pb.updated, quote: f.b.quote, start: f.b.start, end: f.b.end },
            winner: newer?.id ?? null,
            rule: pr.rule,
            ...(rule === "scope" ? { basis: "conflict" as const } : {}),
          });
          if (older && !drop.has(older.id)) {
            drop.add(older.id);
            removed.push({ passageId: older.id, title: older.title, why: pr.rule === "scope" ? "out_of_scope" : "older_conflicting" });
          }
        } else if (rule === "scope" && pair.relation === "overlapping" && officeOverride(pa, pb, ctx.persona)) {
          const { winner, loser } = officeOverride(pa, pb, ctx.persona)!;
          const qa = leadSentence(pa.text);
          const qb = leadSentence(pb.text);
          conflicts.push({
            kind: "office_scope",
            confidence: pair.probabilities.overlapping ?? pair.related ?? 0,
            a: { passageId: pa.id, title: pa.title, updated: pa.updated, ...qa },
            b: { passageId: pb.id, title: pb.title, updated: pb.updated, ...qb },
            winner: winner.id,
            rule: "scope",
            basis: "overlap",
          });
          if (!drop.has(loser.id)) {
            drop.add(loser.id);
            removed.push({ passageId: loser.id, title: loser.title, why: "out_of_scope" });
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
        const loser = removed.find((r) => r.why === "older_conflicting" || r.why === "out_of_scope");
        effect =
          first.rule === "scope"
            ? `"${winner.title}" is written for this employee's ${winner.region.includes(ctx.persona.region) && !winner.region.includes("any") ? `office (${ctx.persona.office})` : `setup (${ctx.persona.osLabel})`}, so it governs over the company-wide "${loser?.title}", which is removed before drafting.`
            : `"${winner.title}" (${winner.updated}) overrides "${loser?.title}": the older rule is removed before drafting.`;
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
