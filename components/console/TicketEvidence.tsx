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
    <section aria-labelledby="evidence-h" className="fp-row-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="evidence-h" className="text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">
          Ticket evidence
        </h3>
        <div role="tablist" aria-label="Ticket view" className="inline-flex rounded-full bg-secondary p-0.5 text-[12px]">
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
              className={cn("min-h-7 rounded-full px-2.5 font-medium transition-colors duration-150", view === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-hairline bg-surface-sunken px-3.5 py-3 text-[14px] leading-[23px]">
        {view === "original"
          ? original.map((s, i) => (
              <span
                key={i}
                className={cn(
                  s.mark === "pii" && "underline decoration-mark-pii decoration-[3px] underline-offset-4",
                  s.mark === "injection" && "rounded-sm bg-risk-soft text-risk line-through decoration-risk decoration-2",
                )}
              >
                {s.text}
              </span>
            ))
          : screen.safeText
            ? masked.map((s, i) => (
                <span key={i} className={cn(s.mark === "extract" && "rounded-sm bg-ok-soft px-0.5 text-ok", /<[A-Z_]+>/.test(s.text) && "font-mono text-[12px] font-medium text-violet")}>
                  {s.text}
                </span>
              ))
            : <span className="text-muted-foreground">Nothing safe was left to read.</span>}
      </p>
      <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-[3px] w-3 rounded-full bg-mark-pii" /> personal data {counts.length ? `(${counts.map(([k, v]) => `${v} ${k}`).join(", ")})` : "(none)"}
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
