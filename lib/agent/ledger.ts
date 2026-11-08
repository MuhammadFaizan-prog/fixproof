import type { StepEvent } from "./types";

/**
 * The audit ledger: one row per Clocked call in a run, in call order, with the
 * SHA-256 of the exact request body, the decision it led to, credits, attempts
 * and when it finished. Rows are hash-chained (each `rowHash` covers the row
 * and the previous `rowHash`), so editing or dropping a row in an exported file
 * breaks every hash after it. Bodies, ticket text and the key are never in it.
 *
 * Shared by the JSON API (server, node:crypto) and the in-app export (browser,
 * SubtleCrypto): pass the SHA-256 function for the side you are on.
 */

export const LEDGER_VERSION = "fixproof-ledger/1";

export interface LedgerRow {
  seq: number;
  at: string | null;
  step: string;
  endpoint: string;
  title: string;
  status: string;
  /** What the call decided: Clocked's verdict when there is one, else the row status. */
  decision: string;
  /** What that decision changed in the run (the Proof Trail line). */
  effect: string;
  inputsHash: string | null;
  credits: number | null;
  attempts: number | null;
  idempotencyKeyPrefix: string | null;
  source: "live" | "replay" | "simulated" | "not run";
  recordedAt: string | null;
  prevHash: string;
  rowHash: string;
}

export interface LedgerRun {
  mode: string;
  scenarioId: string | null;
  personaId: string;
  simulated: string | null;
  outcome: string | null;
  decidingCheck: string | null;
  credits: number;
}

export interface Ledger {
  version: typeof LEDGER_VERSION;
  run: LedgerRun;
  calls: LedgerRow[];
  /** rowHash of the last row (or the genesis hash when no call was made). */
  headHash: string;
}

export type Sha256 = (text: string) => string | Promise<string>;

export const GENESIS = "0".repeat(64);

/** Stable JSON: keys in the order given, so the same row always hashes the same. */
function canonical(row: Omit<LedgerRow, "rowHash">): string {
  const keys: (keyof Omit<LedgerRow, "rowHash">)[] = ["seq", "at", "step", "endpoint", "title", "status", "decision", "effect", "inputsHash", "credits", "attempts", "idempotencyKeyPrefix", "source", "recordedAt", "prevHash"];
  return JSON.stringify(keys.map((k) => row[k]));
}

function sourceOf(e: StepEvent, simulated: boolean): LedgerRow["source"] {
  if (e.status === "skipped") return "not run";
  if (e.meta?.synthetic && simulated) return "simulated";
  if (e.meta) return e.meta.replay ? "replay" : "live";
  if (e.status === "error" && simulated) return "simulated";
  return "live";
}

/** Build the hash-chained ledger from a run's events (Clocked calls only; local steps are left out). */
export async function buildLedger(events: StepEvent[], run: LedgerRun, sha256: Sha256): Promise<Ledger> {
  const calls: LedgerRow[] = [];
  let prev = GENESIS;
  for (const e of events) {
    if (e.endpoint === "local" || e.status === "running") continue;
    const row: Omit<LedgerRow, "rowHash"> = {
      seq: calls.length + 1,
      at: e.meta?.at ?? e.error?.at ?? null,
      step: e.id,
      endpoint: e.endpoint,
      title: e.title,
      status: e.status,
      decision: e.verdict ?? (e.status === "error" ? `failed (${e.error?.kind ?? "unknown"})` : e.status),
      effect: e.effect,
      inputsHash: e.meta?.inputsHash ?? e.error?.inputsHash ?? null,
      credits: e.meta?.credits ?? null,
      attempts: e.meta?.attempts ?? null,
      idempotencyKeyPrefix: e.meta?.idempotencyKeyPrefix ?? null,
      source: sourceOf(e, run.simulated !== null),
      recordedAt: e.meta?.recordedAt ?? null,
      prevHash: prev,
    };
    const rowHash = await sha256(canonical(row));
    calls.push({ ...row, rowHash });
    prev = rowHash;
  }
  return { version: LEDGER_VERSION, run, calls, headHash: prev };
}

/** Re-walk the chain; returns the seq of the first row whose hash does not match, or null when intact. */
export async function verifyLedger(ledger: Ledger, sha256: Sha256): Promise<number | null> {
  let prev = GENESIS;
  for (const r of ledger.calls) {
    const { rowHash, ...rest } = r;
    if (rest.prevHash !== prev || (await sha256(canonical(rest))) !== rowHash) return r.seq;
    prev = rowHash;
  }
  return ledger.headHash === prev ? null : ledger.calls.length + 1;
}

/** Browser SHA-256 via SubtleCrypto. */
export async function sha256Browser(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
