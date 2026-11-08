import { z } from "zod";
import { runTicket } from "@/lib/agent/run";
import { MAX_EDIT_CHARS, recheckReply, recheckStep } from "@/lib/agent/recheck";
import { createClockedClient } from "@/lib/clocked/client";
import { createBudgetTransport } from "@/lib/clocked/budget";
import { createFileFixtureStore } from "@/lib/clocked/fixture-files";
import { hasApiKey } from "@/lib/clocked/client";
import { createReplayTransport } from "@/lib/clocked/replay";
import { createHttpTransport } from "@/lib/clocked/transport";
import { getKbIndex } from "@/lib/kb/index";
import { clientIp, liveGuard } from "@/lib/server/live-guard";
import { getPersona } from "@/data/personas";
import { getScenario } from "@/data/scenarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  scenarioId: z.string().regex(/^[a-z0-9-]+$/).optional(),
  question: z.string().max(4000).optional(),
  reply: z.string().trim().min(1).max(MAX_EDIT_CHARS),
  /** Live runs only: the passages the draft was written from (presets rebuild them from their recording). */
  sources: z.array(z.object({ id: z.string().max(200), text: z.string().max(6000) })).max(8).optional(),
});

/**
 * POST /api/recheck → JSON. Re-verifies a technician's edited reply with
 * Verify against the passages the original reply was drafted from. A preset
 * edit replays when that exact text was recorded (the payroll "back by 2pm"
 * edit is); any other edit runs live when the deployment has a key, through
 * the same live guard as triage, with a 20-credit ceiling. Sends nothing.
 */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "invalid", message: `The edited reply must be 1 to ${MAX_EDIT_CHARS.toLocaleString("en")} characters.` }, { status: 400 });
  const { scenarioId, reply } = parsed.data;
  const store = createFileFixtureStore();
  let question = parsed.data.question ?? "";
  let sources = parsed.data.sources ?? [];

  if (scenarioId) {
    const s = getScenario(scenarioId);
    if (!s) return Response.json({ code: "unknown_scenario", message: "Unknown preset." }, { status: 400 });
    const client = createClockedClient({ transport: createReplayTransport({ store, scenario: s.id }), sleep: async () => {} });
    const run = await runTicket({ client, persona: getPersona(s.personaId)!, emit: () => {} }, { text: s.text, index: getKbIndex() });
    question = run.screen?.safeText ?? "";
    sources = (run.draft?.sources ?? []).map((p) => ({ id: p.id, text: p.text }));
  }
  if (!sources.length) return Response.json({ code: "no_sources", message: "This run drafted no reply, so there is nothing to re-verify against." }, { status: 400 });

  const recorded = scenarioId ? await store.get(scenarioId, recheckStep(reply)) : null;
  if (recorded && scenarioId) {
    const client = createClockedClient({ transport: createReplayTransport({ store, scenario: scenarioId }), sleep: async () => {} });
    return Response.json({ mode: "replay", ...(await recheckReply(client, question, sources, reply)) });
  }
  if (!hasApiKey(process.env)) {
    return Response.json({ code: "needs_live", message: "Re-verifying a new edit needs a live Clocked call, and this deployment has no key. The recorded example edit still works." }, { status: 409 });
  }
  const admitted = liveGuard().admit(clientIp(req.headers));
  if (!admitted.ok) return Response.json({ code: admitted.code, message: admitted.message, retryAfterSec: admitted.retryAfterSec }, { status: 429, headers: { "Retry-After": String(admitted.retryAfterSec) } });
  let spent = 0;
  try {
    const transport = createBudgetTransport(createHttpTransport({ apiKey: process.env.CLOCKED_API_KEY!.trim(), baseUrl: process.env.CLOCKED_BASE_URL || undefined }), 20);
    const result = await recheckReply(createClockedClient({ transport, concurrency: 1 }), question, sources, reply);
    spent = result.credits;
    return Response.json({ mode: "live", ...result });
  } catch {
    return Response.json({ code: "unavailable", message: "Clocked did not answer the re-verify. Nothing was sent; the edit stays blocked until it is verified." }, { status: 503 });
  } finally {
    admitted.settle(spent);
  }
}
