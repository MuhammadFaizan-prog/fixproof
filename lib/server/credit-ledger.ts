/**
 * Global daily credit meter for live mode, shared by every serverless
 * instance. Uses a Redis REST endpoint when one is configured (Upstash, or
 * Vercel's Redis/KV integration, which sets the same variables):
 *   KV_REST_API_URL + KV_REST_API_TOKEN, or
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 * Without one, live-guard.ts falls back to a per-instance cap (see there).
 *
 * One key per UTC day ("fixproof:credits:YYYY-MM-DD") holds the credits
 * reserved or spent that day. A run reserves its estimate atomically with
 * INCRBY before any Clocked call and settles to what Clocked charged. If the
 * store cannot be reached the run is refused (fail closed): the presets still
 * replay.
 */

export interface CreditLedger {
  readonly kind: "redis";
  /** Reserve `n` credits under `cap`. Returns false (and reserves nothing) when it would pass the cap. */
  reserve(n: number, cap: number): Promise<boolean>;
  /** Correct today's total by `delta` (actual spend minus the reservation). */
  adjust(delta: number): Promise<void>;
  spentToday(): Promise<number>;
}

export class LedgerUnavailableError extends Error {
  constructor() {
    super("Live credit ledger unreachable");
    this.name = "LedgerUnavailableError";
  }
}

export function ledgerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): { url: string; token: string } | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

const dayKey = (now: number) => `fixproof:credits:${new Date(now).toISOString().slice(0, 10)}`;
const TWO_DAYS_S = 172_800;

export function createRedisLedger(cfg: { url: string; token: string }, opts: { fetchImpl?: typeof fetch; now?: () => number } = {}): CreditLedger {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  async function pipeline(cmds: (string | number)[][]): Promise<unknown[]> {
    let res: Response;
    try {
      res = await f(`${cfg.url}/pipeline`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
        body: JSON.stringify(cmds),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      throw new LedgerUnavailableError();
    }
    if (!res.ok) throw new LedgerUnavailableError();
    const out = (await res.json().catch(() => null)) as { result?: unknown; error?: string }[] | null;
    if (!Array.isArray(out) || out.some((r) => r?.error)) throw new LedgerUnavailableError();
    return out.map((r) => r.result);
  }
  return {
    kind: "redis",
    async reserve(n, cap) {
      const key = dayKey(now());
      const [total] = await pipeline([["INCRBY", key, n], ["EXPIRE", key, TWO_DAYS_S]]);
      if (Number(total) > cap) {
        await pipeline([["DECRBY", key, n]]);
        return false;
      }
      return true;
    },
    async adjust(delta) {
      if (!delta) return;
      const key = dayKey(now());
      await pipeline([["INCRBY", key, Math.round(delta)], ["EXPIRE", key, TWO_DAYS_S]]);
    },
    async spentToday() {
      const [v] = await pipeline([["GET", dayKey(now())]]);
      return Number(v ?? 0) || 0;
    },
  };
}

let shared: CreditLedger | null | undefined;
/** The process-wide ledger, or null when no durable store is configured. */
export function creditLedger(env: NodeJS.ProcessEnv = process.env): CreditLedger | null {
  if (shared === undefined) {
    const cfg = ledgerConfigFromEnv(env);
    shared = cfg ? createRedisLedger(cfg) : null;
  }
  return shared;
}

/** Tests only. */
export function resetCreditLedger(): void {
  shared = undefined;
}
