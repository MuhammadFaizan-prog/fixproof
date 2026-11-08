/**
 * FixProof eval over the locked case set (eval/cases.jsonl, hash in eval/LOCK.txt).
 *
 *   pnpm eval                      # replay both runs from recordings (no key, 0 credits), rebuild the scorecards, check they match
 *   pnpm eval --write              # replay and (re)write eval/results/<run>.json, eval/scorecard*.json and EVAL.md
 *   pnpm eval --live --record      # run 1: live Clocked calls for cases with no recording yet, saved as fixtures (needs a key)
 *        [--max-credits 2300] [--only id,id]
 *   pnpm eval --run 2 --live --record [--max-credits 120]
 *                                  # run 2: live calls only for steps whose request changed since run 1
 *
 * Two runs over the same locked cases and labels:
 *   run-1-pre-tuning   the conflict rule at the lock ("newer" wins). Its fixtures (fixtures/<scenario>/), its
 *                      results file and its EVAL.md section are never rewritten by run 2.
 *   run-2-post-tuning  scope-aware precedence (lib/agent/steps/reconcile.ts). A step whose request equals
 *                      run 1's recording byte for byte replays it; a step whose request changed replays
 *                      fixtures/r2-<scenario>/<step>.json, recorded live for run 2.
 *
 * Each case runs FixProof (runTicket) and the naive baseline (lib/agent/naive.ts),
 * whose draft is scored by Verify against FixProof's kept passages. Metrics
 * come only from recorded Clocked verdicts plus the case labels written before
 * the first live run. Never prints the key or ticket text beyond case ids.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runTicket, type RunResult } from "../lib/agent/run";
import { runNaive, type NaiveResult } from "../lib/agent/naive";
import type { StepEvent } from "../lib/agent/types";
import { createClockedClient } from "../lib/clocked/client";
import { createBudgetTransport } from "../lib/clocked/budget";
import { createFileFixtureStore } from "../lib/clocked/fixture-files";
import { createRecordingTransport, createReplayTransport } from "../lib/clocked/replay";
import { createHttpTransport, type Transport } from "../lib/clocked/transport";
import { getKbIndex } from "../lib/kb/index";
import { getPersona } from "../data/personas";
import { SCENARIOS } from "../data/scenarios";
import { scoreRun, buildScorecard, renderEvalMd, renderRun2Md, type CaseRecord, type EvalCase } from "../lib/eval/score";

const ROOT = process.cwd();
const CASES = path.join(ROOT, "eval/cases.jsonl");
const RUN_ID = "run-1-pre-tuning";
const RUN2_ID = "run-2-post-tuning";
export const r2Scenario = (scenario: string) => `r2-${scenario}`;
const sameRequest = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function loadCases(): Promise<EvalCase[]> {
  const raw = await readFile(CASES, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as EvalCase)
    .map((c) => (c.source === "preset" ? { ...c, text: SCENARIOS.find((s) => s.id === c.id)!.text } : c));
}

function fallthroughTransport(replay: Transport, liveT: Transport, store: ReturnType<typeof createFileFixtureStore>, scenario: string): Transport {
  return {
    kind: "http",
    async send(req) {
      return (await store.get(scenario, req.step)) ? replay.send(req) : liveT.send(req);
    },
  };
}

/**
 * Run 2's transport. A step replays run 1's recording only when today's request
 * equals the recorded one byte for byte; otherwise it replays its run-2
 * recording (whose request must match too) or, when live, goes live and is
 * saved under r2-<scenario>. Anything else is reported as drift.
 */
function run2Transport(store: ReturnType<typeof createFileFixtureStore>, scenario: string, liveT: Transport | null, drift: string[]): Transport {
  const base = createReplayTransport({ store, scenario });
  const r2 = createReplayTransport({ store, scenario: r2Scenario(scenario) });
  return {
    kind: liveT ? "http" : "replay",
    async send(req) {
      const f2 = await store.get(r2Scenario(scenario), req.step);
      if (f2) {
        if (!sameRequest(f2.request, req.body)) drift.push(`${r2Scenario(scenario)}/${req.step}`);
        return r2.send(req);
      }
      const f1 = await store.get(scenario, req.step);
      if (f1 && sameRequest(f1.request, req.body)) return base.send(req);
      if (liveT) return liveT.send(req);
      drift.push(`${scenario}/${req.step}${f1 ? " (request changed since run 1)" : " (no recording)"}`);
      return base.send(req);
    },
  };
}

export const fixtureScenario = (c: Pick<EvalCase, "id" | "source">) => (c.source === "preset" ? c.id : `eval-${c.id}`);

