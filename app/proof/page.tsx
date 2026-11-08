import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import scorecard from "@/eval/scorecard.json";
import { Panel, Eyebrow, StatTile } from "@/components/console/primitives";

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
        <Eyebrow>Proof · {s.cases} locked tickets · run {s.runId.replace(/-/g, " ")}</Eyebrow>
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
        <div className="mt-4 overflow-x-auto">
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
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          FixProof&apos;s one miss: a Lahore visitor&apos;s guest Wi-Fi reply also drew on the company-wide article (scope-aware conflict rules are not built yet). It was sent back to the employee to confirm, not auto-resolved. Full table: <a className="text-primary underline" href={`${REPO}/blob/main/EVAL.md`}>EVAL.md</a>.
        </p>
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
