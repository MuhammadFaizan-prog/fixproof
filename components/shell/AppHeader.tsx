"use client";

import { Coins, Compass, ShieldCheck } from "lucide-react";
import { recordedLabel } from "@/components/console/format";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type Pane = "tickets" | "run" | "evidence";

interface AppHeaderProps {
  mode: "replay" | "live";
  /** Recording date of the run on screen, when it is a replay. */
  recordedAt?: string | null;
  sessionCredits: number;
  /** Starts the judge tour; absent while the tour is running. */
  onTour?: () => void;
  /** Below 1024 px: which pane is showing, and how to switch. */
  pane: Pane;
  onPane: (p: Pane) => void;
  /** Outcome of the run on screen, shown on the Run tab ("running" while it plays). */
  runOutcome: "AUTO_RESOLVED" | "CONFIRM_WITH_USER" | "ESCALATED" | "running" | null;
}

const PANES: { id: Pane; label: string; className?: string }[] = [
  { id: "tickets", label: "Tickets" },
  { id: "run", label: "Run" },
  // From 768 px the evidence rail sits under the run, so its tab only exists on phones.
  { id: "evidence", label: "Evidence", className: "md:hidden" },
];
const DOT: Record<string, string> = { AUTO_RESOLVED: "bg-ok-fill", CONFIRM_WITH_USER: "bg-warn-fill", ESCALATED: "bg-risk-fill", running: "bg-primary animate-pulse" };

const SECTIONS = [
  { id: "queue", label: "Tickets" },
  { id: "trace", label: "Proof trail" },
  { id: "evidence", label: "Evidence" },
] as const;

/**
 * Top bar as floating white pills on the canvas (D): name pill left, section
 * pill centre (real in-page anchors, not fake destinations), mode + credits
 * right. No blur.
 */
export function AppHeader({ mode, recordedAt, sessionCredits, onTour, pane, onPane, runOutcome }: AppHeaderProps) {
  const [active, setActive] = useState<string>("trace");
  return (
    <header className="sticky top-0 z-30 shrink-0 bg-background xl:static">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-3 py-2 sm:px-5 sm:py-3 xl:py-4">
        <div className="flex h-12 items-center gap-2.5 rounded-full border border-hairline bg-card pl-1.5 pr-4 sm:h-14 sm:pl-2 sm:pr-5">
          <span aria-hidden className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary sm:size-10">
            <ShieldCheck className="size-[18px]" strokeWidth={2.25} />
          </span>
          <span className="text-[16px] font-medium tracking-[-0.01em] sm:text-[17px]">FixProof</span>
        </div>

        <nav aria-label="Sections" className="hidden h-14 items-center gap-1 rounded-full border border-hairline bg-card p-1.5 lg:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActive(s.id)}
              aria-current={active === s.id ? "location" : undefined}
              className={cn(
                "flex h-11 items-center rounded-full px-5 text-[15px] transition-colors duration-150",
                active === s.id ? "bg-primary font-medium text-primary-foreground" : "text-foreground hover:bg-secondary",
              )}
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex h-12 items-center gap-1.5 rounded-full border border-hairline bg-card p-1.5 sm:h-14">
          {onTour ? (
            <button type="button" onClick={onTour} className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-3.5 text-[14px] font-medium text-primary-foreground hover:bg-primary/90 sm:h-11 sm:px-4">
              <Compass aria-hidden className="size-4" />
              <span className="sm:hidden">Tour</span>
              <span className="hidden sm:inline">Take the 90-second tour</span>
            </button>
          ) : null}
          <span title={mode === "live" ? "Live calls to Clocked" : recordedAt ? `Replay of a live run ${recordedLabel(recordedAt).replace("Recorded live ", "recorded ")}` : "Replays recorded live runs"} className={cn("inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[14px] font-medium sm:h-11", mode === "live" ? "bg-ok-soft text-ok" : "bg-primary-soft text-primary")}>
            <span aria-hidden className={cn("size-2 rounded-full", mode === "live" ? "bg-ok-fill" : "bg-primary")} />
            {mode === "live" ? "Live" : "Replay"}
            {mode === "replay" && recordedAt ? <span className="hidden font-normal 2xl:inline">· {recordedLabel(recordedAt).replace("Recorded live", "recorded")}</span> : null}
          </span>
          <span className="hidden h-11 items-center gap-2 px-3 text-[14px] text-muted-foreground sm:inline-flex">
            <Coins aria-hidden className="size-4" />
            <span className="tabular font-medium text-foreground">{sessionCredits}</span> credits this session
          </span>
        </div>
      </div>
      <nav aria-label="Panes" className="mx-auto max-w-[1600px] px-3 pb-2 sm:px-5 sm:pb-3 lg:hidden">
        <div className="flex gap-1 rounded-full border border-hairline bg-card p-1">
          {PANES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-controls={`pane-${p.id}`}
              aria-current={pane === p.id || (p.id === "run" && pane === "evidence") ? "page" : undefined}
              onClick={() => onPane(p.id)}
              data-pane-tab={p.id}
              className={cn(
                "flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-3 text-[15px] font-medium transition-colors duration-150",
                pane === p.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary",
                p.id === "run" && pane === "evidence" && "md:bg-primary md:text-primary-foreground",
                p.className,
              )}
            >
              {p.label}
              {p.id === "run" && runOutcome ? <span aria-hidden className={cn("size-2 rounded-full ring-2 ring-card", DOT[runOutcome])} /> : null}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}
