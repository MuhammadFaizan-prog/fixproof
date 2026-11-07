import type { ClockedClient } from "@/lib/clocked/client";
import type { ClockedMeta, Endpoint, Span } from "@/lib/clocked/types";
import type { Persona } from "@/data/personas";
import type { StageId } from "@/data/pipeline";

/**
 * One event on the Proof Trail. Every Clocked call produces a `running`
 * event and then an `ok` or `error` event with the same id. Local steps
 * (BM25, the policy) use endpoint "local" and carry no credits.
 */
export type StepStatus = "running" | "ok" | "error" | "skipped";

export interface EvidenceMark extends Span {
  /** Which text the span indexes: the ticket as typed, the masked ticket, a KB chunk, the draft, or a script. */
  target: "original" | "masked" | "chunk" | "draft" | "script";
  /** KB chunk id or passage id ("<article>#<i>[,<j>]") when target is "chunk"; offsets are local to that text. */
  ref?: string;
  kind: "pii" | "injection" | "extract" | "support" | "conflict" | "script";
  label: string;
}

export interface StepMeta {
  credits: number | null;
  modelMs: number | null;
  attempts: number;
  idempotencyKeyPrefix: string;
  transport: string | null;
  roundTripMs: number;
  replay: boolean;
  synthetic: boolean;
  recordedAt: string | null;
}

export interface StepEvent {
  /** Stable id within a run, e.g. "screen", "retrieve:guard:mfa-new-phone#2". Also the fixture step name. */
  id: string;
  stage: StageId;
  endpoint: Endpoint | "local";
  /** Short human title for the row, e.g. "Protect + Guard". */
  title: string;
  status: StepStatus;
  /** Headline number for the step row (entities masked, chunks kept, claims supported). */
  count?: number;
  countLabel?: string;
  verdict?: string;
  /** 0–1 value for the row's bar, with what it measures. */
  probability?: number;
  probabilityLabel?: string;
  /** What this call's output changed in the run. Required: a call whose result changes nothing is a bug. */
  effect: string;
  evidence?: EvidenceMark[];
  meta?: StepMeta;
  /** Request/response summary for the inspector. Never contains raw PII or the key. */
  detail?: { request?: unknown; response?: unknown };
  error?: { kind: string; message: string; status?: number };
}

export type Emit = (event: StepEvent) => void;

export interface RunContext {
  client: ClockedClient;
  persona: Persona;
  emit: Emit;
}

export function toStepMeta(meta: ClockedMeta): StepMeta {
  return {
    credits: meta.credits,
    modelMs: meta.modelMs,
    attempts: meta.attempts,
    idempotencyKeyPrefix: meta.idempotencyKeyPrefix,
    transport: meta.transport,
    roundTripMs: meta.roundTripMs,
    replay: meta.replay,
    synthetic: meta.synthetic,
    recordedAt: meta.recordedAt,
  };
}
