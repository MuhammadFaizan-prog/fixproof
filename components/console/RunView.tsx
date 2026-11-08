"use client";

import { useCallback, useState } from "react";
import type { Persona } from "@/data/personas";
import type { Scenario } from "@/data/scenarios";
import type { HistoryEntry } from "@/lib/client/history";
import type { TriageState } from "@/lib/client/useTriage";
import { DeskView, type AuditEntry } from "./DeskView";
import { NaiveCard } from "./NaiveCard";
import { OutcomeCard } from "./OutcomeCard";
import { Panel } from "./primitives";
import { ProofTrail } from "./ProofTrail";
import { RecentRuns } from "./RunsList";
import { RunHeader } from "./RunHeader";
import { StepInspector } from "./StepInspector";

/** 429 codes from the live guard: live is limited, but every recorded run still replays at no cost. */
const LIVE_LIMIT_CODES = new Set(["daily_cap", "rate_limited", "busy", "budget_unavailable"]);

/** Main column: run header, the outcome receipt (top, in view), the Proof Trail, recent runs, and the step inspector. */
export function RunView({ state, persona, scenario, history, scenarios, onReplay, onFallback }: { state: TriageState; persona: Persona; scenario: Scenario | null; history: HistoryEntry[]; scenarios: Scenario[]; onReplay?: () => void; onFallback?: () => void }) {
  const [inspecting, setInspecting] = useState<string | null>(null);
  const row = inspecting ? (state.rows[inspecting] ?? null) : null;
  // Technician and employee actions for the run on screen (action names only, never ticket text).
  const [audit, setAudit] = useState<{ run: number | null; entries: AuditEntry[] }>({ run: null, entries: [] });
  const entries = audit.run === state.startedAt ? audit.entries : [];
  const onAudit = useCallback(
    (action: string) => setAudit((a) => ({ run: state.startedAt, entries: [...(a.run === state.startedAt ? a.entries : []), { at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), action }] })),
    [state.startedAt],
  );
  return (
    <div className="flex flex-col gap-4 xl:gap-5">
      <RunHeader state={state} persona={persona} scenario={scenario} onReplay={onReplay} onInspect={setInspecting} />
      {state.status === "error" && state.error ? (
        <div role="alert" className="rounded-[28px] border border-risk-soft bg-risk-wash px-6 py-4">
          <p className="text-[15px] font-medium text-risk">The run stopped</p>
          <p className="mt-1 text-[14px] text-risk">{state.error.message}</p>
          {onFallback && LIVE_LIMIT_CODES.has(state.error.code) ? (
            <button type="button" onClick={onFallback} className="mt-3 inline-flex h-11 items-center rounded-full bg-primary px-5 text-[15px] font-medium text-primary-foreground hover:bg-primary/90">
              Replay a recorded run instead
            </button>
          ) : null}
        </div>
      ) : null}
      {state.result ? (
        <OutcomeCard key={`outcome-${state.startedAt ?? 0}`} result={state.result} persona={persona} onAudit={onAudit} />
      ) : state.status === "running" ? (
        <Panel aria-hidden className="px-7 py-6">
          <div className="fp-skeleton h-3 w-28 rounded" />
          <div className="fp-skeleton mt-3 h-7 w-64 rounded-lg" />
          <div className="mt-5 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="fp-skeleton h-11 rounded-[18px]" />
            ))}
          </div>
        </Panel>
      ) : null}
      {state.result ? <DeskView key={`desk-${state.startedAt ?? 0}`} result={state.result} scenarioId={state.start?.scenarioId ?? null} audit={entries} onAudit={onAudit} /> : null}
      {state.result && state.start?.scenarioId ? <NaiveCard key={`naive-${state.startedAt ?? 0}`} scenarioId={state.start.scenarioId} /> : null}
      <ProofTrail key={`trail-${state.startedAt ?? 0}`} state={state} onInspect={setInspecting} />
      <RecentRuns history={history} scenarios={scenarios} />
      <StepInspector row={row} open={row !== null} onOpenChange={(o) => !o && setInspecting(null)} />
    </div>
  );
}
