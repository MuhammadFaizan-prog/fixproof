"use client";

import { Check, Copy, Play, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PublicResult } from "@/lib/agent/triage";
import { cn } from "@/lib/utils";
import type { Persona } from "@/data/personas";
import { pct } from "./format";
import { OUTCOME_STYLE } from "./outcome-style";
import { failedAs } from "./EvidenceCards";

/**
 * The outcome as a receipt, rebuilt from DESIGN.md R1b (Merit "approve with
 * a receipt"): tinted band with eyebrow + serif line, a white card that
 * overlaps it, one row per sentence with its source chip (or the reason it
 * was cut), an italic note, a one-line cost note, and the actions.
 */
export function OutcomeCard({ result, persona }: { result: PublicResult; persona: Persona }) {
  const o = result.outcome;
  const style = OUTCOME_STYLE[o.outcome];
  const first = persona.name.split(" ")[0];
  const [ran, setRan] = useState<null | "fix" | "yes" | "no">(null);
  const [copied, setCopied] = useState(false);
  const passages = new Map((result.retrieve?.used ?? []).map((p) => [p.id, p]));
  const claims = result.prove?.claims ?? [];
  const passed = o.checks.filter((c) => c.pass === true).length;

  const band = {
    AUTO_RESOLVED: { eyebrow: "Resolved without a technician", line: `${first}'s fix is ready.`, bg: "bg-primary", fg: "text-primary-foreground", eb: "text-primary-foreground/75" },
    CONFIRM_WITH_USER: { eyebrow: "Close call, so it asks first", line: `One question back to ${first}.`, bg: "bg-[#7a4a0c]", fg: "text-white", eb: "text-white/75" },
    ESCALATED: { eyebrow: "Handed to a person", line: `${result.handoff?.assignmentGroup ?? "Service Desk"} has it, with proof.`, bg: "bg-[#3d1d1a]", fg: "text-white", eb: "text-white/70" },
  }[o.outcome];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.reply ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section aria-labelledby="outcome-h" className="overflow-hidden rounded-xl border border-border" data-outcome-card={o.outcome}>
      <div className={cn("px-5 pb-12 pt-5", band.bg)}>
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em]", band.eb)}>{band.eyebrow}</p>
        <h2 id="outcome-h" className={cn("mt-1 font-heading text-[26px] leading-[32px]", band.fg)}>
          {band.line}
        </h2>
      </div>
      <div className="-mt-8 mx-3 mb-3 rounded-xl border border-border bg-card px-5 pb-5 pt-4 shadow-sm sm:mx-4">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
          <div className="min-w-0">
            <p className="font-heading text-[19px] leading-[26px]">{result.reply ? `Reply to ${first}` : "No reply was sent"}</p>
            <p className="text-[13px] text-muted-foreground">
              {persona.device} · {persona.osLabel}
              {result.prove ? ` · grounded ${pct(result.prove.grounded)}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", style.pill)}>{style.label}</span>
          <span className="text-[13px] text-muted-foreground">
            {passed} of {o.checks.length} checks passed
          </span>
        </div>

        {claims.length ? (
          <ul className="mt-3 flex flex-col gap-2.5" aria-label="Reply, sentence by sentence">
            {claims.map((c, i) => {
              const src = c.source ? passages.get(c.source.passageId) : undefined;
              return (
                <li key={i} className="grid grid-cols-[18px_1fr_auto] items-start gap-x-2">
                  {c.kept ? <Check aria-label="supported" className="mt-0.5 size-4 text-ok" /> : <X aria-label="removed" className="mt-0.5 size-4 text-warn" />}
                  <span className={cn("text-[14px] leading-[21px]", !c.kept && "text-muted-foreground line-through decoration-warn/70")}>{c.text}</span>
                  <span
                    title={c.source ? [src ? `${src.title} › ${src.section}` : c.source.passageId, c.source.quote ? `“${c.source.quote}”` : null].filter(Boolean).join("\n") : undefined}
                    className={cn(
                      "mt-0.5 max-w-[170px] truncate rounded border px-1.5 py-px font-mono text-[11px] font-medium",
                      c.kept ? "border-border bg-surface-sunken text-muted-foreground" : "border-warn/30 bg-warn-soft text-warn",
                    )}
                  >
                    {c.kept ? (c.verdict === "not_a_claim" ? "framing" : c.source ? c.source.passageId : "no source named") : c.verdict.replace("_", " ").toUpperCase()}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        <blockquote className="mt-4 rounded-lg bg-surface-sunken px-3.5 py-3 font-heading text-[15px] italic leading-[22px] text-secondary-foreground">
          {o.outcome === "AUTO_RESOLVED"
            ? `Every sentence above is backed by a knowledge-base passage that applies to ${persona.osLabel}. ${result.outcome.runFix ? "The fix script was inspected against this laptop's approved scope." : ""}`
            : o.outcome === "CONFIRM_WITH_USER"
              ? `${o.deciding ? `${failedAs(o.deciding)}.` : ""} FixProof sends the verified steps and asks ${first} to confirm before closing.`
              : `${o.deciding ? `${failedAs(o.deciding)}.` : ""} ${result.reply ? `${first} still gets the verified steps above while waiting.` : "Nothing was sent to the employee."}`}
        </blockquote>

        <p className="mt-3 text-center text-[12px] text-muted-foreground">
          This run used {result.credits} credits across {result.calls} Clocked calls. FixProof never executes scripts; Run fix shows a simulated log.
        </p>

        {ran ? <ActionNote ran={ran} result={result} first={first} /> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {o.outcome === "AUTO_RESOLVED" ? (
            <>
              {result.outcome.runFix ? (
                <Button className="h-11 flex-1 rounded-lg text-[15px] sm:h-10" onClick={() => setRan("fix")} disabled={ran === "fix"}>
                  <Play aria-hidden /> Run fix
                </Button>
              ) : (
                <Button className="h-11 flex-1 rounded-lg text-[15px] sm:h-10" onClick={() => setRan("yes")} disabled={ran === "yes"}>
                  Send reply and close
                </Button>
              )}
            </>
          ) : o.outcome === "CONFIRM_WITH_USER" ? (
            <>
              <Button className="h-11 flex-1 rounded-lg text-[15px] sm:h-10" onClick={() => setRan("yes")} disabled={ran !== null}>
                It worked
              </Button>
              <Button variant="outline" className="h-11 rounded-lg px-4 text-[15px] sm:h-10" onClick={() => setRan("no")} disabled={ran !== null}>
                Still broken
              </Button>
            </>
          ) : null}
          {result.reply ? (
            <Button variant="ghost" className="h-11 rounded-lg px-4 text-[15px] sm:h-10" onClick={copy}>
              <Copy aria-hidden /> {copied ? "Copied" : "Copy reply"}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ActionNote({ ran, result, first }: { ran: "fix" | "yes" | "no"; result: PublicResult; first: string }) {
  if (ran === "fix" && result.fixGate?.script) {
    const lines = result.fixGate.script.code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    return (
      <div role="status" className="mt-4 rounded-lg bg-[#16231d] p-3.5 font-mono text-[12.5px] leading-5 text-[#cfe8dc]">
        <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-[#8fb8a5]">Simulated run · nothing executed</p>
        {lines.map((l, i) => (
          <p key={i}>
            <span className="text-[#8fb8a5]">$</span> {l} <span className="text-[#7fd1a8]">✓</span>
          </p>
        ))}
        <p className="mt-1 text-[#8fb8a5]">Ticket closed for {first}. Inspected script, verified steps.</p>
      </div>
    );
  }
  return (
    <p role="status" className="mt-4 rounded-lg bg-surface-sunken px-3.5 py-2.5 text-[13px] text-secondary-foreground">
      {ran === "yes" ? `Ticket closed. ${first} received the verified reply.` : `Reopened for a technician with the full Proof Trail attached.`}
    </p>
  );
}
