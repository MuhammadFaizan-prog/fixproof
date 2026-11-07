import { encodeSse } from "@/lib/sse";
import { planTriage, runTriage, TriageInputError, TriageRequestSchema } from "@/lib/agent/triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/triage → text/event-stream
 *   event: start   { mode, reason, scenarioId, persona }
 *   event: step    StepEvent (one per row update)
 *   event: result  PublicResult
 *   event: error   { code, message }   (bad input; the stream then ends)
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(encodeSse(event, data)));
      send("start", { mode: start.mode.mode, reason: start.mode.reason, scenarioId: start.scenarioId, persona: start.persona.id });
      try {
        const result = await runTriage(start, (e) => send("step", e));
        send("result", result);
      } catch (err) {
        console.error("triage failed", { kind: err instanceof Error ? err.name : "unknown", scenario: start.scenarioId });
        send("error", { code: "internal", message: "FixProof hit an internal error. Nothing was sent to the employee." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
