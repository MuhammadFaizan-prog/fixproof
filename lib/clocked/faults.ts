import { TransportTimeoutError, type Transport } from "./transport";

/**
 * Outage drills: a recorded preset replayed with a simulated Clocked failure
 * injected at one step, so judges can see how FixProof behaves when Clocked
 * does not answer. Replay only (no key, 0 credits). The failure goes through
 * the same client code path as a live one: same retry loop, same
 * Idempotency-Key reused on every attempt, same error kinds, same outcome
 * policy. Nothing here is ever used for a live run.
 */

export const FAULT_IDS = ["guard_down", "rate_limited", "timeout"] as const;
export type FaultId = (typeof FAULT_IDS)[number];

export interface FaultSpec {
  id: FaultId;
  /** Short label for the toggle. */
  label: string;
  /** The fixture step the fault hits. */
  step: string;
  /** Which stage that step belongs to, for the copy. */
  stageTitle: string;
  /** Failing attempts before the real (recorded) answer is returned; Infinity = never answers. */
  failures: number;
  /** What each failing attempt looks like on the wire. */
  wire: { kind: "status"; status: number; retryAfterSec?: number } | { kind: "timeout" };
  /** One line: what FixProof does about it. */
  expect: string;
}

export const FAULTS: Record<FaultId, FaultSpec> = {
  guard_down: {
    id: "guard_down",
    label: "Guard is down (503)",
    step: "screen",
    stageTitle: "Screen the ticket (Protect + Guard)",
    failures: Number.POSITIVE_INFINITY,
    wire: { kind: "status", status: 503 },
    expect: "Fail-closed. Nothing reads an unscreened ticket, so every later stage is blocked and the ticket is queued for a person with a handoff FixProof builds itself.",
  },
  rate_limited: {
    id: "rate_limited",
    label: "Rate limited (429)",
    step: "retrieve:rerank",
    stageTitle: "Find what applies to you (Rerank)",
    failures: 2,
    wire: { kind: "status", status: 429, retryAfterSec: 1 },
    expect: "Retried. Clocked says 429 twice; FixProof waits the Retry-After, reuses the same Idempotency-Key, gets the answer on attempt 3 and the run finishes as normal.",
  },
  timeout: {
    id: "timeout",
    label: "Verify times out",
    step: "prove",
    stageTitle: "Prove every claim (Verify)",
    failures: Number.POSITIVE_INFINITY,
    wire: { kind: "timeout" },
    expect: "Fail-closed. A draft exists but was never verified, so it is withheld; the fix script is never inspected or offered, and the ticket is queued for a person.",
  },
};

export const isFaultId = (x: unknown): x is FaultId => typeof x === "string" && (FAULT_IDS as readonly string[]).includes(x);

/** Wrap a replay transport so the fault's step fails the way the spec says, then (if ever) answers from the recording. */
export function createFaultTransport(inner: Transport, fault: FaultSpec): Transport {
  let seen = 0;
  return {
    kind: inner.kind,
    async send(req) {
      if (req.step !== fault.step || seen >= fault.failures) return inner.send(req);
      seen++;
      if (fault.wire.kind === "timeout") throw new TransportTimeoutError();
      const headers: Record<string, string> = { "x-clocked-credits": "0" };
      if (fault.wire.retryAfterSec !== undefined) headers["retry-after"] = String(fault.wire.retryAfterSec);
      return {
        status: fault.wire.status,
        headers,
        json: { error: { code: fault.wire.status === 429 ? "rate_limited" : "unavailable", message: "Simulated outage drill (replay)." } },
        replay: { synthetic: true, recordedAt: null },
      };
    },
  };
}
