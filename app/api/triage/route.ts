import { encodeSse } from "@/lib/sse";
import { planTriage, runTriage, TriageInputError, TriageRequestSchema } from "@/lib/agent/triage";
import { clientIp, liveGuard, type Ticket } from "@/lib/server/live-guard";
import { creditLedger } from "@/lib/server/credit-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/triage → text/event-stream
 *   event: start   { mode, reason, scenarioId, persona }
 *   event: step    StepEvent (one per row update)
 *   event: result  PublicResult
 *   event: error   { code, message }   (bad input; the stream then ends)
 * Live runs (free text with a key) pass the live guard first: 429 with
 * Retry-After for the per-visitor hourly limit, one run in flight, and the
 * daily credit cap. Replay is never limited and never spends credits.
 * Logs never include ticket text or the Authorization header.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ code: "invalid", message: "Send JSON." }, { status: 400 });
  }
  const parsed = TriageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ code: "invalid", message: "Ticket must be at most 4,000 characters and name an employee profile." }, { status: 400 });
  }
  let start;
  try {
    start = planTriage(parsed.data);
  } catch (err) {
    if (err instanceof TriageInputError) return Response.json({ code: err.code, message: err.message }, { status: 400 });
    throw err;
  }

  let ticket: Ticket | null = null;
  if (start.mode.mode === "live") {
    const admitted = liveGuard().admit(clientIp(req.headers));
    if (!admitted.ok) {
      return Response.json({ code: admitted.code, message: admitted.message, retryAfterSec: admitted.retryAfterSec }, { status: 429, headers: { "Retry-After": String(admitted.retryAfterSec) } });
    }
    ticket = admitted;
    // Global daily meter shared by every instance, when a durable store is configured.
    const ledger = creditLedger();
    if (ledger) {
      const { dailyCreditCap, runEstimate } = liveGuard().config();
      let reserved = false;
      try {
        reserved = await ledger.reserve(runEstimate, dailyCreditCap);
      } catch {
        admitted.settle(0);
        return Response.json({ code: "budget_unavailable", message: "Live mode cannot check today's credit budget right now, so it is paused. The recorded tickets still replay.", retryAfterSec: 60 }, { status: 429, headers: { "Retry-After": "60" } });
      }
      if (!reserved) {
        admitted.settle(0);
        return Response.json({ code: "daily_cap", message: "Live mode has used today's credit budget. The recorded tickets still replay; live opens again after midnight UTC.", retryAfterSec: 3600 }, { status: 429, headers: { "Retry-After": "3600" } });
      }
      const local = admitted;
      ticket = {
        ok: true,
        settle(spent: number) {
          local.settle(spent);
          ledger.adjust(Math.max(0, Math.round(spent)) - runEstimate).catch(() => {});
        },
      };
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(encodeSse(event, data)));
      send("start", { mode: start.mode.mode, reason: start.mode.reason, scenarioId: start.scenarioId, persona: start.persona.id });
      let spent = 0;
      try {
        const result = await runTriage(start, (e) => {
          if (e.status !== "running" && e.meta?.credits) spent += e.meta.credits;
          send("step", e);
        });
        spent = result.credits;
        send("result", result);
      } catch (err) {
        console.error("triage failed", { kind: err instanceof Error ? err.name : "unknown", scenario: start.scenarioId });
        send("error", { code: "internal", message: "FixProof hit an internal error. Nothing was sent to the employee." });
      } finally {
        ticket?.settle(spent);
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
