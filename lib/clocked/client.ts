import { randomUUID } from "node:crypto";
import { ClockedError, kindForStatus } from "./errors";
import { parseUsageHeaders } from "./headers";
import { createLimiter, type Limiter } from "./limiter";
import { createHttpTransport, TransportTimeoutError, type Transport, type TransportResponse } from "./transport";
import type { ClockedMeta, ClockedResult, Endpoint, RequestMap } from "./types";

/**
 * FixProof's only door to Clocked.
 *
 * - One Idempotency-Key per logical call, reused on every retry of that call
 *   with the identical payload (docs: Authentication, Errors & retries).
 * - Bounded exponential backoff with full jitter on 429, 5xx, network errors
 *   and client timeouts. 409 is retried only while recovering an attempt whose
 *   outcome is unknown. 400/401/402/403/413/422 are never retried.
 * - Stops at once when the body says `retryAsNew: true`.
 * - Every result carries the X-Clocked-* usage headers as `meta`.
 * - All calls share one concurrency limiter sized to the account allowance.
 */

export interface ClientOptions {
  transport: Transport;
  /** Account concurrency: 1 Trial, 4 Build, 8 Production, 16 Scale. */
  concurrency?: number;
  /** Total attempts per logical call, including the first. */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Per-attempt client timeout. The gateway allows 110 s for a model request. */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  uuid?: () => string;
  now?: () => number;
  /** Observes attempts for the Proof Trail ("Waiting for a Clocked slot (attempt 2)"). Never receives the key or payload. */
  onAttempt?: (info: { endpoint: Endpoint; step: string; attempt: number; status?: number; waitMs?: number }) => void;
}

export interface CallOptions {
  /** Logical step name in the FixProof run. */
  step: string;
}

export interface ClockedClient {
  readonly mode: Transport["kind"];
  readonly limiter: Limiter;
  call<E extends Endpoint>(endpoint: E, body: RequestMap[E], opts: CallOptions): Promise<ClockedResult<E>>;
  decide(body: RequestMap["decide"], opts: CallOptions): Promise<ClockedResult<"decide">>;
  extract(body: RequestMap["extract"], opts: CallOptions): Promise<ClockedResult<"extract">>;
  fill(body: RequestMap["fill"], opts: CallOptions): Promise<ClockedResult<"fill">>;
  pii(body: RequestMap["pii"], opts: CallOptions): Promise<ClockedResult<"pii">>;
  injection(body: RequestMap["injection"], opts: CallOptions): Promise<ClockedResult<"injection">>;
  script(body: RequestMap["script"], opts: CallOptions): Promise<ClockedResult<"script">>;
  grounding(body: RequestMap["grounding"], opts: CallOptions): Promise<ClockedResult<"grounding">>;
  compare(body: RequestMap["compare"], opts: CallOptions): Promise<ClockedResult<"compare">>;
  rerank(body: RequestMap["rerank"], opts: CallOptions): Promise<ClockedResult<"rerank">>;
  pipeline(body: RequestMap["pipeline"], opts: CallOptions): Promise<ClockedResult<"pipeline">>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Full-jitter backoff: random in [0, min(max, base * 2^(attempt-1))]. */
export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, random: () => number): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(random() * ceiling);
}

function errorMessage(json: unknown): string | null {
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    const raw = record.error ?? record.detail;
    if (typeof raw === "string") return raw.slice(0, 200);
  }
  return null;
}

function retryAsNew(json: unknown): boolean {
  return Boolean(json && typeof json === "object" && (json as Record<string, unknown>).retryAsNew === true);
}

