"use client";

import { useState } from "react";
import type { Persona } from "@/data/personas";
import type { Scenario } from "@/data/scenarios";
import type { HistoryEntry } from "@/lib/client/history";
import type { TriageState } from "@/lib/client/useTriage";
import { OutcomeCard } from "./OutcomeCard";
import { Panel } from "./primitives";
import { ProofTrail } from "./ProofTrail";
import { RecentRuns } from "./RunsList";
import { RunHeader } from "./RunHeader";
import { StepInspector } from "./StepInspector";

/** Main column: run header, the outcome receipt (top, in view), the Proof Trail, recent runs, and the step inspector. */
export function RunView({ state, persona, scenario, history, scenarios }: { state: TriageState; persona: Persona; scenario: Scenario | null; history: HistoryEntry[]; scenarios: Scenario[] }) {
  const [inspecting, setInspecting] = useState<string | null>(null);
  const row = inspecting ? (state.rows[inspecting] ?? null) : null;
  return (
    <div className="flex flex-col gap-4 xl:gap-5">
      <RunHeader state={state} persona={persona} scenario={scenario} />
      {state.status === "error" && state.error ? (
        <div role="alert" className="rounded-[28px] border border-risk-soft bg-risk-wash px-6 py-4">
          <p className="text-[15px] font-medium text-risk">The run stopped</p>
          <p className="mt-1 text-[14px] text-risk">{state.error.message}</p>
        </div>
      ) : null}
      {state.result ? (
        <OutcomeCard key={`outcome-${state.startedAt ?? 0}`} result={state.result} persona={persona} />
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
      <ProofTrail key={`trail-${state.startedAt ?? 0}`} state={state} onInspect={setInspecting} />
      <RecentRuns history={history} scenarios={scenarios} />
      <StepInspector row={row} open={row !== null} onOpenChange={(o) => !o && setInspecting(null)} />
    </div>
  );
}
