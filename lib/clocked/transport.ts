import type { Endpoint } from "./types";

/** One HTTP attempt as the client sees it. Replay mode implements the same interface. */
export interface TransportRequest {
  endpoint: Endpoint;
  step: string;
  body: unknown;
  idempotencyKey: string;
  timeoutMs: number;
}

export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  /** Parsed JSON body, or null when the body was empty or not JSON. */
  json: unknown;
  /** Set by replay transports. */
  replay?: { synthetic: boolean; recordedAt: string | null };
}

export interface Transport {
  readonly kind: "http" | "replay";
  send(req: TransportRequest): Promise<TransportResponse>;
}

export const DEFAULT_BASE_URL = "https://clocked.rezolve.ai/clocked";

export class TransportTimeoutError extends Error {
  constructor() {
    super("Clocked request timed out on the client");
    this.name = "TransportTimeoutError";
  }
}

export interface HttpTransportOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Raw HTTPS transport (docs: Authentication). Sends the Bearer key, JSON body
 * and Idempotency-Key. Never logs headers or bodies.
 */
export function createHttpTransport({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch }: HttpTransportOptions): Transport {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    kind: "http",
    async send({ endpoint, body, idempotencyKey, timeoutMs }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(`${root}/${endpoint}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) throw new TransportTimeoutError();
        throw err;
      } finally {
        clearTimeout(timer);
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const text = await res.text();
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      return { status: res.status, headers, json };
    },
  };
}
