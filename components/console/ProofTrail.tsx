"use client";

import { ChevronRight, LoaderCircle } from "lucide-react";
import { BANDS } from "@/lib/agent/policy";
import type { TriageState } from "@/lib/client/useTriage";
import { cn } from "@/lib/utils";
import type { Persona } from "@/data/personas";
import { endpointLabel, recordedLabel, seconds } from "./format";
import { OUTCOME_STYLE } from "./outcome-style";
import { BandBar, ProbabilityBar } from "./ProbabilityBar";
import { isCall, stageViews, type Row, type StageView } from "./StageRows";

/**
 * The Proof Trail, rebuilt from DESIGN.md R1 (Merit run trace): serif
 * summary, one muted meta line, one white card of numbered rows with a
 * duration pill and a 4 px bar. Each Clocked call under a stage opens the
 * inspector (R3).
 */
export function ProofTrail({ state, persona, onInspect }: { state: TriageState; persona: Persona; onInspect: (id: string) => void }) {
  const stages = stageViews(state);
  const calls = state.order.map((id) => state.rows[id]).filter((r) => isCall(r) && r.status !== "running");
  const credits = calls.reduce((n, r) => n + (r.meta?.credits ?? 0), 0);
  const first = calls[0]?.meta;
  const source = state.start?.mode === "live" ? "Live on Clocked" : first?.synthetic ? "Synthetic fixture" : recordedLabel(first?.recordedAt ?? null);
  const outcome = state.result?.outcome.outcome ?? null;
  const modelMs = calls.reduce((n, r) => n + (r.meta?.modelMs ?? 0), 0);

  return (
    <section aria-labelledby="trail-h">
      <h1 id="trail-h" className="font-heading text-[30px] leading-[36px] tracking-[-0.01em]">
        <Headline state={state} />
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {persona.name} · {persona.osLabel} · {source} · <span className="tabular">{credits}</span> credits · {calls.length} Clocked calls
        {modelMs ? ` · ${seconds(modelMs)} of model time` : ""}
      </p>
      <ol className="mt-5 divide-y divide-border rounded-xl border border-border bg-card px-5" aria-live="polite" aria-busy={state.status === "running"}>
        {stages.map((s) => (
          <StageRow key={s.id} stage={s} final={s.id === "outcome" ? outcome : null} onInspect={onInspect} />
        ))}
      </ol>
    </section>
  );
}

function Headline({ state }: { state: TriageState }) {
  const r = state.result;
  const n = state.order.filter((id) => isCall(state.rows[id]) && state.rows[id].status !== "running").length;
  if (state.status === "running" || !r) {
    return (
      <>
        Reading the ticket.
        <br />
        <span className="text-muted-foreground">{n} check{n === 1 ? "" : "s"} so far.</span>
      </>
    );
  }
  const second =
    r.outcome.outcome === "AUTO_RESOLVED"
      ? "resolved, no technician."
      : r.outcome.outcome === "CONFIRM_WITH_USER"
        ? "one question back to the employee."
        : `handed to ${r.handoff?.assignmentGroup ?? "a person"}.`;
  return (
    <>
      {n} checks ran,
      <br />
      {second}
    </>
  );
}

function StageRow({ stage, final, onInspect }: { stage: StageView; final: string | null; onInspect: (id: string) => void }) {
  const lead = stage.lead;
  const pending = stage.status === "pending";
  const running = stage.status === "running";
  const finalStyle = final ? OUTCOME_STYLE[final as keyof typeof OUTCOME_STYLE] : null;
  const count = stage.count?.value;
  const decide = stage.rows.find((r) => r.id === "understand:decide" && r.status === "ok");
  const decideProbs = (decide?.detail?.response as { policy?: { probabilities?: Record<string, number> } } | undefined)?.policy?.probabilities;
  const calls = stage.rows.filter((r) => isCall(r) || r.id === "retrieve:recall");

  return (
    <li className={cn("grid grid-cols-[44px_1fr] gap-x-4 py-4 sm:grid-cols-[56px_1fr]", pending && "opacity-55")} data-stage={stage.id} data-outcome={final ?? undefined}>
      <span
        className={cn(
          "tabular pt-0.5 text-right text-[26px] font-semibold leading-none sm:text-[28px]",
          finalStyle ? finalStyle.text : pending || count === undefined ? "text-muted-foreground/45" : stage.status === "error" ? "text-risk" : "text-foreground",
        )}
        title={stage.count ? `${stage.count.value} ${stage.count.label}` : undefined}
      >
        {count ?? stage.index + 1}
      </span>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[16px] font-semibold leading-[22px] sm:text-[17px]">
            {stage.title}
            {stage.count ? <span className="sr-only"> ({stage.count.value} {stage.count.label})</span> : null}
          </h3>
          <span className="tabular mt-0.5 shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
            {running ? (
              <span className="inline-flex items-center gap-1">
                <LoaderCircle aria-hidden className="size-3 animate-spin" /> working
              </span>
            ) : stage.credits ? (
              `${stage.credits} cr · ${seconds(stage.ms)}`
            ) : pending ? (
              stage.endpoints.join(" · ")
            ) : (
              "no call"
            )}
          </span>
        </div>
        <p className={cn("mt-0.5 text-[14px] leading-[21px] text-muted-foreground sm:text-[15px] sm:leading-[22px]", stage.status === "error" && "text-risk")}>
          {lead ? lead.effect : pending ? stage.promise : "Not needed for this ticket."}
        </p>
        {decideProbs && stage.id === "understand" ? (
          <div className="mt-3">
            <BandBar probabilities={decideProbs} autoMin={BANDS.autoMin} escalateMin={BANDS.escalateMin} />
          </div>
        ) : lead?.probability !== undefined && lead.status === "ok" ? (
          <ProbabilityBar className="mt-3" value={lead.probability} label={lead.probabilityLabel} />
        ) : (
          <div aria-hidden className="mt-3 h-1 rounded-full bg-track">
            {running ? <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/40" /> : null}
          </div>
        )}
        {calls.length ? (
          <ul className="mt-3 flex flex-col">
            {calls.map((r) => (
              <CallLine key={r.id} row={r} onInspect={onInspect} />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function CallLine({ row, onInspect }: { row: Row; onInspect: (id: string) => void }) {
  const tone =
    row.status === "error" ? "text-risk" : /dropped|quarantined|malicious|blocked|unresolved|weak/.test(row.verdict ?? "") ? "text-risk" : row.status === "running" ? "text-muted-foreground" : "text-foreground";
  return (
    <li>
      <button
        type="button"
        data-step-button
        onClick={() => onInspect(row.id)}
        className="group -mx-2 flex min-h-9 w-[calc(100%+16px)] items-center gap-2 rounded-md px-2 text-left text-[13px] leading-5 transition-colors duration-150 hover:bg-surface-sunken"
      >
        <span className="hidden w-[68px] shrink-0 font-medium text-muted-foreground sm:block">{endpointLabel(row.endpoint)}</span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-muted-foreground sm:hidden">{endpointLabel(row.endpoint)} · </span>
          {row.title.replace(/^(Guard|Fill|Rerank|Decide|Extract|Verify|Inspect|Compare), /, "")}
        </span>
        <span className={cn("shrink-0 font-medium", tone)}>{row.status === "running" ? "…" : row.verdict ?? row.status}</span>
        <span className="tabular w-[44px] shrink-0 text-right text-muted-foreground">{row.meta?.credits != null ? `${row.meta.credits} cr` : ""}</span>
        <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
      </button>
    </li>
  );
}
