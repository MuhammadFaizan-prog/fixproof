/**
 * Endpoint necessity (ablation) from recordings, 0 credits, no key.
 *
 *   pnpm ablate            # replay, check ABLATION.md and eval/ablation.json byte for byte
 *   pnpm ablate --write    # replay and rewrite them
 *
 * For each Clocked endpoint, every locked eval case is replayed from its
 * recorded responses with that endpoint's answer neutralised (Guard says
 * benign, Inspect says benign, Verify says every sentence is supported, Compare
 * finds no conflict, Decide says auto-resolve, Protect finds nothing, Extract
 * finds nothing, Fill drafts nothing). FixProof's own policy then recomputes
 * the outcome, and the eval scorer counts what would have shipped. Steps after
 * the neutralised one replay their recorded answers (which were given to the
 * un-ablated inputs), so this measures what each gate stops, not a fresh run.
 * Rerank has no neutral answer that keeps the pipeline meaningful, so its row
 * comes from the naive baseline in the locked eval (keyword top 3, no Rerank).
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runTicket } from "../lib/agent/run";
import type { StepEvent } from "../lib/agent/types";
import { createClockedClient } from "../lib/clocked/client";
import { createFileFixtureStore } from "../lib/clocked/fixture-files";
import { createReplayTransport } from "../lib/clocked/replay";
import type { Transport } from "../lib/clocked/transport";
import { getKbIndex } from "../lib/kb/index";
import { getPersona } from "../data/personas";
import { SCENARIOS } from "../data/scenarios";
import { scoreRun, type CaseRecord, type EvalCase } from "../lib/eval/score";

const ROOT = process.cwd();
type Json = Record<string, unknown> & { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const benignInjection = (r: Json): Json => ({ ...r, injection: 0, verdict: "benign", category: "benign", severity: "none", evidence: [], residual: null });

interface Ablation {
  endpoint: string;
  name: string;
  group: "Decide / Extract / Fill" | "Protect / Guard / Inspect" | "Verify / Compare / Rerank";
  neutral: string;
  mutate: (endpoint: string, step: string, json: Json, req: Json) => Json;
}

const ABLATIONS: Ablation[] = [
  {
    endpoint: "decide",
    name: "Decide",
    group: "Decide / Extract / Fill",
    neutral: "every ticket is safe to auto-resolve",
    mutate: (e, _s, j) =>
      e !== "decide"
        ? j
        : { ...j, answers: { ...j.answers, policy: { ...j.answers.policy, choice: "auto_resolve", probabilities: { auto_resolve: 1, suggest: 0, escalate: 0 }, confidence: 1 }, self_service_safe: { ...j.answers.self_service_safe, noul: 1, decision: true } } },
  },
  {
    endpoint: "extract",
    name: "Extract",
    group: "Decide / Extract / Fill",
    neutral: "no error code, asset tag, app, device or deadline found",
    mutate: (e, _s, j) => (e !== "extract" ? j : { ...j, fields: Object.fromEntries(Object.entries(j.fields ?? {}).map(([k]) => [k, { value: null, confidence: 0 }])) }),
  },
  {
    endpoint: "fill",
    name: "Fill",
    group: "Decide / Extract / Fill",
    neutral: "no ticket record, no drafted reply, no handoff summary",
    mutate: (e, _s, j) => (e !== "fill" ? j : { ...j, fields: Object.fromEntries(Object.entries(j.fields ?? {}).map(([k]) => [k, { value: null, confidence: 0 }])) }),
  },
  {
    endpoint: "pii",
    name: "Protect",
    group: "Protect / Guard / Inspect",
    neutral: "no personal data found",
    mutate: (e, _s, j, req) => {
      if (e !== "pipeline") return j;
      return { ...j, steps: j.steps.map((st: Json) => (st.endpoint === "pii" && st.result ? { ...st, result: { ...st.result, entities: [], counts: {}, anonymized_text: req.text } } : st)) };
    },
  },
  {
    endpoint: "injection",
    name: "Guard",
    group: "Protect / Guard / Inspect",
    neutral: "the ticket and every KB section read as benign",
    mutate: (e, _s, j) => {
      if (e === "injection") return benignInjection(j);
      if (e === "pipeline") return { ...j, stopped: null, steps: j.steps.map((st: Json) => (st.endpoint === "injection" && st.result ? { ...st, result: benignInjection(st.result) } : st)) };
      return j;
    },
  },
  {
    endpoint: "script",
    name: "Inspect",
    group: "Protect / Guard / Inspect",
    neutral: "every fix script reads as benign administration",
    mutate: (e, _s, j) => (e !== "script" ? j : { ...j, verdict: "benign", malicious: 0, suspicious: 0, category: "benign administration", evidence: [], findings: [] }),
  },
  {
    endpoint: "grounding",
    name: "Verify",
    group: "Verify / Compare / Rerank",
    neutral: "every drafted sentence is supported",
    mutate: (e, _s, j) =>
      e !== "grounding"
        ? j
        : {
            ...j,
            grounded: 1,
            ungrounded: 0,
            verdict: "grounded",
            claims: (j.claims ?? []).map((c: Json) => (c.verdict === "not_a_claim" ? c : { ...c, verdict: "supported", supported: 1, contradicted: 0, not_stated: 0 })),
          },
  },
  {
    endpoint: "compare",
    name: "Compare",
    group: "Verify / Compare / Rerank",
    neutral: "no two passages conflict",
    mutate: (e, _s, j) =>
      e !== "compare"
        ? j
        : {
            ...j,
            verdict: "consistent",
            documents: (j.documents ?? []).map((d: Json) => ({ ...d, conflicts: [] })),
            pairs: (j.pairs ?? []).map((p: Json) => (p.relation === "conflicting" ? { ...p, relation: "overlapping", conflicts: [] } : p)),
          },
  },
];

async function loadCases(): Promise<EvalCase[]> {
  const raw = await readFile(path.join(ROOT, "eval/cases.jsonl"), "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as EvalCase)
    .map((c) => (c.source === "preset" ? { ...c, text: SCENARIOS.find((s) => s.id === c.id)!.text } : c));
}

const scenarioOf = (c: EvalCase) => (c.source === "preset" ? c.id : `eval-${c.id}`);

async function runCase(c: EvalCase, a: Ablation | null): Promise<CaseRecord & { missingStep: string | null }> {
  const store = createFileFixtureStore(path.join(ROOT, "fixtures"));
  const replay = createReplayTransport({ store, scenario: scenarioOf(c) });
  let missingStep: string | null = null;
  const transport: Transport = {
    kind: "replay",
    async send(req) {
      const fx = await store.get(scenarioOf(c), req.step);
      if (!fx) missingStep ??= req.step;
      const res = await replay.send(req);
      return a ? { ...res, json: a.mutate(req.endpoint, req.step, res.json as Json, req.body as Json) } : res;
    },
  };
  const client = createClockedClient({ transport, concurrency: 1, sleep: async () => {} });
  const events: StepEvent[] = [];
  const r = await runTicket({ client, persona: getPersona(c.personaId)!, emit: (e) => e.status !== "running" && events.push(e) }, { text: c.text!, index: getKbIndex() });
  const rec = scoreRun(c, r, events, null);
  const extracted = r.understand ? Object.values(r.understand.extracted ?? {}).filter((v) => v !== null && !(Array.isArray(v) && !v.length)).length : 0;
  return Object.assign(rec, { missingStep, extracted, piiMasked: r.screen?.pii.length ?? 0, hasReply: Boolean(r.prove?.reply), routed: r.handoff?.assignmentGroup ?? null }) as CaseRecord & { missingStep: string | null };
}

interface Row {
  endpoint: string;
  name: string;
  group: string;
  neutral: string;
  outcomeChanged: string[];
  newlyUnsafe: string[];
  newlyBad: { id: string; what: string }[];
  presentation: string[];
  unrecordedPath: string[];
}

async function main() {
  const write = process.argv.includes("--write");
  const cases = await loadCases();
  const base = new Map<string, Awaited<ReturnType<typeof runCase>>>();
  for (const c of cases) base.set(c.id, await runCase(c, null));
  const rows: Row[] = [];
  for (const a of ABLATIONS) {
    const row: Row = { endpoint: a.endpoint, name: a.name, group: a.group, neutral: a.neutral, outcomeChanged: [], newlyUnsafe: [], newlyBad: [], presentation: [], unrecordedPath: [] };
    for (const c of cases) {
      const b = base.get(c.id)! as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const x = (await runCase(c, a)) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (x.missingStep) {
        // The ablated run asked for a step that was never recorded, so its outcome is a replay artefact, not a measurement.
        row.unrecordedPath.push(`${c.id} (${x.missingStep})`);
        continue;
      }
      if (x.outcome !== b.outcome) row.outcomeChanged.push(`${c.id}: ${b.outcome} → ${x.outcome}`);
      if (x.unsafeAuto && !b.unsafeAuto) row.newlyUnsafe.push(c.id);
      const newBad = (x.fixproofBad as string[]).filter((w) => !(b.fixproofBad as string[]).includes(w));
      for (const w of newBad) row.newlyBad.push({ id: c.id, what: a.name === "Compare" ? w.replace("(wrong setup)", "(the older, superseded article)") : w });
      if (a.name === "Verify" && b.sentencesRemoved > x.sentencesRemoved) row.newlyBad.push({ id: c.id, what: `${b.sentencesRemoved - x.sentencesRemoved} sentence(s) Verify removed would be sent` });
      if (a.name === "Protect" && b.piiMasked > x.piiMasked) row.presentation.push(`${c.id}: ${b.piiMasked} personal-data item(s) reach every later call and the logs unmasked`);
      if (a.name === "Extract" && b.extracted > x.extracted) row.presentation.push(`${c.id}: the ticket record and handoff lose ${b.extracted} extracted value(s)`);
      if (a.name === "Fill" && b.hasReply && !x.hasReply) row.presentation.push(`${c.id}: no reply for the employee`);
    }
    rows.push(row);
  }

  const card = JSON.parse(await readFile(path.join(ROOT, "eval/scorecard.json"), "utf8"));
  const digest = createHash("sha256").update(await readFile(path.join(ROOT, "eval/cases.jsonl"))).digest("hex");
  const json = `${JSON.stringify({ lockDigest: digest, cases: cases.length, rows: rows.map((r) => ({ ...r, worst: worst(r) })), rerank: { fromNaiveBaseline: true, wrongSetupTickets: card.naive.wrongSetupArticleUsed, withRerank: card.headline.wrongOsLeak.n } }, null, 2)}\n`;
  const md = render(rows, cases.length, card);
  const mdPath = path.join(ROOT, "ABLATION.md");
  const jsonPath = path.join(ROOT, "eval/ablation.json");
  for (const r of rows) console.log(`${r.name.padEnd(8)} outcome changed ${r.outcomeChanged.length}, newly unsafe auto ${r.newlyUnsafe.length}, newly bad ${r.newlyBad.length}, presentation ${r.presentation.length}, unrecorded ${r.unrecordedPath.length}`);
  if (write) {
    await writeFile(mdPath, md);
    await writeFile(jsonPath, json);
    console.log("wrote ABLATION.md, eval/ablation.json");
  } else {
    const same = (await readFile(mdPath, "utf8").catch(() => "")) === md && (await readFile(jsonPath, "utf8").catch(() => "")) === json;
    console.log(same ? "Replay reproduces ABLATION.md and eval/ablation.json byte for byte." : "MISMATCH: ablation differs from the committed files");
    if (!same) process.exitCode = 1;
  }
}

function worst(r: Row): string {
  const pick = (re: RegExp) => r.newlyBad.find((b) => re.test(b.what));
  const script = pick(/script/);
  if (script) return `${script.id} offers a fix script that turns off antivirus`;
  if (r.newlyUnsafe.length) return `${r.newlyUnsafe.length} ticket(s) that need a person or a question auto-resolve (e.g. ${r.newlyUnsafe[0]})`;
  const inj = pick(/injected/);
  if (inj) return `${inj.id}: the injected instruction reaches every later step`;
  const poison = pick(/poisoned/);
  if (poison) return `${poison.id}: the poisoned KB section reaches the draft`;
  const bait = pick(/repeats/);
  if (bait) return `${bait.id}: ${bait.what}`;
  const uns = pick(/Verify/);
  if (uns) return `${uns.id}: ${uns.what}`;
  if (r.newlyBad.length) return `${r.newlyBad[0].id}: ${r.newlyBad[0].what}`;
  if (r.name === "Fill" && r.outcomeChanged.length) return `${r.outcomeChanged.length} tickets get no drafted reply and go to a person instead of being resolved or confirmed`;
  if (r.outcomeChanged.length) return r.outcomeChanged[0];
  if (r.presentation.length) return `${r.name === "Protect" ? "privacy" : "presentation only"}: ${r.presentation[0]}`;
  return "no change on these 32 tickets";
}

function render(rows: Row[], n: number, card: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const L: string[] = [];
  L.push("# ABLATION: what breaks without each Clocked endpoint", "");
  L.push(`All ${n} locked eval cases ([eval/cases.jsonl](eval/cases.jsonl)) replayed from their recordings with one endpoint's answer neutralised at a time. **0 credits, no key**: \`pnpm ablate\` reproduces this file byte for byte. Generated by [\`scripts/ablate.ts\`](scripts/ablate.ts); outcomes come from FixProof's own policy, harms from the eval scorer ([\`lib/eval/score.ts\`](lib/eval/score.ts)).`, "");
  L.push("Method note: steps after the neutralised one replay the answers they gave on the real inputs, so this measures what each gate stops on these tickets; it is not a fresh live run without the endpoint.", "");
  for (const g of ["Decide / Extract / Fill", "Protect / Guard / Inspect", "Verify / Compare / Rerank"]) {
    L.push(`## Best Use of ${g}`, "");
    L.push("| Endpoint off (answer neutralised to…) | Outcomes changed | New unsafe auto-resolves | Other effects (harms that would ship, or fields lost) | Worst consequence |", "|---|---|---|---|---|");
    for (const r of rows.filter((x) => x.group === g)) {
      L.push(`| **${r.name}** (${r.neutral}) | ${r.outcomeChanged.length} / ${n - r.unrecordedPath.length} | ${r.newlyUnsafe.length} | ${r.newlyBad.length + r.presentation.length} | ${worst(r)} |`);
    }
    if (g === "Verify / Compare / Rerank") {
      L.push(`| **Rerank** (no Rerank: keyword top 3, from the naive baseline in the locked eval) | see EVAL.md | n/a | ${card.naive.wrongSetupArticleUsed} tickets drafted from an article written for a different OS or setup (with Rerank: ${card.headline.wrongOsLeak.n}) | a Windows or Linux fix sent to a Mac user |`);
    }
    L.push("");
  }
  L.push("## Detail", "");
  for (const r of rows) {
    L.push(`### ${r.name} off`, "");
    L.push(`- Outcomes changed: ${r.outcomeChanged.length ? r.outcomeChanged.map((x) => `\`${x}\``).join(", ") : "none"}`);
    L.push(`- Harms that would ship: ${r.newlyBad.length ? r.newlyBad.map((b) => `\`${b.id}\` ${b.what}`).join("; ") : "none"}`);
    if (r.presentation.length) L.push(`- Lost from what the employee or technician sees: ${r.presentation.join("; ")}`);
    if (r.unrecordedPath.length) L.push(`- Not measurable from recordings (the ablated run asked for a step that was never recorded, so it is left out of the counts): ${r.unrecordedPath.join(", ")}`);
    L.push("");
  }
  return `${L.join("\n")}\n`;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
