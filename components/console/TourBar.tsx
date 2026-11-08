"use client";

import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { TourStop } from "@/data/tour";
import { naiveProblemsFor } from "./NaiveCard";

/**
 * The judge tour's caption bar, above the run view: which stop, what Clocked
 * changed in this run, Back / Next / Exit. Esc exits. Focus moves to the bar
 * on each stop so screen readers hear the caption.
 */
export function TourBar({ stops, index, onBack, onNext, onExit }: { stops: TourStop[]; index: number; onBack: () => void; onNext: () => void; onExit: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const stop = stops[index];
  const last = index === stops.length - 1;
  // Naive vs FixProof at this stop: recorded naive-bot problems beside what Clocked changed. Drill stops have no comparison.
  const naive = stop.simulate ? [] : naiveProblemsFor(stop.scenarioId);
  const compare = !stop.simulate && stop.difference && naive.length > 0;
  useEffect(() => {
    ref.current?.focus();
  }, [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="tour-h"
      data-tour-stop={stop.scenarioId}
      className="fp-row-in rounded-[28px] border border-primary/25 bg-primary-soft px-5 py-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-primary">
          <Compass aria-hidden className="size-4" /> Judge tour · stop {index + 1} of {stops.length} · replay, no key
        </p>
        <button type="button" onClick={onExit} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-primary hover:bg-card">
          <X aria-hidden className="size-4" /> Exit tour
        </button>
      </div>
      <h2 id="tour-h" className="mt-1 text-[20px] font-medium leading-7 tracking-[-0.01em]">
        {stop.title}
      </h2>
      <p className="mt-1 max-w-[70ch] text-[15px] leading-[22px]">{stop.caption}</p>
      {compare ? (
        <div data-tour-compare={stop.scenarioId} className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[18px] border border-risk-soft bg-risk-wash px-4 py-3">
            <h3 className="text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-risk">Naive bot on this ticket (simulated, recorded)</h3>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[14px] leading-5 text-risk">
              {naive.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[18px] border border-hairline bg-card px-4 py-3">
            <h3 className="text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-ok">FixProof on the same ticket</h3>
            <p className="mt-1.5 text-[14px] leading-5">{stop.difference}</p>
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack} disabled={index === 0} className="inline-flex h-11 items-center gap-2 rounded-full border border-hairline bg-card px-4 text-[15px] font-medium disabled:opacity-50">
          <ArrowLeft aria-hidden className="size-4" /> Back
        </button>
        <button type="button" onClick={last ? onExit : onNext} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-medium text-primary-foreground hover:bg-primary/90">
          {last ? "Finish tour" : "Next stop"} {last ? null : <ArrowRight aria-hidden className="size-4" />}
        </button>
        <span className="text-[13px] text-muted-foreground">Esc exits · every number below comes from a recorded live run</span>
      </div>
    </section>
  );
}
