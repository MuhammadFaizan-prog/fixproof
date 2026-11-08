import type { RunResult } from "@/lib/agent/run";
import type { StepEvent } from "@/lib/agent/types";
import { USD_PER_1000_CREDITS, type EvalCase, type Outcome } from "./score";

/**
 * Per-endpoint "fires / stays quiet" proof and credit accounting, computed by
 * `pnpm eval` from the run-2 replay of the locked cases (recorded Clocked
 * answers, recorded X-Clocked-Credits). For each of the 9 endpoints: one case
 * where its output changed what FixProof did, and one where it correctly
 * changed nothing (or was not called at all). Cases are picked by a fixed
 * rule (first match in eval/cases.jsonl order), never by hand.
 */

export interface CaseRun {
  c: EvalCase;
  r: RunResult;
  events: StepEvent[];
}

export interface EndpointRow {
  name: string;
  group: "Decide / Extract / Fill" | "Protect / Guard / Inspect" | "Verify / Compare / Rerank";
  fires: { caseId: string; what: string } | null;
  quiet: { caseId: string; what: string } | null;
  /** Tickets where it is never called, and why. */
  notCalled: { count: number; why: string } | null;
  /** Runs inside the screening Pipeline call on every ticket (credits counted on the Protect row). */
  inPipeline?: boolean;
  calls: number;
  tickets: number;
  credits: number;
  creditsPerCallMedian: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.ceil(0.5 * s.length) - 1];
};
const credits = (e: StepEvent) => e.meta?.credits ?? 0;
const final = (events: StepEvent[]) => events.filter((e) => e.status === "ok" || e.status === "error");
const first = <T>(xs: CaseRun[], f: (x: CaseRun) => T | null | undefined | false): { caseId: string; what: T } | null => {
  for (const x of xs) {
    const v = f(x);
    if (v) return { caseId: x.c.id, what: v };
  }
  return null;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const OUT: Record<Outcome, string> = { AUTO_RESOLVED: "Resolved", CONFIRM_WITH_USER: "Confirm", ESCALATED: "Handed off" };

export function endpointReport(runs: CaseRun[], runId: string) {
  const callsOf = (pred: (e: StepEvent) => boolean) => runs.map((x) => final(x.events).filter((e) => e.endpoint !== "local" && pred(e)));
  const stat = (pred: (e: StepEvent) => boolean) => {
    const per = callsOf(pred);
    const all = per.flat();
    return { calls: all.length, tickets: per.filter((p) => p.length).length, credits: all.reduce((n, e) => n + credits(e), 0), creditsPerCallMedian: median(all.map(credits)) };
  };
  const n = runs.length;
  const isGuardKb = (e: StepEvent) => e.endpoint === "injection" && e.id.startsWith("retrieve:guard");
  const pipe = stat((e) => e.endpoint === "pipeline");

  const rows: EndpointRow[] = [
    {
      name: "Protect (Pipeline, with Guard)",
      group: "Protect / Guard / Inspect",
      fires: first(runs, (x) => {
        const k = Object.values(x.r.screen?.piiCounts ?? {}).reduce((a, b) => a + b, 0);
        return k > 0 && `masked ${plural(k, "personal-data item")} before any other step read the ticket`;
      }),
      quiet: first(runs, (x) => x.r.screen && !x.r.screen.quarantined && Object.values(x.r.screen.piiCounts).reduce((a, b) => a + b, 0) === 0 && "found no personal data; the ticket went on unchanged"),
      notCalled: null,
      ...pipe,
    },
    {
      name: "Guard (ticket)",
      group: "Protect / Guard / Inspect",
      fires: first(runs, (x) => x.r.screen?.quarantined && (x.r.screen.canContinue ? "cut the injected sentence by its offsets; the rest was re-checked and answered" : "held the whole ticket: nothing safe was left")),
      quiet: first(runs, (x) => x.r.screen?.injection.verdict === "benign" && "read the ticket as benign; nothing cut, no re-check call"),
      notCalled: null,
      inPipeline: true,
      ...stat((e) => e.endpoint === "injection" && !isGuardKb(e)),
    },
    {
      name: "Guard (knowledge-base sections)",
      group: "Protect / Guard / Inspect",
      fires: first(runs, (x) => (x.r.retrieve?.dropped.length ?? 0) > 0 && `dropped ${plural(x.r.retrieve!.dropped.length, "poisoned section")} before drafting`),
      quiet: first(runs, (x) => {
        const g = final(x.events).filter(isGuardKb);
        return g.length > 0 && (x.r.retrieve?.dropped.length ?? 0) === 0 && `cleared all ${plural(g.length, "kept section")}`;
      }),
      notCalled: { count: runs.filter((x) => !final(x.events).some(isGuardKb)).length, why: "no passage was kept to check" },
      ...stat(isGuardKb),
    },
    {
      name: "Inspect",
      group: "Protect / Guard / Inspect",
      fires: first(runs, (x) => x.r.fixGate?.ran && !x.r.fixGate.runAllowed && `blocked the knowledge-base script (${x.r.fixGate.category ?? x.r.fixGate.verdict}); no Run fix`),
      quiet: first(runs, (x) => x.r.fixGate?.ran && x.r.fixGate.runAllowed && "cleared the script for this device; Run fix offered (simulated)"),
      notCalled: { count: runs.filter((x) => !x.r.fixGate?.ran).length, why: "no kept article carries a script" },
      ...stat((e) => e.endpoint === "script"),
    },
    {
      name: "Decide",
      group: "Decide / Extract / Fill",
      fires: first(runs, (x) => x.r.understand?.policy.band === "escalate" && "escalate band: handed to a person whatever the reply says"),
      quiet: first(runs, (x) => x.r.understand?.policy.band === "auto" && x.r.outcome.outcome === "AUTO_RESOLVED" && "auto band: did not stop a ticket every other check cleared"),
      notCalled: null,
      ...stat((e) => e.endpoint === "decide"),
    },
    {
      name: "Extract",
      group: "Decide / Extract / Fill",
      fires: first(runs, (x) => {
        const u = x.r.understand?.extracted;
        if (!u) return null;
        const k = u.errorCodes.length + u.apps.length + (u.assetTag ? 1 : 0) + (u.device ? 1 : 0) + (u.deadline ? 1 : 0);
        return u.errorCodes.length > 0 && `found ${plural(k, "exact value")} (error code ${u.errorCodes[0].value}), added to the knowledge-base query and the handoff`;
      }),
      quiet: first(runs, (x) => {
        const u = x.r.understand?.extracted;
        return u && !u.errorCodes.length && !u.apps.length && !u.assetTag && !u.device && !u.deadline && "found nothing to extract and invented nothing; the fields stay empty";
      }),
      notCalled: null,
      ...stat((e) => e.endpoint === "extract"),
    },
    {
      name: "Fill (record, draft, handoff)",
      group: "Decide / Extract / Fill",
      fires: first(runs, (x) => x.r.outcome.outcome === "ESCALATED" && !x.r.failure && final(x.events).some((e) => e.id === "handoff" && e.endpoint === "fill") && `wrote the handoff: team ${x.r.handoff?.assignmentGroup ?? "?"}, priority ${x.r.handoff?.priority ?? "?"}`),
      quiet: first(runs, (x) => x.r.outcome.outcome === "AUTO_RESOLVED" && "resolved, so the handoff Fill was never called"),
      notCalled: { count: runs.filter((x) => !final(x.events).some((e) => e.id === "handoff" && e.endpoint === "fill")).length, why: "the handoff Fill runs only on escalation" },
      ...stat((e) => e.endpoint === "fill"),
    },
    {
      name: "Rerank",
      group: "Verify / Compare / Rerank",
      fires: first(runs, (x) => {
        const s = (x.r.retrieve?.skipped ?? []).filter((p) => p.reason === "different_case");
        return s.length > 0 && `skipped ${plural(s.length, "passage")} written for a different setup (e.g. "${s[0].title}")`;
      }),
      quiet: first(runs, (x) => x.r.retrieve && (x.r.retrieve.used.length ?? 0) > 0 && !(x.r.retrieve.skipped ?? []).some((p) => p.reason === "different_case") && "no passage was written for another setup; nothing skipped for that reason"),
      notCalled: null,
      ...stat((e) => e.endpoint === "rerank"),
    },
    {
      name: "Compare",
      group: "Verify / Compare / Rerank",
      fires: first(runs, (x) => {
        const c = x.r.reconcile?.conflicts.find((k) => k.winner);
        if (!c) return null;
        const loser = c.winner === c.a.passageId ? c.b : c.a;
        const winner = c.winner === c.a.passageId ? c.a : c.b;
        const scope = runs.find((y) => y.r.reconcile?.conflicts.some((k) => k.rule === "scope"));
        const also = scope && scope !== x ? `; scope rule on \`${scope.c.id}\`: the office article beat a newer company-wide one` : "";
        return c.rule === "scope" ? `"${winner.title}" governs for this employee's office; "${loser.title}" removed before drafting` : `found "${winner.title}" and "${loser.title}" disagree; the newer stood and the older passage was removed before drafting${also}`;
      }),
      quiet: first(runs, (x) => x.r.reconcile?.ran && !x.r.reconcile.conflicts.length && !x.r.reconcile.removed.length && `read ${plural(x.r.reconcile.used.length, "passage")}: no conflict, nothing removed`),
      notCalled: { count: runs.filter((x) => !x.r.reconcile?.ran).length, why: "fewer than 2 passages were kept" },
      ...stat((e) => e.endpoint === "compare"),
    },
    {
      name: "Verify",
      group: "Verify / Compare / Rerank",
      fires: first(runs, (x) => (x.r.prove?.removed.length ?? 0) > 0 && `removed ${plural(x.r.prove!.removed.length, "unsupported sentence")} before the reply was shown`),
      quiet: first(runs, (x) => x.r.prove && !x.r.prove.removed.length && x.r.outcome.outcome === "AUTO_RESOLVED" && "every sentence supported; nothing removed"),
      notCalled: { count: runs.filter((x) => !x.r.prove).length, why: "no reply was drafted: the ticket was held or no passage applied" },
      ...stat((e) => e.endpoint === "grounding"),
    },
  ];

  // Credits by outcome type: FixProof's own calls per ticket.
  const byOutcome = (["AUTO_RESOLVED", "CONFIRM_WITH_USER", "ESCALATED"] as Outcome[]).map((o) => {
    const xs = runs.filter((x) => x.r.outcome.outcome === o).map((x) => x.r.credits);
    const med = median(xs);
    return { outcome: o, label: OUT[o], tickets: xs.length, creditsMedian: med, creditsMax: xs.length ? Math.max(...xs) : 0, usdMedian: Number(((med * USD_PER_1000_CREDITS) / 1000).toFixed(4)) };
  });
  const totals = runs.map((x) => x.r.credits);
  return {
    runId,
    cases: n,
    note: "Computed by pnpm eval from the run-2 replay: recorded Clocked answers and recorded X-Clocked-Credits. Fires = the endpoint's output changed what FixProof did on that ticket; quiet = it ran and correctly changed nothing, or was not called. First matching case in eval/cases.jsonl order.",
    usdPer1000: USD_PER_1000_CREDITS,
    rows,
    byOutcome,
    perTicket: { creditsMedian: median(totals), usdMedian: Number(((median(totals) * USD_PER_1000_CREDITS) / 1000).toFixed(4)), creditsTotal: totals.reduce((a, b) => a + b, 0) },
  };
}
export type EndpointReport = ReturnType<typeof endpointReport>;

/** Markdown block inserted between <!-- endpoints:start --> and <!-- endpoints:end --> in README.md and CLOCKED.md. */
export function renderEndpointsMd(rep: EndpointReport): string {
  const L: string[] = [];
  L.push(`<!-- endpoints:start (generated by pnpm eval from ${rep.runId}; do not edit by hand) -->`);
  L.push("");
  L.push("| Endpoint | Fires: its output changed what happened | Stays quiet: correctly changed nothing | Called on | Credits (median per call) |");
  L.push("|---|---|---|---|---|");
  for (const r of rep.rows) {
    const f = r.fires ? `\`${r.fires.caseId}\`: ${r.fires.what}` : "not seen in this set";
    const q = [r.quiet ? `\`${r.quiet.caseId}\`: ${r.quiet.what}` : null, r.notCalled && r.notCalled.count ? `not called on ${r.notCalled.count} tickets (${r.notCalled.why})` : null].filter(Boolean).join("; ");
    const called = r.inPipeline ? `${rep.cases} / ${rep.cases} tickets in the Pipeline, plus ${plural(r.calls, "re-check call")} after a cut` : `${r.tickets} / ${rep.cases} tickets, ${r.calls} calls`;
    const cr = r.inPipeline ? `in the Pipeline; re-checks ${r.credits} (${r.creditsPerCallMedian})` : `${r.credits} (${r.creditsPerCallMedian})`;
    L.push(`| **${r.name}** | ${f} | ${q || "n/a"} | ${called} | ${cr} |`);
  }
  L.push("");
  L.push(`Protect and the ticket Guard run as one Pipeline call on every ticket, so the Pipeline's credits are counted once, on the Protect row. Per ticket: median **${rep.perTicket.creditsMedian} credits ≈ $${rep.perTicket.usdMedian.toFixed(4)}** at $${rep.usdPer1000} per 1,000 credits. By outcome:`);
  L.push("");
  L.push("| Outcome | Tickets | Credits per ticket, median (max) | $ per ticket, median |");
  L.push("|---|---|---|---|");
  for (const o of rep.byOutcome) L.push(`| ${o.label} | ${o.tickets} | ${o.creditsMedian} (${o.creditsMax}) | $${o.usdMedian.toFixed(4)} |`);
  L.push("");
  L.push(`Source: \`pnpm eval\` replay of the ${rep.cases} locked tickets (run 2), recorded \`X-Clocked-Credits\` only; [eval/endpoints.json](eval/endpoints.json).`);
  L.push("");
  L.push("<!-- endpoints:end -->");
  return L.join("\n");
}

export function spliceEndpoints(doc: string, block: string): string {
  const a = doc.indexOf("<!-- endpoints:start");
  const b = doc.indexOf("<!-- endpoints:end -->");
  if (a < 0 || b < 0) return doc;
  return doc.slice(0, a) + block + doc.slice(b + "<!-- endpoints:end -->".length);
}
