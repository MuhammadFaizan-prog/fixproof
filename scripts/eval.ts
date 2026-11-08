/**
 * FixProof eval over the locked case set (eval/cases.jsonl, hash in eval/LOCK.txt).
 *
 *   pnpm eval                      # replay every case from recordings (no key, 0 credits), rebuild the scorecard, check it matches
 *   pnpm eval --write              # replay and (re)write eval/results/<run>.json, eval/scorecard.json and EVAL.md
 *   pnpm eval --live --record      # live Clocked calls for cases with no recording yet, saved as fixtures (needs a key)
 *        [--max-credits 2300] [--only id,id]
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
import { scoreRun, buildScorecard, renderEvalMd, type CaseRecord, type EvalCase } from "../lib/eval/score";

const ROOT = process.cwd();
const CASES = path.join(ROOT, "eval/cases.jsonl");
const RUN_ID = "run-1-pre-tuning";

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

export const fixtureScenario = (c: Pick<EvalCase, "id" | "source">) => (c.source === "preset" ? c.id : `eval-${c.id}`);

async function main() {
  const args = process.argv.slice(2);
  const record = args.includes("--record");
  const live = record || args.includes("--live");
  const write = args.includes("--write") || record;
  const maxCredits = Number(args[args.indexOf("--max-credits") + 1]) || 2300;
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
  const apiKey = process.env.CLOCKED_API_KEY;
  if (live && !apiKey) throw new Error("--live needs CLOCKED_API_KEY");

  const lock = await readFile(path.join(ROOT, "eval/LOCK.txt"), "utf8");
  const digest = createHash("sha256").update(await readFile(CASES)).digest("hex");
  if (!lock.includes(digest)) throw new Error(`eval/cases.jsonl does not match eval/LOCK.txt (sha256 ${digest}); the locked set was edited`);

  const cases = await loadCases();
  const store = createFileFixtureStore(path.join(ROOT, "fixtures"));
  const index = getKbIndex();
  const records: CaseRecord[] = [];
  // Live spend is metered on the wire (X-Clocked-Credits of live answers only; replayed steps cost nothing).
  const meters: { spent(): number }[] = [];
  const liveSpent = () => meters.reduce((n, m) => n + m.spent(), 0);

  for (const c of cases) {
    if (only && !only.includes(c.id)) continue;
    const persona = getPersona(c.personaId);
    if (!persona) throw new Error(`unknown persona ${c.personaId}`);
    const scenario = fixtureScenario(c);
    const hasRecording = existsSync(path.join(ROOT, "fixtures", scenario, "naive-draft.json"));
    let transport: Transport;
    let liveNow = false;
    if (live && !hasRecording) {
      if (liveSpent() >= maxCredits) {
        console.log(`STOP: ${liveSpent()} live credits spent, cap ${maxCredits}`);
        break;
      }
      const http = createBudgetTransport(createHttpTransport({ apiKey: apiKey as string, baseUrl: process.env.CLOCKED_BASE_URL || undefined }), Number.MAX_SAFE_INTEGER);
      meters.push(http);
      // Steps already recorded (e.g. the presets' FixProof run) replay; only missing steps go live and are saved.
      transport = fallthroughTransport(createReplayTransport({ store, scenario }), record ? createRecordingTransport({ inner: http, store, scenario }) : http, store, scenario);
      liveNow = true;
    } else {
      transport = createReplayTransport({ store, scenario });
    }
    const client = createClockedClient({ transport, concurrency: 1, sleep: liveNow ? undefined : async () => {} });
    const events: StepEvent[] = [];
    const t0 = Date.now();
    const r: RunResult = await runTicket({ client, persona, emit: (e) => e.status !== "running" && events.push(e) }, { text: c.text!, index });
    const judge = r.reconcile?.used ?? r.retrieve?.used ?? [];
    let naive: NaiveResult | null = null;
    try {
      naive = await runNaive(client, persona, index, c.text!, judge);
    } catch (err) {
      console.log(`  naive baseline failed for ${c.id}: ${(err as Error).message}`);
    }
    const wallMs = Date.now() - t0;
    const rec = scoreRun(c, r, events, naive);
    if (liveNow) rec.liveWallMs = wallMs;
    records.push(rec);
    console.log(`${rec.ok ? "✓" : "✗"} ${c.id.padEnd(22)} ${rec.outcome.padEnd(18)} expected ${c.labels.outcomes.join("|").padEnd(36)} ${rec.credits}cr fixproof + ${rec.naive?.credits ?? 0}cr naive${liveNow ? " (live)" : ""}`);
  }
  if (live) console.log(`\nLive credits this run: ${liveSpent()}`);

  const runFile = path.join(ROOT, "eval/results", `${RUN_ID}.json`);
  // Live wall-clock times are only known when a case was recorded; keep them from the first write.
  if (existsSync(runFile)) {
    const prev = JSON.parse(await readFile(runFile, "utf8")) as { cases: CaseRecord[] };
    for (const rec of records) rec.liveWallMs ??= prev.cases.find((p) => p.id === rec.id)?.liveWallMs ?? null;
  }
  const scorecard = buildScorecard(records, { runId: RUN_ID, lockDigest: digest });
  const notes = await readFile(path.join(ROOT, "eval/NOTES.md"), "utf8").catch(() => "");
  const md = renderEvalMd(scorecard, records, notes);
  const runJson = `${JSON.stringify({ runId: RUN_ID, lockDigest: digest, cases: records }, null, 2)}\n`;
  const cardJson = `${JSON.stringify(scorecard, null, 2)}\n`;
  if (only) return;
  if (write) {
    await mkdir(path.dirname(runFile), { recursive: true });
    await writeFile(runFile, runJson);
    await writeFile(path.join(ROOT, "eval/scorecard.json"), cardJson);
    await writeFile(path.join(ROOT, "EVAL.md"), md);
    console.log("wrote eval/results, eval/scorecard.json, EVAL.md");
  } else {
    const same = (await readFile(path.join(ROOT, "EVAL.md"), "utf8").catch(() => "")) === md && (await readFile(path.join(ROOT, "eval/scorecard.json"), "utf8").catch(() => "")) === cardJson;
    console.log(same ? "\nReplay reproduces EVAL.md and eval/scorecard.json byte for byte." : "\nMISMATCH: replay differs from the committed EVAL.md / scorecard.json");
    if (!same) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
