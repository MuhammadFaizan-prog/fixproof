"use client";

import { ChevronDown, Download, ScrollText } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { buildLedger, sha256Browser, verifyLedger, type Ledger } from "@/lib/agent/ledger";
import type { TriageState } from "@/lib/client/useTriage";
import { cn } from "@/lib/utils";
import { Chip, Eyebrow, Panel } from "./primitives";
import { ScrollRegion } from "./ScrollRegion";

const SOURCE: Record<string, string> = { live: "Live", replay: "Recorded", simulated: "Simulated failure", "not run": "Not run" };
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "n/a");

/**
 * Audit ledger for the run on screen: every Clocked call in order with the
 * SHA-256 of its request body, the decision, credits, attempts and when it
 * finished. Hash-chained and exportable as JSON. Collapsed by default.
 */
export function LedgerCard({ state }: { state: TriageState }) {
  const [open, setOpen] = useState(false);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [intact, setIntact] = useState<boolean | null>(null);
  const id = useId();
  const result = state.result;
  useEffect(() => {
    if (!result || !state.start) return;
    let live = true;
    const events = state.order.map((k) => state.rows[k]);
    buildLedger(
      events,
      { mode: state.start.mode, scenarioId: state.start.scenarioId, personaId: state.start.persona, simulated: result.simulated?.id ?? null, outcome: result.outcome.outcome, decidingCheck: result.outcome.deciding?.id ?? null, credits: result.credits },
      sha256Browser,
    ).then(async (l) => {
      const bad = await verifyLedger(l, sha256Browser);
      if (!live) return;
      setLedger(l);
      setIntact(bad === null);
    });
    return () => {
      live = false;
    };
  }, [result, state.start, state.order, state.rows]);
  if (!result || !ledger) return null;
  const credits = ledger.calls.reduce((n, c) => n + (c.credits ?? 0), 0);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(ledger, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fixproof-ledger-${ledger.run.scenarioId ?? "live"}-${ledger.headHash.slice(0, 8)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <Panel aria-labelledby={`${id}-h`} className="px-5 py-4 sm:px-7" data-ledger-card data-ledger-calls={ledger.calls.length} data-ledger-head={ledger.headHash}>
      <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 text-left">
        <span className="min-w-0">
          <Eyebrow as="span" className="flex items-center gap-1.5">
            <ScrollText aria-hidden className="size-3.5" /> Audit ledger
          </Eyebrow>
          <span id={`${id}-h`} className="mt-1 block text-[17px] font-medium leading-6 tracking-[-0.01em]">
            Every Clocked call in this run, hash-chained
          </span>
        </span>
        <span className="flex items-center gap-2">
          <Chip>
            {ledger.calls.length} calls · {credits} credits
          </Chip>
          {intact !== null ? <Chip tone={intact ? "ok" : "risk"}>{intact ? "Chain verified" : "Chain broken"}</Chip> : null}
          <ChevronDown aria-hidden className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div id={`${id}-body`} className="fp-row-in mt-3">
          <p className="max-w-[75ch] text-[13px] leading-5 text-muted-foreground">
            Each row holds the SHA-256 of the exact request sent to Clocked (never the request itself), what the call decided, its credits and attempts, and when it finished. Each row&apos;s hash covers the one before it, so an edited or deleted row breaks the chain. On a recorded run the request hash equals the hash of the request saved in the recording.
          </p>
          <ScrollRegion label="Audit ledger table (scrolls sideways)" className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring">
            <table className="w-full min-w-[600px] border-separate border-spacing-y-1 text-left text-[13px] leading-5">
              <thead>
                <tr className="text-[12px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th scope="col" className="px-2 font-medium">#</th>
                  <th scope="col" className="px-2 font-medium">Finished</th>
                  <th scope="col" className="px-2 font-medium">Call</th>
                  <th scope="col" className="px-2 font-medium">Request hash</th>
                  <th scope="col" className="px-2 font-medium">Decision</th>
                  <th scope="col" className="px-2 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {ledger.calls.map((c) => (
                  <tr key={c.seq} data-ledger-row={c.seq} className={cn(c.status === "error" ? "bg-risk-wash" : "bg-card")}>
                    <td className="tabular rounded-l-[12px] px-2 py-1.5 align-top text-muted-foreground">{c.seq}</td>
                    <td className="tabular px-2 py-1.5 align-top" title={c.at ?? undefined}>
                      {time(c.at)}
                    </td>
                    <td className="px-2 py-1.5 align-top">{c.title}</td>
                    <td className="px-2 py-1.5 align-top font-mono text-[12px]" title={c.inputsHash ?? undefined}>
                      {c.inputsHash ? `${c.inputsHash.slice(0, 12)}…` : "n/a"}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <span className="font-medium">{c.decision.replace(/_/g, " ")}</span>
                      <span className="line-clamp-2 text-[12.5px] text-muted-foreground" title={c.effect}>{c.effect}</span>
                    </td>
                    <td className="tabular rounded-r-[12px] px-2 py-1.5 text-right align-top">
                      {c.credits ?? "n/a"}
                      <span className="block whitespace-nowrap text-[12px] text-muted-foreground">
                        {SOURCE[c.source] ?? c.source}
                        {c.attempts && c.attempts > 1 ? ` · ${c.attempts} attempts` : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={exportJson} className="inline-flex h-11 items-center gap-2 rounded-full border border-hairline bg-card px-4 text-[15px] font-medium hover:bg-primary-soft">
              <Download aria-hidden className="size-4" /> Export JSON
            </button>
            <span className="font-mono text-[12px] text-muted-foreground" title={ledger.headHash}>
              head {ledger.headHash.slice(0, 16)}…
            </span>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
