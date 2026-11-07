"use client";

import { BadgeCheck, ChevronDown, ChevronRight, FileCode2, Flag, GitCompareArrows, LoaderCircle, PenLine, ScanText, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { StageId } from "@/data/pipeline";
import { BANDS } from "@/lib/agent/policy";
import type { TriageState } from "@/lib/client/useTriage";
import { cn } from "@/lib/utils";
import { endpointLabel, seconds } from "./format";
import { OUTCOME_STYLE } from "./outcome-style";
import { Chip, Eyebrow, Panel } from "./primitives";
import { BandBar, ProbabilityBar } from "./ProbabilityBar";
import { isCall, stageViews, type Row, type StageView } from "./StageRows";

const ICON: Record<StageId, LucideIcon> = {
  screen: ShieldCheck,
  understand: ScanText,
  retrieve: Search,
  reconcile: GitCompareArrows,
  draft: PenLine,
  prove: BadgeCheck,
  fixGate: FileCode2,
  outcome: Flag,
};

/**
 * The Proof Trail as a tight timeline: one row per stage (icon, title, a
 * one-line result, its confidence bar, a credits · ms chip). Rows are
 * collapsed by default; opening one lists its Clocked calls, each of which
 * opens the step inspector.
 */
export function ProofTrail({ state, onInspect }: { state: TriageState; onInspect: (id: string) => void }) {
  const stages = stageViews(state);
  const outcome = state.result?.outcome.outcome ?? null;
  const arrived = stages.filter((x) => x.status !== "pending").length;
  const [open, setOpen] = useState<Set<StageId>>(new Set());
  const toggle = (id: StageId) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Panel id="trace" aria-labelledby="trail-h" className="scroll-mt-24 px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="trail-h" className="text-[24px] font-medium leading-8 tracking-[-0.015em] sm:text-[28px] sm:leading-9">
          Proof trail
        </h2>
        <div className="flex items-center gap-2">
          {state.status !== "idle" ? (
            <button
              type="button"
              onClick={() => setOpen(open.size ? new Set() : new Set(stages.filter((s) => s.rows.length).map((s) => s.id)))}
              className="h-[30px] rounded-full border border-hairline bg-card px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-secondary"
            >
              {open.size ? "Collapse all" : "Expand all"}
            </button>
          ) : null}
          <Chip tone={outcome ? "ok" : "neutral"} className="h-[30px] px-3 text-[14px]">
            {state.status === "idle" ? 0 : arrived} of 8 stages
          </Chip>
        </div>
      </div>
      <div className="mt-4 hidden grid-cols-[44px_minmax(0,1fr)_176px_112px] gap-x-3 px-4 sm:grid">
        <Eyebrow as="span">#</Eyebrow>
        <Eyebrow as="span">Step and result</Eyebrow>
        <Eyebrow as="span">Confidence</Eyebrow>
        <Eyebrow as="span" className="text-right">Credits · time</Eyebrow>
      </div>
      <ol aria-live="polite" aria-busy={state.status === "running"} className="mt-2 flex flex-col gap-2">
        {stages.map((s) => (
          <StageRow key={s.id} stage={s} final={s.id === "outcome" ? outcome : null} open={open.has(s.id)} onToggle={() => toggle(s.id)} onInspect={onInspect} idle={state.status === "idle"} />
        ))}
      </ol>
    </Panel>
  );
}

