/**
 * Re-record one step of a preset live while every other step replays its
 * fixture. Use it when only one request changed (for example the handoff
 * wording), so a single call is spent instead of a whole run.
 *
 *   pnpm tsx scripts/rerecord-step.ts tampered-printer handoff
 *
 * Needs CLOCKED_API_KEY. Never prints the key; ticket text stays local.
 */
import path from "node:path";
import { runTicket } from "../lib/agent/run";
import { createClockedClient } from "../lib/clocked/client";
import { createFileFixtureStore } from "../lib/clocked/fixture-files";
import { createRecordingTransport, createReplayTransport } from "../lib/clocked/replay";
import { createHttpTransport, type Transport } from "../lib/clocked/transport";
import { getKbIndex } from "../lib/kb/index";
import { getPersona } from "../data/personas";
import { SCENARIOS } from "../data/scenarios";

async function main() {
  const [id, ...steps] = process.argv.slice(2);
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s || !steps.length) throw new Error("usage: rerecord-step.ts <preset> <step> [step...]");
  const apiKey = process.env.CLOCKED_API_KEY;
  if (!apiKey) throw new Error("needs CLOCKED_API_KEY");
  const persona = getPersona(s.personaId);
  if (!persona) throw new Error(`unknown persona ${s.personaId}`);

  const store = createFileFixtureStore(path.join(process.cwd(), "fixtures"));
  const replay = createReplayTransport({ store, scenario: s.id });
  const live = createRecordingTransport({ inner: createHttpTransport({ apiKey, baseUrl: process.env.CLOCKED_BASE_URL || undefined }), store, scenario: s.id });
  let spent = 0;
  const transport: Transport = {
    kind: "replay",
    async send(req) {
      if (!steps.includes(req.step)) return replay.send(req);
      const res = await live.send(req);
      spent += Number(res.headers["x-clocked-credits"] ?? 0);
      return res;
    },
  };
  const client = createClockedClient({ transport, concurrency: 1 });
  const result = await runTicket({ client, persona, emit: () => {} }, { text: s.text, index: getKbIndex() });
  console.log(`${s.id}: ${result.outcome.outcome}; re-recorded ${steps.join(", ")} for ${spent} credits`);
  if (result.handoff) console.log(`handoff: ${result.handoff.assignmentGroup} ${result.handoff.priority} · ${result.handoff.summary}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
