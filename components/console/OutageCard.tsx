"use client";

import { CircleAlert, CircleCheck, CircleDashed, CircleSlash, RotateCcw } from "lucide-react";
import type { TriageState } from "@/lib/client/useTriage";
import { cn } from "@/lib/utils";
import { Eyebrow, Panel } from "./primitives";
import { stageViews } from "./StageRows";
import { plainText } from "./plain";

const STATUS: Record<string, { label: string; icon: typeof CircleCheck; tone: string }> = {
  ok: { label: "ran", icon: CircleCheck, tone: "text-ok" },
  retried: { label: "ran after retries", icon: RotateCcw, tone: "text-warn" },
  error: { label: "failed: no answer", icon: CircleAlert, tone: "text-risk" },
  blocked: { label: "blocked, not run", icon: CircleSlash, tone: "text-risk" },
  skipped: { label: "not needed", icon: CircleDashed, tone: "text-muted-foreground" },
};

/**
 * Outage drill summary, shown above the receipt when a preset was replayed
 * with a simulated Clocked failure: what was simulated, each stage's fate
 * (ran / retried / failed / blocked), the retry lines, and what the employee
 * actually gets. Everything is read from the run's own events.
 */
export function OutageCard({ state }: { state: TriageState }) {
  const r = state.result;
  if (!r?.simulated) return null;
  const stages = stageViews(state);
  const retried = state.order.map((id) => state.rows[id]).filter((row) => row.retries?.length);
  const failedClosed = Boolean(r.failure);
  return (
    <Panel aria-labelledby="drill-h" className="border-warn-soft px-5 py-5 sm:px-7" data-drill={r.simulated.id}>
      <Eyebrow>Outage drill · simulated failure on a recorded run · no credits</Eyebrow>
      <h2 id="drill-h" className="mt-1 text-[20px] font-medium leading-7 tracking-[-0.01em]">
        {r.simulated.label} at “{r.simulated.stageTitle}”
      </h2>
      <p className="mt-1 max-w-[75ch] text-[14px] leading-5 text-muted-foreground">{r.simulated.expect}</p>
      <ol className="mt-4 grid gap-1.5 sm:grid-cols-2" aria-label="What each stage did">
        {stages.map((s) => {
          const key = s.status === "ok" && s.rows.some((row) => row.retries?.length) ? "retried" : s.status === "running" || s.status === "pending" ? "skipped" : s.status;
          const st = STATUS[key] ?? STATUS.skipped;
          const Icon = st.icon;
          return (
            <li key={s.id} data-drill-stage={s.id} data-drill-status={key} className="flex items-center gap-2.5 rounded-[14px] border border-hairline bg-card px-3 py-2 text-[14px]">
              <Icon aria-hidden className={cn("size-4 shrink-0", st.tone)} />
              <span className="min-w-0 flex-1 truncate">
                <span className="tabular mr-1.5 text-[12px] text-muted-foreground">{String(s.index + 1).padStart(2, "0")}</span>
                {s.title}
              </span>
              <span className={cn("shrink-0 text-[12px] font-medium", st.tone)}>{st.label}</span>
            </li>
          );
        })}
      </ol>
      {retried.length ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {retried.map((row) => (
            <li key={row.id} data-retry-line className="rounded-[14px] bg-warn-wash px-3 py-2 text-[13px] leading-5">
              <span className="font-medium">{row.title}:</span> {plainText(row.effect.slice(row.effect.search(/(Retried|Gave up)/)))}
            </li>
          ))}
        </ul>
      ) : null}
      <p className={cn("mt-3 rounded-[14px] px-3 py-2.5 text-[14px] leading-5", failedClosed ? "bg-risk-wash text-risk" : "bg-ok-wash text-ok")}>
        {failedClosed
          ? "What the employee gets: no unverified reply and no fix script. “Clocked unavailable, queued for a person”: a technician gets a handoff FixProof built itself (what was tried, the failed step, the masked ticket), and the run can be repeated once Clocked answers."
          : "What the employee gets: the same verified reply as the recorded run. 429 is Clocked's concurrency limit, so FixProof queued and retried the same attempt (same Idempotency-Key, identical payload, as Clocked's retry guidance says) instead of starting a duplicate."}
      </p>
    </Panel>
  );
}
