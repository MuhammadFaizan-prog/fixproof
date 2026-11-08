import type { ClockedMeta, Endpoint } from "./types";

export type ClockedErrorKind =
  | "no_key"
  | "invalid" // 400 / 422
  | "auth" // 401 / 403
  | "credits" // 402
  | "conflict" // 409
  | "too_large" // 413
  | "rate_limited" // 429 after the retry budget
  | "server" // 5xx after the retry budget
  | "ended" // retryAsNew: true, this attempt is over
  | "network"
  | "timeout"
  | "no_fixture"
  | "budget"; // live run hit its per-run credit ceiling (lib/clocked/budget.ts)

export interface ClockedErrorInit {
  kind: ClockedErrorKind;
  endpoint: Endpoint;
  step: string;
  status?: number;
  attempts: number;
  retryAsNew?: boolean;
  meta?: Partial<ClockedMeta>;
}

/** A Clocked call that did not produce a usable answer. The message never contains the API key or the payload. */
export class ClockedError extends Error {
  readonly kind: ClockedErrorKind;
  readonly endpoint: Endpoint;
  readonly step: string;
  readonly status?: number;
  readonly attempts: number;
  readonly retryAsNew: boolean;
  readonly meta?: Partial<ClockedMeta>;

  constructor(message: string, init: ClockedErrorInit) {
    super(message);
    this.name = "ClockedError";
    this.kind = init.kind;
    this.endpoint = init.endpoint;
    this.step = init.step;
    this.status = init.status;
    this.attempts = init.attempts;
    this.retryAsNew = init.retryAsNew ?? false;
    this.meta = init.meta;
  }
}

/** Map an HTTP status to a kind (docs: Errors & retries). */
export function kindForStatus(status: number): ClockedErrorKind {
  if (status === 400 || status === 422) return "invalid";
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "credits";
  if (status === 409) return "conflict";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  return "server";
}
