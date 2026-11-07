import { createClockedClient, type ClockedClient } from "@/lib/clocked/client";
import { createMemoryFixtureStore, type Fixture } from "@/lib/clocked/fixtures";
import { createReplayTransport } from "@/lib/clocked/replay";
import type { Endpoint, ResponseMap } from "@/lib/clocked/types";
import { PERSONAS } from "@/data/personas";
import type { RunContext, StepEvent } from "@/lib/agent/types";

/**
 * Doc-shaped responses for unit tests. They are marked synthetic: they follow
 * the shapes on the Clocked reference pages but were not produced by our key.
 */
export function shaped<E extends Endpoint>(step: string, endpoint: E, response: Partial<ResponseMap[E]> & Record<string, unknown>, credits = 3): Fixture {
  return {
    synthetic: true,
    source: "docs-shape",
    recorded_at: null,
    endpoint,
    scenario: "unit",
    step,
    status: 200,
    request: null,
    response: { model: "clocked-1.0", ...response },
    headers: { "x-clocked-credits": String(credits) },
  };
}

export function fakeContext(fixtures: Fixture[], personaId = "priya-us-design"): { ctx: RunContext; events: StepEvent[]; client: ClockedClient } {
  const client = createClockedClient({
    transport: createReplayTransport({ store: createMemoryFixtureStore(fixtures), scenario: "unit" }),
    concurrency: 1,
    sleep: async () => {},
  });
  const events: StepEvent[] = [];
  const persona = PERSONAS.find((p) => p.id === personaId)!;
  return { ctx: { client, persona, emit: (e) => events.push(e) }, events, client };
}

/** The final (non-running) event for each row id. */
export function finalEvents(events: StepEvent[]): Map<string, StepEvent> {
  const m = new Map<string, StepEvent>();
  for (const e of events) if (e.status !== "running") m.set(e.id, e);
  return m;
}
