import { ClockedError } from "./errors";
import { parseUsageHeaders } from "./headers";
import type { Transport } from "./transport";

/**
 * Hard per-run credit ceiling for live mode. Wraps a transport, adds up the
 * X-Clocked-Credits of every answer, and refuses to send the next request
 * once the run has spent `ceiling` credits. The refusal is a typed
 * ClockedError (kind "budget"), so the run ends the way any Clocked failure
 * does: handed to a person with a locally built handoff, never a guess.
 */
export function createBudgetTransport(inner: Transport, ceiling: number): Transport & { spent(): number } {
  let spent = 0;
  return {
    kind: inner.kind,
    spent: () => spent,
    async send(req) {
      if (spent >= ceiling) {
        throw new ClockedError(`Live run reached its ${ceiling}-credit ceiling before ${req.endpoint}`, { kind: "budget", endpoint: req.endpoint, step: req.step, attempts: 0 });
      }
      const res = await inner.send(req);
      spent += parseUsageHeaders(res.headers).credits ?? 0;
      return res;
    },
  };
}
