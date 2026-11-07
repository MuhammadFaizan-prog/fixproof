import { describe, expect, it, vi } from "vitest";
import { backoffDelay, createClockedClient, createLiveClientFromEnv, hasApiKey } from "@/lib/clocked/client";
import { ClockedError } from "@/lib/clocked/errors";
import { createHttpTransport, TransportTimeoutError, type Transport, type TransportRequest, type TransportResponse } from "@/lib/clocked/transport";
import { createLimiter } from "@/lib/clocked/limiter";

const OK_HEADERS = {
  "x-clocked-credits": "3",
  "x-clocked-model-ms": "61.2",
  "x-clocked-cost-usd": "0.000600",
  "x-clocked-cost-basis": "prepaid",
  "x-clocked-transport": "door:east",
};

function scripted(responses: (TransportResponse | Error)[]) {
  const seen: TransportRequest[] = [];
  const transport: Transport = {
    kind: "http",
    async send(req) {
      seen.push(req);
      const next = responses.shift();
      if (!next) throw new Error("no more scripted responses");
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { transport, seen };
}

const decideBody = { state: "VPN drops", questions: { vpn: { type: "noul" as const, instructions: "Is this VPN?" } } };
const ok = (json: unknown = { model: "clocked-1.0", answers: {} }): TransportResponse => ({ status: 200, headers: OK_HEADERS, json });
const fast = { sleep: async () => {}, random: () => 0.5, uuid: () => "aaaaaaaa-1111-2222-3333-444444444444" };

describe("clocked client", () => {
  it("returns data and parses usage headers into meta", async () => {
    const { transport, seen } = scripted([ok()]);
    const client = createClockedClient({ transport, ...fast });
    const res = await client.decide(decideBody, { step: "understand" });
    expect(res.data.model).toBe("clocked-1.0");
    expect(res.meta).toMatchObject({
      endpoint: "decide",
      step: "understand",
      status: 200,
      attempts: 1,
      credits: 3,
      modelMs: 61.2,
      costUsd: 0.0006,
      costBasis: "prepaid",
      transport: "door:east",
      replay: false,
      synthetic: false,
      idempotencyKeyPrefix: "aaaaaaaa",
    });
    expect(seen[0].endpoint).toBe("decide");
  });

  it("retries 429 and 5xx with the same idempotency key and identical body", async () => {
    let n = 0;
    const { transport, seen } = scripted([
      { status: 429, headers: {}, json: { error: "busy" } },
      { status: 503, headers: {}, json: { error: "upstream" } },
      ok(),
    ]);
    const client = createClockedClient({ transport, ...fast, uuid: () => `key-${++n}` });
    const res = await client.decide(decideBody, { step: "s" });
    expect(res.meta.attempts).toBe(3);
    expect(new Set(seen.map((r) => r.idempotencyKey))).toEqual(new Set(["key-1"]));
    expect(seen.every((r) => r.body === decideBody)).toBe(true);
  });

  it("uses a new key for each new logical call", async () => {
    let n = 0;
    const { transport, seen } = scripted([ok(), ok()]);
    const client = createClockedClient({ transport, ...fast, uuid: () => `key-${++n}` });
    await client.decide(decideBody, { step: "a" });
    await client.decide(decideBody, { step: "b" });
    expect(seen.map((r) => r.idempotencyKey)).toEqual(["key-1", "key-2"]);
  });

  it("honours Retry-After when present", async () => {
    const sleep = vi.fn(async () => {});
    const { transport } = scripted([{ status: 429, headers: { "retry-after": "2" }, json: {} }, ok()]);
    const client = createClockedClient({ transport, ...fast, sleep });
    await client.decide(decideBody, { step: "s" });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("stops immediately on retryAsNew", async () => {
    const { transport, seen } = scripted([{ status: 409, headers: {}, json: { error: "ended", retryAsNew: true } }]);
    const client = createClockedClient({ transport, ...fast });
    await expect(client.decide(decideBody, { step: "s" })).rejects.toMatchObject({ kind: "ended", retryAsNew: true, attempts: 1 });
    expect(seen).toHaveLength(1);
  });

  it.each([
    [400, "invalid"],
    [401, "auth"],
    [402, "credits"],
    [403, "auth"],
    [413, "too_large"],
    [422, "invalid"],
  ])("never retries %i", async (status, kind) => {
    const { transport, seen } = scripted([{ status, headers: {}, json: { error: "nope" } }]);
    const client = createClockedClient({ transport, ...fast });
    await expect(client.decide(decideBody, { step: "s" })).rejects.toMatchObject({ kind, status, attempts: 1 });
    expect(seen).toHaveLength(1);
  });

  it("does not retry a plain 409, but does while recovering an unknown outcome", async () => {
    const plain = scripted([{ status: 409, headers: {}, json: { error: "conflict" } }]);
    await expect(createClockedClient({ transport: plain.transport, ...fast }).decide(decideBody, { step: "s" })).rejects.toMatchObject({ kind: "conflict" });
    expect(plain.seen).toHaveLength(1);

    const recovering = scripted([new TypeError("socket hang up"), { status: 409, headers: {}, json: { error: "in progress" } }, ok()]);
    const res = await createClockedClient({ transport: recovering.transport, ...fast }).decide(decideBody, { step: "s" });
    expect(res.meta.attempts).toBe(3);
  });

  it("gives up after maxAttempts with the right kind", async () => {
    const { transport, seen } = scripted([
      { status: 500, headers: {}, json: {} },
      { status: 500, headers: {}, json: {} },
      { status: 500, headers: {}, json: {} },
    ]);
    const client = createClockedClient({ transport, ...fast, maxAttempts: 3 });
    await expect(client.decide(decideBody, { step: "s" })).rejects.toMatchObject({ kind: "server", attempts: 3 });
    expect(seen).toHaveLength(3);

    const timeouts = scripted([new TransportTimeoutError(), new TransportTimeoutError()]);
    await expect(createClockedClient({ transport: timeouts.transport, ...fast, maxAttempts: 2 }).decide(decideBody, { step: "s" })).rejects.toMatchObject({ kind: "timeout" });
  });

  it("treats a 200 without JSON as a failed step", async () => {
    const { transport } = scripted([{ status: 200, headers: {}, json: null }]);
    await expect(createClockedClient({ transport, ...fast }).decide(decideBody, { step: "s" })).rejects.toBeInstanceOf(ClockedError);
  });

  it("never puts the key in an error message", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "Use a Clocked account API key." }), { status: 401 }));
    const transport = createHttpTransport({ apiKey: "sk-secret-value", fetchImpl: fetchImpl as unknown as typeof fetch });
    const err = await createClockedClient({ transport, ...fast }).decide(decideBody, { step: "s" }).catch((e) => e);
    expect(err).toBeInstanceOf(ClockedError);
    expect(String(err.message)).not.toContain("sk-secret-value");
    expect(JSON.stringify(err)).not.toContain("sk-secret-value");
  });
});

