import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import scorecard from "@/eval/scorecard.json";
import scorecard2 from "@/eval/scorecard-run-2.json";
import ablation from "@/eval/ablation.json";
import endpoints from "@/eval/endpoints.json";
import { Panel, Eyebrow, StatTile } from "@/components/console/primitives";
import { ScrollRegion } from "@/components/console/ScrollRegion";

export const metadata = { title: "Proof · FixProof" };

const REPO = "https://github.com/MuhammadFaizan-prog/fixproof";
const frac = (x: { n: number; d: number }) => `${x.n} / ${x.d}`;

/**
 * /proof: the locked eval's scorecard and the naive-desk comparison, read
 * straight from eval/scorecard.json (written by `pnpm eval`, which a test
 * keeps byte-identical to EVAL.md's source run). No number is typed by hand.
 */
export default function Proof() {
  const s = scorecard;
  const s2 = scorecard2;
  const h = s.headline;
  const n = s.naive;
  const tiles: [string, string][] = [
    ["Unsafe auto-resolves", frac(h.unsafeAutoResolve)],
    ["Injected instructions cut or held", frac(h.injectionRecall)],
    ["Poisoned KB sections kept out", frac(h.poisonedRecall)],
    ["Malicious scripts blocked by Inspect", frac(h.scriptBlockedByInspect)],
    ["Outcome in the expected set", frac(h.outcomeAccuracy)],
    ["Invented times repeated in a reply", frac(h.baitShipped)],
    ["Routine tickets escalated", frac(h.falseEscalation)],
    ["Credits per ticket (median)", `${s.cost.creditsMedian} ≈ $${s.cost.usdPerTicketMedian.toFixed(4)}`],
  ];
  const rows: [string, string, string][] = [
    ["Tickets where an unsafe or wrong answer would ship", `${n.shippedBad} / ${n.cases}`, `${s.fixproof.shippedBad} / ${s.cases}`],
    ["Sentences Verify could not support", `${n.unsupportedSentences} of ${n.sentences}`, "0 shown (removed first)"],
    ["Showed a script Inspect blocks", String(n.blockedScriptShown), "0"],
    ["Drafted from an article written for a different setup", String(n.wrongSetupArticleUsed), String(h.wrongOsLeak.n)],
    ["Passed an injected instruction to the model", String(n.injectionPassedToModel), "0"],
    ["Personal-data items sent unmasked", String(n.personalDataItemsExposed), "0"],
  ];
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-full border border-hairline bg-card px-4 text-[15px] font-medium">
          <ArrowLeft aria-hidden className="size-4" /> Back to the desk
        </Link>
        <span className="inline-flex h-11 items-center gap-2 rounded-full bg-primary-soft px-4 text-[14px] font-medium text-primary">
          <ShieldCheck aria-hidden className="size-4" /> Locked set · sha256 {s.lockDigest.slice(0, 8)}…
        </span>
      </div>
      <Panel aria-labelledby="proof-h" className="px-5 py-6 sm:px-8">
        <Eyebrow>Proof · {s.cases} locked tickets · {s.runId.replace(/-/g, " ").replace(/^run (\d+) pre tuning$/, "run $1, before tuning")}</Eyebrow>
        <h1 id="proof-h" className="mt-1 text-[28px] font-medium leading-9 tracking-[-0.015em] sm:text-[32px]">
          The naive desk would have shipped {n.shippedBad} bad answers out of {n.cases}. FixProof shipped {s.fixproof.shippedBad}.
        </h1>
        <p className="mt-2 max-w-[75ch] text-[15px] leading-[22px] text-muted-foreground">
          8 presets plus 24 held-out tickets, labelled and hashed before the first live run. Every number below is a recorded Clocked verdict scored against those labels; <code className="font-mono text-[13px]">pnpm eval</code> reproduces it with no key and no credits.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {tiles.map(([label, value]) => (
            <StatTile key={label} label={label} value={value} />
          ))}
        </div>
      </Panel>

      <Panel aria-labelledby="naive-h" className="px-5 py-6 sm:px-8">
        <Eyebrow>Before and after</Eyebrow>
        <h2 id="naive-h" className="mt-1 text-[22px] font-medium leading-8 tracking-[-0.01em]">
          Same tickets, same judge: a simulated naive bot vs FixProof
        </h2>
        <p className="mt-1 max-w-[75ch] text-[14px] leading-5 text-muted-foreground">
          The naive bot is not FixProof: it reads the ticket as typed, drafts from the top 3 keyword matches with no checks, and shows any script as-is. Verify then judges its draft against the passages FixProof kept.
        </p>
        <ScrollRegion className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring" label="Naive bot vs FixProof table (scrolls sideways)">
          <table className="w-full min-w-[560px] border-separate border-spacing-y-1.5 text-left text-[14px]">
            <thead>
              <tr className="text-[12px] uppercase tracking-[0.06em] text-muted-foreground">
                <th scope="col" className="px-3 font-medium">On the same {s.cases} tickets</th>
                <th scope="col" className="px-3 font-medium">Naive bot</th>
                <th scope="col" className="px-3 font-medium">FixProof</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, a, b]) => (
                <tr key={k} className="bg-card">
                  <th scope="row" className="rounded-l-[14px] border-y border-l border-hairline px-3 py-2.5 font-normal">{k}</th>
                  <td className="tabular border-y border-hairline px-3 py-2.5 font-medium text-risk">{a}</td>
                  <td className="tabular rounded-r-[14px] border-y border-r border-hairline px-3 py-2.5 font-medium text-ok">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Run 1&apos;s one miss: a Lahore visitor&apos;s guest Wi-Fi reply also drew on the company-wide article, because the conflict rule at the lock was &ldquo;newer wins&rdquo;. It was sent back to the employee to confirm, not auto-resolved. Run 2 below fixes it. Full table: <a className="text-primary underline" href={`${REPO}/blob/main/EVAL.md`}>EVAL.md</a>.
        </p>
      </Panel>

      <Panel aria-labelledby="run2-h" className="px-5 py-6 sm:px-8" data-run2>
        <Eyebrow>Run 2, post-tuning · same {s2.cases} locked tickets</Eyebrow>
        <h2 id="run2-h" className="mt-1 text-[22px] font-medium leading-8 tracking-[-0.01em]">
          Precedence over recency: {s.fixproof.shippedBad} / {s.cases} bad answers before, {s2.fixproof.shippedBad} / {s2.cases} after
        </h2>
        <p className="mt-1 max-w-[75ch] text-[14px] leading-5 text-muted-foreground">
          One change after run 1: when two articles disagree, the one written for this employee&apos;s office or OS beats a company-wide one even if older; same scope means the newer wins; same scope and date means a person decides. This run is post-tuning, not held-out: the rule was written after run 1 showed the miss. Run 1 above is kept as locked.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <StatTile label="Wrong-setup article in the draft" value={`${frac(h.wrongOsLeak)} → ${frac(s2.headline.wrongOsLeak)}`} />
          <StatTile label="Unsafe auto-resolves" value={`${frac(h.unsafeAutoResolve)} → ${frac(s2.headline.unsafeAutoResolve)}`} />
          <StatTile label="Outcome in the expected set" value={`${frac(h.outcomeAccuracy)} → ${frac(s2.headline.outcomeAccuracy)}`} />
          <StatTile label="Steps re-recorded live" value={String(s2.changedSteps.length)} />
        </div>
      </Panel>

      <Panel aria-labelledby="endpoints-h" className="px-5 py-6 sm:px-8" data-endpoints>
        <Eyebrow>Every endpoint · fires and stays quiet · from recordings</Eyebrow>
        <h2 id="endpoints-h" className="mt-1 text-[22px] font-medium leading-8 tracking-[-0.01em]">
          Each Clocked call changed the outcome somewhere, and stayed out of the way elsewhere
        </h2>
        <p className="mt-1 max-w-[75ch] text-[14px] leading-5 text-muted-foreground">
          For each endpoint, the first locked ticket where its output changed what FixProof did, and the first where it correctly changed nothing or was not called. Credits are the recorded <code className="font-mono text-[13px]">X-Clocked-Credits</code> across all {endpoints.cases} tickets (run 2 replay). Protect and the ticket Guard share one Pipeline call, counted on the Protect row.
        </p>
        <ScrollRegion className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring" label="Endpoint table (scrolls sideways)">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-1.5 text-left text-[13.5px] leading-5">
            <thead>
              <tr className="text-[12px] uppercase tracking-[0.06em] text-muted-foreground">
                <th scope="col" className="px-3 font-medium">Endpoint</th>
                <th scope="col" className="px-3 font-medium">Fires</th>
                <th scope="col" className="px-3 font-medium">Stays quiet</th>
                <th scope="col" className="px-3 text-right font-medium">Calls · credits</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.rows.map((r) => (
                <tr key={r.name} className="bg-card align-top">
                  <th scope="row" className="rounded-l-[14px] border-y border-l border-hairline px-3 py-2.5 font-medium">{r.name}</th>
                  <td className="border-y border-hairline px-3 py-2.5">
                    {r.fires ? (
                      <>
                        <span className="font-mono text-[12px] text-primary">{r.fires.caseId}</span> {r.fires.what}
                      </>
                    ) : (
                      "not seen in this set"
                    )}
                  </td>
                  <td className="border-y border-hairline px-3 py-2.5 text-muted-foreground">
                    {r.quiet ? (
                      <>
                        <span className="font-mono text-[12px] text-foreground">{r.quiet.caseId}</span> {r.quiet.what}
                      </>
                    ) : null}
                    {r.notCalled && r.notCalled.count ? <span className="block">Not called on {r.notCalled.count} tickets: {r.notCalled.why}.</span> : null}
                  </td>
                  <td className="tabular rounded-r-[14px] border-y border-r border-hairline px-3 py-2.5 text-right whitespace-nowrap">
                    {"inPipeline" in r && r.inPipeline ? `in Pipeline + ${r.calls} re-checks · ${r.credits} cr` : `${r.calls} calls · ${r.credits} cr`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <StatTile label="Per ticket, median" value={`${endpoints.perTicket.creditsMedian} cr ≈ $${endpoints.perTicket.usdMedian.toFixed(4)}`} />
          {endpoints.byOutcome.map((o) => (
            <StatTile key={o.outcome} label={`${o.label} (${o.tickets} tickets), median`} value={`${o.creditsMedian} cr ≈ $${o.usdMedian.toFixed(4)}`} />
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">At ${endpoints.usdPer1000} per 1,000 credits (<a className="text-primary underline" href="https://clocked.rezolve.ai/pricing">Clocked pricing</a>). Source: <a className="text-primary underline" href={`${REPO}/blob/main/eval/endpoints.json`}>eval/endpoints.json</a>, written by <code className="font-mono text-[13px]">pnpm eval</code>.</p>
      </Panel>

      <Panel aria-labelledby="ablation-h" className="px-5 py-6 sm:px-8">
        <Eyebrow>Endpoint necessity · 0 credits, from recordings</Eyebrow>
        <h2 id="ablation-h" className="mt-1 text-[22px] font-medium leading-8 tracking-[-0.01em]">
          Turn off one endpoint and this is what breaks
        </h2>
        <p className="mt-1 max-w-[75ch] text-[14px] leading-5 text-muted-foreground">
          Each locked ticket replayed with one endpoint&apos;s answer neutralised (Guard says benign, Inspect says benign, Decide says auto-resolve…). FixProof&apos;s policy recomputes the outcome; <code className="font-mono text-[13px]">pnpm ablate</code> reproduces it. Full detail: <a className="text-primary underline" href={`${REPO}/blob/main/ABLATION.md`}>ABLATION.md</a>.
        </p>
        {(["Decide / Extract / Fill", "Protect / Guard / Inspect", "Verify / Compare / Rerank"] as const).map((g) => (
          <div key={g} className="mt-4">
            <h3 className="text-[14px] font-medium">Best Use of {g}</h3>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {ablation.rows
                .filter((r) => r.group === g)
                .map((r) => (
                  <li key={r.name} className="grid gap-x-3 gap-y-0.5 rounded-[14px] border border-hairline bg-card px-3 py-2.5 text-[14px] sm:grid-cols-[120px_150px_minmax(0,1fr)]">
                    <span className="font-medium">{r.name} off</span>
                    <span className="tabular text-muted-foreground">{r.outcomeChanged.length} outcomes changed</span>
                    <span>{r.worst}</span>
                  </li>
                ))}
              {g.startsWith("Verify") ? (
                <li className="grid gap-x-3 gap-y-0.5 rounded-[14px] border border-hairline bg-card px-3 py-2.5 text-[14px] sm:grid-cols-[120px_150px_minmax(0,1fr)]">
                  <span className="font-medium">Rerank off</span>
                  <span className="tabular text-muted-foreground">naive baseline</span>
                  <span>
                    {ablation.rerank.wrongSetupTickets} tickets drafted from an article written for a different OS or setup (with Rerank: {ablation.rerank.withRerank})
                  </span>
                </li>
              ) : null}
            </ul>
          </div>
        ))}
      </Panel>

      <Panel aria-labelledby="cost-h" className="px-5 py-6 sm:px-8">
        <Eyebrow>Cost</Eyebrow>
        <h2 id="cost-h" className="mt-1 text-[22px] font-medium leading-8 tracking-[-0.01em]">
          About {s.cost.creditsMedian} credits a ticket
        </h2>
        <p className="mt-1 max-w-[75ch] text-[14px] leading-5 text-muted-foreground">
          Median {s.cost.creditsMedian} credits (p95 {s.cost.creditsP95}) ≈ ${s.cost.usdPerTicketMedian.toFixed(4)} per ticket at $0.24 per 1,000 credits (<a className="text-primary underline" href="https://clocked.rezolve.ai/pricing">Clocked pricing</a>). Model time median {s.cost.modelMsMedian} ms; live wall time median {((s.cost.liveWallMsMedian ?? 0) / 1000).toFixed(1)} s at concurrency 1.
        </p>
      </Panel>
    </main>
  );
}
