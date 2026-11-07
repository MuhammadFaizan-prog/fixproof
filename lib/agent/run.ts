import { ClockedError } from "@/lib/clocked/errors";
import type { KbIndex } from "@/lib/kb/index";
import { decideOutcome, type OutcomeDecision } from "./policy";
import { draft, type DraftResult } from "./steps/draft";
import { fixGate, type FixGateResult } from "./steps/fixGate";
import { handoff, localHandoff, type HandoffRecord } from "./steps/handoff";
import { prove, type ProveResult } from "./steps/prove";
import { reconcile, type ReconcileResult } from "./steps/reconcile";
import { retrieve, type RetrieveResult } from "./steps/retrieve";
import { screen, type ScreenResult } from "./steps/screen";
import { understand, type UnderstandResult } from "./steps/understand";
import type { RunContext, StepEvent } from "./types";

/**
 * The FixProof run: eight stages, each one's Clocked output deciding what
 * the next one does. Never throws for a Clocked failure: a failed call ends
 * the run as ESCALATED with a locally built handoff ("queued for a human").
 */

export interface RunResult {
  outcome: OutcomeDecision;
  screen: ScreenResult | null;
  understand: UnderstandResult | null;
  retrieve: RetrieveResult | null;
  reconcile: ReconcileResult | null;
  draft: DraftResult | null;
  prove: ProveResult | null;
  fixGate: FixGateResult | null;
  handoff: HandoffRecord | null;
  credits: number;
  calls: number;
  failure: { step: string; kind: string; message: string } | null;
}

export interface RunInput {
  text: string;
  index: KbIndex;
}

export async function runTicket(ctx: RunContext, input: RunInput): Promise<RunResult> {
  let credits = 0;
  let calls = 0;
  const emit = (e: StepEvent) => {
    if (e.status !== "running" && e.endpoint !== "local") {
      calls++;
      credits += e.meta?.credits ?? 0;
    }
    ctx.emit(e);
  };
  const c: RunContext = { ...ctx, emit };
  const r: RunResult = { outcome: null as unknown as OutcomeDecision, screen: null, understand: null, retrieve: null, reconcile: null, draft: null, prove: null, fixGate: null, handoff: null, credits: 0, calls: 0, failure: null };
  const attempted: string[] = [];

  try {
    r.screen = await screen(c, input.text);
    attempted.push(r.screen.quarantined ? "screened the ticket and cut an injected instruction" : "screened the ticket and masked personal data");
    if (r.screen.canContinue) {
      r.understand = await understand(c, r.screen.safeText);
      attempted.push(`classified it as ${r.understand.record.category ?? "uncategorised"}, ${r.understand.record.severity ?? "unknown"} severity`);
      r.retrieve = await retrieve(c, input.index, r.screen.safeText, r.understand);
      attempted.push(`searched the knowledge base and kept ${r.retrieve.used.length} passage${r.retrieve.used.length === 1 ? "" : "s"}`);
      if (r.retrieve.used.length) {
        r.reconcile = await reconcile(c, r.retrieve.used);
        const sources = r.reconcile.used;
        r.draft = await draft(c, r.screen.safeText, sources);
        r.prove = await prove(c, r.screen.safeText, r.draft);
        attempted.push(`drafted a reply and verified it (${Math.round(r.prove.grounded * 100)}% grounded)`);
        r.fixGate = await fixGate(c, sources);
        if (r.fixGate.ran) attempted.push(`inspected the ${r.fixGate.script?.lang} script: ${r.fixGate.verdict}`);
      }
    }
  } catch (err) {
    const e = err instanceof ClockedError ? err : null;
    r.failure = { step: e?.step ?? "run", kind: e?.kind ?? (err instanceof Error && /shape|returned no|without both/i.test(err.message) ? "invalid_response" : "internal"), message: e?.message ?? (err instanceof Error ? err.message : "Unexpected error") };
  }

  r.outcome = decideOutcome({
    failure: r.failure,
    screen: r.screen ? { canContinue: r.screen.canContinue, quarantined: r.screen.quarantined } : null,
    band: r.understand?.policy.band ?? null,
    bandReason: r.understand?.policy.reason,
    retrievedCount: r.retrieve ? r.retrieve.used.length : null,
    unresolvedConflicts: r.reconcile?.ran ? r.reconcile.unresolved : null,
    resolvedConflicts: r.reconcile?.ran ? r.reconcile.conflicts.length - r.reconcile.unresolved : null,
    prove: r.prove ? { grounded: r.prove.grounded, answersQuestion: r.prove.answersQuestion, keptShare: r.prove.keptShare, removed: r.prove.removed.length, replyEmpty: !r.prove.reply.trim() } : null,
    script: r.fixGate ? { ran: r.fixGate.ran, verdict: r.fixGate.verdict, runAllowed: r.fixGate.runAllowed, category: r.fixGate.category, source: r.fixGate.articleTitle } : null,
  });

  if (r.outcome.outcome === "ESCALATED") {
    const h = { maskedTicket: r.screen?.safeText ?? "", failed: r.outcome.deciding, attempted, reply: r.prove?.reply || null };
    if (r.failure) {
      r.handoff = localHandoff(h, c.persona);
      emit({ id: "handoff", stage: "outcome", endpoint: "local", title: "Handoff record", status: "ok", verdict: "Service Desk · P3", effect: "Clocked did not answer, so FixProof built the handoff itself and queued the ticket for a person. Nothing was guessed." });
    } else {
      try {
        r.handoff = await handoff(c, h);
      } catch (err) {
        const e = err instanceof ClockedError ? err : null;
        r.failure = { step: "handoff", kind: e?.kind ?? "invalid_response", message: e?.message ?? "handoff failed" };
        r.handoff = localHandoff(h, c.persona);
      }
    }
  }

  emit({
    id: "outcome",
    stage: "outcome",
    endpoint: "local",
    title: "Outcome",
    status: "ok",
    verdict: r.outcome.outcome,
    count: r.outcome.checks.filter((x) => x.pass === true).length,
    countLabel: `of ${r.outcome.checks.length} checks`,
    effect: r.outcome.headline,
  });

  r.credits = credits;
  r.calls = calls;
  return r;
}
