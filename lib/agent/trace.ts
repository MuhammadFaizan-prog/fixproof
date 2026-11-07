import { ClockedError } from "@/lib/clocked/errors";
import type { ClockedResult, Endpoint } from "@/lib/clocked/types";
import type { StageId } from "@/data/pipeline";
import { toStepMeta, type RunContext, type StepEvent } from "./types";

/** What a finished call reports on its row, derived from the Clocked result. */
export type StepSummary = Omit<StepEvent, "id" | "stage" | "endpoint" | "title" | "status" | "meta">;

/**
 * Run one Clocked call as one Proof Trail row: emit `running`, make the call
 * (step id doubles as the fixture step and the idempotency scope), then emit
 * `ok` with the summary and usage meta, or `error` and rethrow.
 */
export async function tracedCall<E extends Endpoint, T>(
  ctx: RunContext,
  row: { id: string; stage: StageId; endpoint: E; title: string; runningEffect?: string },
  call: () => Promise<ClockedResult<E>>,
  summarize: (result: ClockedResult<E>) => { value: T; summary: StepSummary },
): Promise<{ value: T; result: ClockedResult<E> }> {
  const base = { id: row.id, stage: row.stage, endpoint: row.endpoint, title: row.title };
  ctx.emit({ ...base, status: "running", effect: row.runningEffect ?? "Waiting for Clocked" });
  let result: ClockedResult<E>;
  try {
    result = await call();
  } catch (err) {
    const e = err instanceof ClockedError ? err : null;
    ctx.emit({
      ...base,
      status: "error",
      effect: "This check did not return, so FixProof will not act on it.",
      error: { kind: e?.kind ?? "unknown", message: e?.message ?? "Unexpected error", status: e?.status },
    });
    throw err;
  }
  let out: { value: T; summary: StepSummary };
  try {
    out = summarize(result);
  } catch (err) {
    ctx.emit({
      ...base,
      status: "error",
      meta: toStepMeta(result.meta),
      effect: "Clocked answered, but not in the shape this step needs, so FixProof will not act on it.",
      error: { kind: "invalid_response", message: err instanceof Error ? err.message : "Unreadable response" },
    });
    throw err;
  }
  const { value, summary } = out;
  ctx.emit({ ...base, status: "ok", meta: toStepMeta(result.meta), ...summary });
  return { value, result };
}

/** A local (non-Clocked) row, such as BM25 recall or the outcome policy. */
export function localStep(ctx: RunContext, row: { id: string; stage: StageId; title: string }, summary: StepSummary): void {
  ctx.emit({ ...row, endpoint: "local", status: "ok", ...summary });
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