function StageRow({ stage, final, open, onToggle, onInspect, idle }: { stage: StageView; final: string | null; open: boolean; onToggle: () => void; onInspect: (id: string) => void; idle: boolean }) {
  const Icon = ICON[stage.id];
  const lead = stage.lead;
  const pending = stage.status === "pending";
  const running = stage.status === "running";
  const finalStyle = final ? OUTCOME_STYLE[final as keyof typeof OUTCOME_STYLE] : null;
  const decide = stage.rows.find((r) => r.id === "understand:decide" && r.status === "ok");
  const decideProbs = (decide?.detail?.response as { policy?: { probabilities?: Record<string, number> } } | undefined)?.policy?.probabilities;
  const calls = stage.rows.filter((r) => isCall(r) || r.id === "retrieve:recall");
  const regionId = `stage-${stage.id}-calls`;
  const expandable = calls.length > 0;
  const highlight = finalStyle && final === "AUTO_RESOLVED" ? "border-ok-soft bg-ok-wash" : finalStyle && final === "ESCALATED" ? "border-risk-soft bg-risk-wash" : finalStyle ? "border-warn-soft bg-warn-wash" : stage.status === "error" ? "border-risk-soft bg-risk-wash" : "border-hairline bg-card";

  const iconTone = finalStyle
    ? finalStyle.pill
    : stage.status === "error"
      ? "bg-risk-soft text-risk"
      : running
        ? "bg-primary-soft text-primary"
        : pending
          ? "border border-dashed border-neutral text-muted-foreground"
          : stage.status === "skipped"
            ? "bg-secondary text-muted-foreground"
            : "bg-primary-soft text-primary";

  const effect = lead ? lead.effect : pending ? stage.promise : "Not needed for this ticket.";
  const bar =
    decideProbs && stage.id === "understand" ? (
      <BandBar probabilities={decideProbs} autoMin={BANDS.autoMin} escalateMin={BANDS.escalateMin} />
    ) : lead?.probability !== undefined && lead.status === "ok" ? (
      <ProbabilityBar compact value={lead.probability} label={lead.probabilityLabel} handled={lead.verdict === "resolved"} />
    ) : (
      <div aria-hidden className={cn("h-1.5 rounded-full", running ? "fp-skeleton" : "bg-track")} />
    );

  return (
    <li
      className={cn("rounded-[18px] border transition-colors duration-200", highlight, !pending && !idle && "fp-row-in")}
      data-stage={stage.id}
      data-status={stage.status}
      data-outcome={final ?? undefined}
    >
      <button
        type="button"
        onClick={expandable ? onToggle : undefined}
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? regionId : undefined}
        disabled={!expandable}
        className={cn("grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[18px] px-3 py-2.5 text-left sm:grid-cols-[44px_minmax(0,1fr)_176px_112px] sm:px-4", expandable && "cursor-pointer hover:bg-black/[0.015]")}
      >
        <span className={cn("grid size-9 place-items-center rounded-full", iconTone)}>
          {running ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Icon aria-hidden className="size-4" strokeWidth={2.1} />}
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="tabular shrink-0 text-[12px] font-medium text-muted-foreground">{String(stage.index + 1).padStart(2, "0")}</span>
            <span className={cn("truncate text-[15px] font-medium leading-[22px]", pending && "text-muted-foreground")}>{stage.title}</span>
            {stage.count && !pending && !running ? (
              <span className={cn("tabular hidden shrink-0 rounded-full sm:inline px-2 text-[12px] font-medium leading-5", finalStyle ? finalStyle.pill : stage.status === "error" ? "bg-risk-soft text-risk" : "bg-secondary text-foreground")}>
                {stage.count.value} {stage.count.label}
              </span>
            ) : null}
          </span>
          <span className={cn("block text-[13px] leading-[19px] text-muted-foreground", !open && "line-clamp-1", stage.status === "error" && "text-risk")}>
            {running && !lead?.effect ? <span aria-hidden className="fp-skeleton mt-1 block h-3 w-2/3 rounded" /> : effect}
          </span>
        </span>
        <span className="hidden min-w-0 sm:block">{decideProbs && stage.id === "understand" ? <MiniBand probabilities={decideProbs} /> : bar}</span>
        <span className="flex items-center justify-end gap-1.5">
          {running ? (
            <span className="hidden text-[13px] text-muted-foreground sm:inline">working…</span>
          ) : stage.credits ? (
            <span className="tabular hidden whitespace-nowrap text-[13px] text-muted-foreground sm:inline">
              <span className="font-medium text-foreground">{stage.credits} cr</span> · {seconds(stage.ms)}
            </span>
          ) : !pending ? (
            <span className="hidden text-[13px] text-muted-foreground sm:inline">no call</span>
          ) : (
            <span className="hidden truncate text-[12px] text-muted-foreground sm:inline">{stage.endpoints.join(" · ")}</span>
          )}
          {expandable ? <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} /> : <span aria-hidden className="size-4 shrink-0" />}
        </span>
        <span className="col-span-3 mt-2 flex flex-col gap-1.5 sm:hidden">
          {bar}
          <span className="tabular flex justify-between text-[12px] text-muted-foreground">
            <span>{stage.count && !pending && !running ? `${stage.count.value} ${stage.count.label}` : ""}</span>
            <span>{running ? "working…" : stage.credits ? `${stage.credits} cr · ${seconds(stage.ms)}` : pending ? stage.endpoints.join(" · ") : "no call"}</span>
          </span>
        </span>
      </button>

      {calls.length ? (
        <div id={regionId} hidden={!open} className="border-t border-hairline px-3 pb-3 pt-2.5 sm:px-4">
          {decideProbs && stage.id === "understand" ? <div className="mb-3 hidden sm:block">{bar}</div> : null}
          <ul className="flex flex-col gap-1.5">
            {calls.map((r) => (
              <CallLine key={r.id} row={r} onInspect={onInspect} />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

/** Compact Decide distribution for the row's confidence column; the full band chart shows when the row opens. */
function MiniBand({ probabilities }: { probabilities: Record<string, number> }) {
  const a = probabilities.auto_resolve ?? 0;
  const s = probabilities.suggest ?? 0;
  const e = probabilities.escalate ?? 0;
  const top = [
    ["auto", a],
    ["suggest", s],
    ["escalate", e],
  ].sort((x, y) => (y[1] as number) - (x[1] as number))[0];
  return (
    <span className="flex items-center gap-2">
      <span role="img" aria-label={`Decide: auto-resolve ${Math.round(a * 100)}%, suggest ${Math.round(s * 100)}%, escalate ${Math.round(e * 100)}%`} className="fp-bar flex h-1.5 flex-1 overflow-hidden rounded-full bg-track">
        <span className="bg-primary" style={{ width: `${a * 100}%` }} />
        <span className="bg-warn-fill" style={{ width: `${s * 100}%` }} />
        <span className="bg-risk-fill" style={{ width: `${e * 100}%` }} />
      </span>
      <span className="tabular shrink-0 text-xs">
        <span className="text-muted-foreground">{top[0]} </span>
        <span className="font-semibold">{Math.round((top[1] as number) * 100)}%</span>
      </span>
    </span>
  );
}

function CallLine({ row, onInspect }: { row: Row; onInspect: (id: string) => void }) {
  const bad = row.status === "error" || /dropped|quarantined|malicious|blocked|unresolved|weak/.test(row.verdict ?? "");
  return (
    <li>
      <button
        type="button"
        data-step-button
        onClick={() => onInspect(row.id)}
        className="group flex min-h-9 w-full items-center gap-3 rounded-xl border border-hairline bg-card px-3 text-left text-[13px] leading-5 transition-colors duration-150 hover:border-primary/30 hover:bg-primary-soft/40"
      >
        <span className="w-[64px] shrink-0 font-medium text-foreground">{endpointLabel(row.endpoint)}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.title.replace(/^(Guard|Fill|Rerank|Decide|Extract|Verify|Inspect|Compare), /, "")}</span>
        <span className={cn("shrink-0 rounded-full px-2 py-px text-xs font-medium", bad ? "bg-risk-soft text-risk" : row.status === "running" ? "text-muted-foreground" : "bg-secondary text-foreground")}>
          {row.status === "running" ? "…" : (row.verdict ?? row.status)}
        </span>
        <span className="tabular hidden w-[92px] shrink-0 text-right text-xs text-muted-foreground sm:block">
          {row.meta?.credits != null ? `${row.meta.credits} cr · ${row.meta.modelMs != null ? seconds(row.meta.modelMs) : "–"}` : "local"}
        </span>
        <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" />
      </button>
    </li>
  );
}
