/**
 * Per-visitor limit for JSON API replays (POST /api/triage with Accept:
 * application/json). Replays spend no credits, but the endpoint is public, so
 * it is rate-limited like live mode: a sliding window per visitor, 429 with
 * Retry-After when exceeded. In process memory; addresses are map keys only
 * and are never logged.
 */
export const API_REPLAY_DEFAULTS = { perIpPerMinute: 30 } as const;

export function createReplayLimiter(perMinute: number = API_REPLAY_DEFAULTS.perIpPerMinute, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    admit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
      const cutoff = now() - 60_000;
      const list = (hits.get(ip) ?? []).filter((t) => t > cutoff);
      if (list.length >= perMinute) {
        hits.set(ip, list);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((list[0] + 60_000 - now()) / 1000)) };
      }
      list.push(now());
      hits.set(ip, list);
      if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => t > cutoff)) hits.delete(k);
      return { ok: true };
    },
  };
}

let shared: ReturnType<typeof createReplayLimiter> | null = null;
export function replayLimiter() {
  const n = Number(process.env.API_REPLAY_PER_IP_PER_MINUTE);
  shared ??= createReplayLimiter(Number.isInteger(n) && n > 0 ? n : API_REPLAY_DEFAULTS.perIpPerMinute);
  return shared;
}
/** Tests only. */
export function resetReplayLimiter(): void {
  shared = null;
}
