/**
 * Run preset tickets end to end from the command line.
 *
 *   pnpm scenario vpn-macos            # replay recorded fixtures (no key, no credits)
 *   pnpm scenario all                  # every preset, replay
 *   pnpm scenario vpn-macos --live     # live Clocked calls (needs CLOCKED_API_KEY)
 *   pnpm scenario all --record         # live, and save every response as fixtures/<id>/*.json
 *
 * Prints each Proof Trail row, the outcome, and whether it matches the
 * preset's expectation. Never prints the key; ticket text stays local.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { runTicket } from "../lib/agent/run";
import type { StepEvent } from "../lib/agent/types";
import { createClockedClient } from "../lib/clocked/client";
import { createFileFixtureStore } from "../lib/clocked/fixture-files";
import { createRecordingTransport, createReplayTransport } from "../lib/clocked/replay";
import { createHttpTransport, type Transport } from "../lib/clocked/transport";
import { getKbIndex } from "../lib/kb/index";
import { getPersona } from "../data/personas";
import { SCENARIOS } from "../data/scenarios";

async function main() {
  const args = process.argv.slice(2);
  const record = args.includes("--record");
  const live = record || args.includes("--live");
  const ids = args.filter((a) => !a.startsWith("--"));
  const scenarios = ids.includes("all") || !ids.length ? SCENARIOS : SCENARIOS.filter((s) => ids.includes(s.id));
  if (!scenarios.length) throw new Error(`unknown scenario: ${ids.join(", ")}`);
  const apiKey = process.env.CLOCKED_API_KEY;
  if (live && !apiKey) throw new Error("--live and --record need CLOCKED_API_KEY");

  const root = path.join(process.cwd(), "fixtures");
  const store = createFileFixtureStore(root);
  const index = getKbIndex();
  let total = 0;
  let mismatches = 0;

  for (const s of scenarios) {
    const persona = getPersona(s.personaId);
    if (!persona) throw new Error(`unknown persona ${s.personaId}`);
    let transport: Transport;
    if (live) {
      const http = createHttpTransport({ apiKey: apiKey as string, baseUrl: process.env.CLOCKED_BASE_URL || undefined });
      if (record) await rm(path.join(root, s.id), { recursive: true, force: true });
      transport = record ? createRecordingTransport({ inner: http, store, scenario: s.id }) : http;
    } else {
      transport = createReplayTransport({ store, scenario: s.id });
    }
    const client = createClockedClient({ transport, concurrency: Number(process.env.CLOCKED_CONCURRENCY ?? 1), sleep: live ? undefined : async () => {} });
    console.log(`\n== ${s.id} · ${s.title} · ${persona.name} (${persona.osLabel}) · ${live ? (record ? "live, recording" : "live") : "replay"}`);
    const emit = (e: StepEvent) => {
      if (e.status === "running") return;
      const credits = e.meta?.credits != null ? ` ${e.meta.credits}cr` : "";
      const prob = e.probability != null ? ` ${e.probabilityLabel ?? "p"}=${e.probability.toFixed(2)}` : "";
      console.log(`  ${e.status === "error" ? "✗" : e.status === "skipped" ? "–" : "✓"} ${e.id.padEnd(34)} ${(e.verdict ?? "").padEnd(16)}${prob}${credits}\n      ${e.effect}${e.error ? ` [${e.error.kind}]` : ""}`);
    };
    const result = await runTicket({ client, persona, emit }, { text: s.text, index });
    const expected = Array.isArray(s.expects.outcome) ? s.expects.outcome : [s.expects.outcome];
    const ok = expected.includes(result.outcome.outcome);
    if (!ok) mismatches++;
    total += result.credits;
    console.log(`  => ${result.outcome.outcome} (${ok ? "matches" : `EXPECTED ${expected.join(" | ")}`}) · ${result.calls} calls · ${result.credits} credits`);
    if (result.prove) console.log(`  reply:\n    ${result.prove.reply.split("\n").join("\n    ")}`);
    if (result.handoff) console.log(`  handoff: ${result.handoff.assignmentGroup} ${result.handoff.priority} · ${result.handoff.summary}`);
  }
  console.log(`\n${scenarios.length} scenario(s), ${total} credits, ${mismatches} mismatch(es)`);
  if (mismatches) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
