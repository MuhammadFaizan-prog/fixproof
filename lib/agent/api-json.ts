import type { PublicResult } from "./triage";
import { createHash } from "node:crypto";
import { buildLedger } from "./ledger";
import type { StepEvent } from "./types";

const OUTCOME_LABEL = { AUTO_RESOLVED: "Resolved", CONFIRM_WITH_USER: "Needs confirmation", ESCALATED: "Handed to a person" } as const;

/** The JSON API's response: what a desk integration needs, nothing the browser cards alone need. */
export async function jsonBody(mode: string, scenarioId: string | null, personaId: string, r: PublicResult, events: StepEvent[]) {
  const calls = events.filter((e) => e.endpoint !== "local");
  return {
    mode,
    scenarioId,
    personaId,
    simulated: r.simulated?.id ?? null,
    outcome: r.outcome.outcome,
    outcomeLabel: OUTCOME_LABEL[r.outcome.outcome as keyof typeof OUTCOME_LABEL] ?? r.outcome.outcome,
    headline: r.outcome.headline,
    runFixOffered: r.outcome.runFix,
    decidingCheck: r.outcome.deciding ? { id: r.outcome.deciding.id, label: r.outcome.deciding.label, detail: r.outcome.deciding.detail } : null,
    reasons: r.outcome.checks.map((c) => ({ id: c.id, label: c.label, pass: c.pass, detail: c.detail, severity: c.severity })),
    reply: r.reply,
    maskedTicket: r.screen?.safeText ?? null,
    handoff: r.handoff,
    failure: r.failure,
    credits: r.credits,
    usdAtBuildRate: Number(((r.credits * 0.24) / 1000).toFixed(5)),
    calls: calls.map((e) => ({
      step: e.id,
      endpoint: e.endpoint,
      title: e.title,
      status: e.status,
      verdict: e.verdict ?? null,
      effect: e.effect,
      credits: e.meta?.credits ?? null,
      modelMs: e.meta?.modelMs ?? null,
      attempts: e.meta?.attempts ?? null,
      replay: e.meta?.replay ?? null,
      inputsHash: e.meta?.inputsHash ?? e.error?.inputsHash ?? null,
      at: e.meta?.at ?? e.error?.at ?? null,
    })),
    ledger: await buildLedger(
      events,
      { mode, scenarioId, personaId, simulated: r.simulated?.id ?? null, outcome: r.outcome.outcome, decidingCheck: r.outcome.deciding?.id ?? null, credits: r.credits },
      (t) => createHash("sha256").update(t).digest("hex"),
    ),
  };
}

