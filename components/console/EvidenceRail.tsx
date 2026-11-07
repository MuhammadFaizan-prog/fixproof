"use client";

import { FileSearch } from "lucide-react";
import { useState } from "react";
import type { Persona } from "@/data/personas";
import type { TriageState } from "@/lib/client/useTriage";
import { cn } from "@/lib/utils";
import { ConflictCard, HandoffCard, ScriptGateCard } from "./EvidenceCards";
import { seconds } from "./format";
import { Eyebrow, Panel, StatTile } from "./primitives";
import { isCall } from "./StageRows";
import { TicketEvidence } from "./TicketEvidence";

type Tab = "ticket" | "sources" | "script" | "handoff";

/**
 * Right rail (D's rail panel): run-health tiles, the evidence cards as tabs
 * instead of a long scroll, and the employee's approved scope.
 */
export function EvidenceRail({ state, persona }: { state: TriageState; persona: Persona }) {
  const r = state.result;
  const calls = state.order.map((id) => state.rows[id]).filter((x) => isCall(x) && x.status !== "running");
  const credits = calls.reduce((n, x) => n + (x.meta?.credits ?? 0), 0);
  const modelMs = calls.reduce((n, x) => n + (x.meta?.modelMs ?? 0), 0);
  const idle = state.status === "idle";

  const tabs: { id: Tab; label: string }[] = r
    ? [
        ...(r.screen ? [{ id: "ticket" as Tab, label: "Ticket" }] : []),
        ...(r.reconcile?.conflicts?.length ? [{ id: "sources" as Tab, label: "Sources" }] : []),
        ...(r.fixGate?.ran && r.fixGate.script ? [{ id: "script" as Tab, label: "Script" }] : []),
        ...(r.handoff ? [{ id: "handoff" as Tab, label: "Handoff" }] : []),
      ]
    : [];
  const preferred: Tab | undefined = r?.handoff ? "handoff" : r?.reconcile?.conflicts?.length ? "sources" : r?.fixGate?.ran && r.fixGate.script ? "script" : tabs[0]?.id;

  return (
    <Panel id="evidence" aria-label="Evidence" className="scroll-mt-24 px-5 pb-5 pt-5 sm:px-6">
      <Eyebrow>Run health · this ticket</Eyebrow>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <StatTile label="Credits" value={idle ? "–" : credits} />
        <StatTile label="Model time" value={idle || !modelMs ? "–" : seconds(modelMs)} />
        <StatTile label="Clocked calls" value={idle ? "–" : calls.length} />
        <StatTile label="Checks passed" value={r ? `${r.outcome.checks.filter((c) => c.pass === true).length}/${r.outcome.checks.length}` : "–"} />
      </div>

      <div className="mt-6 flex items-center gap-2.5">
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-violet-soft text-violet">
          <FileSearch className="size-4" />
        </span>
        <h2 className="text-[17px] font-medium leading-6">Evidence</h2>
      </div>
      {r && tabs.length ? (
        <EvidenceTabs key={state.startedAt ?? 0} tabs={tabs} initial={preferred ?? tabs[0].id} state={state} />
      ) : (
        <p className="mt-2 text-[14px] leading-[21px] text-muted-foreground">
          {state.status === "running"
            ? "Collecting evidence as each step lands…"
            : "Replay a ticket and the evidence lands here: the ticket as every step read it, conflicting sources, the script gate and the handoff record."}
        </p>
      )}

      <Eyebrow className="mt-6">Employee scope</Eyebrow>
      <div className="mt-2.5 rounded-2xl border border-hairline bg-card px-4 py-3">
        <p className="flex items-center gap-2 text-[15px] font-medium leading-[22px]">
          <span aria-hidden className="size-2 rounded-full bg-ok-fill" />
          {persona.name} · {persona.osLabel}
        </p>
        <p className="mt-0.5 text-[13px] leading-[19px] text-muted-foreground">
          {persona.role}, {persona.office} · {persona.assetTag}
        </p>
        <p className="mt-2 line-clamp-4 text-[13px] leading-[19px] text-muted-foreground" title={persona.approvedScope}>
          {persona.approvedScope}
        </p>
      </div>
    </Panel>
  );
}

function EvidenceTabs({ tabs, initial, state }: { tabs: { id: Tab; label: string }[]; initial: Tab; state: TriageState }) {
  const [tab, setTab] = useState<Tab>(initial);
  const r = state.result!;
  return (
    <div className="mt-3">
      <div role="tablist" aria-label="Evidence" className="flex gap-1 rounded-full border border-hairline bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`ev-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`ev-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn("h-8 flex-1 rounded-full px-2 text-[13px] font-medium transition-colors duration-150", tab === t.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`ev-panel-${tab}`} aria-labelledby={`ev-tab-${tab}`} className="mt-4 flex flex-col gap-5">
        {tab === "ticket" ? <TicketEvidence result={r} extractMarks={state.rows["understand:extract"]?.evidence ?? []} /> : null}
        {tab === "sources" ? <ConflictCard result={r} /> : null}
        {tab === "script" ? <ScriptGateCard result={r} /> : null}
        {tab === "handoff" ? <HandoffCard result={r} /> : null}
      </div>
    </div>
  );
}
