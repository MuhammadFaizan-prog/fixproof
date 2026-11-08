import { STAGES, type StageId } from "@/data/pipeline";
import type { StepEvent } from "@/lib/agent/types";
import type { TriageState } from "@/lib/client/useTriage";

export type Row = TriageState["rows"][string];

export interface StageView {
  id: StageId;
  index: number;
  title: string;
  endpoints: string[];
  promise: string;
  rows: Row[];
  /** The row whose effect speaks for the stage. */
  lead: Row | null;
  /** Merit's number column: the stage's key count, when it has one. */
  count: { value: number; label: string } | null;
  /** blocked: never ran because an earlier stage's Clocked call did not return (fail-closed). */
  status: "pending" | "running" | "ok" | "error" | "skipped" | "blocked";
  credits: number;
  ms: number;
}

/** Which row tells the stage's story on the Merit-style row. */
const LEAD: Record<StageId, (rows: Row[]) => Row | undefined> = {
  screen: (r) => r.find((x) => x.id === "screen:recheck" && x.status !== "running") ?? r.find((x) => x.id === "screen"),
  understand: (r) => r.find((x) => x.id === "understand:decide") ?? r[r.length - 1],
  retrieve: (r) => r.find((x) => x.id === "retrieve:expand") ?? r.find((x) => x.id === "retrieve:rerank") ?? r[0],
  reconcile: (r) => r[0],
  draft: (r) => r[0],
  prove: (r) => r[0],
  fixGate: (r) => r[0],
  outcome: (r) => r.find((x) => x.id === "outcome") ?? r.find((x) => x.id === "handoff"),
};

export function stageViews(state: TriageState): StageView[] {
  const byStage = new Map<StageId, Row[]>();
  for (const id of state.order) {
    const row = state.rows[id];
    byStage.set(row.stage, [...(byStage.get(row.stage) ?? []), row]);
  }
  const done = state.status === "done" || state.status === "error";
  let failedEarlier = false;
  return STAGES.map((s, index) => {
    const rows = byStage.get(s.id) ?? [];
    const lead = rows.length ? (LEAD[s.id](rows) ?? rows[0]) : null;
    let status: StageView["status"] = "pending";
    if (rows.some((r) => r.status === "error")) status = "error";
    else if (rows.some((r) => r.status === "running")) status = "running";
    else if (rows.length && rows.every((r) => r.status === "skipped")) status = "skipped";
    else if (rows.length) status = "ok";
    else if (done) status = failedEarlier && s.id !== "outcome" ? "blocked" : "skipped";
    if (status === "error" && s.id !== "outcome") failedEarlier = true;
    const credits = rows.reduce((n, r) => n + (r.meta?.credits ?? 0), 0);
    const ms = rows.reduce((n, r) => n + (r.meta?.modelMs ?? 0), 0);
    const counted = [lead, ...rows].find((r) => r && r.status !== "running" && r.count !== undefined) ?? null;
    const count = counted ? { value: counted.count as number, label: counted.countLabel ?? "" } : null;
    return { id: s.id, index, title: s.title, endpoints: s.endpoints, promise: s.promise, rows, lead, count, status, credits, ms };
  });
}

export function isCall(r: StepEvent): boolean {
  return r.endpoint !== "local";
}
