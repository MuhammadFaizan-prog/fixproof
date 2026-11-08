import { z } from "zod";
import { createClockedClient, type ClockedClient } from "@/lib/clocked/client";
import { createBudgetTransport } from "@/lib/clocked/budget";
import { ClockedError } from "@/lib/clocked/errors";
import { createHttpTransport } from "@/lib/clocked/transport";
import { DEFAULTS as LIVE_DEFAULTS } from "@/lib/server/live-guard";
import { createFileFixtureStore } from "@/lib/clocked/fixture-files";
import { resolveMode, type ModeDecision } from "@/lib/clocked/mode";
import { createReplayTransport } from "@/lib/clocked/replay";
import { createFaultTransport, FAULT_IDS, FAULTS, type FaultId } from "@/lib/clocked/faults";
import { getKbIndex } from "@/lib/kb/index";
import { getPersona, type Persona } from "@/data/personas";
import { getScenario } from "@/data/scenarios";
import { runTicket, type RunResult } from "./run";
import type { StepEvent } from "./types";
import type { Passage } from "./steps/retrieve";

/**
 * Server-side entry for one triage request: validate, choose replay or live,
 * run, and hand every event to the caller. Used by the API route; kept
 * separate so it is testable without HTTP.
 */

export const MAX_TICKET_CHARS = 4000;

export const TriageRequestSchema = z.object({
  text: z.string().trim().max(MAX_TICKET_CHARS).default(""),
  personaId: z.string().min(1),
  scenarioId: z.string().regex(/^[a-z0-9-]+$/).optional(),
  mode: z.enum(["replay", "live"]).default("replay"),
  /** Outage drill: replay a preset with a simulated Clocked failure (lib/clocked/faults.ts). Presets only, never live. */
  simulate: z.enum(FAULT_IDS).optional(),
});
export type TriageRequest = z.infer<typeof TriageRequestSchema>;

export interface TriageStart {
  mode: ModeDecision;
  persona: Persona;
  scenarioId: string | null;
  text: string;
  simulate: FaultId | null;
}

export class TriageInputError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "unknown_persona" | "unknown_scenario" | "needs_preset" | "empty",
  ) {
    super(message);
  }
}

/** Resolve what will run. Presets always use their own text and persona, never what the client sent. */
export function planTriage(req: TriageRequest, env: NodeJS.ProcessEnv = process.env): TriageStart {
  const scenario = req.scenarioId ? getScenario(req.scenarioId) : undefined;
  if (req.scenarioId && !scenario) throw new TriageInputError("Unknown preset.", "unknown_scenario");
  if (req.simulate && !scenario) throw new TriageInputError("Outage drills replay a recorded preset; pick one.", "needs_preset");
  const persona = getPersona(scenario?.personaId ?? req.personaId);
  if (!persona) throw new TriageInputError("Unknown employee profile.", "unknown_persona");
  const text = scenario?.text ?? req.text;
  if (!text.trim()) throw new TriageInputError("Write a ticket or pick a preset.", "empty");
  // A drill is always a replay: it never spends credits and never touches the live key.
  const mode = req.simulate ? ({ mode: "replay", reason: "preset" } as ModeDecision) : resolveMode({ requested: req.mode, isPreset: Boolean(scenario), env });
  if (mode.mode === "replay" && !scenario) {
    throw new TriageInputError(
      mode.reason === "no_key" ? "This deployment has no Clocked key, so only the recorded presets can run." : "Free-text tickets run live; pick a preset to replay a recorded run.",
      "needs_preset",
    );
  }
  return { mode, persona, scenarioId: scenario?.id ?? null, text, simulate: req.simulate ?? null };
}

export type AttemptObserver = (info: { step: string; attempt: number; status?: number; waitMs?: number }) => void;

export function clientFor(start: TriageStart, env: NodeJS.ProcessEnv = process.env, onAttempt?: AttemptObserver): ClockedClient {
  if (start.mode.mode === "replay") {
    const replay = createReplayTransport({ store: createFileFixtureStore(), scenario: start.scenarioId as string });
    const transport = start.simulate ? createFaultTransport(replay, FAULTS[start.simulate]) : replay;
    // Replays (drills included) skip the backoff waits; the wait each retry would have taken is still reported.
    return createClockedClient({ transport, sleep: async () => {}, onAttempt });
  }
  const apiKey = env.CLOCKED_API_KEY?.trim();
  if (!apiKey) throw new ClockedError("CLOCKED_API_KEY is not set", { kind: "no_key", endpoint: "pipeline", step: "init", attempts: 0 });
  const ceiling = Number(env.LIVE_RUN_CREDIT_CEILING);
  const concurrency = Number(env.CLOCKED_CONCURRENCY ?? 1);
  // Every live run is bounded by a hard credit ceiling, whatever the daily caps say.
  return createClockedClient({
    transport: createBudgetTransport(createHttpTransport({ apiKey, baseUrl: env.CLOCKED_BASE_URL || undefined }), Number.isInteger(ceiling) && ceiling > 0 ? ceiling : LIVE_DEFAULTS.runCeiling),
    concurrency: Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 1,
    onAttempt,
  });
}

