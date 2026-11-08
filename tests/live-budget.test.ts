import { describe, expect, it } from "vitest";
import { createBudgetTransport } from "@/lib/clocked/budget";
import { createClockedClient } from "@/lib/clocked/client";
import { ClockedError } from "@/lib/clocked/errors";
import type { Transport } from "@/lib/clocked/transport";
import { createRedisLedger, ledgerConfigFromEnv, LedgerUnavailableError } from "@/lib/server/credit-ledger";
import { failureMeaning } from "@/lib/agent/policy";

const costly = (credits: number): Transport & { sent: number } => {
  const t = {
    kind: "http" as const,
    sent: 0,
    async send() {
      t.sent++;
      return { status: 200, headers: { "x-clocked-credits": String(credits) }, json: { decision: "x" } };
    },
  };
  return t;
};

describe("per-run credit ceiling", () => {
  it("stops sending once a run has spent its ceiling, with a typed non-retryable error", async () => {
    const inner = costly(30);
    const budget = createBudgetTransport(inner, 60);
    const client = createClockedClient({ transport: budget, sleep: async () => {} });
    await client.decide({ text: "a", options: ["x"] } as never, { step: "a" });
    await client.decide({ text: "b", options: ["x"] } as never, { step: "b" });
    const err = await client.decide({ text: "c", options: ["x"] } as never, { step: "c" }).catch((e) => e);
    expect(err).toBeInstanceOf(ClockedError);
    expect((err as ClockedError).kind).toBe("budget");
    expect(inner.sent).toBe(2);
    expect(budget.spent()).toBe(60);
    expect(failureMeaning("budget")).toMatchObject({ retryable: false, priority: "P3" });
  });
});

describe("global credit ledger (Redis REST)", () => {
  function fakeRedis() {
    const store = new Map<string, number>();
    const calls: unknown[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const cmds = JSON.parse(String(init.body)) as (string | number)[][];
      calls.push(cmds);
      const out = cmds.map(([op, key, n]) => {
        const k = String(key);
        if (op === "INCRBY") store.set(k, (store.get(k) ?? 0) + Number(n));
        if (op === "DECRBY") store.set(k, (store.get(k) ?? 0) - Number(n));
        return { result: op === "EXPIRE" ? 1 : (store.get(k) ?? null) };
      });
      return new Response(JSON.stringify(out), { status: 200 });
    }) as typeof fetch;
    return { store, calls, fetchImpl };
  }

  it("reads its config from Vercel KV or Upstash variable names", () => {
    expect(ledgerConfigFromEnv({} as never)).toBeNull();
    expect(ledgerConfigFromEnv({ KV_REST_API_URL: "https://kv.example/", KV_REST_API_TOKEN: "t" } as never)).toEqual({ url: "https://kv.example", token: "t" });
    expect(ledgerConfigFromEnv({ UPSTASH_REDIS_REST_URL: "https://u.example", UPSTASH_REDIS_REST_TOKEN: "t" } as never)).toEqual({ url: "https://u.example", token: "t" });
  });

  it("reserves under the cap, refuses past it without keeping the reservation, and settles", async () => {
    const r = fakeRedis();
    const ledger = createRedisLedger({ url: "https://kv.example", token: "t" }, { fetchImpl: r.fetchImpl, now: () => Date.UTC(2026, 10, 9, 12) });
    expect(await ledger.reserve(60, 100)).toBe(true);
    expect(await ledger.reserve(60, 100)).toBe(false);
    expect(await ledger.spentToday()).toBe(60);
    await ledger.adjust(-25); // the run actually cost 35
    expect(await ledger.spentToday()).toBe(35);
    expect([...r.store.keys()]).toEqual(["fixproof:credits:2026-11-09"]);
  });

  it("fails closed when the store cannot be reached", async () => {
    const down = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const ledger = createRedisLedger({ url: "https://kv.example", token: "t" }, { fetchImpl: down });
    await expect(ledger.reserve(60, 100)).rejects.toBeInstanceOf(LedgerUnavailableError);
  });
});
