"use client";

import { Check, CircleCheck, CircleHelp, Copy, Play, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PublicResult } from "@/lib/agent/triage";
import { cn } from "@/lib/utils";
import type { Persona } from "@/data/personas";
import { pct } from "./format";
import { OUTCOME_STYLE } from "./outcome-style";
import { failedAs } from "./EvidenceCards";
import { Callout, Chip, Eyebrow, Panel } from "./primitives";

/**
 * The outcome receipt, first panel under the run header (D's comparison
 * panel): 28 px title with a count chip, a labelled table whose rows are
 * separate white boxes (sentence · source · status), one tinted callout, then
 * the actions and the cost line.
 */
export function OutcomeCard({ result, persona }: { result: PublicResult; persona: Persona }) {
  const o = result.outcome;
  const style = OUTCOME_STYLE[o.outcome];
  const first = persona.name.split(" ")[0];
  const [ran, setRan] = useState<null | "fix" | "yes" | "no">(null);
  const [copied, setCopied] = useState(false);
  const passages = new Map((result.retrieve?.used ?? []).map((p) => [p.id, p]));
  const claims = result.prove?.claims ?? [];
  const kept = claims.filter((c) => c.kept).length;
  const tone = o.outcome === "AUTO_RESOLVED" ? "ok" : o.outcome === "CONFIRM_WITH_USER" ? "warn" : "risk";

  const headline = {
    AUTO_RESOLVED: `${first}'s fix is ready`,
    CONFIRM_WITH_USER: `One question back to ${first}`,
    ESCALATED: `${result.handoff?.assignmentGroup ?? "Service Desk"} has it, with proof`,
  }[o.outcome];

  const note =
    o.outcome === "AUTO_RESOLVED"
      ? `Every sentence is backed by a knowledge-base passage for ${persona.osLabel}.${result.outcome.runFix ? " The fix script stayed inside this laptop's approved scope." : ""}`
      : o.outcome === "CONFIRM_WITH_USER"
        ? `${o.deciding ? `${failedAs(o.deciding)}. ` : ""}FixProof sends the verified steps and asks ${first} to confirm before closing.`
        : `${o.deciding ? `${failedAs(o.deciding)}. ` : ""}${result.reply ? `${first} still gets the verified steps while waiting.` : "Nothing was sent to the employee."}`;

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
    <Panel aria-labelledby="outcome-h" className="fp-row-in px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6" data-outcome-card={o.outcome}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow className={style.text}>Outcome · {style.label}</Eyebrow>
          <h2 id="outcome-h" className="mt-1 text-[24px] font-medium leading-8 tracking-[-0.015em] sm:text-[28px] sm:leading-9">
            {headline}
          </h2>
        </div>
        <Chip tone={claims.length && kept === claims.length ? "ok" : claims.length ? "warn" : "neutral"} icon={CircleCheck} className="h-[34px] px-3.5 text-[14px]">
          {claims.length ? `${kept} of ${claims.length} sentences supported` : "No reply drafted"}
        </Chip>
      </div>

      {claims.length ? (
        <>
          <div className="mt-4 hidden grid-cols-[minmax(0,1fr)_170px_92px] gap-x-4 px-4 sm:grid">
            <Eyebrow as="span">Reply to {first}, sentence by sentence</Eyebrow>
            <Eyebrow as="span">Source</Eyebrow>
            <Eyebrow as="span" className="text-right">Status</Eyebrow>
          </div>
          <ul className="mt-2 flex flex-col gap-2" aria-label="Reply, sentence by sentence">
            {claims.map((c, i) => {
              const src = c.source ? passages.get(c.source.passageId) : undefined;
              const sourceText = c.kept ? (c.verdict === "not_a_claim" ? "framing" : c.source ? c.source.passageId : "no source named") : c.verdict.replace(/_/g, " ");
              return (
                <li
                  key={i}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-[18px] border px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_170px_92px]",
                    c.kept ? "border-hairline bg-card" : "border-risk-soft bg-risk-wash",
                  )}
                >
                  <span className={cn("text-[15px] leading-[22px]", !c.kept && "text-muted-foreground line-through decoration-risk/60")}>{c.text}</span>
                  <span
                    title={c.source ? [src ? `${src.title} › ${src.section}` : c.source.passageId, c.source.quote ? `“${c.source.quote}”` : null].filter(Boolean).join("\n") : undefined}
                    className="col-start-1 row-start-2 truncate font-mono text-[12px] text-muted-foreground sm:col-start-2 sm:row-start-1"
                  >
                    {c.kept ? <Check aria-hidden className="mr-1 inline size-3.5 text-ok" /> : null}
                    {sourceText}
                  </span>
                  <span className="col-start-2 row-span-2 row-start-1 justify-self-end sm:col-start-3 sm:row-span-1">
                    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[13px] font-medium", c.kept ? "bg-ok-soft text-ok" : "bg-risk-soft text-risk")}>
                      {c.kept ? (c.verdict === "not_a_claim" ? "Framing" : "Supported") : "Removed"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-4 rounded-[18px] border border-hairline bg-card px-4 py-3 text-[15px] text-muted-foreground">Nothing safe was left to answer, so no reply was drafted.</p>
      )}

      <Callout tone={tone} icon={o.outcome === "AUTO_RESOLVED" ? CircleCheck : o.outcome === "CONFIRM_WITH_USER" ? CircleHelp : TriangleAlert} className="mt-3 w-fit">
        {note}
      </Callout>

      {ran ? <ActionNote ran={ran} result={result} first={first} /> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {o.outcome === "AUTO_RESOLVED" ? (
          result.outcome.runFix ? (
            <Button className="h-11 rounded-full px-5 text-[15px]" onClick={() => setRan("fix")} disabled={ran === "fix"}>
              <Play aria-hidden /> Run fix
            </Button>
          ) : (
            <Button className="h-11 rounded-full px-5 text-[15px]" onClick={() => setRan("yes")} disabled={ran === "yes"}>
              Send reply and close
            </Button>
          )
        ) : o.outcome === "CONFIRM_WITH_USER" ? (
          <>
            <Button className="h-11 rounded-full px-5 text-[15px]" onClick={() => setRan("yes")} disabled={ran !== null}>
              It worked
            </Button>
            <Button variant="outline" className="h-11 rounded-full border-hairline bg-card px-5 text-[15px]" onClick={() => setRan("no")} disabled={ran !== null}>
              Still broken
            </Button>
          </>
        ) : null}
        {result.reply ? (
          <Button variant="outline" className="h-11 rounded-full border-hairline bg-card px-5 text-[15px]" onClick={copy}>
            <Copy aria-hidden /> {copied ? "Copied" : "Copy reply"}
          </Button>
        ) : null}
        <span className="tabular w-full text-[13px] text-muted-foreground sm:ml-auto sm:w-auto">
          {persona.device} · grounded {result.prove ? pct(result.prove.grounded) : "–"} · scripts never execute
        </span>
      </div>
    </Panel>
  );
}

function ActionNote({ ran, result, first }: { ran: "fix" | "yes" | "no"; result: PublicResult; first: string }) {
  if (ran === "fix" && result.fixGate?.script) {
    const lines = result.fixGate.script.code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    return (
      <div role="status" className="mt-4 rounded-xl bg-foreground p-3.5 font-mono text-[12.5px] leading-5 text-[#dfe7e7]">
        <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-[#9fb0b1]">Simulated run · nothing executed</p>
        {lines.map((l, i) => (
          <p key={i}>
            <span className="text-[#9fb0b1]">$</span> {l} <span className="text-ok-soft">✓</span>
          </p>
        ))}
        <p className="mt-1 text-[#9fb0b1]">Ticket closed for {first}. Inspected script, verified steps.</p>
      </div>
    );
  }
  return (
    <p role="status" className="mt-4 rounded-xl bg-surface-sunken px-3.5 py-2.5 text-[13px] text-secondary-foreground">
      {ran === "yes" ? `Ticket closed. ${first} received the verified reply.` : `Reopened for a technician with the full Proof Trail attached.`}
    </p>
  );
}
