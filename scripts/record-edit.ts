/**
 * Record the technician edit for the human-in-the-loop demo (data/hitl.ts):
 * replay the preset, append the scripted sentence to its verified reply, and
 * re-verify that edit live once, saving it as fixtures/<preset>/recheck-<hash>.json.
 *
 *   pnpm tsx scripts/record-edit.ts payroll-eta      (needs CLOCKED_API_KEY, ~5 credits)
 */
import path from "node:path";
import { runTicket } from "../lib/agent/run";
import { recheckReply } from "../lib/agent/recheck";
import { createClockedClient } from "../lib/clocked/client";
import { createFileFixtureStore } from "../lib/clocked/fixture-files";
import { createRecordingTransport, createReplayTransport } from "../lib/clocked/replay";
import { createHttpTransport } from "../lib/clocked/transport";
import { getKbIndex } from "../lib/kb/index";
import { getPersona } from "../data/personas";
import { getScenario } from "../data/scenarios";
import { RECORDED_EDITS, scriptedEdit } from "../data/hitl";

async function main() {
  const id = process.argv[2];
  const s = getScenario(id);
  const edit = RECORDED_EDITS[id];
  if (!s || !edit) throw new Error("usage: record-edit.ts <preset with a RECORDED_EDITS entry>");
  const apiKey = process.env.CLOCKED_API_KEY;
  if (!apiKey) throw new Error("needs CLOCKED_API_KEY");
  const store = createFileFixtureStore(path.join(process.cwd(), "fixtures"));
  const replay = createClockedClient({ transport: createReplayTransport({ store, scenario: s.id }), sleep: async () => {} });
  const run = await runTicket({ client: replay, persona: getPersona(s.personaId)!, emit: () => {} }, { text: s.text, index: getKbIndex() });
  if (!run.prove?.reply || !run.draft) throw new Error("preset has no verified reply");
  const edited = scriptedEdit(run.prove.reply, edit.sentence);
  const live = createClockedClient({ transport: createRecordingTransport({ inner: createHttpTransport({ apiKey, baseUrl: process.env.CLOCKED_BASE_URL || undefined }), store, scenario: s.id }), concurrency: 1 });
  const r = await recheckReply(live, run.screen?.safeText ?? "", run.draft.sources, edited);
  for (const c of r.claims) console.log(`${c.kept ? "kept   " : "REMOVED"} ${c.verdict.padEnd(12)} ${c.text}`);
  console.log(`${r.credits} credits`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