/** What the browser receives at the end: everything the cards need, nothing it did not already have. */
export function publicResult(r: RunResult, simulate: FaultId | null = null) {
  return {
    simulated: simulate ? { id: simulate, label: FAULTS[simulate].label, stageTitle: FAULTS[simulate].stageTitle, expect: FAULTS[simulate].expect } : null,
    outcome: r.outcome,
    screen: r.screen && {
      originalText: r.screen.originalText,
      safeText: r.screen.safeText,
      marks: r.screen.marks,
      quarantined: r.screen.quarantined,
      piiCounts: r.screen.piiCounts,
      injection: { verdict: r.screen.injection.verdict, category: r.screen.injection.category, severity: r.screen.injection.severity, evidence: r.screen.injection.evidence.map((e) => ({ quote: e.quote, start: e.start, end: e.end })) },
      recheck: r.screen.recheck,
    },
    understand: r.understand,
    retrieve: r.retrieve && { recalled: r.retrieve.recalled, used: r.retrieve.used.map(slimPassage), skipped: r.retrieve.skipped, dropped: r.retrieve.dropped },
    reconcile: r.reconcile,
    reply: r.prove?.reply ?? null,
    prove: r.prove && { grounded: r.prove.grounded, answersQuestion: r.prove.answersQuestion, claims: r.prove.claims, keptShare: r.prove.keptShare },
    draft: r.draft?.text ?? null,
    fixGate: r.fixGate,
    handoff: r.handoff,
    credits: r.credits,
    calls: r.calls,
    failure: r.failure && { step: r.failure.step, kind: r.failure.kind },
  };
}
export type PublicResult = ReturnType<typeof publicResult>;

function slimPassage(p: Passage) {
  return { id: p.id, articleId: p.articleId, title: p.title, section: p.section, text: p.text, updated: p.updated, relevance: p.relevance, pulledBy: p.pulledBy ?? null, hasScript: Boolean(p.script) };
}

/** One plain sentence about the retries a call needed, for its Proof Trail row (live runs and drills alike). */
export function retryNote(tries: { attempt: number; status?: number; waitMs?: number }[], final: "ok" | "error"): string | null {
  const failed = tries.filter((t) => t.waitMs !== undefined);
  if (!failed.length) return null;
  const why = failed.map((t) => (t.status ? String(t.status) : "no answer")).join(", ");
  const waits = failed.map((t) => `${Math.round((t.waitMs ?? 0) / 100) / 10} s`).join(", ");
  const n = failed.length + 1;
  return final === "ok"
    ? `Retried ${failed.length === 1 ? "once" : `${failed.length} times`} (${why}), waiting ${waits}, with the same Idempotency-Key each time; answered on attempt ${n}.`
    : `Gave up after ${n} attempts (${why}, …), waiting ${waits} between them, with the same Idempotency-Key each time.`;
}

export async function runTriage(start: TriageStart, emit: (e: StepEvent) => void, env: NodeJS.ProcessEnv = process.env): Promise<PublicResult> {
  const tries = new Map<string, { attempt: number; status?: number; waitMs?: number }[]>();
  const client = clientFor(start, env, (info) => {
    if (info.waitMs !== undefined) tries.set(info.step, [...(tries.get(info.step) ?? []), info]);
  });
  const withRetries = (e: StepEvent) => {
    const t = e.status === "running" ? undefined : tries.get(e.id);
    const note = t ? retryNote(t, e.status === "error" ? "error" : "ok") : null;
    emit(note ? { ...e, effect: `${e.effect} ${note}`, retries: t!.map((x) => ({ attempt: x.attempt, status: x.status ?? null, waitMs: x.waitMs ?? 0 })) } : e);
  };
  const result = await runTicket({ client, persona: start.persona, emit: withRetries }, { text: start.text, index: getKbIndex() });
  return publicResult(result, start.simulate);
}
