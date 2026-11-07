/**
 * Budget guards for live mode (free-text tickets that spend real Clocked
 * credits). Replay never passes through here.
 *
 *  - per visitor: at most LIVE_PER_IP_RUNS_PER_HOUR live runs in a sliding hour
 *  - one live run in flight at a time (LIVE_MAX_INFLIGHT, default 1), so two
 *    visitors never push the account past its Trial concurrency of 1
 *  - per UTC day: at most LIVE_DAILY_CREDIT_CAP credits. A run reserves a
 *    worst-case estimate before it starts and settles to the credits Clocked
 *    actually charged (X-Clocked-Credits) when it ends.
 *
 * State is in process memory. On a serverless host each warm instance keeps
 * its own counters, so the caps are per instance: a bound on spend per
 * instance, not an exact global meter. Visitor addresses are kept only as
 * map keys for an hour and are never logged.
 */

export const DEFAULTS = { dailyCreditCap: 2000, perIpPerHour: 5, maxInflight: 1, runEstimate: 60 } as const;

export interface GuardConfig {
  dailyCreditCap: number;
  perIpPerHour: number;
  maxInflight: number;
  /** Credits reserved per run before it starts (presets used 21–50 live). */
  runEstimate: number;
}

function intFrom(v: string | undefined, fallback: number, min: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= min ? n : fallback;
}

export function guardConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GuardConfig {
  return {
    dailyCreditCap: intFrom(env.LIVE_DAILY_CREDIT_CAP, DEFAULTS.dailyCreditCap, 0),
    perIpPerHour: intFrom(env.LIVE_PER_IP_RUNS_PER_HOUR, DEFAULTS.perIpPerHour, 0),
    maxInflight: intFrom(env.LIVE_MAX_INFLIGHT, DEFAULTS.maxInflight, 1),
    runEstimate: intFrom(env.LIVE_RUN_CREDIT_ESTIMATE, DEFAULTS.runEstimate, 1),
  };
}

export type Denial = { ok: false; code: "rate_limited" | "daily_cap" | "busy"; message: string; retryAfterSec: number };
export interface Ticket {
  ok: true;
  /** Settle the reservation with what the run actually spent. Safe to call once; later calls are ignored. */
  settle(creditsSpent: number): void;
}

const HOUR = 3_600_000;

export function createLiveGuard(config: GuardConfig, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  let day = "";
  let spent = 0;
  let reserved = 0;
  let inflight = 0;

  const today = () => new Date(now()).toISOString().slice(0, 10);
  const rollDay = () => {
    const d = today();
    if (d !== day) {
      day = d;
      spent = 0;
    }
  };
  const secondsToUtcMidnight = () => {
    const t = new Date(now());
    const next = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1);
    return Math.max(1, Math.ceil((next - t.getTime()) / 1000));
  };

  function recent(ip: string): number[] {
    const cutoff = now() - HOUR;
    const list = (hits.get(ip) ?? []).filter((t) => t > cutoff);
    if (list.length) hits.set(ip, list);
    else hits.delete(ip);
    return list;
  }

  return {
    /** Ask to start a live run for this visitor. Every denial says when to try again. */
    admit(ip: string): Ticket | Denial {
      rollDay();
      if (spent + reserved + config.runEstimate > config.dailyCreditCap) {
        return { ok: false, code: "daily_cap", message: "Live mode has used today's credit budget. The recorded presets still run; live opens again after midnight UTC.", retryAfterSec: secondsToUtcMidnight() };
      }
      const list = recent(ip);
      if (list.length >= config.perIpPerHour) {
        const retry = list.length ? Math.max(1, Math.ceil((list[0] + HOUR - now()) / 1000)) : 3600;
        return { ok: false, code: "rate_limited", message: `Live mode allows ${config.perIpPerHour} runs an hour per visitor. The recorded presets still run.`, retryAfterSec: retry };
      }
      if (inflight >= config.maxInflight) {
        return { ok: false, code: "busy", message: "Another live run is in progress. Try again in a few seconds, or replay a preset.", retryAfterSec: 10 };
      }
      list.push(now());
      hits.set(ip, list);
      inflight += 1;
      reserved += config.runEstimate;
      let settled = false;
      const reservedDay = day;
      return {
        ok: true,
        settle(creditsSpent: number) {
          if (settled) return;
          settled = true;
          inflight -= 1;
          reserved -= config.runEstimate;
          rollDay();
          if (day === reservedDay) spent += Math.max(0, Math.round(creditsSpent) || 0);
        },
      };
    },
    /** For /api/health: whether a live run could start now, without revealing anyone's usage. */
    status() {
      rollDay();
      return { creditsLeftToday: Math.max(0, config.dailyCreditCap - spent - reserved), capReached: spent + reserved + config.runEstimate > config.dailyCreditCap };
    },
  };
}

export type LiveGuard = ReturnType<typeof createLiveGuard>;

let shared: LiveGuard | null = null;
/** The process-wide guard used by the API routes. */
export function liveGuard(): LiveGuard {
  shared ??= createLiveGuard(guardConfigFromEnv());
  return shared;
}

/** The visitor's address as the platform reports it (first X-Forwarded-For hop on Vercel). */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Tests only: drop the shared guard so the next call rereads the environment. */
export function resetLiveGuard(): void {
  shared = null;
}
