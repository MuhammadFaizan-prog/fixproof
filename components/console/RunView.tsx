"use client";

import type { Persona } from "@/data/personas";
import type { TriageState } from "@/lib/client/useTriage";

/** Interim run view: one line per Proof Trail row as it streams in. Replaced by the full trail. */
export function RunView({ state }: { state: TriageState; persona: Persona }) {
  if (state.status === "error" && state.error) {
    return (
      <div role="alert" className="rounded-xl border border-risk/30 bg-risk-soft p-5 text-sm text-risk">
        {state.error.message}
      </div>
    );
  }
  return (
    <ol className="divide-y divide-border rounded-xl border border-border bg-card px-5" aria-live="polite">
      {state.order.map((id) => {
        const row = state.rows[id];
        return (
          <li key={id} className="py-3">
            <p className="text-[15px] font-semibold">{row.title}</p>
            <p className="text-sm text-muted-foreground">{row.effect}</p>
          </li>
        );
      })}
    </ol>
  );
}
