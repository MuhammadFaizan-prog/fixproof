import { describe, expect, it } from "vitest";
import { runTicket } from "@/lib/agent/run";
import { createClockedClient } from "@/lib/clocked/client";
import { createFileFixtureStore } from "@/lib/clocked/fixture-files";
import { createReplayTransport } from "@/lib/clocked/replay";
import type { Transport } from "@/lib/clocked/transport";
import { getKbIndex } from "@/lib/kb/index";
import { getPersona } from "@/data/personas";
import { SCENARIOS } from "@/data/scenarios";

/**
 * Replay answers by (scenario, step). If the app now sends a different request
 * than the one recorded (a KB edit changes BM25 recall, a prompt changes), the
 * replayed answer would describe inputs it never saw. Every preset request must
 * equal its recorded request byte for byte; re-record the step when it does not.
 */
describe("replay fixtures match today's requests", () => {
  it.each(SCENARIOS.map((s) => [s.id]))("%s sends exactly the recorded requests", async (id) => {
    const s = SCENARIOS.find((x) => x.id === id)!;
    const store = createFileFixtureStore();
    const replay = createReplayTransport({ store, scenario: id });
    const drift: string[] = [];
    const transport: Transport = {
      kind: "replay",
      async send(req) {
        const f = await store.get(id, req.step);
        if (f && JSON.stringify(f.request) !== JSON.stringify(req.body)) drift.push(req.step);
        return replay.send(req);
      },
    };
    const client = createClockedClient({ transport, sleep: async () => {} });
    await runTicket({ client, persona: getPersona(s.personaId)!, emit: () => {} }, { text: s.text, index: getKbIndex() });
    expect(drift).toEqual([]);
  });
});