async function main() {
  const args = process.argv.slice(2);
  const which = args.includes("--run") ? args[args.indexOf("--run") + 1] : "all";
  const record = args.includes("--record");
  const live = record || args.includes("--live");
  const write = args.includes("--write") || record;
  const maxCredits = Number(args[args.indexOf("--max-credits") + 1]) || (which === "2" ? 120 : 2300);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
  const apiKey = process.env.CLOCKED_API_KEY;
  if (live && !apiKey) throw new Error("--live needs CLOCKED_API_KEY");

  const lock = await readFile(path.join(ROOT, "eval/LOCK.txt"), "utf8");
  const digest = createHash("sha256").update(await readFile(CASES)).digest("hex");
  if (!lock.includes(digest)) throw new Error(`eval/cases.jsonl does not match eval/LOCK.txt (sha256 ${digest}); the locked set was edited`);

  const cases = await loadCases();
  const store = createFileFixtureStore(path.join(ROOT, "fixtures"));
  const index = getKbIndex();
  const meters: { spent(): number }[] = [];
  const liveSpent = () => meters.reduce((n, m) => n + m.spent(), 0);
  const httpMeter = () => {
    const http = createBudgetTransport(createHttpTransport({ apiKey: apiKey as string, baseUrl: process.env.CLOCKED_BASE_URL || undefined }), Number.MAX_SAFE_INTEGER);
    meters.push(http);
    return http;
  };

  // ---------- Run 1 (locked rule: newer wins) ----------
  const records: CaseRecord[] = [];
  // What the UI's "Without FixProof" card shows for each preset: the naive reply with Verify's verdict per sentence.
  const naivePresets: Record<string, unknown> = {};
  const run1Live = live && which !== "2";

  for (const c of cases) {
    if (only && !only.includes(c.id)) continue;
    const persona = getPersona(c.personaId);
    if (!persona) throw new Error(`unknown persona ${c.personaId}`);
    const scenario = fixtureScenario(c);
    const hasRecording = existsSync(path.join(ROOT, "fixtures", scenario, "naive-draft.json"));
    let transport: Transport;
    let liveNow = false;
    if (run1Live && !hasRecording) {
      if (liveSpent() >= maxCredits) {
        console.log(`STOP: ${liveSpent()} live credits spent, cap ${maxCredits}`);
        break;
      }
      const http = httpMeter();
      transport = fallthroughTransport(createReplayTransport({ store, scenario }), record ? createRecordingTransport({ inner: http, store, scenario }) : http, store, scenario);
      liveNow = true;
    } else {
      transport = createReplayTransport({ store, scenario });
    }
    const client = createClockedClient({ transport, concurrency: 1, sleep: liveNow ? undefined : async () => {} });
    const events: StepEvent[] = [];
    const t0 = Date.now();
    const r: RunResult = await runTicket({ client, persona, emit: (e) => e.status !== "running" && events.push(e), conflictRule: "newer" }, { text: c.text!, index });
    const judge = r.reconcile?.used ?? r.retrieve?.used ?? [];
    let naive: NaiveResult | null = null;
    try {
      naive = await runNaive(client, persona, index, c.text!, judge);
    } catch (err) {
      console.log(`  naive baseline failed for ${c.id}: ${(err as Error).message}`);
    }
    const wallMs = Date.now() - t0;
    const rec = scoreRun(c, r, events, naive);
    if (c.source === "preset" && naive && rec.naive) {
      naivePresets[c.id] = {
        reply: naive.reply,
        sentences: naive.claims ?? [],
        sources: naive.sources.map((x) => ({ id: x.id, title: x.title, section: x.section })),
        script: naive.script ? { ...naive.script, blockedByInspect: rec.naive.scriptShown?.flaggedByInspect ?? null } : null,
        wrongSetup: rec.naive.wrongOs,
        injectionPassed: rec.naive.injectionUnscreened,
        personalData: rec.naive.piiExposed,
        problems: rec.naive.bad,
        credits: naive.credits,
      };
    }
    // Wall time only for held-out cases, whose whole run was live (a preset's FixProof run replays; only its naive baseline went live).
    if (liveNow && c.source !== "preset") rec.liveWallMs = wallMs;
    records.push(rec);
    if (which !== "2") console.log(`${rec.ok ? "✓" : "✗"} ${c.id.padEnd(22)} ${rec.outcome.padEnd(18)} expected ${c.labels.outcomes.join("|").padEnd(36)} ${rec.credits}cr fixproof + ${rec.naive?.credits ?? 0}cr naive${liveNow ? " (live)" : ""}`);
  }

  const runFile = path.join(ROOT, "eval/results", `${RUN_ID}.json`);
  // Live wall-clock times are only known when a case was recorded; keep them from the first write.
  if (existsSync(runFile)) {
    const prev = JSON.parse(await readFile(runFile, "utf8")) as { cases: CaseRecord[] };
    for (const rec of records) rec.liveWallMs ??= prev.cases.find((p) => p.id === rec.id)?.liveWallMs ?? null;
  }
  const scorecard = buildScorecard(records, { runId: RUN_ID, lockDigest: digest });
  const notes = await readFile(path.join(ROOT, "eval/NOTES.md"), "utf8").catch(() => "");
  const md1 = renderEvalMd(scorecard, records, notes);

  // ---------- Run 2 (scope-aware precedence) ----------
  const records2: CaseRecord[] = [];
  const drift: string[] = [];
  const changedSteps: string[] = [];
  for (const c of cases) {
    if (only && !only.includes(c.id)) continue;
    const persona = getPersona(c.personaId)!;
    const scenario = fixtureScenario(c);
    let liveT: Transport | null = null;
    if (live && which !== "1") {
      if (liveSpent() >= maxCredits) {
        console.log(`STOP: ${liveSpent()} live credits spent, cap ${maxCredits}`);
        break;
      }
      const http = httpMeter();
      liveT = record ? createRecordingTransport({ inner: http, store, scenario: r2Scenario(scenario) }) : http;
    }
    const inner = run2Transport(store, scenario, liveT, drift);
    const transport: Transport = {
      kind: inner.kind,
      async send(req) {
        const f1 = await store.get(scenario, req.step);
        if (!f1 || !sameRequest(f1.request, req.body)) changedSteps.push(`${c.id}/${req.step}`);
        return inner.send(req);
      },
    };
    const client = createClockedClient({ transport, concurrency: 1, sleep: liveT ? undefined : async () => {} });
    const events: StepEvent[] = [];
    const r: RunResult = await runTicket({ client, persona, emit: (e) => e.status !== "running" && events.push(e), conflictRule: "scope" }, { text: c.text!, index });
    const judge = r.reconcile?.used ?? r.retrieve?.used ?? [];
    let naive: NaiveResult | null = null;
    try {
      naive = await runNaive(client, persona, index, c.text!, judge);
    } catch (err) {
      console.log(`  naive baseline failed for ${c.id} (run 2): ${(err as Error).message}`);
    }
    const rec = scoreRun(c, r, events, naive);
    records2.push(rec);
    if (which === "2") console.log(`${rec.ok && !rec.fixproofBad.length ? "✓" : "✗"} ${c.id.padEnd(22)} ${rec.outcome.padEnd(18)} ${rec.credits}cr${rec.fixproofBad.length ? ` BAD: ${rec.fixproofBad.join("; ")}` : ""}`);
  }
  if (live) console.log(`\nLive credits this run: ${liveSpent()}`);
  if (drift.length) {
    console.log(`\nRun 2 replay drift (re-record with --run 2 --live --record): ${[...new Set(drift)].join(", ")}`);
    process.exitCode = 1;
  }
  const scorecard2 = { ...buildScorecard(records2, { runId: RUN2_ID, lockDigest: digest }), changedSteps: [...new Set(changedSteps)] };
  const notes2 = await readFile(path.join(ROOT, "eval/NOTES-run-2.md"), "utf8").catch(() => "");
  const md = md1 + renderRun2Md(scorecard2, records2, scorecard, records, notes2);

  const runJson = `${JSON.stringify({ runId: RUN_ID, lockDigest: digest, cases: records }, null, 2)}\n`;
  const run2Json = `${JSON.stringify({ runId: RUN2_ID, lockDigest: digest, changedSteps: scorecard2.changedSteps, cases: records2 }, null, 2)}\n`;
  const cardJson = `${JSON.stringify(scorecard, null, 2)}\n`;
  const card2Json = `${JSON.stringify(scorecard2, null, 2)}\n`;
  const naiveJson = `${JSON.stringify({ note: "Simulated naive Tier-0 bot, not FixProof. Generated by pnpm eval from recorded Clocked responses.", runId: RUN_ID, presets: naivePresets }, null, 2)}\n`;
  const NAIVE_FILE = path.join(ROOT, "data/naive-presets.json");
  const RUN2_FILE = path.join(ROOT, "eval/results", `${RUN2_ID}.json`);
  const CARD2_FILE = path.join(ROOT, "eval/scorecard-run-2.json");
  if (only) return;
  if (write) {
    await mkdir(path.dirname(runFile), { recursive: true });
    // Run 1's results file is frozen once written; only a run-1 live recording may rewrite it.
    if (which !== "2" || !existsSync(runFile)) await writeFile(runFile, runJson);
    await writeFile(path.join(ROOT, "eval/scorecard.json"), cardJson);
    await writeFile(RUN2_FILE, run2Json);
    await writeFile(CARD2_FILE, card2Json);
    await writeFile(path.join(ROOT, "EVAL.md"), md);
    await writeFile(NAIVE_FILE, naiveJson);
    console.log("wrote eval/results, eval/scorecard.json, eval/scorecard-run-2.json, EVAL.md");
  } else {
    const read = (f: string) => readFile(f, "utf8").catch(() => "");
    const checks: [string, string, string][] = [
      ["EVAL.md", path.join(ROOT, "EVAL.md"), md],
      ["eval/scorecard.json", path.join(ROOT, "eval/scorecard.json"), cardJson],
      ["eval/scorecard-run-2.json", CARD2_FILE, card2Json],
      ["data/naive-presets.json", NAIVE_FILE, naiveJson],
      [`eval/results/${RUN_ID}.json`, runFile, runJson],
      [`eval/results/${RUN2_ID}.json`, RUN2_FILE, run2Json],
    ];
    const bad: string[] = [];
    for (const [name, f, want] of checks) if ((await read(f)) !== want) bad.push(name);
    console.log(!bad.length ? "\nReplay reproduces EVAL.md, both scorecards and both results files byte for byte." : `\nMISMATCH: replay differs from the committed ${bad.join(", ")}`);
    if (bad.length) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
