"use client";

import { useState } from "react";
import type { PublicResult } from "@/lib/agent/triage";
import type { EvidenceMark } from "@/lib/agent/types";
import { segment } from "@/lib/text/offsets";
import { cn } from "@/lib/utils";

/**
 * The ticket with its evidence marked by Clocked offsets (Gatehouse's lesson:
 * marks on the original plus the filtered copy every step read). PII violet
 * underline, injected text red strike-through, extracted values green.
 */
export function TicketEvidence({ result, extractMarks }: { result: PublicResult; extractMarks: EvidenceMark[] }) {
  const [view, setView] = useState<"original" | "masked">(result.screen?.quarantined ? "original" : "masked");
  const screen = result.screen;
  if (!screen) return null;
  const original = segment(
    screen.originalText,
    screen.marks.filter((m) => m.target === "original").map((m) => ({ start: m.start, end: m.end, kind: m.kind })),
  );
  const masked = segment(
    screen.safeText,
    [
      ...extractMarks.filter((m) => m.target === "masked").map((m) => ({ start: m.start, end: m.end, kind: "extract" as EvidenceMark["kind"] })),
    ],
  );
  const counts = Object.entries(screen.piiCounts);

  return (
    <section aria-labelledby="evidence-h" className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="evidence-h" className="text-[15px] font-semibold leading-[22px]">
          Ticket evidence
        </h2>
        <div role="tablist" aria-label="Ticket view" className="inline-flex rounded-lg bg-secondary p-0.5 text-[13px]">
          {(
            [
              ["original", "As typed"],
              ["masked", "What every step read"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={view === k}
              onClick={() => setView(k)}
              className={cn("min-h-8 rounded-md px-2.5 font-medium transition-colors", view === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-4 whitespace-pre-wrap rounded-[10px] bg-surface-sunken px-3.5 py-3 text-[15px] leading-[24px]">
        {view === "original"
          ? original.map((s, i) => (
              <span
                key={i}
                className={cn(
                  s.mark === "pii" && "underline decoration-mark-pii decoration-2 underline-offset-4",
                  s.mark === "injection" && "rounded-sm bg-risk-soft text-risk line-through decoration-risk decoration-2",
                )}
              >
                {s.text}
              </span>
            ))
          : screen.safeText
            ? masked.map((s, i) => (
                <span key={i} className={cn(s.mark === "extract" && "rounded-sm bg-ok-soft px-0.5 text-ok", /<[A-Z_]+>/.test(s.text) && "font-mono text-[13px] text-mark-pii")}>
                  {s.text}
                </span>
              ))
            : <span className="text-muted-foreground">Nothing safe was left to read.</span>}
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 bg-mark-pii" /> personal data {counts.length ? `(${counts.map(([k, v]) => `${v} ${k}`).join(", ")})` : "(none)"}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-3 rounded-sm bg-risk-soft ring-1 ring-risk/40" /> injected, cut by offset {screen.injection.evidence.length ? `(${screen.injection.evidence.length})` : "(none)"}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-3 rounded-sm bg-ok-soft ring-1 ring-ok/40" /> extracted values
        </li>
      </ul>
    </section>
  );
}