export function createClockedClient(options: ClientOptions): ClockedClient {
  const {
    transport,
    concurrency = 4,
    maxAttempts = 4,
    baseDelayMs = 500,
    maxDelayMs = 8_000,
    timeoutMs = 115_000,
    sleep = defaultSleep,
    random = Math.random,
    uuid = randomUUID,
    now = Date.now,
    onAttempt,
  } = options;
  const limiter = createLimiter(concurrency);

  async function attemptLoop<E extends Endpoint>(endpoint: E, body: RequestMap[E], step: string): Promise<ClockedResult<E>> {
    const idempotencyKey = uuid();
    const keyPrefix = idempotencyKey.slice(0, 8);
    const started = now();
    let unknownOutcome = false;

    for (let attempt = 1; ; attempt++) {
      onAttempt?.({ endpoint, step, attempt });
      let res: TransportResponse;
      try {
        res = await transport.send({ endpoint, step, body, idempotencyKey, timeoutMs });
      } catch (err) {
        if (err instanceof ClockedError) throw err; // replay transports raise typed errors (e.g. no_fixture)
        unknownOutcome = true;
        const kind = err instanceof TransportTimeoutError ? "timeout" : "network";
        if (attempt >= maxAttempts) {
          throw new ClockedError(`Clocked ${endpoint} failed: ${kind} after ${attempt} attempts`, {
            kind,
            endpoint,
            step,
            attempts: attempt,
            meta: { idempotencyKeyPrefix: keyPrefix },
          });
        }
        const waitMs = backoffDelay(attempt, baseDelayMs, maxDelayMs, random);
        onAttempt?.({ endpoint, step, attempt, waitMs });
        await sleep(waitMs);
        continue;
      }

      const usage = parseUsageHeaders(res.headers);
      const meta: ClockedMeta = {
        endpoint,
        step,
        idempotencyKeyPrefix: keyPrefix,
        status: res.status,
        attempts: attempt,
        credits: usage.credits,
        modelMs: usage.modelMs,
        costUsd: usage.costUsd,
        costBasis: usage.costBasis,
        transport: usage.transport,
        roundTripMs: now() - started,
        replay: transport.kind === "replay",
        synthetic: res.replay?.synthetic ?? false,
        recordedAt: res.replay?.recordedAt ?? null,
      };

      if (res.status >= 200 && res.status < 300) {
        if (res.json === null || typeof res.json !== "object") {
          throw new ClockedError(`Clocked ${endpoint} returned ${res.status} without a JSON body`, {
            kind: "server",
            endpoint,
            step,
            status: res.status,
            attempts: attempt,
            meta,
          });
        }
        return { data: res.json as ClockedResult<E>["data"], meta };
      }

      const message = errorMessage(res.json) ?? `HTTP ${res.status}`;
      if (retryAsNew(res.json)) {
        throw new ClockedError(`Clocked ${endpoint} attempt ended (retryAsNew): ${message}`, {
          kind: "ended",
          endpoint,
          step,
          status: res.status,
          attempts: attempt,
          retryAsNew: true,
          meta,
        });
      }

      const retryable = res.status === 429 || res.status >= 500 || (res.status === 409 && unknownOutcome);
      if (!retryable || attempt >= maxAttempts) {
        throw new ClockedError(`Clocked ${endpoint} failed: ${message}`, {
          kind: kindForStatus(res.status),
          endpoint,
          step,
          status: res.status,
          attempts: attempt,
          meta,
        });
      }
      if (res.status >= 500) unknownOutcome = true;
      const waitMs = Math.min(maxDelayMs, usage.retryAfterMs ?? backoffDelay(attempt, baseDelayMs, maxDelayMs, random));
      onAttempt?.({ endpoint, step, attempt, status: res.status, waitMs });
      await sleep(waitMs);
    }
  }

  const call = <E extends Endpoint>(endpoint: E, body: RequestMap[E], opts: CallOptions) =>
    limiter.run(() => attemptLoop(endpoint, body, opts.step));

  return {
    mode: transport.kind,
    limiter,
    call,
    decide: (body, opts) => call("decide", body, opts),
    extract: (body, opts) => call("extract", body, opts),
    fill: (body, opts) => call("fill", body, opts),
    pii: (body, opts) => call("pii", body, opts),
    injection: (body, opts) => call("injection", body, opts),
    script: (body, opts) => call("script", body, opts),
    grounding: (body, opts) => call("grounding", body, opts),
    compare: (body, opts) => call("compare", body, opts),
    rerank: (body, opts) => call("rerank", body, opts),
    pipeline: (body, opts) => call("pipeline", body, opts),
  };
}

/** Whether a real key is configured. Never returns or logs the key itself. */
export function hasApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.CLOCKED_API_KEY === "string" && env.CLOCKED_API_KEY.trim().length > 0;
}

/** Live client from server environment. Throws a typed no_key error when the key is missing. */
export function createLiveClientFromEnv(env: NodeJS.ProcessEnv = process.env, overrides: Partial<ClientOptions> = {}): ClockedClient {
  if (!hasApiKey(env)) {
    throw new ClockedError("CLOCKED_API_KEY is not set", { kind: "no_key", endpoint: "pipeline", step: "init", attempts: 0 });
  }
  // Trial accounts get one concurrent request; raise CLOCKED_CONCURRENCY on a Build plan (4).
  const concurrency = Number(env.CLOCKED_CONCURRENCY ?? 1);
  return createClockedClient({
    transport: createHttpTransport({ apiKey: env.CLOCKED_API_KEY as string, baseUrl: env.CLOCKED_BASE_URL || undefined }),
    concurrency: Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 1,
    ...overrides,
  });
}
