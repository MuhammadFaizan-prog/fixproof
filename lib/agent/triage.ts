import { z } from "zod";
import { createClockedClient, type ClockedClient } from "@/lib/clocked/client";
import { createBudgetTransport } from "@/lib/clocked/budget";
import { ClockedError } from "@/lib/clocked/errors";
import { createHttpTransport } from "@/lib/clocked/transport";
import { DEFAULTS as LIVE_DEFAULTS } from "@/lib/server/live-guard";
import { createFileFixtureStore } from "@/lib/clocked/fixture-files";
import { resolveMode, type ModeDecision } from "@/lib/clocked/mode";
import { createReplayTransport } from "@/lib/clocked/replay";
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
});
export type TriageRequest = z.infer<typeof TriageRequestSchema>;

export interface TriageStart {
  mode: ModeDecision;
  persona: Persona;
  scenarioId: string | null;
  text: string;
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
  const persona = getPersona(scenario?.personaId ?? req.personaId);
  if (!persona) throw new TriageInputError("Unknown employee profile.", "unknown_persona");
  const text = scenario?.text ?? req.text;
  if (!text.trim()) throw new TriageInputError("Write a ticket or pick a preset.", "empty");
  const mode = resolveMode({ requested: req.mode, isPreset: Boolean(scenario), env });
  if (mode.mode === "replay" && !scenario) {
    throw new TriageInputError(
      mode.reason === "no_key" ? "This deployment has no Clocked key, so only the recorded presets can run." : "Free-text tickets run live; pick a preset to replay a recorded run.",
      "needs_preset",
    );
  }
  return { mode, persona, scenarioId: scenario?.id ?? null, text };
}

export function clientFor(start: TriageStart, env: NodeJS.ProcessEnv = process.env): ClockedClient {
  if (start.mode.mode === "replay") {
    return createClockedClient({ transport: createReplayTransport({ store: createFileFixtureStore(), scenario: start.scenarioId as string }), sleep: async () => {} });
  }
  const apiKey = env.CLOCKED_API_KEY?.trim();
  if (!apiKey) throw new ClockedError("CLOCKED_API_KEY is not set", { kind: "no_key", endpoint: "pipeline", step: "init", attempts: 0 });
  const ceiling = Number(env.LIVE_RUN_CREDIT_CEILING);
  const concurrency = Number(env.CLOCKED_CONCURRENCY ?? 1);
  // Every live run is bounded by a hard credit ceiling, whatever the daily caps say.
  return createClockedClient({
    transport: createBudgetTransport(createHttpTransport({ apiKey, baseUrl: env.CLOCKED_BASE_URL || undefined }), Number.isInteger(ceiling) && ceiling > 0 ? ceiling : LIVE_DEFAULTS.runCeiling),
    concurrency: Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 1,
  });
}

/** What the browser receives at the end: everything the cards need, nothing it did not already have. */
export function publicResult(r: RunResult) {
  return {
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

export async function runTriage(start: TriageStart, emit: (e: StepEvent) => void, env: NodeJS.ProcessEnv = process.env): Promise<PublicResult> {
  const client = clientFor(start, env);
  const result = await runTicket({ client, persona: start.persona, emit }, { text: start.text, index: getKbIndex() });
  return publicResult(result);
}