describe("http transport", () => {
  it("sends the documented headers to /clocked/<endpoint>", async () => {
    const fetchImpl = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "X-Clocked-Credits": "1" } }));
    const transport = createHttpTransport({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await transport.send({ endpoint: "rerank", step: "s", body: { a: 1 }, idempotencyKey: "id-1", timeoutMs: 1000 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://clocked.rezolve.ai/clocked/rerank");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer k", "Content-Type": "application/json", "Idempotency-Key": "id-1" });
    expect(init.body).toBe('{"a":1}');
    expect(res.headers["x-clocked-credits"]).toBe("1");
  });
});

describe("limiter and helpers", () => {
  it("never runs more than the concurrency allowance", async () => {
    const limiter = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      limiter.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all([task(), task(), task(), task(), task()]);
    expect(peak).toBe(2);
  });

  it("caps backoff and applies full jitter", () => {
    expect(backoffDelay(1, 500, 8000, () => 1)).toBe(500);
    expect(backoffDelay(3, 500, 8000, () => 1)).toBe(2000);
    expect(backoffDelay(10, 500, 8000, () => 1)).toBe(8000);
    expect(backoffDelay(10, 500, 8000, () => 0)).toBe(0);
  });

  it("detects a missing key without exposing it", () => {
    expect(hasApiKey({} as NodeJS.ProcessEnv)).toBe(false);
    expect(hasApiKey({ CLOCKED_API_KEY: "  " } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(() => createLiveClientFromEnv({} as NodeJS.ProcessEnv)).toThrow(ClockedError);
  });
});

describe("live client concurrency", () => {
  it("defaults to the Trial plan's single slot and honours CLOCKED_CONCURRENCY", () => {
    const one = createLiveClientFromEnv({ CLOCKED_API_KEY: "test-key" } as unknown as NodeJS.ProcessEnv);
    const four = createLiveClientFromEnv({ CLOCKED_API_KEY: "test-key", CLOCKED_CONCURRENCY: "4" } as unknown as NodeJS.ProcessEnv);
    const bad = createLiveClientFromEnv({ CLOCKED_API_KEY: "test-key", CLOCKED_CONCURRENCY: "zero" } as unknown as NodeJS.ProcessEnv);
    expect(one.limiter.concurrency).toBe(1);
    expect(four.limiter.concurrency).toBe(4);
    expect(bad.limiter.concurrency).toBe(1);
  });
});
