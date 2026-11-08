import { encodeSse } from "@/lib/sse";
import { planTriage, runTriage, TriageInputError, TriageRequestSchema } from "@/lib/agent/triage";
import { jsonBody } from "@/lib/agent/api-json";
import type { StepEvent } from "@/lib/agent/types";
import { replayLimiter } from "@/lib/server/api-limit";
import { SCENARIOS } from "@/data/scenarios";
import { PERSONAS } from "@/data/personas";
import { FAULT_IDS } from "@/lib/clocked/faults";
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
 *
 * POST /api/triage with `Accept: application/json` (or ?format=json) → one JSON
 * document (see jsonBody below): the outcome, the checks behind it, the
 * handoff, and every Clocked call with its credits. Same request body.
 *
 * Live runs (free text with a key) pass the live guard first: 429 with
 * Retry-After for the per-visitor hourly limit, one run in flight, and the
 * daily credit cap. Replays never spend credits; JSON replays are limited per
 * visitor per minute (lib/server/api-limit.ts), also 429 with Retry-After.
 * Logs never include ticket text or the Authorization header.
 */
export async function POST(req: Request): Promise<Response> {
  const wantsJson = new URL(req.url).searchParams.get("format") === "json" || /application\/json/.test(req.headers.get("accept") ?? "");
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

  if (wantsJson && start.mode.mode === "replay") {
    const ok = replayLimiter().admit(clientIp(req.headers));
    if (!ok.ok) return Response.json({ code: "rate_limited", message: "The JSON API allows a limited number of replays per minute per visitor.", retryAfterSec: ok.retryAfterSec }, { status: 429, headers: { "Retry-After": String(ok.retryAfterSec) } });
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

  if (wantsJson) {
    const events: StepEvent[] = [];
    let spent = 0;
    try {
      const result = await runTriage(start, (e) => {
        if (e.status !== "running") events.push(e);
      });
      spent = result.credits;
      return Response.json(await jsonBody(start.mode.mode, start.scenarioId, start.persona.id, result, events), { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      console.error("triage failed", { kind: err instanceof Error ? err.name : "unknown", scenario: start.scenarioId });
      return Response.json({ code: "internal", message: "FixProof hit an internal error. Nothing was sent to the employee." }, { status: 500 });
    } finally {
      ticket?.settle(spent);
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

/** GET /api/triage: how to call the JSON API, and the presets / profiles / drills it accepts. */
export async function GET(): Promise<Response> {
  return Response.json({
    usage: "POST /api/triage with JSON {scenarioId} to replay a recorded preset (0 credits), or {text, personaId, mode: \"live\"} for a live run within the live caps. Send Accept: application/json for one JSON response, otherwise the response is a text/event-stream. Optional simulate: one of the outage drills (presets only).",
    presets: SCENARIOS.map((s) => ({ id: s.id, title: s.title, personaId: s.personaId })),
    personas: PERSONAS.map((p) => ({ id: p.id, name: p.name, os: p.os, region: p.region, office: p.office })),
    simulate: FAULT_IDS,
    limits: { replayPerVisitorPerMinute: Number(process.env.API_REPLAY_PER_IP_PER_MINUTE) || 30, live: "per-visitor runs per hour, one run in flight, daily credit cap, per-run credit ceiling (see /api/health)" },
  });
}
