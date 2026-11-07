"use client";

import { useEffect, useRef, useState } from "react";
import type { Persona } from "@/data/personas";
import type { TriageState } from "@/lib/client/useTriage";
import { ConflictCard, HandoffCard, ScriptGateCard } from "./EvidenceCards";
import { OutcomeCard } from "./OutcomeCard";
import { ProofTrail } from "./ProofTrail";
import { StepInspector } from "./StepInspector";

/** Right column once a run starts: error banner (if any), the Proof Trail, and the step inspector. */
export function RunView({ state, persona }: { state: TriageState; persona: Persona }) {
  const [inspecting, setInspecting] = useState<string | null>(null);
  const row = inspecting ? (state.rows[inspecting] ?? null) : null;
  const top = useRef<HTMLDivElement>(null);
  // On narrow screens the trail sits below the form: bring it into view when a run starts.
  useEffect(() => {
    if (state.status === "running" && window.matchMedia("(max-width: 1023px)").matches) top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state.status, state.startedAt]);
  return (
    <div ref={top} className="flex scroll-mt-20 flex-col gap-6">
      {state.status === "error" && state.error ? (
        <div role="alert" className="rounded-xl border border-risk/30 bg-risk-soft px-5 py-4">
          <p className="text-[15px] font-semibold text-risk">The run stopped</p>
          <p className="mt-1 text-sm text-risk">{state.error.message}</p>
        </div>
      ) : null}
      {state.order.length || state.status === "running" ? (
        <ProofTrail state={state} persona={persona} onInspect={setInspecting} between={state.result ? <OutcomeCard key={state.startedAt ?? 0} result={state.result} persona={persona} /> : null} />
      ) : null}
      {state.result ? (
        <>
          <ConflictCard result={state.result} />
          <ScriptGateCard result={state.result} />
          <HandoffCard result={state.result} />
        </>
      ) : null}
      <StepInspector row={row} open={row !== null} onOpenChange={(o) => !o && setInspecting(null)} />
    </div>
  );
}
