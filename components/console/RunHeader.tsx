"use client";

import { ArrowUpRight, ChevronRight, CircleCheck, RotateCcw, CircleHelp, Hourglass, Laptop, TriangleAlert } from "lucide-react";
import type { Persona } from "@/data/personas";
import type { Scenario } from "@/data/scenarios";
import type { TriageState } from "@/lib/client/useTriage";
import { cn } from "@/lib/utils";
import { recordedLabel, seconds } from "./format";
import { OUTCOME_STYLE } from "./outcome-style";
import { Eyebrow, Panel, StatusPill } from "./primitives";
import { isCall } from "./StageRows";

/**
 * Top of the run view (D's header panel): breadcrumb, a 36 px title with the
 * outcome chip, one muted meta line, then the path row: the employee node,
 * a connector carrying the run's metrics, and the outcome node.
 */
export function RunHeader({ state, persona, scenario, onReplay, onInspect }: { state: TriageState; persona: Persona; scenario: Scenario | null; onReplay?: () => void; onInspect?: (id: string) => void }) {
  const calls = state.order.map((id) => state.rows[id]).filter((r) => isCall(r) && r.status !== "running");
  const credits = calls.reduce((n, r) => n + (r.meta?.credits ?? 0), 0);
  const modelMs = calls.reduce((n, r) => n + (r.meta?.modelMs ?? 0), 0);
  const first = calls[0]?.meta;
  const firstCall = calls.find((c) => c.endpoint === "grounding")?.id ?? calls[0]?.id ?? null;
  const r = state.result;
  const outcome = r?.outcome.outcome ?? null;
  const style = outcome ? OUTCOME_STYLE[outcome] : null;
  const passed = r ? r.outcome.checks.filter((c) => c.pass === true).length : null;
  const idle = state.status === "idle";
  const source = idle ? "Not run yet" : state.start?.mode === "live" ? "Live on Clocked" : first?.synthetic ? "Synthetic fixture" : first ? recordedLabel(first.recordedAt ?? null) : "Replay";
  const title = scenario?.title ?? "Your ticket";
  const ticketId = scenario?.id ?? "new-ticket";

  const End = outcome === "AUTO_RESOLVED" ? CircleCheck : outcome === "CONFIRM_WITH_USER" ? CircleHelp : outcome === "ESCALATED" ? TriangleAlert : Hourglass;
  // Short words for the path diagram; the outcome card and queue carry the full label.
  const endTitle = outcome ? { AUTO_RESOLVED: "Resolved", CONFIRM_WITH_USER: "Confirming", ESCALATED: "Handed off" }[outcome] : state.status === "running" ? "Checking…" : state.status === "error" ? "Stopped" : "Waiting";
  const endSub =
    outcome === "AUTO_RESOLVED"
      ? "no technician"
      : outcome === "CONFIRM_WITH_USER"
        ? "asks first"
        : outcome === "ESCALATED"
          ? (r?.handoff?.assignmentGroup ?? "a person")
          : idle
            ? "replay a ticket"
            : "in progress";

  return (
    <Panel className="px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[14px] text-muted-foreground sm:flex">
          <span>Service desk</span>
          <ChevronRight aria-hidden className="size-3.5" />
          <span className="truncate font-mono text-[13px]">{ticketId}</span>
          <ChevronRight aria-hidden className="size-3.5" />
          <span className="text-foreground">Proof trail</span>
        </nav>
        {state.status === "done" || state.status === "error" ? (
          <div className="flex items-center gap-2">
            {onReplay && scenario ? (
              <button type="button" onClick={onReplay} className="inline-flex h-10 items-center gap-2 rounded-full border border-hairline bg-card px-4 text-[14px] font-medium transition-colors duration-150 hover:bg-secondary">
                <RotateCcw aria-hidden className="size-4" /> Replay again
              </button>
            ) : null}
            {onInspect && firstCall ? (
              <button type="button" onClick={() => onInspect(firstCall)} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[14px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90">
                <ArrowUpRight aria-hidden className="size-4" /> Inspect a call
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[26px] font-medium leading-[34px] tracking-[-0.02em] sm:text-[36px] sm:leading-[44px]">{title}</h1>
        {style ? (
          <StatusPill dot={style.dot} className={cn(style.pill, "fp-row-in")}>
            {style.label}
          </StatusPill>
        ) : state.status === "running" ? (
          <StatusPill dot="bg-primary animate-pulse" className="bg-primary-soft text-primary">
            Running
          </StatusPill>
        ) : null}
      </div>
      <p className="mt-1 text-[15px] leading-[22px] text-muted-foreground">
        {persona.name}<span className="hidden sm:inline"> · {persona.role}</span> · {persona.osLabel} · {source}
      </p>

      {/* Phones: one compact metrics row so the outcome receipt stays near the top. */}
      <dl className="mt-3 grid grid-cols-4 gap-1 rounded-[18px] border border-hairline bg-card px-2 py-2 md:hidden" aria-label="Run metrics">
        <Metric value={idle ? "–" : String(credits)} label="credits" />
        <Metric value={idle || !modelMs ? "–" : seconds(modelMs)} label="model" />
        <Metric value={idle ? "–" : String(calls.length)} label="calls" />
        <Metric value={passed == null ? "–" : `${passed} of ${r!.outcome.checks.length}`} label="checks" />
      </dl>
      <Eyebrow className="mt-5 hidden md:block">Ticket path</Eyebrow>
      <div className="mt-2.5 hidden items-center md:flex">
        <Node icon={Laptop} tone="bg-ok-soft text-ok" title={persona.name.split(" ")[0]} sub={persona.osLabel} />
        <div className="relative flex shrink-0 items-center justify-center px-3 lg:px-5">
          <span aria-hidden className="absolute inset-x-2 top-1/2 h-[2px] -translate-y-1/2 bg-violet-line" />
          <span aria-hidden className="absolute left-1 top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-violet-line" />
          <span aria-hidden className="absolute right-0 top-1/2 size-0 -translate-y-1/2 border-y-[6px] border-l-[9px] border-y-transparent border-l-violet-line" />
          <dl className="relative z-[1] flex items-center gap-3.5 rounded-full border border-hairline bg-card px-4 py-1.5 shadow-[0_2px_10px_rgba(15,23,25,0.05)]">
            <Metric value={idle ? "–" : String(credits)} label="credits" />
            <Metric value={idle || !modelMs ? "–" : seconds(modelMs)} label="model" />
            <Metric value={idle ? "–" : String(calls.length)} label="calls" />
            <Metric value={passed == null ? "–" : `${passed} of ${r!.outcome.checks.length}`} label="checks passed" />
          </dl>
        </div>
        <Node icon={End} tone={style ? style.pill : "border border-dashed border-neutral bg-card text-muted-foreground"} title={endTitle} sub={endSub} final={outcome} />
      </div>
    </Panel>
  );
}

function Node({ icon: Icon, tone, title, sub, final }: { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; tone: string; title: string; sub: string; final?: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[20px] border border-hairline bg-card px-3.5 py-3 shadow-[0_2px_10px_rgba(15,23,25,0.05)]" data-path-outcome={final ?? undefined}>
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-full max-xl:hidden", tone)}>
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="line-clamp-2 block text-[16px] font-medium leading-5">{title}</span>
        <span className="block truncate text-[13px] leading-[18px] text-muted-foreground">{sub}</span>
      </span>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse items-center text-center">
      <dt className="text-[12px] leading-4 text-muted-foreground">{label}</dt>
      <dd className="tabular whitespace-nowrap text-[15px] font-medium leading-5">{value}</dd>
    </div>
  );
}
