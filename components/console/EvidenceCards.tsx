import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { PublicResult } from "@/lib/agent/triage";
import { codePoints } from "@/lib/text/offsets";
import { cn } from "@/lib/utils";
import { OUTCOME_STYLE } from "./outcome-style";
import { FAILED_AS, type CheckId } from "@/lib/agent/policy";

/** Drop markdown heading lines ("## Steps") that Compare's quote can carry over from the article. */
export function cleanQuote(q: string): string {
  return q
    .split("\n")
    .filter((l) => !/^\s*#{1,6}\s/.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Knowledge-base articles conflict (detail)", the FAILED_AS wording used in the handoff and headline. */
export function failedAs(c: { id: string; label: string; detail: string }): string {
  const w = FAILED_AS[c.id as CheckId] ?? c.label;
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} (${c.detail})`;
}

/** Evidence block for the right rail: eyebrow, a 16 px title, then the evidence. The rail supplies the panel. */
function Card({ eyebrow, title, tone = "neutral", children }: { eyebrow: string; title: string; tone?: "neutral" | "risk" | "ok" | "warn"; children: React.ReactNode }) {
  const eb = { neutral: "text-primary", risk: "text-risk", ok: "text-ok", warn: "text-warn" }[tone];
  return (
    <section className="fp-row-in">
      <p className={cn("text-[11px] font-semibold uppercase leading-4 tracking-[0.08em]", eb)}>{eyebrow}</p>
      <h3 className="mt-1 text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Compare found two articles that disagree: both quotes side by side, the newer one marked as the one that stood. */
export function ConflictCard({ result }: { result: PublicResult }) {
  const conflicts = result.reconcile?.conflicts ?? [];
  if (!conflicts.length) return null;
  return (
    <>
      {conflicts.map((c, i) => (
        <Card key={i} eyebrow={`Compare · ${c.kind.replace(/_/g, " ")} · ${Math.round(c.confidence * 100)}%`} title={c.winner ? "Two articles disagree. The newer one stands." : "Two articles disagree, and nothing breaks the tie."} tone={c.winner ? "warn" : "risk"}>
          <div className="flex flex-col gap-2.5">
            {[c.a, c.b].map((side) => {
              const won = c.winner === side.passageId;
              const lost = c.winner && !won;
              return (
                <figure key={side.passageId} className={cn("rounded-[18px] border p-3.5", won ? "border-ok-soft bg-ok-wash" : "border-hairline bg-card")}>
                  <figcaption className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
                    <span className="truncate font-medium text-foreground">{side.title}</span>
                    <span className="tabular shrink-0">{side.updated}</span>
                  </figcaption>
                  <blockquote className={cn("mt-2 text-[14px] leading-[21px]", lost && "text-muted-foreground line-through decoration-risk/50")}>“{cleanQuote(side.quote)}”</blockquote>
                  <p className={cn("mt-2 text-[12px] font-semibold", won ? "text-ok" : lost ? "text-muted-foreground" : "text-risk")}>
                    {won ? "Kept: newer article" : lost ? "Removed before drafting" : "Unresolved"}
                  </p>
                </figure>
              );
            })}
          </div>
        </Card>
      ))}
    </>
  );
}

/** Inspect's verdict on the fix script: the code with the flagged line marked, or the all-clear. */
export function ScriptGateCard({ result }: { result: PublicResult }) {
  const g = result.fixGate;
  if (!g?.ran || !g.script) return null;
  const blocked = !g.runAllowed;
  const code = g.script.code;
  // Mark the lines that contain an evidence span (offsets are code points into the script).
  const lines = code.split("\n");
  let offset = 0;
  const flagged = lines.map((line) => {
    const start = offset;
    const end = start + codePoints(line).length;
    offset = end + 1;
    return g.evidence.some((e) => e.start < end && e.end > start);
  });
  return (
    <Card
      eyebrow={`Inspect · ${g.script.lang} · ${g.verdict}`}
      title={blocked ? `Blocked: ${g.category}` : "Script stays inside the approved scope"}
      tone={blocked ? "risk" : "ok"}
    >
      <div className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
        {blocked ? <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-risk" /> : <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />}
        From “{g.articleTitle}” · malicious {Math.round(g.malicious * 100)}% · suspicious {Math.round(g.suspicious * 100)}%{g.severity ? ` · ${g.severity}` : ""}
      </div>
      <pre className="fp-scroll mt-3 overflow-x-auto rounded-xl border border-hairline bg-surface-sunken py-2.5 font-mono text-[12px] leading-[21px]">
        {lines.map((l, i) => (
          <div key={i} className={cn("flex gap-3 px-3.5", flagged[i] && "bg-risk-soft text-risk")}>
            <span aria-hidden className="w-4 shrink-0 select-none text-right text-muted-foreground">
              {i + 1}
            </span>
            <span className="whitespace-pre">{l || " "}</span>
            {flagged[i] ? <span className="sr-only"> (flagged by Inspect)</span> : null}
          </div>
        ))}
      </pre>
      <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
        {blocked ? "No Run fix button. A technician reviews the script and the knowledge-base article it came from." : "Run fix is offered on the receipt. FixProof simulates the run; nothing executes."}
      </p>
    </Card>
  );
}

/** The record a technician picks up when FixProof stops. */
export function HandoffCard({ result }: { result: PublicResult }) {
  const h = result.handoff;
  if (!h) return null;
  const rows: [string, React.ReactNode][] = [
    ["Team", h.assignmentGroup + (h.assignmentConfidence != null ? ` (${Math.round(h.assignmentConfidence * 100)}%)` : "")],
    ["Priority", h.priority],
    ["Stopped at", h.failedCheck ? failedAs(h.failedCheck) : "–"],
    ["Employee", `${h.employee.name} · ${h.employee.device} · ${h.employee.assetTag} · ${h.employee.office}`],
    ["Written by", h.source === "fill" ? "Clocked Fill (summary, team, priority) + FixProof (facts it already knew)" : "FixProof locally (Clocked was unavailable)"],
  ];
  return (
    <Card eyebrow="Handoff record" title={`${h.assignmentGroup} · ${h.priority}`} tone="risk">
      <p className="mb-3 rounded-[18px] border border-hairline bg-card px-3.5 py-2.5 text-[14px] leading-[21px]">{h.summary}</p>
      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-2 mt-4 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted-foreground">Already tried</p>
      <ol className="flex flex-col gap-1.5 text-[13px] leading-5">
        {h.attempted.map((a, i) => (
          <li key={i} className="grid grid-cols-[20px_1fr] gap-2">
            <span className="tabular text-muted-foreground">{i + 1}.</span>
            <span>{a}</span>
          </li>
        ))}
      </ol>
      <p className="mb-2 mt-4 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted-foreground">Ticket (masked)</p>
      <p className="rounded-xl border border-hairline bg-surface-sunken px-3.5 py-2.5 text-[13px] leading-5">{h.maskedTicket || "Nothing safe to show."}</p>
    </Card>
  );
}

/** Small outcome pill used in history rows. */
export function OutcomePill({ outcome }: { outcome: keyof typeof OUTCOME_STYLE }) {
  const s = OUTCOME_STYLE[outcome];
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", s.pill)}>{s.label}</span>;
}
